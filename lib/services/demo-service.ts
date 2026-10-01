import * as demo from '@/lib/demo-data';
import { orgSub } from '@/lib/domain/labels';
import type { Comment, Conversation, Event, Message, Organization, Post, Representation, Session } from '@/lib/domain/types';
import { commentSchema, eventResponseInputSchema, messageSchema, onboardingSchema, publishPostSchema, voteSchema } from '@/lib/domain/validation';
import type { AddCommentInput, ElevradsnettService, OnboardingInput, PublishPostInput, SendMessageInput, SetEventResponseInput, VoteInput } from './contracts';

/**
 * Minnebasert tjeneste over demodataene. Brukes når Supabase ikke er konfigurert, og i tester.
 * Hver instans har sin egen kopi av dataene, så endringer lekker ikke mellom instanser.
 */
export class DemoElevradsnettService implements ElevradsnettService {
  private user = structuredClone(demo.currentUser);
  private representations = structuredClone(demo.representations);
  private activeRepresentationId = this.representations[0].id;
  private organizations = structuredClone(demo.organizations);
  private posts = structuredClone(demo.initialPosts);
  private events = structuredClone(demo.events);
  private conversations = structuredClone(demo.conversations);
  private supported = new Set<string>();
  private votes = new Map<string,string>();
  private eventResponses = new Map<string,'going'|'interested'>();
  private reported = new Set<string>();
  private sequence = 0;

  private nextId(prefix:string) { this.sequence += 1; return `${prefix}-${Date.now()}-${this.sequence}`; }
  private representation(id:string):Representation {
    const rep = this.representations.find(r=>r.id===id);
    if (!rep) throw new Error('Ukjent representasjon.');
    return rep;
  }
  private organization(id:string):Organization {
    const o = this.organizations.find(x=>x.id===id);
    if (!o) throw new Error('Ukjent organisasjon.');
    return o;
  }
  private post(id:string):Post {
    const p = this.posts.find(x=>x.id===id);
    if (!p) throw new Error('Ukjent innlegg.');
    return p;
  }
  private conversation(id:string):Conversation {
    const c = this.conversations.find(x=>x.id===id);
    if (!c) throw new Error('Ukjent samtale.');
    return c;
  }

  async getSession():Promise<Session> {
    return structuredClone({ user:this.user, representations:this.representations, activeRepresentationId:this.activeRepresentationId });
  }
  async listOrganizations() { return structuredClone(this.organizations); }
  async listFeed(input:{ representationId:string; mode:'recommended'|'chronological' }) {
    this.representation(input.representationId);
    return structuredClone(this.posts);
  }
  async listEvents():Promise<Event[]> { return structuredClone(this.events); }
  async listConversations() { return structuredClone(this.conversations); }
  async listPublicOfficers(organizationId:string) { return structuredClone(this.organization(organizationId).officers ?? []); }

  async switchRepresentation(representationId:string) {
    this.representation(representationId);
    this.activeRepresentationId = representationId;
  }
  async completeOnboarding(input:OnboardingInput) {
    const parsed = onboardingSchema.parse(input);
    const school = this.organization(parsed.schoolId);
    if (school.type!=='school') throw new Error('Velg en skole.');
  }

  async publishPost(input:PublishPostInput):Promise<Post> {
    const parsed = publishPostSchema.parse(input);
    const rep = this.representation(parsed.representationId);
    if (!rep.canPublish) throw new Error(`${rep.name} har ikke gitt deg publiseringsrett.`);
    const post:Post = {
      id:this.nextId('post'), organizationId:rep.organizationId, initials:rep.initials, organizationName:rep.name,
      actorName:this.user.name, actorRole:rep.publicRole, createdAt:'Akkurat nå', body:parsed.body, audience:parsed.audience,
      likes:0, comments:0, commentItems:[],
      media:parsed.withImage?[{ id:this.nextId('m'), type:'image', alt:'foto: lastet opp av elevrådet' }]:undefined,
      poll:parsed.poll?{ question:parsed.body.split('\n')[0], closesAt:'om 14 dager', resultsVisibility:'after_vote', options:parsed.poll.options.map((label,i)=>({ id:String(i), label, votes:0 })) }:undefined,
    };
    if (parsed.status==='published') this.posts.unshift(post);
    return structuredClone(post);
  }
  async addComment(input:AddCommentInput):Promise<Comment> {
    const parsed = commentSchema.parse(input);
    const rep = this.representation(parsed.representationId);
    const post = this.post(parsed.postId);
    const comment:Comment = { id:this.nextId('c'), organizationId:rep.organizationId, organizationName:rep.name, actorName:this.user.name, createdAt:'nå', body:parsed.body };
    post.commentItems = [...(post.commentItems ?? []),comment];
    post.comments += 1;
    return structuredClone(comment);
  }
  async setPostSupport(input:{ postId:string; supported:boolean }) {
    const post = this.post(input.postId);
    const had = this.supported.has(post.id);
    if (input.supported===had) return;
    if (input.supported) this.supported.add(post.id); else this.supported.delete(post.id);
    post.likes += input.supported?1:-1;
  }
  async vote(input:VoteInput) {
    const parsed = voteSchema.parse(input);
    const post = this.post(parsed.postId);
    if (!post.poll) throw new Error('Innlegget har ingen avstemning.');
    const option = post.poll.options.find(o=>o.id===parsed.optionId);
    if (!option) throw new Error('Ukjent svaralternativ.');
    const key = `${post.id}:${parsed.organizationId}`;
    const previous = post.poll.options.find(o=>o.id===this.votes.get(key));
    if (previous) previous.votes -= 1;
    option.votes += 1;
    this.votes.set(key,option.id);
  }
  async reportPost(input:{ postId:string }) { this.reported.add(this.post(input.postId).id); }

  async setFollow(input:{ organizationId:string; following:boolean }) {
    const o = this.organization(input.organizationId);
    if (!!o.following===input.following) return;
    o.following = input.following;
    o.followers += input.following?1:-1;
  }
  async setEventResponse(input:SetEventResponseInput) {
    const parsed = eventResponseInputSchema.parse(input);
    const event = this.events.find(e=>e.id===parsed.eventId);
    if (!event) throw new Error('Ukjent arrangement.');
    const key = `${event.id}:${parsed.organizationId}`;
    const previous = this.eventResponses.get(key);
    if (previous==='going') event.registered -= 1;
    if (previous==='interested') event.interested -= 1;
    if (parsed.response==='going') event.registered += 1;
    if (parsed.response==='interested') event.interested += 1;
    if (parsed.response) this.eventResponses.set(key,parsed.response); else this.eventResponses.delete(key);
  }

  async openConversation(input:{ organizationId:string }):Promise<Conversation> {
    const existing = this.conversations.find(c=>c.organizationId===input.organizationId);
    if (existing) return structuredClone(existing);
    const o = this.organization(input.organizationId);
    const created:Conversation = { id:`c-${o.id}`, name:o.name, initials:o.initials, subtitle:orgSub(o), organizationId:o.id, kind:'group', unread:0, members:(o.officers?.length ?? 1)+1, messages:[] };
    this.conversations.unshift(created);
    return structuredClone(created);
  }
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const parsed = messageSchema.parse(input);
    const conversation = this.conversation(parsed.conversationId);
    const message:Message = { id:this.nextId('m'), from:this.user.name.split(' ')[0], mine:true, text:parsed.body, time:'nå' };
    conversation.messages.push(message);
    return structuredClone(message);
  }
  async markConversationRead(conversationId:string) { this.conversation(conversationId).unread = 0; }
}

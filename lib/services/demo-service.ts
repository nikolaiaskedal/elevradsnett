import * as demo from '@/lib/demo-data';
import { orgSub } from '@/lib/domain/labels';
import { initialsOf } from '@/lib/domain/labels';
import type { Comment, Conversation, CurrentUser, Event, Message, Organization, Post, Representation, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import { avatarSchema, changeSchoolSchema, commentSchema, eventResponseInputSchema, messageSchema, onboardingSchema, publishPostSchema, requestLoginCodeSchema, updateProfileSchema, verifyLoginCodeSchema, voteSchema } from '@/lib/domain/validation';
import type { AddCommentInput, ChangeSchoolInput, ElevradsnettService, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from './contracts';

/** Engangskoden som alltid virker i demoen. Vises i innloggingsdialogen når demotjenesten brukes. */
export const DEMO_LOGIN_CODE = '123456';
/** Logger du inn med denne adressen i demoen, blir du Ida (med verv). Andre adresser går til onboarding. */
export const DEMO_EMAIL = demo.currentUser.email;

/**
 * Minnebasert tjeneste over demodataene. Brukes når Supabase ikke er konfigurert, og i tester.
 * Hver instans har sin egen kopi av dataene, så endringer lekker ikke mellom instanser.
 * Den spiller også serverens rolle: avviser handlinger uten innlogging og sjekker skjemaene.
 */
export class DemoElevradsnettService implements ElevradsnettService {
  readonly demoLoginHint = `Demo: koden er ${DEMO_LOGIN_CODE}. Med ${DEMO_EMAIL} logger du inn som Ida, som har verv. Andre adresser går til onboarding.`;
  private status:Session['status'];
  private user:CurrentUser = structuredClone(demo.currentUser);
  private representations = structuredClone(demo.representations);
  private activeRepresentationId:string|null = this.representations[0].id;
  private schoolHistory:SchoolHistoryEntry[] = [];
  private pendingEmail = '';
  private listeners = new Set<()=>void>();
  private organizations = structuredClone(demo.organizations);
  private posts = structuredClone(demo.initialPosts);
  private events = structuredClone(demo.events);
  private conversations = structuredClone(demo.conversations);
  private supported = new Set<string>();
  private votes = new Map<string,string>();
  private eventResponses = new Map<string,'going'|'interested'>();
  private reported = new Set<string>();
  private sequence = 0;

  /** Demoen starter innlogget som Ida, med mindre signedIn er false (slik appen bruker den). */
  constructor(options:{ signedIn?:boolean } = {}) {
    this.status = options.signedIn===false?'anonymous':'active';
    if (this.user.schoolId) this.schoolHistory = [this.historyEntry(this.user.schoolId,'2024-08-15T00:00:00.000Z')];
  }

  private historyEntry(schoolId:string,startedAt:string):SchoolHistoryEntry {
    const school = this.organization(schoolId);
    return { schoolId, schoolName:school.schoolName ?? school.name, county:school.county, startedAt, endedAt:null };
  }
  /** Innlogget med aktiv profil, ellers samme feil som serveren gir. */
  private requireUser() {
    if (this.status!=='active') throw new Error('Du må logge inn først.');
    return this.user;
  }
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
    if (this.status==='anonymous') return { status:'anonymous' };
    if (this.status==='onboarding') return { status:'onboarding', email:this.pendingEmail };
    return structuredClone({ status:this.status, user:this.user, representations:this.representations, activeRepresentationId:this.activeRepresentationId });
  }
  onSessionChange(listener:()=>void) {
    this.listeners.add(listener);
    return ()=>{ this.listeners.delete(listener); };
  }
  async requestLoginCode(input:RequestLoginCodeInput) {
    this.pendingEmail = requestLoginCodeSchema.parse(input).email;
  }
  async verifyLoginCode(input:VerifyLoginCodeInput):Promise<Session> {
    const parsed = verifyLoginCodeSchema.parse(input);
    if (parsed.email!==this.pendingEmail || parsed.code!==DEMO_LOGIN_CODE) throw new Error('Koden er feil eller utløpt. Prøv igjen, eller be om en ny kode.');
    if (parsed.email===DEMO_EMAIL) {
      this.status = 'active';
    } else {
      // Ny bruker uten profil: må gjennom onboarding før noe annet.
      this.status = 'onboarding';
      this.user = { id:`user-${parsed.email}`, name:'', initials:'', schoolId:null, email:parsed.email };
      this.representations = [];
      this.activeRepresentationId = null;
      this.schoolHistory = [];
    }
    return this.getSession();
  }
  async signOut() {
    this.status = 'anonymous';
    this.listeners.forEach(listener=>listener());
  }

  async listOrganizations() {
    const orgs = structuredClone(this.organizations);
    return this.status==='active'?orgs:orgs.map(o=>({ ...o, following:false }));
  }
  async listFeed(input:{ representationId:string|null; mode:'recommended'|'chronological' }) {
    if (input.representationId===null || this.status!=='active') return structuredClone(this.posts.filter(p=>p.audience==='public'));
    this.representation(input.representationId);
    return structuredClone(this.posts);
  }
  async listOrganizationPosts(organizationId:string) {
    return structuredClone(this.posts.filter(p=>p.organizationId===organizationId && (this.status==='active' || p.audience==='public')));
  }
  async listEvents():Promise<Event[]> { return structuredClone(this.events); }
  async listConversations() { return this.status==='active'?structuredClone(this.conversations):[]; }
  async listPublicOfficers(organizationId:string) { return structuredClone(this.organization(organizationId).officers ?? []); }

  async completeOnboarding(input:OnboardingInput) {
    const parsed = onboardingSchema.parse(input);
    if (this.status!=='onboarding') throw new Error('Profilen din er allerede opprettet.');
    const school = this.organization(parsed.schoolId);
    if (school.type!=='school' || school.status!=='active') throw new Error('Velg en skole.');
    this.user = { ...this.user, name:parsed.displayName, initials:initialsOf(parsed.displayName), schoolId:school.id };
    this.schoolHistory = [this.historyEntry(school.id,new Date().toISOString())];
    this.status = 'active';
  }
  async updateProfile(input:UpdateProfileInput) {
    const parsed = updateProfileSchema.parse(input);
    this.requireUser();
    this.user = { ...this.user, name:parsed.displayName, initials:initialsOf(parsed.displayName) };
  }
  async setAvatar(image:Blob) {
    avatarSchema.parse({ type:image.type, size:image.size });
    this.requireUser();
    if (this.user.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(this.user.avatarUrl);
    this.user = { ...this.user, avatarUrl:URL.createObjectURL(image) };
    return this.user.avatarUrl!;
  }
  async removeAvatar() {
    this.requireUser();
    if (this.user.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(this.user.avatarUrl);
    this.user = { ...this.user, avatarUrl:undefined };
  }
  async changeSchool(input:ChangeSchoolInput) {
    const parsed = changeSchoolSchema.parse(input);
    const user = this.requireUser();
    const school = this.organization(parsed.schoolId);
    if (school.type!=='school' || school.status!=='active') throw new Error('Velg en skole.');
    if (school.id===user.schoolId) throw new Error('Du går allerede på denne skolen.');
    // Verv ved gammel skole avsluttes. Ingen rettigheter følger med til ny skole.
    const now = new Date().toISOString();
    this.representations = this.representations.filter(r=>r.organizationId!==user.schoolId);
    if (!this.representations.some(r=>r.id===this.activeRepresentationId)) this.activeRepresentationId = null;
    this.schoolHistory = [this.historyEntry(school.id,now),...this.schoolHistory.map(h=>h.endedAt?h:{ ...h, endedAt:now })];
    this.user = { ...user, schoolId:school.id };
  }
  async listSchoolHistory() {
    this.requireUser();
    return structuredClone(this.schoolHistory);
  }

  async switchRepresentation(representationId:string) {
    this.requireUser();
    this.representation(representationId);
    this.activeRepresentationId = representationId;
  }

  async publishPost(input:PublishPostInput):Promise<Post> {
    const parsed = publishPostSchema.parse(input);
    this.requireUser();
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
    this.requireUser();
    const rep = this.representation(parsed.representationId);
    const post = this.post(parsed.postId);
    const comment:Comment = { id:this.nextId('c'), organizationId:rep.organizationId, organizationName:rep.name, actorName:this.user.name, createdAt:'nå', body:parsed.body };
    post.commentItems = [...(post.commentItems ?? []),comment];
    post.comments += 1;
    return structuredClone(comment);
  }
  async setPostSupport(input:{ postId:string; supported:boolean }) {
    this.requireUser();
    const post = this.post(input.postId);
    const had = this.supported.has(post.id);
    if (input.supported===had) return;
    if (input.supported) this.supported.add(post.id); else this.supported.delete(post.id);
    post.likes += input.supported?1:-1;
  }
  async vote(input:VoteInput) {
    const parsed = voteSchema.parse(input);
    this.requireUser();
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
  async reportPost(input:{ postId:string }) { this.requireUser(); this.reported.add(this.post(input.postId).id); }

  async setFollow(input:{ organizationId:string; following:boolean }) {
    this.requireUser();
    const o = this.organization(input.organizationId);
    if (!!o.following===input.following) return;
    o.following = input.following;
    o.followers += input.following?1:-1;
  }
  async setEventResponse(input:SetEventResponseInput) {
    const parsed = eventResponseInputSchema.parse(input);
    this.requireUser();
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
    this.requireUser();
    const existing = this.conversations.find(c=>c.organizationId===input.organizationId);
    if (existing) return structuredClone(existing);
    const o = this.organization(input.organizationId);
    const created:Conversation = { id:`c-${o.id}`, name:o.name, initials:o.initials, subtitle:orgSub(o), organizationId:o.id, kind:'group', unread:0, members:(o.officers?.length ?? 1)+1, messages:[] };
    this.conversations.unshift(created);
    return structuredClone(created);
  }
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const parsed = messageSchema.parse(input);
    this.requireUser();
    const conversation = this.conversation(parsed.conversationId);
    const message:Message = { id:this.nextId('m'), from:this.user.name.split(' ')[0], mine:true, text:parsed.body, time:'nå' };
    conversation.messages.push(message);
    return structuredClone(message);
  }
  async markConversationRead(conversationId:string) { this.requireUser(); this.conversation(conversationId).unread = 0; }
}

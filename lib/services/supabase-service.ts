import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comment, Conversation, Event, Message, Organization, Post, PublicOfficer, Session } from '@/lib/domain/types';
import { commentSchema, eventResponseInputSchema, messageSchema, onboardingSchema, publishPostSchema, voteSchema } from '@/lib/domain/validation';
import { NotImplementedError, type AddCommentInput, type ElevradsnettService, type OnboardingInput, type PublishPostInput, type SendMessageInput, type SetEventResponseInput, type VoteInput } from './contracts';

/**
 * Produksjonsadapter. Alle tilgangsbeslutninger tas av RLS og RPC-er i databasen.
 * Metoder uten RPC kaster NotImplementedError.
 */
export class SupabaseElevradsnettService implements ElevradsnettService {
  private client:Promise<SupabaseClient>;
  constructor(client:SupabaseClient|Promise<SupabaseClient>) { this.client = Promise.resolve(client); }

  /** Organisasjonen en representasjon (membership) gjelder. Lesingen er begrenset av RLS. */
  private async organizationOf(representationId:string) {
    const { data,error } = await (await this.client).from('memberships').select('organization_id').eq('id',representationId).single();
    if (error) throw error;
    return (data as { organization_id:string }).organization_id;
  }

  async getSession():Promise<Session> { throw new NotImplementedError('getSession'); }
  async listOrganizations():Promise<Organization[]> { throw new NotImplementedError('listOrganizations'); }
  async listFeed(input:{ representationId:string; mode:'recommended'|'chronological' }) {
    const { data,error } = await (await this.client).rpc('get_ranked_feed',{ p_representation_id:input.representationId, p_mode:input.mode });
    if (error) throw error;
    return (data ?? []) as Post[];
  }
  async listEvents():Promise<Event[]> { throw new NotImplementedError('listEvents'); }
  async listConversations():Promise<Conversation[]> { throw new NotImplementedError('listConversations'); }
  async listPublicOfficers(organizationId:string) {
    const { data,error } = await (await this.client).rpc('get_public_officers',{ p_organization:organizationId });
    if (error) throw error;
    return ((data ?? []) as { membership_id:string; display_name:string; public_title:string }[]).map(r=>({ id:r.membership_id, name:r.display_name, publicTitle:r.public_title }) satisfies PublicOfficer);
  }

  async switchRepresentation(representationId:string) {
    const { error } = await (await this.client).rpc('set_active_representation',{ p_membership_id:representationId });
    if (error) throw error;
  }
  async completeOnboarding(input:OnboardingInput) {
    const parsed = onboardingSchema.parse(input);
    const { error } = await (await this.client).rpc('complete_onboarding',{ p_school:parsed.schoolId, p_display_name:parsed.displayName, p_leader_month:parsed.leaderMonth ?? null });
    if (error) throw error;
  }

  async publishPost(input:PublishPostInput) {
    const parsed = publishPostSchema.parse(input);
    if (parsed.poll || parsed.withImage) throw new NotImplementedError('publishPost med avstemning eller bilde');
    const organizationId = await this.organizationOf(parsed.representationId);
    const { data,error } = await (await this.client).rpc('publish_post',{ p_organization_id:organizationId, p_body:parsed.body, p_audience:parsed.audience, p_status:parsed.status });
    if (error) throw error;
    return data as Post;
  }
  async addComment(input:AddCommentInput):Promise<Comment> {
    const parsed = commentSchema.parse(input);
    const organizationId = await this.organizationOf(parsed.representationId);
    const { data,error } = await (await this.client).rpc('add_comment',{ p_post:parsed.postId, p_organization:organizationId, p_body:parsed.body });
    if (error) throw error;
    const row = data as { id:string; created_at:string };
    return { id:row.id, organizationId, organizationName:'', actorName:'', createdAt:row.created_at, body:parsed.body };
  }
  async setPostSupport():Promise<void> { throw new NotImplementedError('setPostSupport'); }
  async vote(input:VoteInput) {
    const parsed = voteSchema.parse(input);
    const { data:poll,error:pollError } = await (await this.client).from('polls').select('id').eq('post_id',parsed.postId).single();
    if (pollError) throw pollError;
    const { error } = await (await this.client).rpc('cast_organization_vote',{ p_poll_id:(poll as { id:string }).id, p_option_id:parsed.optionId, p_organization_id:parsed.organizationId });
    if (error) throw error;
  }
  async reportPost():Promise<void> { throw new NotImplementedError('reportPost'); }

  async setFollow():Promise<void> { throw new NotImplementedError('setFollow'); }
  async setEventResponse(input:SetEventResponseInput) {
    const parsed = eventResponseInputSchema.parse(input);
    const { error } = await (await this.client).rpc('set_event_response',{ p_event:parsed.eventId, p_organization:parsed.organizationId, p_response:parsed.response ?? 'none' });
    if (error) throw error;
  }

  async openConversation():Promise<Conversation> { throw new NotImplementedError('openConversation'); }
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const parsed = messageSchema.parse(input);
    const { data,error } = await (await this.client).from('messages').insert({ conversation_id:parsed.conversationId, body:parsed.body }).select('id,created_at').single();
    if (error) throw error;
    const row = data as { id:string; created_at:string };
    return { id:row.id, from:'', mine:true, text:parsed.body, time:row.created_at };
  }
  async markConversationRead():Promise<void> { throw new NotImplementedError('markConversationRead'); }
}

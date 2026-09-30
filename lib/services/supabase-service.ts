import { z } from 'zod';
import type { ElevradsnettService, PublishPostInput } from './contracts';
import type { Comment, EventResponse, Post, PublicOfficer, Representation } from '@/lib/domain/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const publishSchema = z.object({ body:z.string().trim().min(1).max(6000), audience:z.enum(['public','county','local','friends']), status:z.enum(['draft','published']) });
const onboardingSchema = z.object({ schoolId:z.uuid(), displayName:z.string().trim().min(2).max(120), leaderMonth:z.number().int().min(1).max(12).optional() });

export class SupabaseElevradsnettService implements ElevradsnettService {
  private client = getSupabaseBrowserClient();
  private requireClient() { if (!this.client) throw new Error('Supabase er ikke konfigurert.'); return this.client; }
  async listFeed(input:{representationId:string;mode:'recommended'|'chronological'}) { const client=this.requireClient(); const { data,error }=await client.rpc('get_ranked_feed',{p_representation_id:input.representationId,p_mode:input.mode}); if(error) throw error; return (data ?? []) as Post[]; }
  async publishPost(input:PublishPostInput) { const parsed=publishSchema.parse(input); const client=this.requireClient(); const { data,error }=await client.rpc('publish_post',{p_organization_id:input.representation.organizationId,p_body:parsed.body,p_audience:parsed.audience,p_status:parsed.status}); if(error) throw error; return data as Post; }
  async switchRepresentation(representationId:string) { const client=this.requireClient(); const { error }=await client.rpc('set_active_representation',{p_membership_id:representationId}); if(error) throw error; }
  async vote(input:{pollId:string;optionId:string;organizationId:string}) { const client=this.requireClient(); const { error }=await client.rpc('cast_organization_vote',{p_poll_id:input.pollId,p_option_id:input.optionId,p_organization_id:input.organizationId}); if(error) throw error; }
  async sendMessage(input:{conversationId:string;body:string}) { const client=this.requireClient(); const body=z.string().trim().min(1).max(5000).parse(input.body); const { error }=await client.from('messages').insert({conversation_id:input.conversationId,body}); if(error) throw error; }
  async addComment(input:{postId:string;representation:Representation;body:string}) { const client=this.requireClient(); const body=z.string().trim().min(1).max(3000).parse(input.body); const { data,error }=await client.rpc('add_comment',{p_post:input.postId,p_organization:input.representation.organizationId,p_body:body}); if(error) throw error; const row=data as { id:string; created_at:string }; return { id:row.id, organizationId:input.representation.organizationId, organizationName:input.representation.name, actorName:'', createdAt:row.created_at, body } satisfies Comment; }
  async setEventResponse(input:{eventId:string;organizationId:string;response:EventResponse|null}) { const client=this.requireClient(); const { error }=await client.rpc('set_event_response',{p_event:input.eventId,p_organization:input.organizationId,p_response:input.response ?? 'none'}); if(error) throw error; }
  async listPublicOfficers(organizationId:string) { const client=this.requireClient(); const { data,error }=await client.rpc('get_public_officers',{p_organization:organizationId}); if(error) throw error; return ((data ?? []) as { membership_id:string; display_name:string; public_title:string }[]).map(r=>({ id:r.membership_id, name:r.display_name, publicTitle:r.public_title }) satisfies PublicOfficer); }
  async completeOnboarding(input:{schoolId:string;displayName:string;leaderMonth?:number}) { const parsed=onboardingSchema.parse(input); const client=this.requireClient(); const { error }=await client.rpc('complete_onboarding',{p_school:parsed.schoolId,p_display_name:parsed.displayName,p_leader_month:parsed.leaderMonth ?? null}); if(error) throw error; }
}

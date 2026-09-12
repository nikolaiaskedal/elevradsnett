import { z } from 'zod';
import type { ElevradsnettService, PublishPostInput } from './contracts';
import type { Post } from '@/lib/domain/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const publishSchema = z.object({ body:z.string().trim().min(1).max(6000), audience:z.enum(['public','county','local','friends']), status:z.enum(['draft','published']) });

export class SupabaseElevradsnettService implements ElevradsnettService {
  private client = getSupabaseBrowserClient();
  private requireClient() { if (!this.client) throw new Error('Supabase er ikke konfigurert.'); return this.client; }
  async listFeed(input:{representationId:string;mode:'recommended'|'chronological'}) { const client=this.requireClient(); const { data,error }=await client.rpc('get_ranked_feed',{p_representation_id:input.representationId,p_mode:input.mode}); if(error) throw error; return (data ?? []) as Post[]; }
  async publishPost(input:PublishPostInput) { const parsed=publishSchema.parse(input); const client=this.requireClient(); const { data,error }=await client.rpc('publish_post',{p_organization_id:input.representation.organizationId,p_body:parsed.body,p_audience:parsed.audience,p_status:parsed.status}); if(error) throw error; return data as Post; }
  async switchRepresentation(representationId:string) { const client=this.requireClient(); const { error }=await client.rpc('set_active_representation',{p_membership_id:representationId}); if(error) throw error; }
  async vote(input:{pollId:string;optionId:string;organizationId:string}) { const client=this.requireClient(); const { error }=await client.rpc('cast_organization_vote',{p_poll_id:input.pollId,p_option_id:input.optionId,p_organization_id:input.organizationId}); if(error) throw error; }
  async sendMessage(input:{conversationId:string;body:string}) { const client=this.requireClient(); const body=z.string().trim().min(1).max(5000).parse(input.body); const { error }=await client.from('messages').insert({conversation_id:input.conversationId,body}); if(error) throw error; }
}

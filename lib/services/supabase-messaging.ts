import type { SupabaseClient } from '@supabase/supabase-js';
import { initialsOf } from '@/lib/domain/labels';
import { formatMessageTime, previewText, type BlockedUser, type Conversation, type ConversationKind, type ConversationMember, type Message, type MessageAttachment, type MessageSettings, type OrganizationContact, type RecipientSearchResult } from '@/lib/domain/messaging';
import { addMembersSchema, createGroupSchema, idSchema, messageSchema, reportMessageSchema } from '@/lib/domain/validation';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { AddMembersInput, CreateGroupInput, ReportMessageInput, SendMessageInput } from './contracts';

type Client = SupabaseClient<Database>;
type Rpc<Name extends keyof Database['public']['Functions']> = Database['public']['Functions'][Name]['Returns'];
/** Samme som run i supabase-service: data fra kallet, eller en norsk feilmelding. */
export type Run = <R extends { data:unknown; error:unknown }>(promise:PromiseLike<R>, fallback?:string)=>Promise<NonNullable<R['data']>>;

export const ATTACHMENT_BUCKET = 'private-message-attachments';
/** Lenker til vedlegg gjelder i ti minutter. */
const ATTACHMENT_URL_SECONDS = 600;
const extension:Record<string,string> = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' };

/**
 * Meldinger mot Supabase (§9). Alt går via RPC-ene i 202610100001_meldinger.sql, som sjekker medlemskap,
 * blokkering og grenser. Vedlegg lastes opp til private-message-attachments/<samtale>/<bruker>/ før meldingen sendes.
 */
export class SupabaseMessaging {
  constructor(private client:Promise<Client>, private run:Run, private userId:()=>Promise<string|null>) {}

  async listConversations():Promise<Conversation[]> {
    if (!await this.userId()) return [];
    const rows = await this.run((await this.client).rpc('list_my_conversations'),'Kunne ikke hente samtalene.');
    return rows.map(toConversation);
  }
  async listMessages(input:{ conversationId:string; before?:string }):Promise<Message[]> {
    const rows = await this.run((await this.client).rpc('get_conversation_messages',{ p_conversation:idSchema.parse(input.conversationId), p_before:input.before }),'Kunne ikke hente meldingene.');
    return rows.map(toMessage);
  }
  async listConversationMembers(conversationId:string):Promise<ConversationMember[]> {
    const rows = await this.run((await this.client).rpc('list_conversation_members',{ p_conversation:idSchema.parse(conversationId) }),'Kunne ikke hente medlemmene.');
    return rows.map(r=>({ userId:r.user_id, name:r.display_name, schoolName:r.school_name ?? undefined, isAdmin:r.is_admin, me:r.me }));
  }
  async searchRecipients(query:string):Promise<RecipientSearchResult[]> {
    const q = query.trim().slice(0,100);
    if (q.length<2) return [];
    const rows = await this.run((await this.client).rpc('search_message_recipients',{ p_query:q }),'Kunne ikke søke.');
    return rows.map(r=>r.kind==='person'
      ?{ kind:'person', id:r.id, name:r.name, schoolName:r.detail ?? undefined }
      :{ kind:'organization', id:r.id, name:r.name, county:r.detail ?? '', type:r.organization_type });
  }
  async listOrganizationContacts(organizationId:string):Promise<OrganizationContact[]> {
    const rows = await this.run((await this.client).rpc('list_organization_contacts',{ p_org:idSchema.parse(organizationId) }),'Kunne ikke hente kontaktpersonene.');
    return rows.map(r=>({ userId:r.user_id, name:r.display_name, publicTitle:r.public_title ?? '', me:r.me }));
  }
  async startDirectConversation(userId:string) {
    return this.run((await this.client).rpc('start_direct_conversation',{ p_user:idSchema.parse(userId) }),'Kunne ikke starte samtalen.');
  }
  async createGroup(input:CreateGroupInput) {
    const parsed = createGroupSchema.parse(input);
    return this.run((await this.client).rpc('create_group_conversation',{ p_name:parsed.name, p_members:parsed.memberIds }),'Kunne ikke opprette gruppen.');
  }
  async createOrganizationGroup(organizationId:string) {
    return this.run((await this.client).rpc('create_organization_group',{ p_org:idSchema.parse(organizationId) }),'Kunne ikke opprette gruppen.');
  }
  async addConversationMembers(input:AddMembersInput) {
    const parsed = addMembersSchema.parse(input);
    await this.run((await this.client).rpc('add_conversation_members',{ p_conversation:parsed.conversationId, p_members:parsed.userIds }),'Kunne ikke legge til personene.');
  }
  async leaveConversation(conversationId:string) {
    await this.run((await this.client).rpc('leave_conversation',{ p_conversation:idSchema.parse(conversationId) }),'Kunne ikke forlate gruppen.');
  }
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const files = input.attachments ?? [];
    const parsed = messageSchema.parse({ ...input, attachments:files.map(f=>({ name:f.name, type:f.type, size:f.size })) });
    const client = await this.client;
    const userId = await this.userId();
    if (!userId) throw new Error('Du må logge inn først.');
    const bucket = client.storage.from(ATTACHMENT_BUCKET);
    const uploaded:{ path:string; mime_type:string; byte_size:number; file_name:string }[] = [];
    try {
      for (const [i,file] of files.entries()) {
        const meta = parsed.attachments[i];
        const path = `${parsed.conversationId}/${userId}/${crypto.randomUUID()}.${extension[meta.type]}`;
        const upload = await bucket.upload(path,file,{ contentType:meta.type, upsert:false });
        if (upload.error) throw new Error('Vedlegget kunne ikke lastes opp. Prøv igjen.');
        uploaded.push({ path, mime_type:meta.type, byte_size:meta.size, file_name:meta.name });
      }
      const rows = await this.run(client.rpc('send_message',{ p_conversation:parsed.conversationId, p_body:parsed.body, p_attachments:uploaded as unknown as Json }),'Kunne ikke sende meldingen.');
      const row = rows[0];
      return { id:row.id, senderId:userId, from:'', mine:true, text:parsed.body, time:formatMessageTime(row.created_at), createdAt:row.created_at,
        attachments:uploaded.map((a,i)=>({ id:`${row.id}-${i}`, path:a.path, mimeType:a.mime_type, byteSize:a.byte_size, fileName:a.file_name })) };
    } catch (error) {
      // Filer som ble lastet opp før feilen, fjernes igjen.
      if (uploaded.length) await bucket.remove(uploaded.map(a=>a.path));
      throw error;
    }
  }
  async markConversationRead(conversationId:string) {
    await this.run((await this.client).rpc('mark_conversation_read',{ p_conversation:idSchema.parse(conversationId) }));
  }
  async setConversationMuted(input:{ conversationId:string; muted:boolean }) {
    await this.run((await this.client).rpc('set_conversation_muted',{ p_conversation:idSchema.parse(input.conversationId), p_muted:input.muted }),'Kunne ikke endre varslene.');
  }
  async hideMessage(messageId:string) {
    await this.run((await this.client).rpc('hide_message',{ p_message:idSchema.parse(messageId) }),'Kunne ikke slette meldingen.');
  }
  async reportMessage(input:ReportMessageInput) {
    const parsed = reportMessageSchema.parse(input);
    await this.run((await this.client).rpc('report_message',{ p_message:parsed.messageId, p_category:parsed.category, p_description:parsed.description || undefined }),'Kunne ikke sende rapporten.');
  }
  async blockUser(userId:string) {
    await this.run((await this.client).rpc('block_user',{ p_user:idSchema.parse(userId) }),'Kunne ikke blokkere personen.');
  }
  async unblockUser(userId:string) {
    await this.run((await this.client).rpc('unblock_user',{ p_user:idSchema.parse(userId) }),'Kunne ikke oppheve blokkeringen.');
  }
  async listBlockedUsers():Promise<BlockedUser[]> {
    const rows = await this.run((await this.client).rpc('list_my_blocks'),'Kunne ikke hente blokkeringene.');
    return rows.map(r=>({ userId:r.user_id, name:r.display_name }));
  }
  async getMessageSettings():Promise<MessageSettings> {
    const rows = await this.run((await this.client).rpc('get_message_settings'));
    return { readReceipts:rows[0]?.read_receipts ?? false };
  }
  async setReadReceipts(enabled:boolean) {
    await this.run((await this.client).rpc('set_read_receipts',{ p_enabled:enabled }),'Kunne ikke lagre innstillingen.');
  }
  async getAttachmentUrl(path:string) {
    const { data,error } = await (await this.client).storage.from(ATTACHMENT_BUCKET).createSignedUrl(path,ATTACHMENT_URL_SECONDS);
    if (error || !data) throw new Error('Vedlegget kunne ikke åpnes.');
    return data.signedUrl;
  }
  /** Sanntid: nye meldinger brukeren kan lese (RLS gjelder) og endringer i egne samtalemedlemskap. */
  subscribeToMessages(listener:()=>void) {
    let stop = ()=>{};
    let closed = false;
    void this.client.then(async client=>{
      const userId = await this.userId();
      if (closed || !userId) return;
      const channel = client.channel(`meldinger:${userId}`)
        .on('postgres_changes',{ event:'INSERT', schema:'public', table:'messages' },()=>listener())
        .on('postgres_changes',{ event:'*', schema:'public', table:'conversation_members', filter:`user_id=eq.${userId}` },()=>listener())
        .subscribe();
      stop = ()=>{ void client.removeChannel(channel); };
    });
    return ()=>{ closed = true; stop(); };
  }
}

function toConversation(r:Rpc<'list_my_conversations'>[number]):Conversation {
  const name = r.name ?? 'Samtale';
  return {
    id:r.id, kind:r.kind as ConversationKind, name, initials:initialsOf(name), organizationId:r.organization_id ?? undefined, otherUserId:r.other_user_id ?? undefined,
    unread:r.unread_count, muted:r.muted, members:r.member_count, isAdmin:r.is_admin, createdAt:r.created_at,
    lastMessage:r.last_message_at?{ text:previewText(r.last_message_body ?? '',r.last_message_has_attachment), time:formatMessageTime(r.last_message_at), mine:r.last_message_mine, createdAt:r.last_message_at }:undefined,
  };
}

function toMessage(r:Rpc<'get_conversation_messages'>[number]):Message {
  const attachments = (r.attachments as { id:string; path:string; mime_type:string; byte_size:number; file_name:string }[] | null) ?? [];
  return {
    id:r.id, senderId:r.sender_user_id, from:r.sender_name, mine:r.mine, text:r.body ?? '', time:formatMessageTime(r.created_at), createdAt:r.created_at,
    attachments:attachments.map(a=>({ id:a.id, path:a.path, mimeType:a.mime_type, byteSize:a.byte_size, fileName:a.file_name }) satisfies MessageAttachment),
    readBy:r.read_by ?? null,
  };
}

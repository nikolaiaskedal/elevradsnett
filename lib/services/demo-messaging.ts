import * as demo from '@/lib/demo-data';
import { initialsOf } from '@/lib/domain/labels';
import { formatMessageTime, previewText, type BlockedUser, type Conversation, type ConversationKind, type ConversationMember, type Message, type MessageAttachment, type MessageSettings, type OrganizationContact, type RecipientSearchResult } from '@/lib/domain/messaging';
import type { Organization } from '@/lib/domain/types';
import { addMembersSchema, createGroupSchema, GROUP_MAX_MEMBERS, messageSchema, reportMessageSchema } from '@/lib/domain/validation';
import type { AddMembersInput, CreateGroupInput, ReportMessageInput, SendMessageInput } from './contracts';
import { messagingServerMessages as errors } from './messaging-errors';

/** Det demotjenesten vet om personer, verv og innlogging. Meldingsdelen spør her i stedet for å ha egne kopier. */
export type DemoMessagingHost = {
  /** Innlogget bruker, eller samme feil som serveren gir. */
  requireUser():{ id:string; name:string };
  isSignedIn():boolean;
  personId(name:string):string;
  person(id:string):{ id:string; name:string; schoolName?:string; active:boolean }|undefined;
  people():{ id:string; name:string; schoolName?:string; active:boolean }[];
  organization(id:string):Organization|undefined;
  activeOrganizations():Organization[];
  /** Aktive verv i en aktiv organisasjon hos aktive personer, slik has_active_membership regner. */
  liveMembers(organizationId:string):{ userId:string; title:string }[];
  nextId(prefix:string):string;
};

type Member = { joinedAt:string; historyStartsAt:string; leftAt?:string; isAdmin:boolean; lastReadAt?:string; muted:boolean };
type StoredConversation = { id:string; kind:ConversationKind; name?:string; organizationId?:string; createdAt:string; members:Map<string,Member> };
type StoredMessage = { id:string; conversationId:string; senderId:string; body:string; createdAt:string; attachments:(MessageAttachment & { url:string })[] };

const LONG_AGO = '2025-08-25T08:00:00.000Z';
const nowIso = ()=>new Date().toISOString();
const ago = (minutes:number)=>new Date(Date.now()-minutes*60000).toISOString();
const extension:Record<string,string> = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' };

/**
 * Minnebaserte meldinger for demoen og testene. Spiller serverens rolle på samme måte som RPC-ene i
 * 202610100001_meldinger.sql: medlemskap, historikkgrense, systemstyrte grupper fra vervene, blokkering og skjuling.
 * De andre personene i demoen har lest-status på og har lest alt fram til sin egen siste melding.
 */
export class DemoMessaging {
  private conversations:StoredConversation[] = [];
  private messages:StoredMessage[] = [];
  private hidden = new Set<string>();
  private blocks = new Set<string>();
  private readReceipts = new Map<string,boolean>();
  private reported = new Set<string>();
  private listeners = new Set<()=>void>();

  constructor(private host:DemoMessagingHost) {
    for (const seed of demo.conversations) {
      const ids = seed.kind==='managed'
        ? host.liveMembers(seed.organizationId!).map(m=>m.userId)
        : [demo.currentUser.id,...seed.people.map(name=>host.personId(name))];
      const members = new Map<string,Member>();
      for (const id of new Set(ids)) {
        const last = seed.messages.filter(m=>host.personId(m.from)===id).at(-1);
        members.set(id,{ joinedAt:LONG_AGO, historyStartsAt:LONG_AGO, isAdmin:seed.kind==='group' && id===demo.currentUser.id, muted:!!seed.muted,
          lastReadAt:last?ago(last.minutesAgo):LONG_AGO });
      }
      const me = members.get(demo.currentUser.id);
      const unreadFrom = seed.unreadFrom ?? 0;
      if (me) me.lastReadAt = seed.messages.length>unreadFrom?ago(seed.messages[seed.messages.length-1-unreadFrom].minutesAgo):LONG_AGO;
      this.conversations.push({ id:seed.id, kind:seed.kind, name:seed.name, organizationId:seed.organizationId, createdAt:LONG_AGO, members });
      seed.messages.forEach((m,i)=>this.messages.push({ id:`${seed.id}-${i+1}`, conversationId:seed.id, senderId:host.personId(m.from), body:m.text, createdAt:ago(m.minutesAgo), attachments:[] }));
    }
    for (const person of host.people()) if (person.id!==demo.currentUser.id) this.readReceipts.set(person.id,true);
  }

  // ---- Tilgang, regnet ut som i databasen ----
  private blockedBetween(a:string,b:string) { return this.blocks.has(`${a}:${b}`) || this.blocks.has(`${b}:${a}`); }
  /** is_conversation_member: aktivt medlem, og for systemstyrte grupper et aktivt verv. */
  private isMember(c:StoredConversation,userId:string) {
    const m = c.members.get(userId);
    if (!m || m.leftAt) return false;
    return c.kind!=='managed' || this.host.liveMembers(c.organizationId!).some(x=>x.userId===userId);
  }
  /** can_view_message for brukeren. */
  private canView(message:StoredMessage,userId:string) {
    const c = this.conversations.find(x=>x.id===message.conversationId);
    const m = c?.members.get(userId);
    return !!c && !!m && this.isMember(c,userId) && message.createdAt>=m.historyStartsAt && !this.blocks.has(`${userId}:${message.senderId}`) && !this.hidden.has(`${userId}:${message.id}`);
  }
  private conversationFor(id:string,userId:string) {
    const c = this.conversations.find(x=>x.id===id);
    if (!c || !this.isMember(c,userId)) throw new Error(errors['conversation not found']);
    return c;
  }
  private visibleMessage(id:string,userId:string) {
    const m = this.messages.find(x=>x.id===id);
    if (!m || !this.canView(m,userId)) throw new Error(errors['message not found']);
    return m;
  }
  /** Systemstyrte grupper følger vervene: nye medlemmer ser bare meldinger fra de ble med, tidligere medlemmer mister tilgangen. */
  private syncManaged() {
    const orgs = new Set(this.host.activeOrganizations().filter(o=>this.host.liveMembers(o.id).length).map(o=>o.id));
    for (const c of this.conversations) if (c.kind==='managed') orgs.add(c.organizationId!);
    for (const orgId of orgs) {
      const live = new Set(this.host.liveMembers(orgId).map(m=>m.userId));
      let c = this.conversations.find(x=>x.kind==='managed' && x.organizationId===orgId);
      if (!c) {
        if (!live.size) continue;
        c = { id:this.host.nextId('c'), kind:'managed', organizationId:orgId, createdAt:LONG_AGO, members:new Map() };
        this.conversations.push(c);
      }
      for (const userId of live) {
        const m = c.members.get(userId);
        if (!m) c.members.set(userId,{ joinedAt:nowIso(), historyStartsAt:nowIso(), isAdmin:false, muted:false });
        else if (m.leftAt) Object.assign(m,{ leftAt:undefined, joinedAt:nowIso(), historyStartsAt:nowIso(), lastReadAt:undefined });
      }
      for (const [userId,m] of c.members) if (!m.leftAt && !live.has(userId)) m.leftAt = nowIso();
    }
  }
  private conversationName(c:StoredConversation,userId:string) {
    if (c.kind==='managed') { const o = this.host.organization(c.organizationId!); return o?.schoolName ?? o?.name ?? 'Gruppe'; }
    if (c.kind==='direct') { const other = [...c.members.keys()].find(id=>id!==userId); return (other && this.host.person(other)?.name) ?? 'Tidligere bruker'; }
    return c.name ?? 'Gruppe';
  }
  private toMessage(m:StoredMessage,userId:string):Message {
    const c = this.conversations.find(x=>x.id===m.conversationId)!;
    const mine = m.senderId===userId;
    const readBy = mine && this.readReceipts.get(userId)
      ? [...c.members].filter(([id,x])=>id!==userId && !x.leftAt && this.readReceipts.get(id) && (x.lastReadAt ?? '')>=m.createdAt).length
      : null;
    return { id:m.id, senderId:m.senderId, from:this.host.person(m.senderId)?.name ?? 'Tidligere bruker', mine, text:m.body, time:formatMessageTime(m.createdAt), createdAt:m.createdAt,
      attachments:m.attachments.map(({ url:_url,...a })=>a), readBy };
  }
  private changed() { this.listeners.forEach(listener=>listener()); }
  private eligible(ids:string[],me:string) {
    return [...new Set(ids)].filter(id=>id!==me && this.host.person(id)?.active && !this.blockedBetween(me,id));
  }

  // ---- Lesing ----
  async listConversations():Promise<Conversation[]> {
    if (!this.host.isSignedIn()) return [];
    const me = this.host.requireUser().id;
    this.syncManaged();
    return this.conversations.filter(c=>this.isMember(c,me)).map(c=>{
      const member = c.members.get(me)!;
      const visible = this.messages.filter(m=>m.conversationId===c.id && this.canView(m,me));
      const last = visible.at(-1);
      const name = this.conversationName(c,me);
      return { id:c.id, kind:c.kind, name, initials:initialsOf(name), organizationId:c.organizationId, otherUserId:c.kind==='direct'?[...c.members.keys()].find(id=>id!==me):undefined,
        unread:visible.filter(m=>m.senderId!==me && (!member.lastReadAt || m.createdAt>member.lastReadAt)).length, muted:member.muted,
        members:[...c.members.values()].filter(m=>!m.leftAt).length, isAdmin:member.isAdmin, createdAt:c.createdAt,
        lastMessage:last?{ text:previewText(last.body,last.attachments.length>0), time:formatMessageTime(last.createdAt), mine:last.senderId===me, createdAt:last.createdAt }:undefined } satisfies Conversation;
    }).sort((a,b)=>(b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt));
  }
  async listMessages(input:{ conversationId:string; before?:string }) {
    const me = this.host.requireUser().id;
    const c = this.conversationFor(input.conversationId,me);
    return this.messages.filter(m=>m.conversationId===c.id && this.canView(m,me) && (!input.before || m.createdAt<input.before)).slice(-50).map(m=>this.toMessage(m,me));
  }
  async listConversationMembers(conversationId:string):Promise<ConversationMember[]> {
    const me = this.host.requireUser().id;
    const c = this.conversationFor(conversationId,me);
    return [...c.members].filter(([,m])=>!m.leftAt).map(([userId,m])=>{
      const p = this.host.person(userId);
      return { userId, name:p?.name ?? 'Tidligere bruker', schoolName:p?.schoolName, isAdmin:m.isAdmin, me:userId===me };
    }).sort((a,b)=>Number(b.me)-Number(a.me) || a.name.localeCompare(b.name,'nb'));
  }
  async searchRecipients(query:string):Promise<RecipientSearchResult[]> {
    const me = this.host.requireUser().id;
    const q = query.trim().toLowerCase();
    if (q.length<2) return [];
    const people = this.host.people().filter(p=>p.active && p.id!==me && !this.blockedBetween(me,p.id) && p.name.toLowerCase().includes(q))
      .sort((a,b)=>a.name.localeCompare(b.name,'nb')).slice(0,10).map(p=>({ kind:'person' as const, id:p.id, name:p.name, schoolName:p.schoolName }));
    const order = { national:0, county_board:1, local_board:2, school:3 };
    const orgs = this.host.activeOrganizations().filter(o=>`${o.name} ${o.schoolName ?? ''}`.toLowerCase().includes(q))
      .sort((a,b)=>order[a.type]-order[b.type] || a.name.localeCompare(b.name,'nb')).slice(0,10)
      .map(o=>({ kind:'organization' as const, id:o.id, name:o.schoolName ?? o.name, county:o.county, type:o.type }));
    return [...people,...orgs];
  }
  async listOrganizationContacts(organizationId:string):Promise<OrganizationContact[]> {
    const me = this.host.requireUser().id;
    const byUser = new Map<string,string[]>();
    for (const m of this.host.liveMembers(organizationId)) byUser.set(m.userId,[...(byUser.get(m.userId) ?? []),m.title]);
    return [...byUser].map(([userId,titles])=>({ userId, name:this.host.person(userId)?.name ?? '', publicTitle:titles.join(', '), me:userId===me }))
      .sort((a,b)=>a.name.localeCompare(b.name,'nb'));
  }
  async listBlockedUsers():Promise<BlockedUser[]> {
    const me = this.host.requireUser().id;
    return [...this.blocks].filter(k=>k.startsWith(`${me}:`)).map(k=>k.slice(me.length+1)).map(userId=>({ userId, name:this.host.person(userId)?.name ?? 'Tidligere bruker' }));
  }
  async getMessageSettings():Promise<MessageSettings> {
    return { readReceipts:this.readReceipts.get(this.host.requireUser().id) ?? false };
  }
  async getAttachmentUrl(path:string) {
    const me = this.host.requireUser().id;
    const attachment = this.messages.filter(m=>this.canView(m,me)).flatMap(m=>m.attachments).find(a=>a.path===path);
    if (!attachment) throw new Error('Vedlegget kunne ikke åpnes.');
    return attachment.url;
  }
  subscribeToMessages(listener:()=>void) {
    this.listeners.add(listener);
    return ()=>{ this.listeners.delete(listener); };
  }

  // ---- Opprette samtaler ----
  async startDirectConversation(userId:string) {
    const me = this.host.requireUser().id;
    if (userId===me || !this.host.person(userId)?.active) throw new Error('Fant ikke personen, eller profilen er deaktivert.');
    if (this.blockedBetween(me,userId)) throw new Error(errors.blocked);
    let c = this.conversations.find(x=>x.kind==='direct' && x.members.has(me) && x.members.has(userId));
    if (!c) {
      c = { id:this.host.nextId('c'), kind:'direct', createdAt:nowIso(), members:new Map() };
      for (const id of [me,userId]) c.members.set(id,{ joinedAt:nowIso(), historyStartsAt:nowIso(), isAdmin:false, muted:false });
      this.conversations.push(c);
    }
    return c.id;
  }
  async createGroup(input:CreateGroupInput) {
    const parsed = createGroupSchema.parse(input);
    const me = this.host.requireUser().id;
    const members = this.eligible(parsed.memberIds,me);
    if (!members.length) throw new Error(errors['no members']);
    const c:StoredConversation = { id:this.host.nextId('c'), kind:'group', name:parsed.name, createdAt:nowIso(), members:new Map() };
    c.members.set(me,{ joinedAt:nowIso(), historyStartsAt:nowIso(), isAdmin:true, muted:false });
    for (const id of members) c.members.set(id,{ joinedAt:nowIso(), historyStartsAt:nowIso(), isAdmin:false, muted:false });
    this.conversations.push(c);
    return c.id;
  }
  async createOrganizationGroup(organizationId:string) {
    const me = this.host.requireUser().id;
    const o = this.host.organization(organizationId);
    if (!o || o.status!=='active') throw new Error('Fant ikke organisasjonen, eller den er deaktivert.');
    const memberIds = (await this.listOrganizationContacts(organizationId)).filter(c=>!c.me).map(c=>c.userId);
    if (!this.eligible(memberIds,me).length) throw new Error(errors['no members']);
    return this.createGroup({ name:(o.schoolName ?? o.name).slice(0,80), memberIds });
  }
  async addConversationMembers(input:AddMembersInput) {
    const parsed = addMembersSchema.parse(input);
    const me = this.host.requireUser().id;
    const c = this.conversationFor(parsed.conversationId,me);
    if (c.kind!=='group' || !c.members.get(me)?.isAdmin) throw new Error('Du har ikke tilgang til å gjøre dette.');
    const added = this.eligible(parsed.userIds,me).filter(id=>!c.members.get(id) || c.members.get(id)!.leftAt);
    if ([...c.members.values()].filter(m=>!m.leftAt).length+added.length>GROUP_MAX_MEMBERS) throw new Error(errors['too many members']);
    for (const id of added) c.members.set(id,{ joinedAt:nowIso(), historyStartsAt:nowIso(), isAdmin:false, muted:false });
  }
  async leaveConversation(conversationId:string) {
    const me = this.host.requireUser().id;
    const c = this.conversationFor(conversationId,me);
    if (c.kind!=='group') throw new Error(errors['cannot leave']);
    Object.assign(c.members.get(me)!,{ leftAt:nowIso(), isAdmin:false });
    const remaining = [...c.members.values()].filter(m=>!m.leftAt).sort((a,b)=>a.joinedAt.localeCompare(b.joinedAt));
    if (remaining.length && !remaining.some(m=>m.isAdmin)) remaining[0].isAdmin = true;
  }

  // ---- Sende, lese, dempe og skjule ----
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const files = input.attachments ?? [];
    const parsed = messageSchema.parse({ ...input, attachments:files.map(f=>({ name:f.name, type:f.type, size:f.size })) });
    const me = this.host.requireUser().id;
    const c = this.conversationFor(parsed.conversationId,me);
    if (c.kind==='direct' && [...c.members.keys()].some(id=>id!==me && this.blockedBetween(me,id))) throw new Error(errors.blocked);
    const id = this.host.nextId('msg');
    const message:StoredMessage = { id, conversationId:c.id, senderId:me, body:parsed.body, createdAt:nowIso(),
      attachments:files.map((file,i)=>({ id:`${id}-${i}`, path:`${c.id}/${me}/${id}-${i}.${extension[parsed.attachments[i].type]}`, mimeType:parsed.attachments[i].type,
        byteSize:parsed.attachments[i].size, fileName:parsed.attachments[i].name, url:URL.createObjectURL(file) })) };
    this.messages.push(message);
    c.members.get(me)!.lastReadAt = message.createdAt;
    this.changed();
    return this.toMessage(message,me);
  }
  async markConversationRead(conversationId:string) {
    const me = this.host.requireUser().id;
    this.conversationFor(conversationId,me).members.get(me)!.lastReadAt = nowIso();
  }
  async setConversationMuted(input:{ conversationId:string; muted:boolean }) {
    const me = this.host.requireUser().id;
    this.conversationFor(input.conversationId,me).members.get(me)!.muted = input.muted;
  }
  async hideMessage(messageId:string) {
    const me = this.host.requireUser().id;
    this.visibleMessage(messageId,me);
    this.hidden.add(`${me}:${messageId}`);
  }
  async reportMessage(input:ReportMessageInput) {
    const parsed = reportMessageSchema.parse(input);
    const me = this.host.requireUser().id;
    const message = this.visibleMessage(parsed.messageId,me);
    if (message.senderId===me) throw new Error(errors['cannot report own message']);
    if (this.reported.has(`${me}:${message.id}`)) throw new Error(errors['already reported']);
    this.reported.add(`${me}:${message.id}`);
  }
  async blockUser(userId:string) {
    const me = this.host.requireUser().id;
    if (userId===me || !this.host.person(userId)) throw new Error('Fant ikke personen, eller profilen er deaktivert.');
    this.blocks.add(`${me}:${userId}`);
  }
  async unblockUser(userId:string) {
    this.blocks.delete(`${this.host.requireUser().id}:${userId}`);
  }
  async setReadReceipts(enabled:boolean) {
    this.readReceipts.set(this.host.requireUser().id,enabled);
  }
}

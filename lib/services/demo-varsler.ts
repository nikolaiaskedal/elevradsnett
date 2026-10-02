import { NOTIFICATION_CATEGORIES, DEFAULT_NOTIFICATION_PREFERENCES, inviteSummary, type AppNotification, type BoardMember, type Handover, type HandoverInvite, type HandoverOverview, type HandoverRole, type MyHandoverInvite, type NotificationCategory, type NotificationPreferences } from '@/lib/domain/notifications';
import type { GrantStatus, InternalRole, Organization } from '@/lib/domain/types';
import { handoverResponseSchema, isoDate, notificationPreferencesSchema, rescheduleHandoverSchema, setElectionDateSchema, startHandoverSchema } from '@/lib/domain/validation';
import type { HandoverResponseInput, NotificationPreferencesInput, RescheduleHandoverInput, SetElectionDateInput, StartHandoverInput } from './contracts';
import { varslerServerMessages as errors } from './supabase-varsler';

type Office = { id:string; userId:string; organizationId:string; title:string; startDate:string; endDate:string|null; status:GrantStatus; grantedBy?:string };
type Grant = { id:string; userId:string; organizationId:string; role:InternalRole; startDate:string; endDate:string|null; status:GrantStatus; grantedBy?:string };

/** Det demotjenesten vet om personer, verv og rettigheter. Varsler og overføring endrer de samme listene som resten av demoen. */
export type DemoVarslerHost = {
  requireUser():{ id:string; name:string; schoolId:string|null; email:string };
  isSignedIn():boolean;
  person(id:string):{ id:string; name:string; schoolId:string|null; active:boolean; email?:string }|undefined;
  organization(id:string):Organization|undefined;
  memberships:Office[];
  grants:Grant[];
  hasRole(userId:string,organizationId:string,roles:InternalRole[]):boolean;
  isAreaBoardAdmin(userId:string,schoolId:string):boolean;
  isSuper(userId:string):boolean;
  live(x:{ status:GrantStatus; startDate:string; endDate:string|null }):boolean;
  log(organizationId:string,action:string,subjectId?:string,details?:Record<string,unknown>):void;
  nextId(prefix:string):string;
};

/** Et lagret varsel. userId, type, title og link er de samme feltene som eldre demotester leser. */
export type StoredNotification = { id:string; userId:string; type:string; category:NotificationCategory; title:string; body?:string; link:string; count:number; readAt?:string; createdAt:string; groupKey?:string; sendEmail:boolean };
type StoredHandover = Omit<Handover,'invites'|'startedByName'> & { organizationId:string; startedBy:string };
type StoredInvite = Omit<HandoverInvite,'name'> & { handoverId:string; invitedName?:string; createdAt:string };

const today = ()=>isoDate(new Date());
const addDays = (days:number,from = new Date())=>isoDate(new Date(from.getFullYear(),from.getMonth(),from.getDate()+days));
const ago = (minutes:number)=>new Date(Date.now()-minutes*60000).toISOString();
const daysBetween = (from:string,to:string)=>Math.round((Date.parse(to)-Date.parse(from))/86400000);
const fail = (code:string)=>{ throw new Error(errors[code] ?? code); };
const category = (type:string):NotificationCategory=>{
  const prefix = type.split('.')[0];
  return prefix==='message'?'messages':prefix==='event'?'events':prefix==='handover'?'handover':['role','office','school_admin'].includes(prefix)?'roles':prefix==='friend'?'organization':'other';
};

/**
 * Varsler og styreoverføring i demoen. Spiller serverens rolle som RPC-ene i 202610120002_varsler_overforing.sql:
 * innstillinger per kategori, sammenslåing av uleste varsler, invitasjoner som må godtas, og aktivering som gir nye
 * verv og rettigheter og avslutter de gamle. Påminnelsene kjøres av pg_cron i ekte drift; demoen har dem fra start.
 */
export class DemoVarsler {
  readonly notifications:StoredNotification[] = [];
  private hidden = new Set<string>();
  private preferences = new Map<string,NotificationPreferences>();
  private electionDates = new Map<string,string>();
  private terms = new Map<string,string>();
  private handovers:StoredHandover[] = [];
  private invites:StoredInvite[] = [];
  private listeners = new Set<()=>void>();

  constructor(private host:DemoVarslerHost, seed:{ userId:string; schoolId:string|null; messageFrom?:string }|null) {
    if (!seed?.schoolId) return;
    // Ida er skoleadministrator på Elvebakken. Styreskiftet er om 12 dager, og påminnelsen 14 dager før er sendt.
    this.electionDates.set(seed.schoolId,addDays(12));
    this.terms.set(seed.schoolId,'2025-08-25');
    const school = host.organization(seed.schoolId)?.name ?? 'skolen';
    this.store({ userId:seed.userId, type:'handover.reminder', title:'Påminnelse om styreoverføring', body:`Styreskiftet i ${school} er om 14 dager. Start styreoverføringen i administrasjonen.`, link:'#/admin', createdAt:ago(2*24*60) });
    this.store({ userId:seed.userId, type:'school_admin.requested', title:'Ny forespørsel om skoleadministrator', body:'Frida Aas vil bli skoleadministrator for Oslo handelsgymnasium.', link:'#/admin', createdAt:ago(5*60) });
    if (seed.messageFrom) this.store({ userId:seed.userId, type:'message.new', title:`Ny melding fra ${seed.messageFrom}`, link:'#/meldinger', groupKey:'demo-conversation', createdAt:ago(25) });
    this.store({ userId:seed.userId, type:'office.assigned', title:'Du har fått et verv', body:`Fylkesstyremedlem i Elevorganisasjonen i Oslo.`, link:'#/profil', createdAt:ago(30*24*60), readAt:ago(29*24*60) });
  }

  // ---- Varsler ----
  /** Samme regler som prepare_notification: deaktiverte får ingenting, innstillingene gjelder, og uleste slås sammen. */
  notify(userId:string,type:string,title:string,body?:string,link = '#/varsler',groupKey?:string) {
    if (this.host.person(userId)?.active===false) return;
    const cat = category(type);
    const prefs = this.preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES;
    const inApp = prefs.inApp && !prefs.inAppOff.includes(cat);
    const email = prefs.email && !prefs.emailOff.includes(cat);
    if (!inApp && !email) return;
    const open = groupKey?this.notifications.find(n=>n.userId===userId && n.groupKey===groupKey && !n.readAt):undefined;
    if (open) Object.assign(open,{ title, body, link, count:open.count+1, createdAt:new Date().toISOString(), sendEmail:email });
    else this.store({ userId, type, title, body, link, groupKey, sendEmail:email, hidden:!inApp });
    this.listeners.forEach(l=>l());
  }
  private store(n:{ userId:string; type:string; title:string; body?:string; link:string; groupKey?:string; createdAt?:string; readAt?:string; sendEmail?:boolean; hidden?:boolean }) {
    const id = this.host.nextId('n');
    this.notifications.push({ id, userId:n.userId, type:n.type, category:category(n.type), title:n.title, body:n.body, link:n.link, count:1, readAt:n.readAt,
      createdAt:n.createdAt ?? new Date().toISOString(), groupKey:n.groupKey, sendEmail:n.sendEmail ?? true });
    if (n.hidden) this.hidden.add(id);
  }
  async listNotifications():Promise<AppNotification[]> {
    if (!this.host.isSignedIn()) return [];
    const me = this.host.requireUser().id;
    return this.notifications.filter(n=>n.userId===me && !this.hidden.has(n.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)
      .map(n=>({ id:n.id, type:n.type, category:n.category, title:n.title, body:n.body, link:n.link, count:n.count, read:!!n.readAt, createdAt:n.createdAt }));
  }
  async markNotificationsRead(ids?:string[]) {
    const me = this.host.requireUser().id;
    const now = new Date().toISOString();
    for (const n of this.notifications) if (n.userId===me && !n.readAt && (!ids || ids.includes(n.id))) n.readAt = now;
    this.listeners.forEach(l=>l());
  }
  async getNotificationPreferences():Promise<NotificationPreferences> {
    return structuredClone(this.preferences.get(this.host.requireUser().id) ?? DEFAULT_NOTIFICATION_PREFERENCES);
  }
  async setNotificationPreferences(input:NotificationPreferencesInput) {
    const p = notificationPreferencesSchema.parse(input);
    const order = (list:NotificationCategory[])=>NOTIFICATION_CATEGORIES.filter(c=>list.includes(c));
    this.preferences.set(this.host.requireUser().id,{ inApp:p.inApp, email:p.email, inAppOff:order(p.inAppOff), emailOff:order(p.emailOff) });
  }
  subscribeToNotifications(listener:()=>void) {
    this.listeners.add(listener);
    return ()=>{ this.listeners.delete(listener); };
  }

  // ---- Styreoverføring ----
  private liveSchoolAdmins(orgId:string) {
    return this.host.grants.filter(g=>g.organizationId===orgId && g.role==='school_admin' && this.host.live(g) && this.host.person(g.userId)?.active!==false);
  }
  private overdueDays(orgId:string) {
    const expected = this.electionDates.get(orgId);
    if (!expected) return 0;
    const done = this.handovers.some(h=>h.organizationId===orgId && h.status==='completed' && h.activationDate>=addDays(-60,new Date(expected)));
    return done?0:Math.max(0,daysBetween(expected,today()));
  }
  private requireView(orgId:string) {
    const me = this.host.requireUser();
    const o = this.host.organization(orgId);
    if (!o || o.type!=='school') fail('school not found');
    if (!this.host.hasRole(me.id,orgId,['school_admin','board_admin']) && !this.host.isAreaBoardAdmin(me.id,orgId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    return { me, org:o! };
  }
  private openHandover(orgId:string) { return this.handovers.find(h=>h.organizationId===orgId && (h.status==='awaiting_acceptance' || h.status==='scheduled')); }
  private inviteName(i:StoredInvite) { return i.userId?this.host.person(i.userId)?.name ?? '':i.invitedName ?? i.email ?? ''; }

  async getHandoverOverview(organizationId:string):Promise<HandoverOverview> {
    const { me, org } = this.requireView(organizationId);
    const members = new Map<string,BoardMember>();
    const member = (userId:string)=>{
      const p = this.host.person(userId);
      if (!p?.active) return null;
      if (!members.has(userId)) members.set(userId,{ userId, name:p.name, offices:[], roles:[] });
      return members.get(userId)!;
    };
    for (const m of this.host.memberships) if (m.organizationId===organizationId && m.title && this.host.live(m)) member(m.userId)?.offices.push(m.title);
    for (const g of this.host.grants) if (g.organizationId===organizationId && (g.role==='school_admin' || g.role==='content_manager') && this.host.live(g)) {
      const x = member(g.userId);
      if (x && !x.roles.includes(g.role)) x.roles.push(g.role);
    }
    const h = this.openHandover(organizationId) ?? [...this.handovers].reverse().find(x=>x.organizationId===organizationId);
    const overdueDays = this.overdueDays(organizationId);
    const adminCount = this.liveSchoolAdmins(organizationId).length;
    return structuredClone({
      organizationId, name:org.schoolName ?? org.name, expectedHandoverOn:this.electionDates.get(organizationId), termStartsOn:this.terms.get(organizationId), overdueDays, adminCount,
      canManage:this.host.hasRole(me.id,organizationId,['school_admin']),
      canRecover:(this.host.isAreaBoardAdmin(me.id,organizationId) || this.host.isSuper(me.id)) && (overdueDays>=7 || adminCount===0),
      members:[...members.values()].sort((a,b)=>a.name.localeCompare(b.name,'nb')),
      handover:h?{ id:h.id, status:h.status, activationDate:h.activationDate, oldBoardEndsOn:h.oldBoardEndsOn, recovery:h.recovery, recoveryReason:h.recoveryReason,
        startedByName:this.host.person(h.startedBy)?.name ?? '', createdAt:h.createdAt, completedAt:h.completedAt,
        invites:this.invites.filter(i=>i.handoverId===h.id).map(i=>({ id:i.id, userId:i.userId, name:this.inviteName(i), email:i.userId?undefined:i.email, publicTitle:i.publicTitle,
          adminRole:i.adminRole, status:i.status, respondedAt:i.respondedAt })) }:null,
    });
  }
  async setElectionDate(input:SetElectionDateInput) {
    const p = setElectionDateSchema.parse(input);
    this.requireView(p.organizationId);
    this.electionDates.set(p.organizationId,p.date);
    this.host.log(p.organizationId,'handover.date_set',undefined,{ date:p.date });
  }
  async startHandover(input:StartHandoverInput) {
    const p = startHandoverSchema.parse(input);
    const { me, org } = this.requireView(p.organizationId);
    const recovery = p.recoveryReason!==undefined;
    if (recovery) {
      if (!this.host.isAreaBoardAdmin(me.id,org.id) && !this.host.isSuper(me.id)) throw new Error('Du har ikke tilgang til å gjøre dette.');
      if (this.overdueDays(org.id)<7 && this.liveSchoolAdmins(org.id).length>0) fail('recovery not allowed');
    } else if (!this.host.hasRole(me.id,org.id,['school_admin'])) throw new Error('Du har ikke tilgang til å gjøre dette.');
    if (this.openHandover(org.id)) fail('handover already open');
    const invites = p.invites.map(i=>{
      const userId = i.userId;
      if (userId) {
        const person = this.host.person(userId);
        if (!person?.active || person.schoolId!==org.id) throw new Error('Personen går ikke på denne skolen.');
      }
      if (userId===me.id && i.adminRole && !this.host.hasRole(me.id,org.id,[i.adminRole])) throw new Error('Du kan ikke gi deg selv rettigheter.');
      return { ...i, userId };
    });
    const id = this.host.nextId('h');
    this.handovers.push({ id, organizationId:org.id, status:'awaiting_acceptance', activationDate:p.activationDate, oldBoardEndsOn:p.oldBoardEndsOn, recovery, recoveryReason:p.recoveryReason,
      startedBy:me.id, createdAt:new Date().toISOString() });
    for (const i of invites) {
      this.invites.push({ id:this.host.nextId('hi'), handoverId:id, userId:i.userId, email:i.userId?undefined:i.email, invitedName:i.userId?undefined:i.name || undefined,
        publicTitle:i.publicTitle, adminRole:i.adminRole as HandoverRole|undefined, status:'pending', createdAt:new Date().toISOString() });
      if (i.userId) this.notify(i.userId,'handover.invited','Du er invitert inn i det nye styret',
        `${org.name} vil gi deg ${inviteSummary({ publicTitle:i.publicTitle, adminRole:i.adminRole as HandoverRole|undefined }).toLowerCase()}. Godta eller avslå invitasjonen.`);
    }
    this.electionDates.set(org.id,p.handoverOn);
    this.host.log(org.id,recovery?'handover.recovery_started':'handover.started',undefined,{ invites:invites.length, activation_date:p.activationDate });
    return id;
  }
  private handover(id:string) {
    const h = this.handovers.find(x=>x.id===id);
    if (!h) fail('handover not found');
    return h!;
  }
  async rescheduleHandover(input:RescheduleHandoverInput) {
    const p = rescheduleHandoverSchema.parse(input);
    const h = this.handover(p.handoverId);
    this.requireView(h.organizationId);
    if (h.status!=='awaiting_acceptance' && h.status!=='scheduled') fail('handover not open');
    Object.assign(h,{ activationDate:p.activationDate, oldBoardEndsOn:p.oldBoardEndsOn });
    this.host.log(h.organizationId,'handover.rescheduled',undefined,{ activation_date:p.activationDate });
    if (h.status==='scheduled' && h.activationDate<=today()) this.activate(h);
  }
  async cancelHandover(handoverId:string) {
    const h = this.handover(handoverId);
    this.requireView(h.organizationId);
    if (h.status!=='awaiting_acceptance' && h.status!=='scheduled') fail('handover not open');
    h.status = 'cancelled';
    for (const i of this.invites.filter(x=>x.handoverId===h.id)) {
      if (i.userId && (i.status==='pending' || i.status==='accepted')) this.notify(i.userId,'handover.cancelled','Styreoverføringen er avlyst',`Invitasjonen fra ${this.host.organization(h.organizationId)?.name} gjelder ikke lenger.`);
      if (i.status==='pending') i.status = 'expired';
    }
    this.host.log(h.organizationId,'handover.cancelled');
  }
  async activateHandoverNow(handoverId:string) {
    const h = this.handover(handoverId);
    this.requireView(h.organizationId);
    if (h.status!=='scheduled') fail('accepted successor required');
    if (h.activationDate>today()) Object.assign(h,{ activationDate:today(), oldBoardEndsOn:h.oldBoardEndsOn<today()?h.oldBoardEndsOn:today() });
    this.activate(h);
  }
  async listMyHandoverInvites():Promise<MyHandoverInvite[]> {
    if (!this.host.isSignedIn()) return [];
    const me = this.host.requireUser();
    return this.invites.filter(i=>i.status==='pending' && this.mine(i,me)).flatMap(i=>{
      const h = this.handover(i.handoverId);
      if (h.status==='cancelled') return [];
      const org = this.host.organization(h.organizationId);
      return [{ id:i.id, organizationId:h.organizationId, organizationName:org?.name ?? '', publicTitle:i.publicTitle, adminRole:i.adminRole, activationDate:h.activationDate,
        invitedByName:this.host.person(h.startedBy)?.name ?? '', createdAt:i.createdAt, atSchool:me.schoolId===h.organizationId }];
    });
  }
  private mine(i:StoredInvite,me:{ id:string; email:string }) { return i.userId===me.id || (!i.userId && i.email?.toLowerCase()===me.email.toLowerCase()); }
  async respondToHandoverInvite(input:HandoverResponseInput) {
    const p = handoverResponseSchema.parse(input);
    const me = this.host.requireUser();
    const i = this.invites.find(x=>x.id===p.inviteId);
    if (!i || !this.mine(i,me)) fail('invite not found');
    const h = this.handover(i!.handoverId);
    if (i!.status!=='pending' || h.status==='cancelled') fail('invite not pending');
    if (p.accept && me.schoolId!==h.organizationId) throw new Error('Personen går ikke på denne skolen.');
    Object.assign(i!,{ userId:me.id, status:p.accept?'accepted':'declined', respondedAt:new Date().toISOString() });
    this.host.log(h.organizationId,p.accept?'handover.accepted':'handover.declined',me.id);
    this.notify(h.startedBy,p.accept?'handover.accepted':'handover.declined',`${me.name} ${p.accept?'har godtatt invitasjonen':'har takket nei'}`,`Styreoverføringen i ${this.host.organization(h.organizationId)?.name}.`,'#/admin');
    if (!p.accept) return;
    if (h.status==='completed') { this.apply(h,i!); return; }
    if (i!.adminRole==='school_admin' && h.status==='awaiting_acceptance') h.status = 'scheduled';
    if (h.status==='scheduled' && h.activationDate<=today()) this.activate(h);
  }
  private apply(h:StoredHandover,i:StoredInvite) {
    if (i.status!=='accepted' || !i.userId) return;
    const start = h.activationDate<today()?h.activationDate:today();
    if (i.publicTitle && !this.host.memberships.some(m=>m.userId===i.userId && m.organizationId===h.organizationId && m.title.toLowerCase()===i.publicTitle!.toLowerCase() && this.host.live(m)))
      this.host.memberships.push({ id:this.host.nextId('m'), userId:i.userId, organizationId:h.organizationId, title:i.publicTitle, startDate:start, endDate:null, status:'active', grantedBy:h.startedBy });
    if (i.adminRole && !this.host.grants.some(g=>g.userId===i.userId && g.organizationId===h.organizationId && g.role===i.adminRole && this.host.live(g)))
      this.host.grants.push({ id:this.host.nextId('g'), userId:i.userId, organizationId:h.organizationId, role:i.adminRole, startDate:start, endDate:null, status:'active', grantedBy:h.startedBy });
  }
  /** Som activate_handover: nye verv og rettigheter, sluttdato for det som ikke videreføres, og ny styreperiode. */
  private activate(h:StoredHandover) {
    const accepted = this.invites.filter(i=>i.handoverId===h.id && i.status==='accepted');
    if (!accepted.some(i=>i.adminRole==='school_admin')) fail('accepted successor required');
    for (const i of accepted) this.apply(h,i);
    const ends = h.oldBoardEndsOn<today()?h.oldBoardEndsOn:today();
    for (const m of this.host.memberships) if (m.organizationId===h.organizationId && m.title && this.host.live(m) && m.startDate<h.activationDate
      && !accepted.some(i=>i.userId===m.userId && i.publicTitle?.toLowerCase()===m.title.toLowerCase())) Object.assign(m,{ status:'ended', endDate:m.startDate>ends?m.startDate:ends });
    for (const g of this.host.grants) if (g.organizationId===h.organizationId && (g.role==='school_admin' || g.role==='content_manager') && this.host.live(g) && g.startDate<h.activationDate
      && !accepted.some(i=>i.userId===g.userId && i.adminRole===g.role)) Object.assign(g,{ status:'ended', endDate:g.startDate>ends?g.startDate:ends });
    Object.assign(h,{ status:'completed', completedAt:new Date().toISOString() });
    this.terms.set(h.organizationId,h.activationDate);
    this.electionDates.set(h.organizationId,addDays(365,new Date(h.activationDate)));
    this.host.log(h.organizationId,'handover.completed',undefined,{ activation_date:h.activationDate });
  }
}

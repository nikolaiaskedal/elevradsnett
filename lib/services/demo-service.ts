import * as demo from '@/lib/demo-data';
import { orgSub } from '@/lib/domain/labels';
import { initialsOf } from '@/lib/domain/labels';
import type { AdminOrganization, AssignablePerson, Audience, AuditEntry, Comment, Conversation, CurrentUser, Event, FriendConnection, GrantStatus, InternalRole, Message, MyRole, Organization, OrganizationRoleEntry, Post, PostDraft, PostRevision, Representation, SchoolAdminRequest, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import { assignPublicOfficeSchema, assignRoleSchema, audiencesFor, avatarSchema, changeSchoolSchema, commentSchema, decideFriendRequestSchema, decideSchoolAdminRequestSchema, editPostSchema, eventResponseInputSchema, friendRequestSchema, isoDate, messageSchema, onboardingSchema, publishPostSchema, requestLoginCodeSchema, saveDraftSchema, schoolAdminRequestSchema, updateProfileSchema, verifyLoginCodeSchema, voteSchema } from '@/lib/domain/validation';
import type { AddCommentInput, AssignPublicOfficeInput, AssignRoleInput, ChangeSchoolInput, DecideFriendRequestInput, DecideSchoolAdminRequestInput, EditPostInput, ElevradsnettService, FriendRequestInput, SaveDraftInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SchoolAdminRequestInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from './contracts';

/** Engangskoden som alltid virker i demoen. Vises i innloggingsdialogen når demotjenesten brukes. */
export const DEMO_LOGIN_CODE = '123456';
/** Logger du inn med denne adressen i demoen, blir du Ida (med verv). Andre adresser går til onboarding. */
export const DEMO_EMAIL = demo.currentUser.email;

type Person = { id:string; name:string; schoolId:string|null; active:boolean };
type Membership = { id:string; userId:string; organizationId:string; title:string; startDate:string; endDate:string|null; status:GrantStatus; grantedBy?:string };
type Grant = { id:string; userId:string; organizationId:string; role:InternalRole; startDate:string; endDate:string|null; status:GrantStatus; grantedBy?:string };
type StoredDraft = PostDraft & { actorId:string };
type StoredConnection = { id:string; requesterId:string; recipientId:string; status:'pending'|'accepted'|'rejected'|'ended'; createdAt:string; approvedAt?:string };
type StoredRequest = Omit<SchoolAdminRequest,'userName'|'schoolName'|'mine'|'canDecide'>;
type Logged = AuditEntry & { organizationId:string; actorId:string; subjectId?:string };

const ROLES:InternalRole[] = ['super_admin','board_admin','school_admin','content_manager'];
const today = ()=>isoDate(new Date());
const personId = (name:string)=>name===demo.currentUser.name?demo.currentUser.id:`person-${name.toLowerCase().normalize('NFD').replace(/[^a-z]+/g,'-')}`;

/**
 * Minnebasert tjeneste over demodataene. Brukes når Supabase ikke er konfigurert, og i tester.
 * Hver instans har sin egen kopi av dataene, så endringer lekker ikke mellom instanser.
 * Den spiller også serverens rolle: avviser handlinger uten innlogging, sjekker skjemaene og
 * regner ut rettigheter på samme måte som databasen (has_role, has_area_role og can_grant_role).
 */
export class DemoElevradsnettService implements ElevradsnettService {
  readonly demoLoginHint = `Demo: koden er ${DEMO_LOGIN_CODE}. Med ${DEMO_EMAIL} logger du inn som Ida, som har verv og er administrator. Andre adresser går til onboarding.`;
  private status:Session['status'];
  private user:CurrentUser = structuredClone(demo.currentUser);
  private activeRepresentationId:string|null = demo.demoRepresentationIds.elvebakken;
  private schoolHistory:SchoolHistoryEntry[] = [];
  private pendingEmail = '';
  private listeners = new Set<()=>void>();
  private organizations = structuredClone(demo.organizations);
  private posts:Post[] = structuredClone(demo.initialPosts).map(p=>({ ...p, schoolLevel:p.schoolLevel ?? 'both' }));
  private drafts:StoredDraft[] = structuredClone(demo.demoDrafts);
  private revisions:Record<string,PostRevision[]> = structuredClone(demo.demoRevisions);
  private connections:StoredConnection[] = demo.demoFriendConnections.map((c,i)=>({ id:`fc-${i+1}`, ...c }));
  private events = structuredClone(demo.events);
  private conversations = structuredClone(demo.conversations);
  private supported = new Set<string>();
  private votes = new Map<string,string>();
  private eventResponses = new Map<string,'going'|'interested'>();
  private reported = new Set<string>();
  private people = new Map<string,Person>();
  private memberships:Membership[] = [];
  private grants:Grant[] = [];
  private requests:StoredRequest[] = [];
  private audit:Logged[] = [];
  private sequence = 0;

  /** Demoen starter innlogget som Ida, med mindre signedIn er false (slik appen bruker den). */
  constructor(options:{ signedIn?:boolean } = {}) {
    this.status = options.signedIn===false?'anonymous':'active';
    if (this.user.schoolId) this.schoolHistory = [this.historyEntry(this.user.schoolId,'2024-08-15T00:00:00.000Z')];
    this.seedRoles();
  }

  /** Personer og verv fra listene over tillitsvalgte, pluss rettighetene og forespørslene i demodataene. */
  private seedRoles() {
    const person = (name:string,schoolId:string|null,active = true)=>{
      const id = personId(name);
      if (!this.people.has(id)) this.people.set(id,{ id, name, schoolId:id===this.user.id?this.user.schoolId:schoolId, active });
      return id;
    };
    for (const o of this.organizations) {
      for (const officer of o.officers ?? []) {
        const userId = person(officer.name,o.type==='school'?o.id:demo.demoPersonSchools[officer.name] ?? null);
        const id = userId===this.user.id?demo.demoRepresentationIds[o.id] ?? `m-${officer.id}`:`m-${officer.id}`;
        this.memberships.push({ id, userId, organizationId:o.id, title:officer.publicTitle, startDate:'2025-08-25', endDate:null, status:'active' });
      }
    }
    for (const former of demo.demoFormerOfficers) {
      const userId = person(former.name,former.organizationId,former.personActive);
      this.memberships.push({ id:this.nextId('m'), userId, organizationId:former.organizationId, title:former.title, startDate:former.startDate, endDate:former.endDate, status:'ended' });
    }
    for (const g of demo.demoGrants) this.grants.push({ id:this.nextId('g'), userId:person(g.person,null), organizationId:g.organizationId, role:g.role, startDate:g.startDate, endDate:null, status:'active' });
    for (const r of demo.demoSchoolAdminRequests) this.requests.push({ id:this.nextId('r'), userId:person(r.person,r.schoolId), schoolId:r.schoolId, message:r.message, status:'pending', createdAt:r.createdAt });
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
  private log(organizationId:string,action:string,subjectId?:string,details:Record<string,unknown> = {}) {
    this.audit.unshift({ id:this.nextId('a'), createdAt:new Date().toISOString(), actorId:this.user.id, actorName:this.user.name, action, organizationId, subjectId, details });
  }

  // ---- Rettigheter, regnet ut som i databasen ----
  private live(x:{ status:GrantStatus; startDate:string; endDate:string|null }) { return x.status==='active' && x.startDate<=today() && (!x.endDate || x.endDate>=today()); }
  private isSuper(userId:string) { return this.grants.some(g=>g.userId===userId && g.role==='super_admin' && this.live(g)); }
  /** has_role: egen rettighet, superadministrator, eller fylkesstyreadministrator i lokallaget til egen skole. */
  private hasRole(userId:string,orgId:string,roles:InternalRole[]):boolean {
    if (this.isSuper(userId)) return true;
    if (this.grants.some(g=>g.userId===userId && g.organizationId===orgId && roles.includes(g.role) && this.live(g))) return true;
    if (!roles.includes('board_admin')) return false;
    const lb = this.organizations.find(o=>o.id===orgId && o.type==='local_board');
    const school = this.organizations.find(o=>o.id===this.people.get(userId)?.schoolId);
    if (!lb || !school || school.localBoard!==lb.localBoard) return false;
    return this.organizations.some(cb=>cb.type==='county_board' && cb.county===lb.county && this.grants.some(g=>g.userId===userId && g.organizationId===cb.id && g.role==='board_admin' && this.live(g)));
  }
  /** Styreadministrator over skolen: lokallaget eller fylkesstyret. */
  private isAreaBoardAdmin(userId:string,schoolId:string) {
    const s = this.organizations.find(o=>o.id===schoolId && o.type==='school');
    if (!s) return false;
    return this.organizations.some(o=>((o.type==='local_board' && s.localBoard && o.localBoard===s.localBoard) || (o.type==='county_board' && o.county===s.county)) && this.hasRole(userId,o.id,['board_admin']));
  }
  private hasAreaRole(userId:string,orgId:string) { return this.hasRole(userId,orgId,['school_admin','board_admin']) || this.isAreaBoardAdmin(userId,orgId); }
  private roleFits(orgId:string,role:InternalRole) {
    const type = this.organizations.find(o=>o.id===orgId)?.type;
    if (!type) return false;
    return role==='super_admin'?type==='national':role==='board_admin'?type!=='school':role==='school_admin'?type==='school':true;
  }
  private canGrant(orgId:string,role:InternalRole) {
    if (!this.roleFits(orgId,role)) return false;
    return role==='super_admin'||role==='board_admin'?this.isSuper(this.user.id):this.hasAreaRole(this.user.id,orgId);
  }
  private requireAreaAdmin(orgId:string) {
    this.requireUser();
    if (!this.hasAreaRole(this.user.id,orgId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
  }
  /** can_view_post: offentlig for alle; ellers medlemmer av avsenderen, fylket, lokallaget eller venneråd. */
  private canView(p:Post) {
    if (p.audience==='public') return true;
    if (this.status!=='active') return false;
    if (this.memberships.some(m=>m.userId===this.user.id && m.organizationId===p.organizationId && this.live(m))) return true;
    const school = this.organizations.find(o=>o.id===this.user.schoolId);
    const author = this.organizations.find(o=>o.id===p.organizationId);
    if (!school || !author) return false;
    if (p.audience==='county') return school.county===author.county;
    if (p.audience==='local') return !!school.localBoard && school.localBoard===author.localBoard;
    return school.id===author.id || this.connected(school.id,author.id);
  }
  private connected(a:string,b:string) {
    return this.connections.some(c=>c.status==='accepted' && ((c.requesterId===a && c.recipientId===b) || (c.requesterId===b && c.recipientId===a)));
  }
  private canManagePost(organizationId:string) {
    return this.status==='active' && this.hasRole(this.user.id,organizationId,['content_manager','school_admin','board_admin']);
  }
  private cards(posts:Post[]) { return structuredClone(posts.map(p=>({ ...p, canManage:this.canManagePost(p.organizationId) }))); }
  /** check_post_content: målgruppen må passe avsenderen, og et tagget arrangement må være publisert. */
  private checkContent(organizationId:string,audience:Audience,eventId?:string) {
    const o = this.organization(organizationId);
    if (!audiencesFor(o.type,!!o.localBoard).includes(audience)) throw new Error('Denne målgruppen passer ikke for avsenderen.');
    if (eventId && !this.events.some(e=>e.id===eventId && (e.status==='published' || e.status==='completed'))) throw new Error('Fant ikke arrangementet, eller det er ikke publisert.');
  }
  /** Representasjonen må være aktiv og ha publiseringsrett. */
  private publisher(representationId:string) {
    this.requireUser();
    const rep = this.usableRepresentation(representationId);
    if (!rep.canPublish) throw new Error(`${rep.name} har ikke gitt deg publiseringsrett.`);
    return rep;
  }
  private requireSchoolAdmin(schoolId:string) {
    this.requireUser();
    if (!this.hasRole(this.user.id,schoolId,['school_admin'])) throw new Error('Du har ikke tilgang til å gjøre dette.');
  }
  private logFriend(action:string,c:StoredConnection) {
    for (const [org,other] of [[c.requesterId,c.recipientId],[c.recipientId,c.requesterId]]) this.log(org,action,undefined,{ school_id:other, school_name:this.organization(other).name });
  }

  private representations():Representation[] {
    const order = { school:0, local_board:1, county_board:2, national:3 };
    return this.memberships.filter(m=>m.userId===this.user.id && this.live(m)).flatMap(m=>{
      const o = this.organizations.find(x=>x.id===m.organizationId);
      if (!o || o.status==='archived') return [];
      return [{ id:m.id, organizationId:o.id, name:o.name, initials:o.initials, publicRole:m.title || 'Medlem', type:o.type, organizationStatus:o.status,
        canPublish:o.status==='active' && this.hasRole(this.user.id,o.id,['content_manager','school_admin','board_admin']) }];
    }).sort((a,b)=>Number(a.organizationStatus!=='active')-Number(b.organizationStatus!=='active') || order[a.type]-order[b.type] || a.name.localeCompare(b.name,'nb'));
  }
  private representation(id:string):Representation {
    const rep = this.representations().find(r=>r.id===id);
    if (!rep) throw new Error('Ukjent representasjon.');
    return rep;
  }
  private usableRepresentation(id:string) {
    const rep = this.representation(id);
    if (rep.organizationStatus!=='active') throw new Error('Du kan ikke representere denne organisasjonen.');
    return rep;
  }
  /** Offentlige verv slik get_public_officers viser dem: aktive verv hos aktive personer i aktive organisasjoner. */
  private officersOf(o:Organization) {
    if (o.status!=='active') return [];
    return this.memberships.filter(m=>m.organizationId===o.id && this.live(m) && this.people.get(m.userId)?.active)
      .map(m=>({ id:m.id, name:this.people.get(m.userId)!.name, publicTitle:m.title }));
  }
  private withOfficers(o:Organization):Organization {
    const officers = this.officersOf(o);
    return { ...o, following:this.status==='active'?o.following:false, officers, officerCount:officers.length };
  }

  async getSession():Promise<Session> {
    if (this.status==='anonymous') return { status:'anonymous' };
    if (this.status==='onboarding') return { status:'onboarding', email:this.pendingEmail };
    const representations = this.representations();
    const usable = representations.filter(r=>r.organizationStatus==='active');
    const active = usable.find(r=>r.id===this.activeRepresentationId) ?? usable[0];
    return structuredClone({ status:this.status, user:this.user, representations, activeRepresentationId:active?.id ?? null });
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
    return structuredClone(this.organizations.filter(o=>o.status==='active').map(o=>this.withOfficers(o)));
  }
  async getOrganization(organizationId:string) {
    const o = this.organizations.find(x=>x.id===organizationId && x.status!=='archived');
    return o?structuredClone(this.withOfficers(o)):null;
  }
  async listFeed(input:{ representationId:string|null; mode:'recommended'|'chronological' }) {
    if (input.representationId===null || this.status!=='active') return this.cards(this.posts.filter(p=>p.audience==='public'));
    const rep = this.representation(input.representationId);
    // Innlegg rettet mot en annen skoleform enn representasjonens vises ikke i feeden (som get_ranked_feed).
    const level = this.organizations.find(o=>o.id===rep.organizationId)?.schoolLevel;
    return this.cards(this.posts.filter(p=>this.canView(p) && (!level || !p.schoolLevel || p.schoolLevel==='both' || p.schoolLevel===level)));
  }
  async listOrganizationPosts(organizationId:string) {
    return this.cards(this.posts.filter(p=>p.organizationId===organizationId && this.canView(p)));
  }
  async listEvents():Promise<Event[]> { return structuredClone(this.events); }
  async listConversations() { return this.status==='active'?structuredClone(this.conversations):[]; }
  async listPublicOfficers(organizationId:string) { return structuredClone(this.officersOf(this.organization(organizationId))); }

  async completeOnboarding(input:OnboardingInput) {
    const parsed = onboardingSchema.parse(input);
    if (this.status!=='onboarding') throw new Error('Profilen din er allerede opprettet.');
    const school = this.organization(parsed.schoolId);
    if (school.type!=='school' || school.status!=='active') throw new Error('Velg en skole.');
    this.user = { ...this.user, name:parsed.displayName, initials:initialsOf(parsed.displayName), schoolId:school.id };
    this.people.set(this.user.id,{ id:this.user.id, name:this.user.name, schoolId:school.id, active:true });
    this.schoolHistory = [this.historyEntry(school.id,new Date().toISOString())];
    this.status = 'active';
    this.log(school.id,'profile.onboarded',this.user.id);
  }
  async updateProfile(input:UpdateProfileInput) {
    const parsed = updateProfileSchema.parse(input);
    this.requireUser();
    this.user = { ...this.user, name:parsed.displayName, initials:initialsOf(parsed.displayName) };
    const me = this.people.get(this.user.id);
    if (me) me.name = parsed.displayName;
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
    const old = user.schoolId;
    if (old) {
      const admins = this.grants.filter(g=>g.organizationId===old && g.role==='school_admin' && this.live(g));
      if (admins.some(g=>g.userId===user.id) && !admins.some(g=>g.userId!==user.id))
        throw new Error('Du er siste skoleadministrator ved skolen. Overfør administratorrollen til en annen før du bytter skole.');
      // Verv og rettigheter ved gammel skole avsluttes med sluttdato. Ingen rettigheter følger med til ny skole.
      for (const x of [...this.memberships,...this.grants]) if (x.userId===user.id && x.organizationId===old && this.live(x)) { x.status = 'ended'; x.endDate = today(); }
    }
    const now = new Date().toISOString();
    this.schoolHistory = [this.historyEntry(school.id,now),...this.schoolHistory.map(h=>h.endedAt?h:{ ...h, endedAt:now })];
    this.user = { ...user, schoolId:school.id };
    this.people.get(user.id)!.schoolId = school.id;
    if (!this.representations().some(r=>r.id===this.activeRepresentationId)) this.activeRepresentationId = null;
    this.log(school.id,'profile.school_changed',user.id,{ from:old, to:school.id });
  }
  async listSchoolHistory() {
    this.requireUser();
    return structuredClone(this.schoolHistory);
  }

  // ---- Representasjon, verv og rettigheter ----
  async switchRepresentation(representationId:string) {
    this.requireUser();
    this.usableRepresentation(representationId);
    this.activeRepresentationId = representationId;
  }
  async listMyRoles():Promise<MyRole[]> {
    const user = this.requireUser();
    const org = (id:string)=>this.organization(id);
    const offices = this.memberships.filter(m=>m.userId===user.id).map(m=>({ id:m.id, kind:'office' as const, organizationId:m.organizationId, organizationName:org(m.organizationId).name,
      organizationStatus:org(m.organizationId).status, title:m.title, startDate:m.startDate, endDate:m.endDate, status:m.status }));
    const roles = this.grants.filter(g=>g.userId===user.id).map(g=>({ id:g.id, kind:'role' as const, organizationId:g.organizationId, organizationName:org(g.organizationId).name,
      organizationStatus:org(g.organizationId).status, title:'', role:g.role, startDate:g.startDate, endDate:g.endDate, status:g.status }));
    return structuredClone([...offices,...roles].sort((a,b)=>Number(a.status!=='active')-Number(b.status!=='active') || b.startDate.localeCompare(a.startDate)));
  }
  async requestSchoolAdmin(input:SchoolAdminRequestInput) {
    const parsed = schoolAdminRequestSchema.parse(input);
    const user = this.requireUser();
    if (user.schoolId!==parsed.schoolId) throw new Error('Du kan bare be om å bli administrator for din egen skole.');
    if (this.hasRole(user.id,parsed.schoolId,['school_admin'])) throw new Error('Du er allerede skoleadministrator.');
    if (this.requests.some(r=>r.userId===user.id && r.schoolId===parsed.schoolId && r.status==='pending')) throw new Error('Dette er allerede registrert.');
    this.requests.unshift({ id:this.nextId('r'), userId:user.id, schoolId:parsed.schoolId, message:parsed.message || undefined, status:'pending', createdAt:new Date().toISOString() });
    this.log(parsed.schoolId,'school_admin.requested',user.id);
  }
  async cancelSchoolAdminRequest(requestId:string) {
    const user = this.requireUser();
    const request = this.requests.find(r=>r.id===requestId && r.userId===user.id && r.status==='pending');
    if (!request) throw new Error('Forespørselen er allerede behandlet.');
    request.status = 'cancelled';
    this.log(request.schoolId,'school_admin.cancelled',user.id);
  }
  async listSchoolAdminRequests():Promise<SchoolAdminRequest[]> {
    const user = this.requireUser();
    return structuredClone(this.requests.flatMap(r=>{
      const mine = r.userId===user.id;
      const canDecide = r.status==='pending' && !mine && this.isAreaBoardAdmin(user.id,r.schoolId);
      if (!mine && !canDecide) return [];
      const school = this.organization(r.schoolId);
      return [{ ...r, userName:this.people.get(r.userId)?.name ?? '', schoolName:school.schoolName ?? school.name, mine, canDecide }];
    }).sort((a,b)=>Number(a.status!=='pending')-Number(b.status!=='pending') || b.createdAt.localeCompare(a.createdAt)));
  }
  async decideSchoolAdminRequest(input:DecideSchoolAdminRequestInput) {
    const parsed = decideSchoolAdminRequestSchema.parse(input);
    const user = this.requireUser();
    const request = this.requests.find(r=>r.id===parsed.requestId && r.status==='pending');
    if (!request) throw new Error('Forespørselen er allerede behandlet.');
    if (request.userId===user.id) throw new Error('Du kan ikke gi deg selv rettigheter.');
    if (!this.isAreaBoardAdmin(user.id,request.schoolId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    const applicant = this.people.get(request.userId);
    if (parsed.approve && (!applicant?.active || applicant.schoolId!==request.schoolId)) throw new Error('Søkeren går ikke lenger på skolen, eller skolen er deaktivert. Forespørselen kan bare avslås.');
    Object.assign(request,{ status:parsed.approve?'approved':'rejected', decidedAt:new Date().toISOString(), decisionReason:parsed.reason || undefined });
    if (parsed.approve && !this.grants.some(g=>g.userId===request.userId && g.organizationId===request.schoolId && g.role==='school_admin' && this.live(g)))
      this.grants.push({ id:this.nextId('g'), userId:request.userId, organizationId:request.schoolId, role:'school_admin', startDate:today(), endDate:null, status:'active', grantedBy:user.id });
    this.log(request.schoolId,parsed.approve?'school_admin.approved':'school_admin.rejected',request.userId);
  }

  // ---- Administrasjon ----
  async listAdminOrganizations():Promise<AdminOrganization[]> {
    if (this.status!=='active') return [];
    const order = { national:0, county_board:1, local_board:2, school:3 };
    const superAdmin = this.isSuper(this.user.id);
    return this.organizations.filter(o=>o.status!=='archived' && (superAdmin || this.hasAreaRole(this.user.id,o.id)))
      .sort((a,b)=>Number(a.status!=='active')-Number(b.status!=='active') || order[a.type]-order[b.type] || a.name.localeCompare(b.name,'nb'))
      .map(o=>({ id:o.id, type:o.type, name:o.name, county:o.county, status:o.status,
        myRole:superAdmin?'super_admin':o.type==='school'&&this.hasRole(this.user.id,o.id,['school_admin'])?'school_admin':'board_admin',
        grantableRoles:ROLES.filter(r=>this.canGrant(o.id,r)) }));
  }
  async listOrganizationRoles(organizationId:string):Promise<OrganizationRoleEntry[]> {
    this.requireAreaAdmin(organizationId);
    const person = (id:string)=>this.people.get(id);
    const offices = this.memberships.filter(m=>m.organizationId===organizationId).map(m=>({ id:m.id, kind:'office' as const, userId:m.userId, userName:person(m.userId)?.name ?? '',
      userActive:!!person(m.userId)?.active, title:m.title, startDate:m.startDate, endDate:m.endDate, status:m.status, grantedByName:m.grantedBy?person(m.grantedBy)?.name:undefined, canChange:true }));
    const roles = this.grants.filter(g=>g.organizationId===organizationId).map(g=>({ id:g.id, kind:'role' as const, userId:g.userId, userName:person(g.userId)?.name ?? '',
      userActive:!!person(g.userId)?.active, title:'', role:g.role, startDate:g.startDate, endDate:g.endDate, status:g.status, grantedByName:g.grantedBy?person(g.grantedBy)?.name:undefined,
      canChange:this.canGrant(organizationId,g.role) }));
    return structuredClone([...offices,...roles].sort((a,b)=>Number(a.status!=='active')-Number(b.status!=='active') || a.userName.localeCompare(b.userName,'nb')));
  }
  async searchAssignablePeople(input:{ organizationId:string; query:string }):Promise<AssignablePerson[]> {
    this.requireAreaAdmin(input.organizationId);
    const o = this.organization(input.organizationId);
    const query = input.query.trim().toLowerCase();
    const inArea = (p:Person)=>{
      const school = this.organizations.find(x=>x.id===p.schoolId);
      return o.type==='school'?p.schoolId===o.id:o.type==='local_board'?!!school?.localBoard && school.localBoard===o.localBoard:o.type==='county_board'?school?.county===o.county:true;
    };
    return [...this.people.values()]
      .filter(p=>p.active && (!query || p.name.toLowerCase().includes(query)) && (inArea(p) || this.memberships.some(m=>m.userId===p.id && m.organizationId===o.id && this.live(m))))
      .sort((a,b)=>a.name.localeCompare(b.name,'nb')).slice(0,20)
      .map(p=>{ const s = this.organizations.find(x=>x.id===p.schoolId); return { id:p.id, name:p.name, schoolName:s?s.schoolName ?? s.name:undefined }; });
  }
  /** Felles kontroller før tildeling: aktiv organisasjon, aktiv person, og på skoler må personen gå der. */
  private assignable(organizationId:string,userId:string) {
    const o = this.organizations.find(x=>x.id===organizationId);
    if (!o || o.status!=='active') throw new Error('Fant ikke organisasjonen, eller den er deaktivert.');
    const target = this.people.get(userId);
    if (!target?.active) throw new Error('Fant ikke personen, eller profilen er deaktivert.');
    if (o.type==='school' && target.schoolId!==o.id) throw new Error('Personen går ikke på denne skolen.');
  }
  async assignPublicOffice(input:AssignPublicOfficeInput) {
    const parsed = assignPublicOfficeSchema.parse(input);
    this.requireAreaAdmin(parsed.organizationId);
    if (parsed.userId===this.user.id && !this.hasRole(this.user.id,parsed.organizationId,['school_admin','board_admin'])) throw new Error('Du kan ikke gi deg selv rettigheter.');
    this.assignable(parsed.organizationId,parsed.userId);
    if (this.memberships.some(m=>m.userId===parsed.userId && m.organizationId===parsed.organizationId && m.title.toLowerCase()===parsed.title.toLowerCase() && this.live(m)))
      throw new Error('Personen har allerede dette vervet.');
    this.memberships.push({ id:this.nextId('m'), userId:parsed.userId, organizationId:parsed.organizationId, title:parsed.title, startDate:today(), endDate:null, status:'active', grantedBy:this.user.id });
    this.log(parsed.organizationId,'office.assigned',parsed.userId,{ title:parsed.title });
  }
  async endPublicOffice(membershipId:string) {
    const user = this.requireUser();
    const m = this.memberships.find(x=>x.id===membershipId);
    if (!m) throw new Error('Fant ikke vervet.');
    if (m.userId!==user.id && !this.hasAreaRole(user.id,m.organizationId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    if (!this.live(m)) throw new Error('Vervet er allerede avsluttet.');
    m.status = 'ended';
    m.endDate = today();
    if (this.activeRepresentationId===m.id) this.activeRepresentationId = null;
    this.log(m.organizationId,'office.ended',m.userId,{ title:m.title });
  }
  async assignRole(input:AssignRoleInput) {
    const parsed = assignRoleSchema.parse(input);
    const user = this.requireUser();
    if (parsed.userId===user.id) throw new Error('Du kan ikke gi deg selv rettigheter.');
    if (!this.roleFits(parsed.organizationId,parsed.role)) throw new Error('Denne rettigheten finnes ikke for denne typen organisasjon.');
    if (!this.canGrant(parsed.organizationId,parsed.role)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    this.assignable(parsed.organizationId,parsed.userId);
    if (this.grants.some(g=>g.userId===parsed.userId && g.organizationId===parsed.organizationId && g.role===parsed.role && this.live(g))) throw new Error('Personen har allerede denne rettigheten.');
    this.grants.push({ id:this.nextId('g'), userId:parsed.userId, organizationId:parsed.organizationId, role:parsed.role, startDate:today(), endDate:null, status:'active', grantedBy:user.id });
    this.log(parsed.organizationId,'role.assigned',parsed.userId,{ role:parsed.role });
  }
  async revokeRole(grantId:string) {
    const user = this.requireUser();
    const g = this.grants.find(x=>x.id===grantId);
    if (!g) throw new Error('Fant ikke rettigheten.');
    if (g.userId!==user.id && !this.canGrant(g.organizationId,g.role)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    if (!this.live(g)) throw new Error('Rettigheten er allerede avsluttet.');
    // Siste administrator kan ikke fjernes uten en etterfølger.
    if (g.role!=='content_manager' && !this.grants.some(x=>x!==g && x.userId!==g.userId && x.role===g.role && (g.role==='super_admin' || x.organizationId===g.organizationId) && this.live(x) && this.people.get(x.userId)?.active))
      throw new Error('Organisasjonen må ha minst én administrator. Gi rollen til en etterfølger før denne fjernes.');
    g.status = 'revoked';
    g.endDate = today();
    this.log(g.organizationId,'role.revoked',g.userId,{ role:g.role });
  }
  async listAuditLog(organizationId:string):Promise<AuditEntry[]> {
    this.requireAreaAdmin(organizationId);
    return structuredClone(this.audit.filter(a=>a.organizationId===organizationId).slice(0,30)
      .map(({ id,createdAt,actorName,action,subjectId,details })=>({ id, createdAt, actorName, action, subjectName:subjectId?this.people.get(subjectId)?.name:undefined, details })));
  }

  // ---- Innlegg ----
  async publishPost(input:PublishPostInput):Promise<Post> {
    const parsed = publishPostSchema.parse(input);
    const rep = this.publisher(parsed.representationId);
    const draft = parsed.draftId?this.drafts.find(d=>d.id===parsed.draftId):undefined;
    if (parsed.draftId && (!draft || draft.organizationId!==rep.organizationId)) throw new Error('Fant ikke innlegget.');
    this.checkContent(rep.organizationId,parsed.audience,parsed.eventId);
    const post:Post = {
      id:draft?.id ?? this.nextId('post'), organizationId:rep.organizationId, initials:rep.initials, organizationName:rep.name,
      actorName:this.user.name, actorRole:rep.publicRole, createdAt:'Akkurat nå', body:parsed.body, audience:parsed.audience, schoolLevel:parsed.schoolLevel,
      eventId:parsed.eventId, likes:0, comments:0, commentItems:[],
      media:parsed.withImage?[{ id:this.nextId('m'), type:'image', alt:'foto: lastet opp av elevrådet' }]:undefined,
      poll:parsed.poll?{ question:parsed.body.split('\n')[0], closesAt:'om 14 dager', resultsVisibility:'after_vote', options:parsed.poll.options.map((label,i)=>({ id:String(i), label, votes:0 })) }:undefined,
    };
    if (draft) this.drafts = this.drafts.filter(d=>d!==draft);
    this.posts.unshift(post);
    this.log(rep.organizationId,draft?'post.published':'post.created');
    return this.cards([post])[0];
  }
  async saveDraft(input:SaveDraftInput):Promise<PostDraft> {
    const parsed = saveDraftSchema.parse(input);
    const rep = this.publisher(parsed.representationId);
    this.checkContent(rep.organizationId,parsed.audience,parsed.eventId);
    const content = { body:parsed.body, audience:parsed.audience, schoolLevel:parsed.schoolLevel, eventId:parsed.eventId, updatedAt:new Date().toISOString() };
    let draft = parsed.draftId?this.drafts.find(d=>d.id===parsed.draftId):undefined;
    if (parsed.draftId && (!draft || draft.organizationId!==rep.organizationId)) throw new Error('Fant ikke innlegget.');
    if (draft) Object.assign(draft,content);
    else {
      draft = { id:this.nextId('draft'), organizationId:rep.organizationId, actorId:this.user.id, actorName:this.user.name, ...content };
      this.drafts.unshift(draft);
      this.log(rep.organizationId,'post.drafted');
    }
    const { actorId:_, ...result } = draft;
    return structuredClone(result);
  }
  async listDrafts(representationId:string):Promise<PostDraft[]> {
    this.requireUser();
    const rep = this.representation(representationId);
    if (!this.canManagePost(rep.organizationId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    return structuredClone(this.drafts.filter(d=>d.organizationId===rep.organizationId).map(({ actorId:_, ...d })=>d));
  }
  async editPost(input:EditPostInput):Promise<Post> {
    const parsed = editPostSchema.parse(input);
    this.requireUser();
    const post = this.post(parsed.postId);
    if (!this.canManagePost(post.organizationId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    this.checkContent(post.organizationId,parsed.audience,parsed.eventId);
    // Som triggeren record_post_revision: forrige versjon lagres bare når tekst, målgruppe eller skoleform endres.
    if (post.body!==parsed.body || post.audience!==parsed.audience || (post.schoolLevel ?? 'both')!==parsed.schoolLevel) {
      this.revisions[post.id] = [{ id:this.nextId('rev'), body:post.body, audience:post.audience, schoolLevel:post.schoolLevel ?? 'both', editedByName:this.user.name, createdAt:new Date().toISOString() },
        ...this.revisions[post.id] ?? []];
      post.edited = true;
    }
    Object.assign(post,{ body:parsed.body, audience:parsed.audience, schoolLevel:parsed.schoolLevel, eventId:parsed.eventId });
    this.log(post.organizationId,'post.edited');
    return this.cards([post])[0];
  }
  async deletePost(postId:string) {
    this.requireUser();
    const draft = this.drafts.find(d=>d.id===postId);
    const organizationId = draft?.organizationId ?? this.post(postId).organizationId;
    if (!this.canManagePost(organizationId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    if (draft) this.drafts = this.drafts.filter(d=>d!==draft);
    else this.posts = this.posts.filter(p=>p.id!==postId);
    this.log(organizationId,draft?'post.draft_deleted':'post.deleted');
  }
  async listPostHistory(postId:string):Promise<PostRevision[]> {
    this.requireUser();
    if (!this.canManagePost(this.post(postId).organizationId)) throw new Error('Du har ikke tilgang til å gjøre dette.');
    return structuredClone(this.revisions[postId] ?? []);
  }
  async addComment(input:AddCommentInput):Promise<Comment> {
    const parsed = commentSchema.parse(input);
    this.requireUser();
    const rep = this.usableRepresentation(parsed.representationId);
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

  // ---- Venneråd ----
  async listFriendConnections(schoolId:string):Promise<FriendConnection[]> {
    this.requireSchoolAdmin(schoolId);
    return structuredClone(this.connections.filter(c=>(c.requesterId===schoolId || c.recipientId===schoolId) && (c.status==='pending' || c.status==='accepted'))
      .sort((a,b)=>Number(a.status==='accepted')-Number(b.status==='accepted') || b.createdAt.localeCompare(a.createdAt))
      .map(c=>{
        const other = this.organization(c.requesterId===schoolId?c.recipientId:c.requesterId);
        return { id:c.id, schoolId:other.id, schoolName:other.name, county:other.county, status:c.status as FriendConnection['status'],
          direction:c.requesterId===schoolId?'outgoing' as const:'incoming' as const, createdAt:c.createdAt, approvedAt:c.approvedAt, canDecide:c.status==='pending' && c.recipientId===schoolId };
      }));
  }
  async requestFriendSchool(input:FriendRequestInput) {
    const parsed = friendRequestSchema.parse(input);
    this.requireSchoolAdmin(parsed.schoolId);
    const target = this.organizations.find(o=>o.id===parsed.targetSchoolId && o.type==='school' && o.status==='active');
    if (!target || target.id===parsed.schoolId) throw new Error('Fant ikke skolen. Velg en aktiv skole fra listen.');
    const existing = this.connections.find(c=>(c.requesterId===parsed.schoolId && c.recipientId===target.id) || (c.requesterId===target.id && c.recipientId===parsed.schoolId));
    if (existing?.status==='accepted') throw new Error('Skolene er allerede venneråd.');
    if (existing?.status==='pending' && existing.requesterId===parsed.schoolId) throw new Error('Dere har allerede sendt en forespørsel til denne skolen.');
    const now = new Date().toISOString();
    if (existing?.status==='pending') {
      Object.assign(existing,{ status:'accepted', approvedAt:now });
      this.logFriend('friend.accepted',existing);
      return;
    }
    const connection = existing ?? { id:this.nextId('fc'), requesterId:parsed.schoolId, recipientId:target.id, status:'pending' as const, createdAt:now };
    if (existing) Object.assign(existing,{ requesterId:parsed.schoolId, recipientId:target.id, status:'pending', createdAt:now, approvedAt:undefined });
    else this.connections.push(connection);
    this.logFriend('friend.requested',connection);
  }
  async decideFriendRequest(input:DecideFriendRequestInput) {
    const parsed = decideFriendRequestSchema.parse(input);
    this.requireUser();
    const c = this.connections.find(x=>x.id===parsed.connectionId && x.status==='pending');
    if (!c) throw new Error('Forespørselen er allerede behandlet.');
    this.requireSchoolAdmin(c.recipientId);
    Object.assign(c,{ status:parsed.accept?'accepted':'rejected', approvedAt:new Date().toISOString() });
    this.logFriend(parsed.accept?'friend.accepted':'friend.rejected',c);
  }
  async endFriendConnection(connectionId:string) {
    this.requireUser();
    const c = this.connections.find(x=>x.id===connectionId && (x.status==='pending' || x.status==='accepted'));
    if (!c) throw new Error('Vennerådet er allerede avsluttet.');
    const allowed = c.status==='pending'?[c.requesterId]:[c.requesterId,c.recipientId];
    if (!allowed.some(id=>this.hasRole(this.user.id,id,['school_admin']))) throw new Error('Du har ikke tilgang til å gjøre dette.');
    c.status = 'ended';
    this.logFriend('friend.ended',c);
  }

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
    const created:Conversation = { id:`c-${o.id}`, name:o.name, initials:o.initials, subtitle:orgSub(o), organizationId:o.id, kind:'group', unread:0, members:this.officersOf(o).length+1, messages:[] };
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

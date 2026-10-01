import type { SupabaseClient } from '@supabase/supabase-js';
import { presentEvent, toEventCategory } from '@/lib/domain/events';
import { initialsOf } from '@/lib/domain/labels';
import { formatDayMonth, formatRelative } from '@/lib/domain/time';
import type { AdminOrganization, AssignablePerson, AuditEntry, Comment, Conversation, CurrentUser, DelegateCandidate, DelegateStatus, Event, EventOrganizer, EventParticipation, GrantStatus, Message, MyRole, Organization, OrganizationCvEntry, OrganizationRoleEntry, OrganizationStatus, OrganizationType, PersonCv, Post, RegistrationStatus, PublicOfficer, Representation, SchoolAdminRequest, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import { assignPublicOfficeSchema, assignRoleSchema, avatarSchema, addDelegateSchema, attendanceSchema, changeSchoolSchema, commentSchema, decideSchoolAdminRequestSchema, delegationResponseSchema, eventImageSchema, eventInputSchema, eventInterestSchema, eventRegistrationSchema, eventStatusChangeSchema, idSchema, isoDate, messageSchema, onboardingSchema, publishPostSchema, requestLoginCodeSchema, schoolAdminRequestSchema, updateProfileSchema, verifyLoginCodeSchema, voteSchema } from '@/lib/domain/validation';
import type { Database } from '@/lib/supabase/database.types';
import { NotImplementedError, type AddCommentInput, type AddDelegateInput, type AttendanceInput, type DelegationResponseInput, type EventInput, type EventInterestInput, type EventRegistrationInput, type EventStatusChangeInput, type AssignPublicOfficeInput, type AssignRoleInput, type ChangeSchoolInput, type DecideSchoolAdminRequestInput, type ElevradsnettService, type OnboardingInput, type SchoolAdminRequestInput, type PublishPostInput, type RequestLoginCodeInput, type SendMessageInput, type UpdateProfileInput, type VerifyLoginCodeInput, type VoteInput } from './contracts';

type Client = SupabaseClient<Database>;
type Rpc<Name extends keyof Database['public']['Functions']> = Database['public']['Functions'][Name]['Returns'];
type PostCardRow = Rpc<'get_post_cards'>[number];
type OrganizationRow = Rpc<'list_public_organizations'>[number];
type EventRow = Rpc<'list_events'>[number];
type SessionRow =
  | { status:'anonymous' }
  | { status:'onboarding'; email:string }
  | { status:'active'|'deactivated'; active_membership_id:string|null;
      profile:{ id:string; display_name:string; email:string; avatar_path:string|null; current_school_id:string|null };
      representations:{ id:string; organization_id:string; name:string; type:OrganizationType; organization_status?:OrganizationStatus; public_title:string; can_publish:boolean }[] };

const AVATAR_BUCKET = 'public-avatars';
const CONTENT_BUCKET = 'public-content';
/** Valgfrie argumenter sendes som null. De genererte typene kjenner ikke til at parameterne kan være null. */
const orNull = <T,>(value:T|undefined)=>(value ?? null) as T;

type DelegateJson = { id:string; user_id:string; display_name:string; status:DelegateStatus; office_title:string|null };
type ParticipationJson = {
  interested:boolean; can_edit:boolean;
  invitations:{ delegate_id:string; registration_id:string; organization_id:string; organization_name:string; status:DelegateStatus; office_title:string|null }[];
  organizations:{ organization_id:string; organization_name:string; type:OrganizationType; allowed:boolean; registration_id:string|null; status:string|null; delegates:DelegateJson[]|null }[];
  attendance:{ registration_id:string; organization_id:string; organization_name:string; status:string; delegates:DelegateJson[]|null }[]|null;
};
type PersonCvJson = {
  id:string; display_name:string; avatar_path:string|null; school_name:string|null; active:boolean;
  offices:{ id:string; organization_id:string; organization_name:string; title:string; start_date:string; end_date:string|null; active:boolean }[];
  events:{ event_id:string; title:string; starts_at:string; category:string; organizer_name:string; organization_id:string; organization_name:string; office_title:string|null; elevtinget:boolean }[];
  invitations:{ delegate_id:string; event_id:string; title:string; starts_at:string; organization_name:string; status:DelegateStatus }[];
};
const toDelegate = (d:DelegateJson)=>({ id:d.id, userId:d.user_id, name:d.display_name, status:d.status, officeTitle:d.office_title ?? undefined });

/** Feilmeldinger fra databasen og Supabase Auth, oversatt til norsk. Ukjente feil får en generell tekst. */
const serverMessages:Record<string,string> = {
  'not authorized':'Du har ikke tilgang til å gjøre dette.',
  'invalid name':'Navnet må ha mellom 2 og 120 tegn.',
  'school not found':'Fant ikke skolen. Velg en aktiv skole fra listen.',
  'invalid election date':'Velg en dato fra i dag og inntil to år frem.',
  'already onboarded':'Profilen din er allerede opprettet.',
  'invalid avatar':'Profilbildet kunne ikke lagres. Prøv et annet bilde.',
  'same school':'Du går allerede på denne skolen.',
  'last school administrator':'Du er siste skoleadministrator ved skolen. Overfør administratorrollen til en annen før du bytter skole.',
  'invalid representation':'Du kan ikke representere denne organisasjonen.',
  'event closed':'Påmeldingen er stengt.',
  'post not found':'Fant ikke innlegget.',
  'self escalation is not allowed':'Du kan ikke gi deg selv rettigheter.',
  'last administrator':'Organisasjonen må ha minst én administrator. Gi rollen til en etterfølger før denne fjernes.',
  'role already assigned':'Personen har allerede denne rettigheten.',
  'office already assigned':'Personen har allerede dette vervet.',
  'invalid role':'Denne rettigheten finnes ikke for denne typen organisasjon.',
  'invalid title':'Vervet må ha mellom 2 og 80 tegn.',
  'invalid date range':'Ugyldig dato.',
  'person not found':'Fant ikke personen, eller profilen er deaktivert.',
  'person not at school':'Personen går ikke på denne skolen.',
  'organization not found':'Fant ikke organisasjonen, eller den er deaktivert.',
  'role not found':'Fant ikke rettigheten.',
  'role not active':'Rettigheten er allerede avsluttet.',
  'office not found':'Fant ikke vervet.',
  'office not active':'Vervet er allerede avsluttet.',
  'request not pending':'Forespørselen er allerede behandlet.',
  'request outdated':'Søkeren går ikke lenger på skolen, eller skolen er deaktivert. Forespørselen kan bare avslås.',
  'only for own school':'Du kan bare be om å bli administrator for din egen skole.',
  'already administrator':'Du er allerede skoleadministrator.',
  'event not found':'Fant ikke arrangementet.',
  'invalid event':'Arrangementet mangler noe eller har ugyldige verdier. Sjekk feltene.',
  'invalid event date':'Sjekk tidspunktene: starten kan ikke være passert, slutten må være etter starten, og fristen før starten.',
  'invalid organizer':'Arrangøren kan ikke endres.',
  'event locked':'Avlyste og avsluttede arrangementer kan ikke endres.',
  'invalid status':'Arrangementet kan ikke få denne statusen nå.',
  'capacity below registrations':'Kapasiteten kan ikke være lavere enn antall påmeldte.',
  'invalid image':'Bildet kunne ikke lagres. Prøv et annet bilde.',
  'outside audience':'Organisasjonen er utenfor målgruppen for arrangementet.',
  'registration not active':'Organisasjonen er ikke påmeldt.',
  'person not eligible':'Personen kan ikke være delegat for denne organisasjonen.',
  'delegate already added':'Personen er allerede delegat.',
  'no seats left':'Organisasjonen har ingen ledige plasser.',
  'delegate not found':'Fant ikke delegaten.',
  'delegate not confirmed':'Delegaten har ikke bekreftet at hen kommer.',
  'event not started':'Oppmøte kan bekreftes når arrangementet har startet.',
};
export function toNorwegianError(error:unknown, fallback = 'Noe gikk galt. Prøv igjen.'):Error {
  if (error instanceof NotImplementedError) return error;
  const raw = error && typeof error==='object' && 'message' in error ? String((error as { message:unknown }).message) : '';
  const status = error && typeof error==='object' && 'status' in error ? Number((error as { status:unknown }).status) : 0;
  if (serverMessages[raw]) return new Error(serverMessages[raw]);
  if (/duplicate key|unique constraint/i.test(raw)) return new Error('Dette er allerede registrert.');
  if (status===429 || /rate limit|too many/i.test(raw)) return new Error('For mange forsøk. Vent litt og prøv igjen.');
  if (/failed to fetch|network/i.test(raw)) return new Error('Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.');
  return new Error(fallback);
}
/** Data fra et kall, eller en norsk feilmelding. Kall som ikke returnerer noe gir null. */
async function run<R extends { data:unknown; error:unknown }>(promise:PromiseLike<R>, fallback?:string):Promise<NonNullable<R['data']>> {
  const { data,error } = await promise;
  if (error) throw toNorwegianError(error,fallback);
  return data as NonNullable<R['data']>;
}

/**
 * Produksjonsadapter. Alle tilgangsbeslutninger tas av RLS og RPC-er i databasen.
 * Metoder uten RPC kaster NotImplementedError.
 */
export class SupabaseElevradsnettService implements ElevradsnettService {
  private client:Promise<Client>;
  constructor(client:SupabaseClient|Promise<SupabaseClient>) { this.client = Promise.resolve(client) as Promise<Client>; }

  private async userId() {
    const { data } = await (await this.client).auth.getSession();
    return data.session?.user.id ?? null;
  }
  private async avatarUrl(path:string|null) {
    return path ? (await this.client).storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : undefined;
  }
  /** Organisasjonen en representasjon (membership) gjelder. Lesingen er begrenset av RLS. */
  private async organizationOf(representationId:string) {
    const data = await run((await this.client).from('memberships').select('organization_id').eq('id',representationId).single());
    return data.organization_id;
  }

  // Innlogging og økt
  async getSession():Promise<Session> {
    if (!await this.userId()) return { status:'anonymous' };
    const row = await run((await this.client).rpc('get_my_session'),'Kunne ikke hente innloggingen.') as unknown as SessionRow;
    if (row.status==='anonymous' || row.status==='onboarding') return row;
    const user:CurrentUser = { id:row.profile.id, name:row.profile.display_name, initials:initialsOf(row.profile.display_name), schoolId:row.profile.current_school_id,
      email:row.profile.email, avatarUrl:await this.avatarUrl(row.profile.avatar_path) };
    const representations = row.representations.map(r=>({ id:r.id, organizationId:r.organization_id, name:r.name, initials:initialsOf(r.name),
      publicRole:r.public_title || 'Medlem', canPublish:r.can_publish, type:r.type, organizationStatus:r.organization_status ?? 'active' }) satisfies Representation);
    // Verv i deaktiverte organisasjoner vises, men kan ikke være aktive.
    const usable = representations.filter(r=>r.organizationStatus==='active');
    const active = usable.find(r=>r.id===row.active_membership_id) ?? usable[0];
    return { status:row.status, user, representations, activeRepresentationId:active?.id ?? null };
  }
  onSessionChange(listener:()=>void) {
    let stop = ()=>{};
    let closed = false;
    void this.client.then(client=>{
      if (closed) return;
      const { data } = client.auth.onAuthStateChange(event=>{
        // Kalles utenfor Supabase sin egen lås, så lytteren kan hente økten på nytt.
        if (event==='SIGNED_IN' || event==='SIGNED_OUT' || event==='USER_UPDATED') setTimeout(listener,0);
      });
      stop = ()=>data.subscription.unsubscribe();
    });
    return ()=>{ closed = true; stop(); };
  }
  async requestLoginCode(input:RequestLoginCodeInput) {
    const { email } = requestLoginCodeSchema.parse(input);
    // shouldCreateUser gjør at svaret er likt om kontoen finnes eller ikke (ingen kontoopplisting).
    const { error } = await (await this.client).auth.signInWithOtp({ email, options:{ shouldCreateUser:true } });
    if (error) throw toNorwegianError(error,'Kunne ikke sende koden. Prøv igjen om litt.');
  }
  async verifyLoginCode(input:VerifyLoginCodeInput) {
    const { email,code } = verifyLoginCodeSchema.parse(input);
    const { error } = await (await this.client).auth.verifyOtp({ email, token:code, type:'email' });
    if (error) throw toNorwegianError(error,'Koden er feil eller utløpt. Prøv igjen, eller be om en ny kode.');
    return this.getSession();
  }
  async signOut() {
    const { error } = await (await this.client).auth.signOut();
    if (error) throw toNorwegianError(error,'Kunne ikke logge ut. Prøv igjen.');
  }

  // Lesing
  async listOrganizations():Promise<Organization[]> {
    const rows = await run((await this.client).rpc('list_public_organizations'),'Kunne ikke hente organisasjonene.');
    return rows.map(toOrganization);
  }
  async getOrganization(organizationId:string) {
    const rows = await run((await this.client).rpc('get_public_organization',{ p_org:organizationId }),'Kunne ikke hente organisasjonen.');
    return rows[0]?toOrganization(rows[0]):null;
  }
  async listFeed(input:{ representationId:string|null; mode:'recommended'|'chronological' }) {
    const rows = await run((await this.client).rpc('get_post_cards',{ p_representation_id:input.representationId ?? undefined, p_mode:input.mode }),'Kunne ikke hente innleggene.');
    return rows.map(toPost);
  }
  async listOrganizationPosts(organizationId:string) {
    const rows = await run((await this.client).rpc('get_post_cards',{ p_organization:organizationId }),'Kunne ikke hente innleggene.');
    return rows.map(toPost);
  }
  async listEvents():Promise<Event[]> {
    const client = await this.client;
    const { data,error } = await client.rpc('list_events');
    // Til migrasjonen fra prompt 9 er kjørt i prosjektet, finnes bare list_public_events (uten bilde, interesse og utkast).
    if (error && (error.code==='PGRST202' || /could not find the function/i.test(error.message))) {
      const old = await run(client.rpc('list_public_events'),'Kunne ikke hente arrangementene.');
      return old.map(r=>toEvent({ ...r, digital_url:null, image_path:null, interested_by_me:false, can_edit:false } as unknown as EventRow));
    }
    if (error) throw toNorwegianError(error,'Kunne ikke hente arrangementene.');
    return (data ?? []).map(r=>toEvent(r,r.image_path?client.storage.from(CONTENT_BUCKET).getPublicUrl(r.image_path).data.publicUrl:undefined));
  }
  async listConversations():Promise<Conversation[]> {
    if (!await this.userId()) return [];
    throw new NotImplementedError('listConversations');
  }
  async listPublicOfficers(organizationId:string) {
    const rows = await run((await this.client).rpc('get_public_officers',{ p_organization:organizationId }));
    return rows.map(r=>({ id:r.membership_id, name:r.display_name, publicTitle:r.public_title }) satisfies PublicOfficer);
  }

  // Profil
  async completeOnboarding(input:OnboardingInput) {
    const parsed = onboardingSchema.parse(input);
    await run((await this.client).rpc('complete_onboarding',{ p_school:parsed.schoolId, p_display_name:parsed.displayName, p_next_election:parsed.nextElection }));
  }
  async updateProfile(input:UpdateProfileInput) {
    const parsed = updateProfileSchema.parse(input);
    await run((await this.client).rpc('update_profile',{ p_display_name:parsed.displayName }));
  }
  async setAvatar(image:Blob) {
    const { type } = avatarSchema.parse({ type:image.type, size:image.size });
    const client = await this.client;
    const userId = await this.userId();
    if (!userId) throw new Error('Du må logge inn først.');
    const path = `${userId}/${crypto.randomUUID()}.${type==='image/jpeg'?'jpg':type.split('/')[1]}`;
    const bucket = client.storage.from(AVATAR_BUCKET);
    const upload = await bucket.upload(path,image,{ contentType:type, upsert:false, cacheControl:'31536000' });
    if (upload.error) throw toNorwegianError(upload.error,'Kunne ikke laste opp bildet. Prøv igjen.');
    const { data:previous,error } = await client.rpc('set_avatar',{ p_path:path });
    if (error) { await bucket.remove([path]); throw toNorwegianError(error); }
    await this.removeOldAvatar(previous,userId);
    return bucket.getPublicUrl(path).data.publicUrl;
  }
  async removeAvatar() {
    const userId = await this.userId();
    if (!userId) throw new Error('Du må logge inn først.');
    const previous:string|null = await run((await this.client).rpc('set_avatar',{}));
    await this.removeOldAvatar(previous,userId);
  }
  /** Sletter forrige profilbilde. Feiler det, blir bare en ubrukt fil liggende igjen. */
  private async removeOldAvatar(previous:string|null,userId:string) {
    if (previous?.startsWith(`${userId}/`)) await (await this.client).storage.from(AVATAR_BUCKET).remove([previous]);
  }
  async changeSchool(input:ChangeSchoolInput) {
    const parsed = changeSchoolSchema.parse(input);
    await run((await this.client).rpc('change_school',{ p_school:parsed.schoolId }));
  }
  async listSchoolHistory():Promise<SchoolHistoryEntry[]> {
    const rows = await run((await this.client).rpc('get_my_school_history'));
    return rows.map(r=>({ schoolId:r.school_id, schoolName:r.school_name, county:r.county, startedAt:r.started_at, endedAt:r.ended_at }));
  }

  // Representasjon
  async switchRepresentation(representationId:string) {
    await run((await this.client).rpc('set_active_representation',{ p_membership_id:representationId }));
  }

  async listMyRoles():Promise<MyRole[]> {
    const rows = await run((await this.client).rpc('get_my_roles'),'Kunne ikke hente vervene dine.');
    return rows.map(r=>({ id:r.id, kind:r.kind as MyRole['kind'], organizationId:r.organization_id, organizationName:r.organization_name, organizationStatus:r.organization_status,
      title:r.title ?? '', role:r.role ?? undefined, startDate:r.start_date, endDate:r.end_date ?? null, status:r.status as GrantStatus }));
  }
  async requestSchoolAdmin(input:SchoolAdminRequestInput) {
    const parsed = schoolAdminRequestSchema.parse(input);
    await run((await this.client).rpc('request_school_admin',{ p_school:parsed.schoolId, p_message:parsed.message || undefined }),'Kunne ikke sende forespørselen.');
  }
  async cancelSchoolAdminRequest(requestId:string) {
    await run((await this.client).rpc('cancel_school_admin_request',{ p_request:idSchema.parse(requestId) }));
  }
  async listSchoolAdminRequests():Promise<SchoolAdminRequest[]> {
    const rows = await run((await this.client).rpc('list_school_admin_requests'),'Kunne ikke hente forespørslene.');
    return rows.map(r=>({ id:r.id, userId:r.user_id, userName:r.display_name, schoolId:r.school_id, schoolName:r.school_name, message:r.message ?? undefined,
      status:r.status as SchoolAdminRequest['status'], createdAt:r.created_at, decidedAt:r.decided_at ?? undefined, decisionReason:r.decision_reason ?? undefined,
      mine:r.mine, canDecide:r.can_decide }));
  }
  async decideSchoolAdminRequest(input:DecideSchoolAdminRequestInput) {
    const parsed = decideSchoolAdminRequestSchema.parse(input);
    await run((await this.client).rpc('decide_school_admin_request',{ p_request:parsed.requestId, p_approve:parsed.approve, p_reason:parsed.reason || undefined }));
  }

  // Administrasjon
  async listAdminOrganizations():Promise<AdminOrganization[]> {
    if (!await this.userId()) return [];
    const rows = await run((await this.client).rpc('list_my_admin_organizations'),'Kunne ikke hente organisasjonene du administrerer.');
    return rows.map(r=>({ id:r.id, type:r.type, name:r.school_name ?? r.name, county:r.county, status:r.status, myRole:r.my_role, grantableRoles:r.grantable_roles ?? [] }));
  }
  async listOrganizationRoles(organizationId:string):Promise<OrganizationRoleEntry[]> {
    const rows = await run((await this.client).rpc('list_organization_roles',{ p_org:organizationId }),'Kunne ikke hente verv og rettigheter.');
    return rows.map(r=>({ id:r.id, kind:r.kind as OrganizationRoleEntry['kind'], userId:r.user_id, userName:r.display_name, userActive:r.user_active, title:r.title ?? '',
      role:r.role ?? undefined, startDate:r.start_date, endDate:r.end_date ?? null, status:r.status as GrantStatus, grantedByName:r.granted_by_name ?? undefined, canChange:r.can_change }));
  }
  async searchAssignablePeople(input:{ organizationId:string; query:string }):Promise<AssignablePerson[]> {
    const rows = await run((await this.client).rpc('list_assignable_people',{ p_org:input.organizationId, p_query:input.query.trim().slice(0,100) }),'Kunne ikke søke etter personer.');
    return rows.map(r=>({ id:r.id, name:r.display_name, schoolName:r.school_name ?? undefined }));
  }
  async assignPublicOffice(input:AssignPublicOfficeInput) {
    const parsed = assignPublicOfficeSchema.parse(input);
    await run((await this.client).rpc('assign_public_office',{ p_user:parsed.userId, p_org:parsed.organizationId, p_title:parsed.title }),'Kunne ikke gi vervet.');
  }
  async endPublicOffice(membershipId:string) {
    await run((await this.client).rpc('end_public_office',{ p_membership:idSchema.parse(membershipId) }),'Kunne ikke avslutte vervet.');
  }
  async assignRole(input:AssignRoleInput) {
    const parsed = assignRoleSchema.parse(input);
    await run((await this.client).rpc('assign_role',{ p_user:parsed.userId, p_org:parsed.organizationId, p_role:parsed.role, p_starts:isoDate(new Date()) }),'Kunne ikke gi rettigheten.');
  }
  async revokeRole(grantId:string) {
    await run((await this.client).rpc('revoke_role',{ p_grant:idSchema.parse(grantId) }),'Kunne ikke fjerne rettigheten.');
  }
  async listAuditLog(organizationId:string):Promise<AuditEntry[]> {
    const rows = await run((await this.client).rpc('list_audit_log',{ p_org:organizationId }),'Kunne ikke hente revisjonsloggen.');
    return rows.map(r=>({ id:String(r.id), createdAt:r.created_at, actorName:r.actor_name ?? '', action:r.action, subjectName:r.subject_name ?? undefined,
      details:(r.details && typeof r.details==='object' && !Array.isArray(r.details) ? r.details : {}) as Record<string,unknown> }));
  }

  // Innlegg
  async publishPost(input:PublishPostInput) {
    const parsed = publishPostSchema.parse(input);
    if (parsed.poll || parsed.withImage) throw new NotImplementedError('publishPost med avstemning eller bilde');
    const organizationId = await this.organizationOf(parsed.representationId);
    const created = await run((await this.client).rpc('publish_post',{ p_organization_id:organizationId, p_body:parsed.body, p_audience:parsed.audience, p_status:parsed.status }));
    const card = (await this.listOrganizationPosts(organizationId)).find(p=>p.id===created.id);
    if (!card) throw new Error('Innlegget er lagret, men kunne ikke vises.');
    return card;
  }
  async addComment(input:AddCommentInput):Promise<Comment> {
    const parsed = commentSchema.parse(input);
    const organizationId = await this.organizationOf(parsed.representationId);
    const row = await run((await this.client).rpc('add_comment',{ p_post:parsed.postId, p_organization:organizationId, p_body:parsed.body }));
    return { id:row.id, organizationId, organizationName:'', actorName:'', createdAt:formatRelative(row.created_at), body:parsed.body };
  }
  async setPostSupport():Promise<void> { throw new NotImplementedError('setPostSupport'); }
  async vote(input:VoteInput) {
    const parsed = voteSchema.parse(input);
    const poll = await run((await this.client).from('polls').select('id').eq('post_id',parsed.postId).single());
    await run((await this.client).rpc('cast_organization_vote',{ p_poll_id:poll.id, p_option_id:parsed.optionId, p_organization_id:parsed.organizationId }));
  }
  async reportPost():Promise<void> { throw new NotImplementedError('reportPost'); }

  // Organisasjoner
  async setFollow():Promise<void> { throw new NotImplementedError('setFollow'); }

  // Arrangementer
  async listEventOrganizers():Promise<EventOrganizer[]> {
    if (!await this.userId()) return [];
    const rows = await run((await this.client).rpc('list_my_event_organizers'),'Kunne ikke hente arrangørene.');
    return rows.map(r=>({ id:r.id, name:r.name, type:r.type, county:r.county }));
  }
  async saveEvent(input:EventInput) {
    const e = eventInputSchema.parse(input);
    return run((await this.client).rpc('save_event',{ p_event:orNull(e.id), p_organizer:e.organizerId, p_title:e.title, p_summary:orNull(e.summary), p_description:e.description,
      p_category:e.category, p_starts_at:e.startsAt, p_ends_at:e.endsAt, p_place:orNull(e.location), p_digital_url:orNull(e.digitalUrl),
      p_registration_deadline:orNull(e.registrationDeadline), p_capacity:orNull(e.capacity), p_seats_per_organization:orNull(e.seatsPerOrganization),
      p_price_label:orNull(e.price), p_audience:e.audience, p_status:e.status }),'Kunne ikke lagre arrangementet.');
  }
  async setEventStatus(input:EventStatusChangeInput) {
    const parsed = eventStatusChangeSchema.parse(input);
    await run((await this.client).rpc('set_event_status',{ p_event:parsed.eventId, p_status:parsed.status }));
  }
  async setEventImage(eventId:string,image:Blob|null) {
    const client = await this.client;
    const bucket = client.storage.from(CONTENT_BUCKET);
    const event = (await this.listEvents()).find(e=>e.id===idSchema.parse(eventId));
    if (!event) throw new Error('Fant ikke arrangementet.');
    let path:string|undefined;
    if (image) {
      const { type } = eventImageSchema.parse({ type:image.type, size:image.size });
      // Stien må ligge under arrangøren, så storage-regelen og set_event_image godtar den.
      path = `${event.hostId}/events/${event.id}/${crypto.randomUUID()}.${type==='image/jpeg'?'jpg':type.split('/')[1]}`;
      const upload = await bucket.upload(path,image,{ contentType:type, upsert:false, cacheControl:'31536000' });
      if (upload.error) throw toNorwegianError(upload.error,'Kunne ikke laste opp bildet. Prøv igjen.');
    }
    const { data:previous,error } = await client.rpc('set_event_image',{ p_event:event.id, p_path:orNull(path) });
    if (error) { if (path) await bucket.remove([path]); throw toNorwegianError(error); }
    // Forrige bilde slettes. Feiler det, blir bare en ubrukt fil liggende.
    if (previous?.startsWith(`${event.hostId}/events/${event.id}/`)) await bucket.remove([previous]);
    return path?bucket.getPublicUrl(path).data.publicUrl:undefined;
  }
  async setEventInterest(input:EventInterestInput) {
    const parsed = eventInterestSchema.parse(input);
    await run((await this.client).rpc('set_event_interest',{ p_event:parsed.eventId, p_interested:parsed.interested }));
  }
  async registerForEvent(input:EventRegistrationInput) {
    const parsed = eventRegistrationSchema.parse(input);
    const status = await run((await this.client).rpc('register_for_event',{ p_event:parsed.eventId, p_org:parsed.organizationId, p_register:parsed.registered }),'Kunne ikke endre påmeldingen.');
    return status as 'registered'|'waitlisted'|'cancelled';
  }
  async getEventParticipation(eventId:string):Promise<EventParticipation> {
    const row = await run((await this.client).rpc('get_event_participation',{ p_event:idSchema.parse(eventId) }),'Kunne ikke hente påmeldingene.') as unknown as ParticipationJson;
    return {
      interested:row.interested, canEdit:row.can_edit,
      invitations:row.invitations.map(i=>({ delegateId:i.delegate_id, registrationId:i.registration_id, organizationId:i.organization_id, organizationName:i.organization_name,
        status:i.status, officeTitle:i.office_title ?? undefined })),
      organizations:row.organizations.map(o=>({ organizationId:o.organization_id, organizationName:o.organization_name, type:o.type, allowed:o.allowed,
        registrationId:o.registration_id ?? undefined, status:(o.status ?? undefined) as RegistrationStatus|undefined, delegates:(o.delegates ?? []).map(toDelegate) })),
      attendance:row.attendance?row.attendance.map(a=>({ registrationId:a.registration_id, organizationId:a.organization_id, organizationName:a.organization_name,
        status:a.status as RegistrationStatus, delegates:(a.delegates ?? []).map(toDelegate) })):null,
    };
  }
  async searchDelegateCandidates(input:{ registrationId:string; query:string }):Promise<DelegateCandidate[]> {
    const rows = await run((await this.client).rpc('list_delegate_candidates',{ p_registration:idSchema.parse(input.registrationId), p_query:input.query.trim().slice(0,100) }),'Kunne ikke søke etter personer.');
    return rows.map(r=>({ id:r.id, name:r.display_name, officeTitle:r.office_title ?? undefined }));
  }
  async addEventDelegate(input:AddDelegateInput) {
    const parsed = addDelegateSchema.parse(input);
    await run((await this.client).rpc('add_event_delegate',{ p_registration:parsed.registrationId, p_user:parsed.userId }),'Kunne ikke melde på delegaten.');
  }
  async removeEventDelegate(delegateId:string) {
    await run((await this.client).rpc('remove_event_delegate',{ p_delegate:idSchema.parse(delegateId) }),'Kunne ikke fjerne delegaten.');
  }
  async respondToDelegation(input:DelegationResponseInput) {
    const parsed = delegationResponseSchema.parse(input);
    await run((await this.client).rpc('respond_event_delegation',{ p_delegate:parsed.delegateId, p_accept:parsed.accept }),'Kunne ikke lagre svaret.');
  }
  async confirmAttendance(input:AttendanceInput) {
    const parsed = attendanceSchema.parse(input);
    await run((await this.client).rpc('confirm_event_attendance',{ p_delegate:parsed.delegateId, p_attended:parsed.attended }),'Kunne ikke lagre oppmøtet.');
  }
  async confirmAllAttendance(eventId:string) {
    return run((await this.client).rpc('confirm_all_event_attendance',{ p_event:idSchema.parse(eventId) }),'Kunne ikke lagre oppmøtet.');
  }

  // CV
  async getPersonCv(userId:string):Promise<PersonCv|null> {
    const row = await run((await this.client).rpc('get_person_cv',{ p_user:idSchema.parse(userId) }),'Kunne ikke hente CV-en.') as unknown as PersonCvJson|null;
    if (!row) return null;
    const events = row.events.map(e=>({ eventId:e.event_id, title:e.title, startsAt:e.starts_at, category:toEventCategory(e.category), organizerName:e.organizer_name,
      organizationId:e.organization_id, organizationName:e.organization_name, officeTitle:e.office_title ?? undefined, elevtinget:e.elevtinget }));
    return {
      id:row.id, name:row.display_name, initials:initialsOf(row.display_name), avatarUrl:await this.avatarUrl(row.avatar_path), schoolName:row.school_name ?? undefined, active:row.active,
      offices:row.offices.map(o=>({ id:o.id, organizationId:o.organization_id, organizationName:o.organization_name, title:o.title, startDate:o.start_date, endDate:o.end_date, active:o.active })),
      events, stars:events.filter(e=>e.elevtinget).length,
      invitations:row.invitations.map(i=>({ delegateId:i.delegate_id, eventId:i.event_id, title:i.title, startsAt:i.starts_at, organizationName:i.organization_name, status:i.status })),
    };
  }
  async getOrganizationCv(organizationId:string):Promise<OrganizationCvEntry[]> {
    const rows = await run((await this.client).rpc('get_organization_cv',{ p_org:idSchema.parse(organizationId) }),'Kunne ikke hente CV-en.');
    return rows.map(r=>({ eventId:r.event_id, title:r.title, startsAt:r.starts_at, category:toEventCategory(r.category), organizerName:r.organizer_name, elevtinget:r.elevtinget,
      userId:r.user_id ?? undefined, name:r.display_name, officeTitle:r.office_title ?? undefined }));
  }

  // Meldinger
  async openConversation():Promise<Conversation> { throw new NotImplementedError('openConversation'); }
  async sendMessage(input:SendMessageInput):Promise<Message> {
    const parsed = messageSchema.parse(input);
    const row = await run((await this.client).from('messages').insert({ conversation_id:parsed.conversationId, body:parsed.body }).select('id,created_at').single());
    return { id:row.id, from:'', mine:true, text:parsed.body, time:formatRelative(row.created_at) };
  }
  async markConversationRead():Promise<void> { throw new NotImplementedError('markConversationRead'); }
}

function toOrganization(r:OrganizationRow):Organization {
  const name = r.name;
  return {
    id:r.id, type:r.type, name, schoolName:r.school_name ?? undefined, initials:initialsOf(r.school_name ?? name), county:r.county,
    localBoard:r.local_board_name ?? undefined, schoolLevel:(r.school_level ?? undefined) as Organization['schoolLevel'], status:r.status, bio:r.bio ?? '',
    contactEmail:r.contact_email ?? undefined, studentCount:r.student_count ?? undefined, memberCount:r.member_count ?? undefined,
    followers:r.follower_count, following:r.following, officerCount:r.officer_count,
    prioritiesTitle:r.priorities_heading ?? undefined, priorities:(r.priorities as Organization['priorities']) ?? undefined,
  };
}

function toPost(r:PostCardRow):Post {
  const comments = (r.comments as { id:string; organization_id:string; organization_name:string; created_at:string; body:string }[] | null) ?? [];
  const poll = r.poll as { question:string; closes_at:string|null; results_visibility:'after_vote'|'after_close'|'always'; options:{ id:string; label:string; votes:number }[]|null } | null;
  return {
    id:r.id, organizationId:r.organization_id, organizationName:r.organization_name, initials:initialsOf(r.organization_name),
    actorName:r.actor_name ?? '', actorRole:r.actor_title ?? '', createdAt:formatRelative(r.published_at), body:r.body, audience:r.audience,
    priority:r.priority, edited:r.edited,
    // Kortet legger til egen støtte selv, så tallet her er de andres.
    likes:r.support_count-(r.supported?1:0), supported:r.supported, comments:r.comment_count,
    commentItems:comments.map(c=>({ id:c.id, organizationId:c.organization_id, organizationName:c.organization_name, actorName:'', createdAt:formatRelative(c.created_at), body:c.body })),
    poll:poll?{ question:poll.question, closesAt:poll.closes_at?formatDayMonth(poll.closes_at):'ingen frist', resultsVisibility:poll.results_visibility, options:poll.options ?? [] }:undefined,
  };
}

function toEvent(r:EventRow,imageUrl?:string):Event {
  return presentEvent({ id:r.id, organizerId:r.organizer_id, organizerName:r.organizer_name, title:r.title, summary:r.summary, description:r.description, category:r.category,
    startsAt:r.starts_at, endsAt:r.ends_at, location:r.place, digital:r.digital, digitalUrl:r.digital_url, registrationDeadline:r.registration_deadline,
    capacity:r.capacity, priceLabel:r.price_label, seatsPerOrganization:r.seats_per_organization, status:r.status, audience:r.audience, imageUrl,
    registered:r.registered, interested:r.interested, interestedByMe:r.interested_by_me, canEdit:r.can_edit });
}

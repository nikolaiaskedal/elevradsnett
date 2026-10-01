import type { SupabaseClient } from '@supabase/supabase-js';
import { audienceLabel, initialsOf } from '@/lib/domain/labels';
import { formatDayMonth, formatEventSpan, formatRelative } from '@/lib/domain/time';
import type { AdminOrganization, AssignablePerson, AuditEntry, Comment, Conversation, CurrentUser, Event, EventCategory, FriendConnection, GrantStatus, Message, MyRole, Organization, OrganizationRoleEntry, OrganizationStatus, OrganizationType, Post, PostDraft, PostRevision, PublicOfficer, Representation, SchoolAdminRequest, SchoolHistoryEntry, SchoolLevelTarget, Session } from '@/lib/domain/types';
import { assignPublicOfficeSchema, assignRoleSchema, avatarSchema, changeSchoolSchema, commentSchema, decideFriendRequestSchema, decideSchoolAdminRequestSchema, editPostSchema, eventResponseInputSchema, friendRequestSchema, idSchema, isoDate, messageSchema, onboardingSchema, publishPostSchema, requestLoginCodeSchema, saveDraftSchema, schoolAdminRequestSchema, updateProfileSchema, verifyLoginCodeSchema, voteSchema } from '@/lib/domain/validation';
import type { Database } from '@/lib/supabase/database.types';
import { NotImplementedError, type AddCommentInput, type AssignPublicOfficeInput, type AssignRoleInput, type ChangeSchoolInput, type DecideFriendRequestInput, type DecideSchoolAdminRequestInput, type EditPostInput, type ElevradsnettService, type FriendRequestInput, type SaveDraftInput, type OnboardingInput, type SchoolAdminRequestInput, type PublishPostInput, type RequestLoginCodeInput, type SendMessageInput, type SetEventResponseInput, type UpdateProfileInput, type VerifyLoginCodeInput, type VoteInput } from './contracts';

type Client = SupabaseClient<Database>;
type Rpc<Name extends keyof Database['public']['Functions']> = Database['public']['Functions'][Name]['Returns'];
type PostCardRow = Rpc<'list_post_cards'>[number];
type DraftRow = Rpc<'list_post_drafts'>[number];
type OrganizationRow = Rpc<'list_public_organizations'>[number];
type EventRow = Rpc<'list_public_events'>[number];
type SessionRow =
  | { status:'anonymous' }
  | { status:'onboarding'; email:string }
  | { status:'active'|'deactivated'; active_membership_id:string|null;
      profile:{ id:string; display_name:string; email:string; avatar_path:string|null; current_school_id:string|null };
      representations:{ id:string; organization_id:string; name:string; type:OrganizationType; organization_status?:OrganizationStatus; public_title:string; can_publish:boolean }[] };

const AVATAR_BUCKET = 'public-avatars';

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
  'invalid post':'Innlegget må ha mellom 1 og 6000 tegn.',
  'invalid comment':'Kommentaren må ha mellom 1 og 3000 tegn.',
  'invalid audience':'Denne målgruppen passer ikke for avsenderen.',
  'invalid school level':'Ugyldig skoleform.',
  'event not found':'Fant ikke arrangementet, eller det er ikke publisert.',

  'already connected':'Skolene er allerede venneråd.',
  'request already sent':'Dere har allerede sendt en forespørsel til denne skolen.',
  'connection not active':'Vennerådet er allerede avsluttet.',
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
    const rows = await run((await this.client).rpc('list_post_cards',{ p_representation_id:input.representationId ?? undefined, p_mode:input.mode }),'Kunne ikke hente innleggene.');
    return rows.map(toPost);
  }
  async listOrganizationPosts(organizationId:string) {
    const rows = await run((await this.client).rpc('list_post_cards',{ p_organization:organizationId }),'Kunne ikke hente innleggene.');
    return rows.map(toPost);
  }
  async listEvents():Promise<Event[]> {
    const rows = await run((await this.client).rpc('list_public_events'),'Kunne ikke hente arrangementene.');
    return rows.map(toEvent);
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
  /** Innleggskortet slik serveren viser det etter en endring. */
  private async card(organizationId:string,postId:string) {
    const card = (await this.listOrganizationPosts(organizationId)).find(p=>p.id===postId);
    if (!card) throw new Error('Innlegget er lagret, men kunne ikke vises.');
    return card;
  }
  private async draft(organizationId:string,draftId:string) {
    const draft = (await this.listDraftsFor(organizationId)).find(d=>d.id===draftId);
    if (!draft) throw new Error('Utkastet er lagret, men kunne ikke vises.');
    return draft;
  }
  private async listDraftsFor(organizationId:string):Promise<PostDraft[]> {
    const rows = await run((await this.client).rpc('list_post_drafts',{ p_org:organizationId }),'Kunne ikke hente utkastene.');
    return rows.map(toDraft);
  }
  async publishPost(input:PublishPostInput) {
    const parsed = publishPostSchema.parse(input);
    if (parsed.poll || parsed.withImage) throw new NotImplementedError('publishPost med avstemning eller bilde');
    const client = await this.client;
    const content = { p_body:parsed.body, p_audience:parsed.audience, p_school_level:parsed.schoolLevel, p_event:parsed.eventId, p_publish:true };
    const saved = parsed.draftId
      ? await run(client.rpc('update_post',{ p_post:parsed.draftId, ...content }),'Kunne ikke publisere utkastet.')
      : await run(client.rpc('create_post',{ p_organization:await this.organizationOf(parsed.representationId), ...content }),'Kunne ikke publisere innlegget.');
    return this.card(saved.organization_id,saved.id);
  }
  async saveDraft(input:SaveDraftInput) {
    const parsed = saveDraftSchema.parse(input);
    const client = await this.client;
    const content = { p_body:parsed.body, p_audience:parsed.audience, p_school_level:parsed.schoolLevel, p_event:parsed.eventId, p_publish:false };
    const saved = parsed.draftId
      ? await run(client.rpc('update_post',{ p_post:parsed.draftId, ...content }),'Kunne ikke lagre utkastet.')
      : await run(client.rpc('create_post',{ p_organization:await this.organizationOf(parsed.representationId), ...content }),'Kunne ikke lagre utkastet.');
    return this.draft(saved.organization_id,saved.id);
  }
  async listDrafts(representationId:string) {
    return this.listDraftsFor(await this.organizationOf(idSchema.parse(representationId)));
  }
  async editPost(input:EditPostInput) {
    const parsed = editPostSchema.parse(input);
    const saved = await run((await this.client).rpc('update_post',{ p_post:parsed.postId, p_body:parsed.body, p_audience:parsed.audience, p_school_level:parsed.schoolLevel, p_event:parsed.eventId }),'Kunne ikke lagre endringene.');
    return this.card(saved.organization_id,saved.id);
  }
  async deletePost(postId:string) {
    await run((await this.client).rpc('delete_post',{ p_post:idSchema.parse(postId) }),'Kunne ikke slette innlegget.');
  }
  async listPostHistory(postId:string):Promise<PostRevision[]> {
    const rows = await run((await this.client).rpc('get_post_history',{ p_post:idSchema.parse(postId) }),'Kunne ikke hente endringshistorikken.');
    return rows.map(r=>({ id:r.id, body:r.body, audience:r.audience, schoolLevel:r.school_level as SchoolLevelTarget, editedByName:r.edited_by_name ?? '', createdAt:r.created_at }));
  }
  async addComment(input:AddCommentInput):Promise<Comment> {
    const parsed = commentSchema.parse(input);
    const organizationId = await this.organizationOf(parsed.representationId);
    const row = await run((await this.client).rpc('add_comment',{ p_post:parsed.postId, p_organization:organizationId, p_body:parsed.body }));
    return { id:row.id, organizationId, organizationName:'', actorName:'', createdAt:formatRelative(row.created_at), body:row.body };
  }
  async setPostSupport():Promise<void> { throw new NotImplementedError('setPostSupport'); }
  async vote(input:VoteInput) {
    const parsed = voteSchema.parse(input);
    const poll = await run((await this.client).from('polls').select('id').eq('post_id',parsed.postId).single());
    await run((await this.client).rpc('cast_organization_vote',{ p_poll_id:poll.id, p_option_id:parsed.optionId, p_organization_id:parsed.organizationId }));
  }
  async reportPost():Promise<void> { throw new NotImplementedError('reportPost'); }

  // Venneråd
  async listFriendConnections(schoolId:string):Promise<FriendConnection[]> {
    const rows = await run((await this.client).rpc('list_friend_connections',{ p_school:idSchema.parse(schoolId) }),'Kunne ikke hente vennerådene.');
    return rows.map(r=>({ id:r.id, schoolId:r.school_id, schoolName:r.school_name, county:r.county, status:r.status as FriendConnection['status'],
      direction:r.direction as FriendConnection['direction'], createdAt:r.created_at, approvedAt:r.approved_at ?? undefined, canDecide:r.can_decide }));
  }
  async requestFriendSchool(input:FriendRequestInput) {
    const parsed = friendRequestSchema.parse(input);
    await run((await this.client).rpc('request_friend_school',{ p_school:parsed.schoolId, p_target:parsed.targetSchoolId }),'Kunne ikke sende forespørselen.');
  }
  async decideFriendRequest(input:DecideFriendRequestInput) {
    const parsed = decideFriendRequestSchema.parse(input);
    await run((await this.client).rpc('decide_friend_request',{ p_connection:parsed.connectionId, p_accept:parsed.accept }),'Kunne ikke svare på forespørselen.');
  }
  async endFriendConnection(connectionId:string) {
    await run((await this.client).rpc('end_friend_connection',{ p_connection:idSchema.parse(connectionId) }),'Kunne ikke avslutte vennerådet.');
  }

  // Organisasjoner og arrangementer
  async setFollow():Promise<void> { throw new NotImplementedError('setFollow'); }
  async setEventResponse(input:SetEventResponseInput) {
    const parsed = eventResponseInputSchema.parse(input);
    await run((await this.client).rpc('set_event_response',{ p_event:parsed.eventId, p_organization:parsed.organizationId, p_response:parsed.response ?? 'none' }));
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
    schoolLevel:r.school_level as SchoolLevelTarget, eventId:r.event_id ?? undefined, canManage:r.can_manage,
    priority:r.priority, edited:r.edited,
    // Kortet legger til egen støtte selv, så tallet her er de andres.
    likes:r.support_count-(r.supported?1:0), supported:r.supported, comments:r.comment_count,
    commentItems:comments.map(c=>({ id:c.id, organizationId:c.organization_id, organizationName:c.organization_name, actorName:'', createdAt:formatRelative(c.created_at), body:c.body })),
    poll:poll?{ question:poll.question, closesAt:poll.closes_at?formatDayMonth(poll.closes_at):'ingen frist', resultsVisibility:poll.results_visibility, options:poll.options ?? [] }:undefined,
  };
}

function toDraft(r:DraftRow):PostDraft {
  return { id:r.id, organizationId:r.organization_id, body:r.body, audience:r.audience, schoolLevel:r.school_level as SchoolLevelTarget, eventId:r.event_id ?? undefined,
    updatedAt:r.updated_at, actorName:r.actor_name ?? '' };
}

const categories:EventCategory[] = ['landsmote','kurs','samling','mote','digitalt','annet'];
function toEvent(r:EventRow):Event {
  const span = formatEventSpan(r.starts_at,r.ends_at);
  return {
    id:r.id, hostId:r.organizer_id, host:r.organizer_name, title:r.title, summary:r.summary ?? '', description:r.description,
    category:categories.includes(r.category as EventCategory)?r.category as EventCategory:'annet',
    startsAt:r.starts_at, start:span.start, end:span.end, place:r.digital?'Digitalt (lenke)':r.place ?? '', digital:r.digital,
    deadline:r.registration_deadline?formatDayMonth(r.registration_deadline):undefined, price:r.price_label ?? undefined,
    seatsPerOrganization:r.seats_per_organization ?? undefined, capacity:r.capacity ?? 0, registered:r.registered, interested:r.interested,
    status:r.status, audience:audienceLabel[r.audience],
  };
}

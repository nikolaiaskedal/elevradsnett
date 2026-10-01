import type { SupabaseClient } from '@supabase/supabase-js';
import { audienceLabel, initialsOf } from '@/lib/domain/labels';
import { formatDayMonth, formatEventSpan, formatRelative } from '@/lib/domain/time';
import type { Comment, Conversation, CurrentUser, Event, EventCategory, Message, Organization, OrganizationType, Post, PublicOfficer, Representation, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import { avatarSchema, changeSchoolSchema, commentSchema, eventResponseInputSchema, messageSchema, onboardingSchema, publishPostSchema, requestLoginCodeSchema, updateProfileSchema, verifyLoginCodeSchema, voteSchema } from '@/lib/domain/validation';
import type { Database } from '@/lib/supabase/database.types';
import { NotImplementedError, type AddCommentInput, type ChangeSchoolInput, type ElevradsnettService, type OnboardingInput, type PublishPostInput, type RequestLoginCodeInput, type SendMessageInput, type SetEventResponseInput, type UpdateProfileInput, type VerifyLoginCodeInput, type VoteInput } from './contracts';

type Client = SupabaseClient<Database>;
type Rpc<Name extends keyof Database['public']['Functions']> = Database['public']['Functions'][Name]['Returns'];
type PostCardRow = Rpc<'get_post_cards'>[number];
type OrganizationRow = Rpc<'list_public_organizations'>[number];
type EventRow = Rpc<'list_public_events'>[number];
type SessionRow =
  | { status:'anonymous' }
  | { status:'onboarding'; email:string }
  | { status:'active'|'deactivated'; active_membership_id:string|null;
      profile:{ id:string; display_name:string; email:string; avatar_path:string|null; current_school_id:string|null };
      representations:{ id:string; organization_id:string; name:string; type:OrganizationType; public_title:string; can_publish:boolean }[] };

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
};
export function toNorwegianError(error:unknown, fallback = 'Noe gikk galt. Prøv igjen.'):Error {
  if (error instanceof NotImplementedError) return error;
  const raw = error && typeof error==='object' && 'message' in error ? String((error as { message:unknown }).message) : '';
  const status = error && typeof error==='object' && 'status' in error ? Number((error as { status:unknown }).status) : 0;
  if (serverMessages[raw]) return new Error(serverMessages[raw]);
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
      publicRole:r.public_title || 'Medlem', canPublish:r.can_publish, type:r.type }) satisfies Representation);
    const active = representations.find(r=>r.id===row.active_membership_id) ?? representations[0];
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
  async listFeed(input:{ representationId:string|null; mode:'recommended'|'chronological' }) {
    const rows = await run((await this.client).rpc('get_post_cards',{ p_representation_id:input.representationId ?? undefined, p_mode:input.mode }),'Kunne ikke hente innleggene.');
    return rows.map(toPost);
  }
  async listOrganizationPosts(organizationId:string) {
    const rows = await run((await this.client).rpc('get_post_cards',{ p_organization:organizationId }),'Kunne ikke hente innleggene.');
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
    priority:r.priority, edited:r.edited,
    // Kortet legger til egen støtte selv, så tallet her er de andres.
    likes:r.support_count-(r.supported?1:0), supported:r.supported, comments:r.comment_count,
    commentItems:comments.map(c=>({ id:c.id, organizationId:c.organization_id, organizationName:c.organization_name, actorName:'', createdAt:formatRelative(c.created_at), body:c.body })),
    poll:poll?{ question:poll.question, closesAt:poll.closes_at?formatDayMonth(poll.closes_at):'ingen frist', resultsVisibility:poll.results_visibility, options:poll.options ?? [] }:undefined,
  };
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

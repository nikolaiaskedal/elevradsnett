import type { AdminOrganization, AssignablePerson, AuditEntry, Comment, Conversation, DelegateCandidate, Event, EventOrganizer, EventParticipation, FriendConnection, Message, MyRole, Organization, OrganizationCvEntry, OrganizationRoleEntry, PersonCv, Post, PostDraft, PostRevision, PublicOfficer, SchoolAdminRequest, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import type { AddCommentInput, AddDelegateInput, AssignPublicOfficeInput, AssignRoleInput, AttendanceInput, ChangeSchoolInput, DecideFriendRequestInput, DecideSchoolAdminRequestInput, DelegationResponseInput, EditPostInput, EventInput, EventInterestInput, EventRegistrationInput, EventStatusChangeInput, FriendRequestInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SaveDraftInput, SchoolAdminRequestInput, SendMessageInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from '@/lib/domain/validation';

export type { AddCommentInput, AddDelegateInput, AssignPublicOfficeInput, AssignRoleInput, AttendanceInput, ChangeSchoolInput, DecideFriendRequestInput, DecideSchoolAdminRequestInput, DelegationResponseInput, EditPostInput, EventInput, EventInterestInput, EventRegistrationInput, EventStatusChangeInput, FriendRequestInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SaveDraftInput, SchoolAdminRequestInput, SendMessageInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput };

/**
 * Alt grensesnittet leser og gjør. Samme kontrakt skal kunne brukes av iOS og Android.
 * Tilgang avgjøres alltid på serveren (RLS og RPC-er), aldri i klienten.
 */
export interface ElevradsnettService {
  /** Bare i demoen: hvordan man logger inn uten ekte e-post. Vises i innloggingen. */
  readonly demoLoginHint?:string;

  // Innlogging og økt
  getSession():Promise<Session>;
  /** Kalles når innloggingen endres utenfra (annen fane, utløpt økt). Returnerer en funksjon som avslutter lyttingen. */
  onSessionChange(listener:()=>void):()=>void;
  /** Sender en engangskode på e-post. Svarer likt om kontoen finnes eller ikke. */
  requestLoginCode(input:RequestLoginCodeInput):Promise<void>;
  verifyLoginCode(input:VerifyLoginCodeInput):Promise<Session>;
  signOut():Promise<void>;

  // Lesing. Alt her virker uten innlogging; serveren avgjør hva som er synlig.
  listOrganizations():Promise<Organization[]>;
  /** Én organisasjon, også når den er deaktivert (så gamle lenker viser siden med historikken). null hvis den ikke finnes. */
  getOrganization(organizationId:string):Promise<Organization|null>;
  /** Med representasjon: rangert feed for den. Uten: offentlige innlegg, nyeste først. */
  listFeed(input:{ representationId:string|null; mode:'recommended'|'chronological' }):Promise<Post[]>;
  listOrganizationPosts(organizationId:string):Promise<Post[]>;
  listEvents():Promise<Event[]>;
  listConversations():Promise<Conversation[]>;
  listPublicOfficers(organizationId:string):Promise<PublicOfficer[]>;

  // Profil
  completeOnboarding(input:OnboardingInput):Promise<void>;
  updateProfile(input:UpdateProfileInput):Promise<void>;
  /** Laster opp et ferdig omkodet profilbilde og returnerer adressen til det. */
  setAvatar(image:Blob):Promise<string>;
  removeAvatar():Promise<void>;
  changeSchool(input:ChangeSchoolInput):Promise<void>;
  listSchoolHistory():Promise<SchoolHistoryEntry[]>;

  // Representasjon, verv og rettigheter (§3, §4)
  switchRepresentation(representationId:string):Promise<void>;
  /** Egne verv og interne rettigheter, også avsluttede. */
  listMyRoles():Promise<MyRole[]>;
  requestSchoolAdmin(input:SchoolAdminRequestInput):Promise<void>;
  cancelSchoolAdminRequest(requestId:string):Promise<void>;
  /** Egne forespørsler og forespørsler brukeren kan avgjøre. */
  listSchoolAdminRequests():Promise<SchoolAdminRequest[]>;
  decideSchoolAdminRequest(input:DecideSchoolAdminRequestInput):Promise<void>;

  // Administrasjon. Serveren avgjør hvilke organisasjoner og rettigheter som vises.
  listAdminOrganizations():Promise<AdminOrganization[]>;
  listOrganizationRoles(organizationId:string):Promise<OrganizationRoleEntry[]>;
  searchAssignablePeople(input:{ organizationId:string; query:string }):Promise<AssignablePerson[]>;
  assignPublicOffice(input:AssignPublicOfficeInput):Promise<void>;
  endPublicOffice(membershipId:string):Promise<void>;
  assignRole(input:AssignRoleInput):Promise<void>;
  revokeRole(grantId:string):Promise<void>;
  listAuditLog(organizationId:string):Promise<AuditEntry[]>;

  // Innlegg (§7). Serveren avgjør hvem som kan publisere, redigere og slette, og hvem som ser hva.
  /** Publiserer et nytt innlegg, eller et utkast når draftId er satt. */
  publishPost(input:PublishPostInput):Promise<Post>;
  /** Lagrer et nytt utkast, eller oppdaterer et eksisterende (draftId). */
  saveDraft(input:SaveDraftInput):Promise<PostDraft>;
  /** Utkastene til organisasjonen representasjonen gjelder. */
  listDrafts(representationId:string):Promise<PostDraft[]>;
  /** Endrer et publisert innlegg. Forrige versjon lagres, og innlegget merkes «redigert». */
  editPost(input:EditPostInput):Promise<Post>;
  /** Sletter et innlegg eller utkast. */
  deletePost(postId:string):Promise<void>;
  /** Tidligere versjoner av et innlegg, nyeste først. */
  listPostHistory(postId:string):Promise<PostRevision[]>;
  addComment(input:AddCommentInput):Promise<Comment>;
  setPostSupport(input:{ postId:string; supported:boolean }):Promise<void>;
  vote(input:VoteInput):Promise<void>;
  reportPost(input:{ postId:string }):Promise<void>;

  // Venneråd: gjensidig godkjent forbindelse mellom to skoler. Skoleadministratorer styrer dem.
  listFriendConnections(schoolId:string):Promise<FriendConnection[]>;
  requestFriendSchool(input:FriendRequestInput):Promise<void>;
  decideFriendRequest(input:DecideFriendRequestInput):Promise<void>;
  /** Avslutter et venneråd, eller trekker en forespørsel skolen har sendt. */
  endFriendConnection(connectionId:string):Promise<void>;

  // Organisasjoner
  setFollow(input:{ organizationId:string; following:boolean }):Promise<void>;

  // Arrangementer (§8). Interesse, påmelding, delegater og bekreftet oppmøte er adskilte handlinger.
  /** Organisasjonene brukeren kan opprette arrangementer for. Tom liste uten rettigheter. */
  listEventOrganizers():Promise<EventOrganizer[]>;
  /** Oppretter (uten id) eller endrer et arrangement. Returnerer id-en. */
  saveEvent(input:EventInput):Promise<string>;
  setEventStatus(input:EventStatusChangeInput):Promise<void>;
  /** Laster opp et ferdig omkodet bilde, eller fjerner bildet (null). Returnerer adressen. */
  setEventImage(eventId:string, image:Blob|null):Promise<string|undefined>;
  /** Personlig interesse. Krever bare innlogging. */
  setEventInterest(input:EventInterestInput):Promise<void>;
  /** Melder organisasjonen på eller av. Er arrangementet fullt, havner den på venteliste. */
  registerForEvent(input:EventRegistrationInput):Promise<'registered'|'waitlisted'|'cancelled'>;
  getEventParticipation(eventId:string):Promise<EventParticipation>;
  searchDelegateCandidates(input:{ registrationId:string; query:string }):Promise<DelegateCandidate[]>;
  addEventDelegate(input:AddDelegateInput):Promise<void>;
  removeEventDelegate(delegateId:string):Promise<void>;
  /** Delegaten bekrefter eller takker nei selv. */
  respondToDelegation(input:DelegationResponseInput):Promise<void>;
  /** Arrangøren bekrefter oppmøte. Bare dette gir CV-oppføring. */
  confirmAttendance(input:AttendanceInput):Promise<void>;
  /** Bekrefter oppmøte for alle delegater som har bekreftet selv. Returnerer antallet. */
  confirmAllAttendance(eventId:string):Promise<number>;

  // CV (§8). Offentlig; deaktiverte personer har ingen offentlig CV (null).
  getPersonCv(userId:string):Promise<PersonCv|null>;
  getOrganizationCv(organizationId:string):Promise<OrganizationCvEntry[]>;

  // Meldinger
  openConversation(input:{ organizationId:string }):Promise<Conversation>;
  sendMessage(input:SendMessageInput):Promise<Message>;
  markConversationRead(conversationId:string):Promise<void>;
}

/** Kastes av adaptere for operasjoner som ennå ikke har en RPC på serveren. */
export class NotImplementedError extends Error {
  constructor(operation:string) {
    super(`«${operation}» er ikke koblet til Supabase ennå: RPC mangler.`);
    this.name = 'NotImplementedError';
  }
}

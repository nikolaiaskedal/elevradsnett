import type { BlockedUser, ConversationMember, MessageSettings, OrganizationContact, RecipientSearchResult } from '@/lib/domain/messaging';
import type { AddMembersInput, CreateGroupInput, ReportMessageInput } from '@/lib/domain/validation';
import type { AdminDashboard, MfaStatus, PlaceholderContentStatus, ModerationReport, TotpEnrollment } from '@/lib/domain/admin';
import type { AdminOrganization, AssignablePerson, AuditEntry, Comment, Conversation, DelegateCandidate, Event, EventOrganizer, EventParticipation, FriendConnection, Message, MyRole, Organization, OrganizationCvEntry, OrganizationRoleEntry, PersonCv, Post, PostDraft, PostRevision, PublicOfficer, SchoolAdminRequest, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import type { AddCommentInput, AddDelegateInput, AdminImagesInput, AdminUserActionInput, AssignPublicOfficeInput, AssignRoleInput, AttendanceInput, ChangeSchoolInput, DecideFriendRequestInput, DecideSchoolAdminRequestInput, DelegationResponseInput, EditPostInput, EventInput, EventInterestInput, EventRegistrationInput, EventStatusChangeInput, FriendRequestInput, ModerationActionInput, ModerationAppealInput, OnboardingInput, OrganizationStatusActionInput, PublishPostInput, RequestLoginCodeInput, SaveDraftInput, SchoolAdminRequestInput, SendMessageInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from '@/lib/domain/validation';

import type { OrganizationImages, Poll } from '@/lib/domain/types';
import type { ReportPostInput } from '@/lib/domain/validation';
import type { AppNotification, HandoverOverview, MyHandoverInvite, NotificationPreferences } from '@/lib/domain/notifications';
import type { HandoverResponseInput, NotificationPreferencesInput, RescheduleHandoverInput, SearchInput, SetElectionDateInput, StartHandoverInput } from '@/lib/domain/validation';
import type { SearchResult } from '@/lib/domain/search';
import type { AdminDataRequest, PrivacyStatus } from '@/lib/domain/privacy';
import type { AcceptTermsInput, ConsentInput, DecideDataRequestInput } from '@/lib/domain/validation';

export type { AddMembersInput, CreateGroupInput, ReportMessageInput, ReportPostInput };
export type { AcceptTermsInput, ConsentInput, DecideDataRequestInput };
export type { HandoverResponseInput, NotificationPreferencesInput, RescheduleHandoverInput, SearchInput, SetElectionDateInput, StartHandoverInput };
export type { AddCommentInput, AddDelegateInput, AdminImagesInput, AdminUserActionInput, AssignPublicOfficeInput, AssignRoleInput, AttendanceInput, ChangeSchoolInput, DecideFriendRequestInput, DecideSchoolAdminRequestInput, DelegationResponseInput, EditPostInput, EventInput, EventInterestInput, EventRegistrationInput, EventStatusChangeInput, FriendRequestInput, ModerationActionInput, ModerationAppealInput, OnboardingInput, OrganizationStatusActionInput, PublishPostInput, RequestLoginCodeInput, SaveDraftInput, SchoolAdminRequestInput, SendMessageInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput };

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
  getAdminDashboard(organizationId:string):Promise<AdminDashboard>;
  manageAdminUser(input:AdminUserActionInput):Promise<void>;
  setOrganizationStatus(input:OrganizationStatusActionInput):Promise<void>;
  setAdminImages(input:AdminImagesInput):Promise<void>;
  deletePlaceholder(input:{ scopeId:string; type:'organization'|'post_media'|'event'; id:string }):Promise<void>;
  deleteAllPlaceholders(scopeId:string):Promise<number>;
  /** Om eksempelinnholdet er skrudd på. Bare superadministrator. */
  getPlaceholderContentStatus():Promise<PlaceholderContentStatus>;
  /** Skrur eksempelinnholdet på (oppretter det) eller av (sletter alt, også svar og reaksjoner på det). Bare superadministrator. */
  setPlaceholderContent(enabled:boolean):Promise<PlaceholderContentStatus>;
  listModerationReports(organizationId:string):Promise<ModerationReport[]>;
  applyModerationAction(input:ModerationActionInput):Promise<void>;
  appealModerationReport(input:ModerationAppealInput):Promise<void>;

  // MFA. Superadministratorrettigheter er sperret server-side til økten har AAL2.
  getMfaStatus():Promise<MfaStatus>;
  enrollTotp():Promise<TotpEnrollment>;
  verifyTotp(input:{ factorId:string; code:string }):Promise<void>;
  challengeTotp(input:{ factorId:string; code:string }):Promise<void>;

  // Innlegg (§7). Serveren avgjør hvem som kan publisere, redigere og slette, og hvem som ser hva.
  /**
   * Publiserer et nytt innlegg, eller et utkast når draftId er satt. Med avstemning eller bilder lagres innlegget først som utkast,
   * bildene lastes opp og kontrolleres, og så publiseres det. onProgress sier hva som skjer, så behandlingsstatusen kan vises.
   */
  publishPost(input:PublishPostInput, onProgress?:(progress:PublishProgress)=>void):Promise<Post>;
  /** Ett innlegg (delte lenker). null hvis det ikke finnes eller ikke er synlig for brukeren. */
  getPost(postId:string):Promise<Post|null>;
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
  /** Gir eller fjerner støtte. Returnerer antall støtter; bare antallet er offentlig. */
  setPostSupport(input:{ postId:string; supported:boolean }):Promise<number>;
  /** Stemmer, eller endrer stemmen, på vegne av organisasjonen. Returnerer avstemningen slik serveren viser den nå. */
  vote(input:VoteInput):Promise<Poll>;
  /** Rapporterer et innlegg til moderatorene (§15). */
  reportPost(input:ReportPostInput):Promise<void>;

  // Venneråd: gjensidig godkjent forbindelse mellom to skoler. Skoleadministratorer styrer dem.
  listFriendConnections(schoolId:string):Promise<FriendConnection[]>;
  requestFriendSchool(input:FriendRequestInput):Promise<void>;
  decideFriendRequest(input:DecideFriendRequestInput):Promise<void>;
  /** Avslutter et venneråd, eller trekker en forespørsel skolen har sendt. */
  endFriendConnection(connectionId:string):Promise<void>;

  // Organisasjoner
  /** Følger eller slutter å følge. Returnerer antall følgere. */
  setFollow(input:{ organizationId:string; following:boolean }):Promise<number>;
  /** Profil- og coverbilde etter bildehierarkiet (§14), og om brukeren kan endre dem. */
  getOrganizationImages(organizationId:string):Promise<OrganizationImages>;
  /** Laster opp et ferdig omkodet bilde som organisasjonens eget, eller fjerner det (null). */
  setOrganizationImage(input:{ organizationId:string; kind:'profile'|'cover'; image:Blob|null }):Promise<OrganizationImages>;

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

  // Meldinger (§9). Alltid mellom personer; serveren avgjør hvem som er med i hvilke samtaler.
  /** Meldingene i en samtale, eldste først. before (ISO-tid) henter eldre meldinger. */
  listMessages(input:{ conversationId:string; before?:string }):Promise<Message[]>;
  listConversationMembers(conversationId:string):Promise<ConversationMember[]>;
  /** Personer (navn og skole) og organisasjoner. Krever minst to tegn. */
  searchRecipients(query:string):Promise<RecipientSearchResult[]>;
  /** Offentlige kontaktpersoner i en organisasjon. Organisasjonen selv har ingen innboks. */
  listOrganizationContacts(organizationId:string):Promise<OrganizationContact[]>;
  /** Åpner direktesamtalen med personen, eller oppretter den. Returnerer samtalens id. */
  startDirectConversation(userId:string):Promise<string>;
  createGroup(input:CreateGroupInput):Promise<string>;
  /** Vanlig gruppe med organisasjonens kontaktpersoner. */
  createOrganizationGroup(organizationId:string):Promise<string>;
  addConversationMembers(input:AddMembersInput):Promise<void>;
  leaveConversation(conversationId:string):Promise<void>;
  sendMessage(input:SendMessageInput):Promise<Message>;
  markConversationRead(conversationId:string):Promise<void>;
  setConversationMuted(input:{ conversationId:string; muted:boolean }):Promise<void>;
  /** Sletter meldingen for egen visning. De andre ser den fortsatt. */
  hideMessage(messageId:string):Promise<void>;
  /** Rapporterer én konkret melding. Bare den meldingen deles med moderator. */
  reportMessage(input:ReportMessageInput):Promise<void>;
  blockUser(userId:string):Promise<void>;
  unblockUser(userId:string):Promise<void>;
  listBlockedUsers():Promise<BlockedUser[]>;
  getMessageSettings():Promise<MessageSettings>;
  setReadReceipts(enabled:boolean):Promise<void>;
  /** Tidsbegrenset lenke til et vedlegg. */
  getAttachmentUrl(path:string):Promise<string>;
  /** Kalles når det kommer nye meldinger eller endringer i samtalene. Returnerer en funksjon som avslutter lyttingen. */
  subscribeToMessages(listener:()=>void):()=>void;

  // Søk (§6, prompt 8). Virker uten innlogging; serveren avgjør hva som er synlig.
  /** Skoler, styrer, personer, arrangementer og innlegg. includeFormer tar med deaktiverte skoler og tidligere tillitsvalgte. */
  search(input:SearchInput):Promise<SearchResult[]>;

  // Varsler (§5, prompt 11). Lagres på serveren; e-post sendes som ett daglig sammendrag.
  /** Egne varsler i plattformen, nyeste først. */
  listNotifications():Promise<AppNotification[]>;
  /** Merker varslene som lest. Uten liste: alle uleste. */
  markNotificationsRead(ids?:string[]):Promise<void>;
  getNotificationPreferences():Promise<NotificationPreferences>;
  setNotificationPreferences(input:NotificationPreferencesInput):Promise<void>;
  /** Kalles når det kommer nye varsler. Returnerer en funksjon som avslutter lyttingen. */
  subscribeToNotifications(listener:()=>void):()=>void;

  // Styreoverføring (§5). Serveren avgjør hvem som kan starte, gjenopprette og godta.
  getHandoverOverview(organizationId:string):Promise<HandoverOverview>;
  /** Dato for neste styreskifte. Kan endres hvis valget utsettes. */
  setElectionDate(input:SetElectionDateInput):Promise<void>;
  /** Starter overføringen og sender invitasjonene. Med recoveryReason er det en gjenoppretting fra styret. Returnerer id-en. */
  startHandover(input:StartHandoverInput):Promise<string>;
  rescheduleHandover(input:RescheduleHandoverInput):Promise<void>;
  cancelHandover(handoverId:string):Promise<void>;
  /** Aktiverer en planlagt overføring nå i stedet for på aktiveringsdatoen. */
  activateHandoverNow(handoverId:string):Promise<void>;
  /** Invitasjoner til den innloggede som venter på svar. */
  listMyHandoverInvites():Promise<MyHandoverInvite[]>;
  respondToHandoverInvite(input:HandoverResponseInput):Promise<void>;

  // Personvern (§10, §16, prompt 14). Virker også for deaktiverte profiler.
  /** Godkjente vilkår, siste samtykke og egne forespørsler om sletting. */
  getPrivacyStatus():Promise<PrivacyStatus>;
  /** Godtar gjeldende vilkår og personvernerklæring. Serveren avviser utdaterte versjoner. */
  acceptTerms(input:AcceptTermsInput):Promise<void>;
  /** Lagrer valget for valgfrie tjenester. Uten innlogging med en tilfeldig id fra nettleseren. Tidligere valg trekkes tilbake. */
  recordConsent(input:ConsentInput):Promise<void>;
  /** Deaktiverer egen profil. Verv og rettigheter avsluttes. Siste administrator stoppes. */
  deactivateAccount():Promise<void>;
  /** Aktiverer en profil brukeren deaktiverte selv. */
  reactivateAccount():Promise<void>;
  /** Alle egne data som JSON, for nedlasting. */
  exportMyData():Promise<Record<string,unknown>>;
  /** Ber om sletting av egne personopplysninger. Superadministrator gjennomfører. */
  requestDeletion():Promise<void>;
  cancelDataRequest(requestId:string):Promise<void>;
  /** Forespørsler om sletting. Bare superadministrator. */
  listDataRequests():Promise<AdminDataRequest[]>;
  /** Under behandling, gjennomført (sletter personopplysningene) eller avslått. Bare superadministrator. */
  decideDataRequest(input:DecideDataRequestInput):Promise<void>;
}

/** Steg i publiseringen, så grensesnittet kan vise behandlingsstatus. */
export type PublishProgress = { step:'saving' } | { step:'uploading'|'checking'; index:number; count:number } | { step:'publishing' };

/** Kastes av adaptere for operasjoner som ennå ikke har en RPC på serveren. */
export class NotImplementedError extends Error {
  constructor(operation:string) {
    super(`«${operation}» er ikke koblet til Supabase ennå: RPC mangler.`);
    this.name = 'NotImplementedError';
  }
}

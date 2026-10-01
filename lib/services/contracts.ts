import type { BlockedUser, ConversationMember, MessageSettings, OrganizationContact, RecipientSearchResult } from '@/lib/domain/messaging';
import type { AddMembersInput, CreateGroupInput, ReportMessageInput } from '@/lib/domain/validation';
import type { AdminOrganization, AssignablePerson, AuditEntry, Comment, Conversation, Event, Message, MyRole, Organization, OrganizationRoleEntry, Post, PublicOfficer, SchoolAdminRequest, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import type { AddCommentInput, AssignPublicOfficeInput, AssignRoleInput, ChangeSchoolInput, DecideSchoolAdminRequestInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SchoolAdminRequestInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from '@/lib/domain/validation';

export type { AddMembersInput, CreateGroupInput, ReportMessageInput };
export type { AddCommentInput, AssignPublicOfficeInput, AssignRoleInput, ChangeSchoolInput, DecideSchoolAdminRequestInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SchoolAdminRequestInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput };

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

  // Innlegg
  publishPost(input:PublishPostInput):Promise<Post>;
  addComment(input:AddCommentInput):Promise<Comment>;
  setPostSupport(input:{ postId:string; supported:boolean }):Promise<void>;
  vote(input:VoteInput):Promise<void>;
  reportPost(input:{ postId:string }):Promise<void>;

  // Organisasjoner og arrangementer
  setFollow(input:{ organizationId:string; following:boolean }):Promise<void>;
  setEventResponse(input:SetEventResponseInput):Promise<void>;

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
}

/** Kastes av adaptere for operasjoner som ennå ikke har en RPC på serveren. */
export class NotImplementedError extends Error {
  constructor(operation:string) {
    super(`«${operation}» er ikke koblet til Supabase ennå: RPC mangler.`);
    this.name = 'NotImplementedError';
  }
}

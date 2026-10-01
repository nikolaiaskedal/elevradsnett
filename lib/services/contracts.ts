import type { Comment, Conversation, Event, Message, Organization, Post, PublicOfficer, SchoolHistoryEntry, Session } from '@/lib/domain/types';
import type { AddCommentInput, ChangeSchoolInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput } from '@/lib/domain/validation';

export type { AddCommentInput, ChangeSchoolInput, OnboardingInput, PublishPostInput, RequestLoginCodeInput, SendMessageInput, SetEventResponseInput, UpdateProfileInput, VerifyLoginCodeInput, VoteInput };

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

  // Representasjon
  switchRepresentation(representationId:string):Promise<void>;

  // Innlegg
  publishPost(input:PublishPostInput):Promise<Post>;
  addComment(input:AddCommentInput):Promise<Comment>;
  setPostSupport(input:{ postId:string; supported:boolean }):Promise<void>;
  vote(input:VoteInput):Promise<void>;
  reportPost(input:{ postId:string }):Promise<void>;

  // Organisasjoner og arrangementer
  setFollow(input:{ organizationId:string; following:boolean }):Promise<void>;
  setEventResponse(input:SetEventResponseInput):Promise<void>;

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

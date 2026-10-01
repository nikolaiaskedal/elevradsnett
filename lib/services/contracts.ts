import type { Comment, Conversation, Event, Message, Organization, Post, PublicOfficer, Session } from '@/lib/domain/types';
import type { AddCommentInput, OnboardingInput, PublishPostInput, SendMessageInput, SetEventResponseInput, VoteInput } from '@/lib/domain/validation';

export type { AddCommentInput, OnboardingInput, PublishPostInput, SendMessageInput, SetEventResponseInput, VoteInput };

/**
 * Alt grensesnittet leser og gjør. Samme kontrakt skal kunne brukes av iOS og Android.
 * Tilgang avgjøres alltid på serveren (RLS og RPC-er), aldri i klienten.
 */
export interface ElevradsnettService {
  // Lesing
  getSession():Promise<Session>;
  listOrganizations():Promise<Organization[]>;
  listFeed(input:{ representationId:string; mode:'recommended'|'chronological' }):Promise<Post[]>;
  listEvents():Promise<Event[]>;
  listConversations():Promise<Conversation[]>;
  listPublicOfficers(organizationId:string):Promise<PublicOfficer[]>;

  // Representasjon og innlogging
  switchRepresentation(representationId:string):Promise<void>;
  completeOnboarding(input:OnboardingInput):Promise<void>;

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

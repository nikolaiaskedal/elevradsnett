import type { Audience, Comment, EventResponse, Post, PublicOfficer, Representation } from '@/lib/domain/types';

export type PublishPostInput = { representation:Representation; body:string; audience:Audience; status:'draft'|'published'; actorUserId:string };
export interface ElevradsnettService {
  listFeed(input:{ representationId:string; mode:'recommended'|'chronological' }):Promise<Post[]>;
  publishPost(input:PublishPostInput):Promise<Post>;
  switchRepresentation(representationId:string):Promise<void>;
  vote(input:{ pollId:string; optionId:string; organizationId:string }):Promise<void>;
  sendMessage(input:{ conversationId:string; body:string }):Promise<void>;
  addComment(input:{ postId:string; representation:Representation; body:string }):Promise<Comment>;
  setEventResponse(input:{ eventId:string; organizationId:string; response:EventResponse|null }):Promise<void>;
  listPublicOfficers(organizationId:string):Promise<PublicOfficer[]>;
  completeOnboarding(input:{ schoolId:string; displayName:string; leaderMonth?:number }):Promise<void>;
}

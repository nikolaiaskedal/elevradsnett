import type { Audience, Post, Representation } from '@/lib/domain/types';

export type PublishPostInput = { representation:Representation; body:string; audience:Audience; status:'draft'|'published'; actorUserId:string };
export interface ElevradsnettService {
  listFeed(input:{ representationId:string; mode:'recommended'|'chronological' }):Promise<Post[]>;
  publishPost(input:PublishPostInput):Promise<Post>;
  switchRepresentation(representationId:string):Promise<void>;
  vote(input:{ pollId:string; optionId:string; organizationId:string }):Promise<void>;
  sendMessage(input:{ conversationId:string; body:string }):Promise<void>;
}

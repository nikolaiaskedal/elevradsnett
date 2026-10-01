import { createContext, useContext } from 'react';
import type { CurrentUser, Event, EventResponse, Organization, Post, Representation } from '@/lib/domain/types';
import type { Route } from './routing';

// Felles tilstand og handlinger for visningene. Data hentes og endres via tjenestelaget (useService).
export type App = {
  currentUser:CurrentUser; representations:Representation[]; events:Event[];
  organizations:Organization[]; posts:Post[]; activeRep:Representation; responses:Record<string,EventResponse|undefined>;
  liked:string[]; openComments:string[]; drafts:Record<string,string>; votes:Record<string,string>;
  org:(id:string)=>Organization|undefined; go:(route:Route)=>void; notify:(text:string)=>void;
  toggleFollow:(id:string)=>void; toggleLike:(id:string)=>void; toggleComments:(id:string)=>void;
  setDraft:(id:string,text:string)=>void; sendComment:(id:string)=>void; vote:(postId:string,optionId:string)=>void;
  respond:(eventId:string,response:EventResponse)=>void; share:(post:Post)=>void; report:(post:Post)=>void; openComposer:()=>void;
};

export const AppContext = createContext<App|null>(null);

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppContext mangler');
  return app;
}

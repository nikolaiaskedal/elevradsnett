import { createContext, useContext } from 'react';
import type { CurrentUser, Event, Organization, Post, Representation, Session } from '@/lib/domain/types';
import type { Route } from './routing';

// Felles tilstand og handlinger for visningene. Data hentes og endres via tjenestelaget (useService).
export type App = {
  session:Session;
  /** Innlogget med aktiv profil. Sier bare hvem som er logget inn; hva brukeren har lov til avgjør serveren. */
  signedIn:boolean;
  currentUser:CurrentUser|null; representations:Representation[]; activeRep:Representation|null; events:Event[];
  organizations:Organization[]; posts:Post[];
  liked:string[]; openComments:string[]; drafts:Record<string,string>; votes:Record<string,string>;
  org:(id:string)=>Organization|undefined; go:(route:Route)=>void; notify:(text:string)=>void;
  /** Åpner innloggingen. Etter innlogging kjøres `then` med oppdatert tilstand, så brukeren kommer tilbake til handlingen. */
  requireLogin:(reason?:string, then?:(app:App)=>void)=>void;
  reload:()=>void; signOut:()=>void;
  /** Bytter aktiv representasjon. Serveren sjekker at vervet er aktivt; feed og navigasjon oppdateres etterpå. */
  switchRepresentation:(rep:Representation)=>void;
  loadOrganizationPosts:(organizationId:string)=>void;
  toggleFollow:(id:string)=>void; toggleLike:(id:string)=>void; toggleComments:(id:string)=>void;
  setDraft:(id:string,text:string)=>void; sendComment:(id:string)=>void; vote:(postId:string,optionId:string)=>void;
  /** Henter arrangementene på nytt, f.eks. etter påmelding eller endring. */
  reloadEvents:()=>Promise<void>;
  /** Personlig interesse for et arrangement (§8). Krever bare innlogging, ikke verv. */
  toggleInterest:(event:Event)=>void;
  share:(post:Post)=>void; report:(post:Post)=>void; openComposer:()=>void;
  /** Åpner publiseringsdialogen for et publisert innlegg. Vises bare når serveren sier at brukeren kan redigere det (post.canManage). */
  editPost:(post:Post)=>void;
  deletePost:(post:Post)=>void;
};

export const AppContext = createContext<App|null>(null);

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppContext mangler');
  return app;
}

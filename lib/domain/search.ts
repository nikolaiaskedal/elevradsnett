// Søk (§6, prompt 8). Delt mellom web, iOS og Android.
import type { OrganizationType } from './types';

export type SearchKind = OrganizationType | 'person' | 'event' | 'post';
/**
 * Et treff. active er false for deaktiverte skoler og tidligere tillitsvalgte (bare med filteret), og for
 * arrangementer som er over. organizationId er skolen til en person, arrangøren av et arrangement og avsenderen av et innlegg.
 */
export type SearchResult = { kind:SearchKind; id:string; title:string; subtitle?:string; organizationId?:string; active:boolean; startsAt?:string };

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

/** Gruppene søkesiden viser, i rekkefølge. */
export const searchGroups:{ id:string; label:string; kinds:SearchKind[] }[] = [
  { id:'schools', label:'Skoler', kinds:['school'] },
  { id:'boards', label:'Fylkeslag, lokallag og EO', kinds:['national','county_board','local_board'] },
  { id:'people', label:'Personer', kinds:['person'] },
  { id:'events', label:'Arrangementer', kinds:['event'] },
  { id:'posts', label:'Innlegg', kinds:['post'] },
];

export type FeedMode = 'recommended'|'chronological';
export const feedModeLabel:Record<FeedMode,string> = { recommended:'Anbefalt', chronological:'Nyeste' };

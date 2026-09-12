import type { OrganizationType } from './types';

export type LiveGrant = { role:'super_admin'|'board_admin'|'school_admin'|'content_manager'; organizationId:string; active:boolean };

export function mayPublish(input:{organizationId:string;organizationType:OrganizationType;hasActiveMembership:boolean;grants:LiveGrant[]}) {
  if (!input.hasActiveMembership) return false;
  return input.grants.some((grant)=>grant.active && (grant.role==='super_admin' || (grant.organizationId===input.organizationId && ['board_admin','school_admin','content_manager'].includes(grant.role))));
}

export function feedScore(input:{priority:boolean;sameCounty:boolean;sameLocalBoard:boolean;followed:boolean;sameSchoolLevel:boolean;ageHours:number;engagement:number}) {
  const freshness=Math.max(0,36-Math.min(input.ageHours,36));
  return (input.priority?120:0)+(input.sameLocalBoard?45:input.sameCounty?30:0)+(input.followed?40:0)+(input.sameSchoolLevel?12:0)+freshness+Math.min(input.engagement,30)*0.2;
}

export const FEED_RANKING_EXPLANATION = 'Prioritet 120, lokallag 45 / fylke 30, fulgt organisasjon 40, samme skoleform 12, ferskhet opptil 36 og begrenset engasjementsvekt opptil 6. Meldinger og privat aktivitet brukes aldri.';

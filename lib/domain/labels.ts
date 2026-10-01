import type { Audience, InternalRole, Organization, OrganizationType } from './types';

// Norske visningsnavn som deles av web og mobil.
export const kindLabel:Record<OrganizationType,string> = { national:'Nasjonalt', county_board:'Fylkeslag', local_board:'Lokallag', school:'Elevråd' };

export const orgSub = (o:Organization)=>o.type==='national'?'Nasjonalt':`${o.county} · ${kindLabel[o.type]}`;

export const initialsOf = (name:string)=>name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase() ?? '').join('');

export const audienceLabel:Record<Audience,string> = { public:'Alle elevråd', county:'Elevråd i fylket', local:'Elevråd i lokallaget', friends:'Venneråd' };

export const roleLabel:Record<InternalRole,string> = { super_admin:'Superadministrator', board_admin:'Styreadministrator', school_admin:'Skoleadministrator', content_manager:'Innholdsansvarlig' };

/** Forslag til offentlige verv per organisasjonstype (§4). Fritekst er også lov. */
export const officeSuggestions:Record<OrganizationType,string[]> = {
  school:['Elevrådsleder','Nestleder','Elevrådsmedlem'],
  local_board:['Lokallagsleder','Nestleder','Lokallagsstyremedlem'],
  county_board:['Fylkesleder','Nestleder','Fylkesstyremedlem'],
  national:['Leder','Nestleder','Sentralstyremedlem'],
};

/** Handlinger i revisjonsloggen. Ukjente handlinger vises med koden. */
export const auditActionLabel:Record<string,string> = {
  'office.assigned':'ga verv', 'office.ended':'avsluttet verv',
  'role.assigned':'ga rettighet', 'role.revoked':'fjernet rettighet',
  'school_admin.requested':'ba om å bli skoleadministrator', 'school_admin.approved':'godkjente skoleadministrator',
  'school_admin.rejected':'avslo skoleadministrator', 'school_admin.cancelled':'trakk forespørsel om skoleadministrator',
  'profile.onboarded':'ble med i Elevrådsnett', 'profile.school_changed':'byttet skole',
  'post.created':'publiserte innlegg', 'post.edited':'redigerte innlegg',
  'event.response':'svarte på arrangement', 'school.deactivated':'deaktiverte skolen',
};

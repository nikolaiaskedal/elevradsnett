import type { Organization, OrganizationType } from './types';

// Norske visningsnavn som deles av web og mobil.
export const kindLabel:Record<OrganizationType,string> = { national:'Nasjonalt', county_board:'Fylkeslag', local_board:'Lokallag', school:'Elevråd' };

export const orgSub = (o:Organization)=>o.type==='national'?'Nasjonalt':`${o.county} · ${kindLabel[o.type]}`;

export const initialsOf = (name:string)=>name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase() ?? '').join('');

import { kindLabel } from '@/lib/domain/labels';
import type { Event, EventCategory, Organization } from '@/lib/domain/types';

export { audienceLabel, initialsOf, kindLabel, orgSub } from '@/lib/domain/labels';

const MONTHS = ['JAN','FEB','MAR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DES'];
export const categoryLabel:Record<EventCategory,string> = { landsmote:'Landsmøte', kurs:'Kurs', samling:'Samling', mote:'Møte', digitalt:'Digitalt', annet:'Arrangement' };
export const formatNumber = (n:number)=>n.toLocaleString('nb-NO');
const osloDay = (iso:string)=>new Intl.DateTimeFormat('en-GB',{ timeZone:'Europe/Oslo', day:'2-digit', month:'numeric' }).formatToParts(new Date(iso));
export const eventDay = (e:Event)=>osloDay(e.startsAt).find(p=>p.type==='day')?.value ?? '';
export const eventMonth = (e:Event)=>MONTHS[Number(osloDay(e.startsAt).find(p=>p.type==='month')?.value)-1] ?? '';
const eventWhen = (e:Event)=>e.end?`${e.start}, ${e.end}`:e.start;
export const byDate = (a:Event,b:Event)=>a.startsAt.localeCompare(b.startsAt);

export function orgLine(o:Organization) {
  if (o.type==='national') return ['Nasjonal interesseorganisasjon',o.contactEmail].filter(Boolean).join(' · ');
  if (o.type==='school') return [o.contactEmail,o.county].filter(Boolean).join(' · ');
  return [kindLabel[o.type],o.county,o.contactEmail].filter(Boolean).join(' · ');
}
/** Har organisasjonen offentlige tillitsvalgte? Demo har listen, Supabase har antallet. */
export const hasOfficers = (o:Organization)=>(o.officers?.length ?? o.officerCount ?? 0)>0;
export const schoolPlace = (o:Organization)=>o.place && o.place!==o.county?`${o.place} · ${o.county}`:o.county;
export function eventFacts(e:Event) {
  const third = e.price ? { label:'Pris', value:e.price } : e.seatsPerOrganization ? { label:'Plasser', value:`${e.seatsPerOrganization} per elevråd` } : { label:'Påmelding', value:e.deadline?`Innen ${e.deadline}`:'Ikke nødvendig' };
  return [{ label:'Dato', value:eventWhen(e) }, { label:e.digital?'Hvor':'Sted', value:e.place }, third];
}
export function contactLabel(o:Organization) {
  return o.type==='national'?'Kontakt EO':o.type==='county_board'?'Kontakt fylkesstyret':o.type==='local_board'?'Kontakt lokallaget':'Foreslå samarbeid';
}

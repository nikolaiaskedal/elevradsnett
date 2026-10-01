import { kindLabel } from '@/lib/domain/labels';
import type { Audience, Event, EventCategory, Organization } from '@/lib/domain/types';

export { initialsOf, kindLabel, orgSub } from '@/lib/domain/labels';

const MONTHS = ['JAN','FEB','MAR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DES'];
export const categoryLabel:Record<EventCategory,string> = { landsmote:'Landsmøte', kurs:'Kurs', samling:'Samling', mote:'Møte', digitalt:'Digitalt', annet:'Arrangement' };
export const audienceLabel:Record<Audience,string> = { public:'Alle elevråd', county:'Elevråd i fylket', local:'Elevråd i lokallaget', friends:'Venneråd' };
export const formatNumber = (n:number)=>n.toLocaleString('nb-NO');
export const eventDay = (e:Event)=>e.startsAt.slice(8,10);
export const eventMonth = (e:Event)=>MONTHS[Number(e.startsAt.slice(5,7))-1] ?? '';
const eventWhen = (e:Event)=>e.end?`${e.start}, ${e.end}`:e.start;
export const byDate = (a:Event,b:Event)=>a.startsAt.localeCompare(b.startsAt);

export function orgLine(o:Organization) {
  if (o.type==='national') return ['Nasjonal interesseorganisasjon',o.contactEmail].filter(Boolean).join(' · ');
  if (o.type==='school') return [o.contactEmail,o.county].filter(Boolean).join(' · ');
  return [kindLabel[o.type],o.county,o.contactEmail].filter(Boolean).join(' · ');
}
export const schoolPlace = (o:Organization)=>o.place && o.place!==o.county?`${o.place} · ${o.county}`:o.county;
export function eventFacts(e:Event) {
  const third = e.price ? { label:'Pris', value:e.price } : e.seatsPerOrganization ? { label:'Plasser', value:`${e.seatsPerOrganization} per elevråd` } : { label:'Påmelding', value:e.deadline?`Innen ${e.deadline}`:'Ikke nødvendig' };
  return [{ label:'Dato', value:eventWhen(e) }, { label:e.digital?'Hvor':'Sted', value:e.place }, third];
}
export function contactLabel(o:Organization) {
  return o.type==='national'?'Kontakt EO':o.type==='county_board'?'Kontakt fylkesstyret':o.type==='local_board'?'Kontakt lokallaget':'Foreslå samarbeid';
}

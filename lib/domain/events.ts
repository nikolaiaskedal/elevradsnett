import { formatDayMonth, formatEventSpan } from './time';
import type { Event, EventAudience, EventCategory, EventStatus } from './types';
import { EVENT_CATEGORIES } from './validation';

// Felles omforming av arrangementer fra serveren til visning. Delt mellom web, iOS og Android.

/** Målgruppe som tekst. «Venneråd» finnes ikke for arrangementer. */
export const eventAudienceLabel:Record<EventAudience,string> = { public:'Alle elevråd', county:'Elevråd i fylket', local:'Elevråd i lokallaget' };

/** Rådata om et arrangement, slik serveren (list_events) eller demoen har det. */
export type EventRecord = {
  id:string; organizerId:string; organizerName:string; title:string; summary:string|null; description:string; category:string;
  startsAt:string; endsAt:string; location:string|null; digital:boolean; digitalUrl:string|null; registrationDeadline:string|null;
  capacity:number|null; priceLabel:string|null; seatsPerOrganization:number|null; status:EventStatus; audience:string;
  imageUrl?:string|null; imageAlt?:string; registered:number; interested:number; interestedByMe:boolean; canEdit:boolean;
};

export const toEventCategory = (value:string):EventCategory=>(EVENT_CATEGORIES as readonly string[]).includes(value)?value as EventCategory:'annet';
const toAudience = (value:string):EventAudience=>value==='county'||value==='local'?value:'public';

export function presentEvent(r:EventRecord):Event {
  const span = formatEventSpan(r.startsAt,r.endsAt);
  const audienceCode = toAudience(r.audience);
  return {
    id:r.id, hostId:r.organizerId, host:r.organizerName, title:r.title, summary:r.summary ?? '', description:r.description, category:toEventCategory(r.category),
    startsAt:r.startsAt, endsAt:r.endsAt, start:span.start, end:span.end,
    place:r.location || (r.digital?'Digitalt (lenke)':''), location:r.location ?? undefined, digital:r.digital, digitalUrl:r.digitalUrl ?? undefined,
    deadline:r.registrationDeadline?formatDayMonth(r.registrationDeadline):undefined, deadlineAt:r.registrationDeadline ?? undefined,
    price:r.priceLabel ?? undefined, seatsPerOrganization:r.seatsPerOrganization ?? undefined, capacity:r.capacity ?? 0,
    registered:r.registered, interested:r.interested, interestedByMe:r.interestedByMe, imageUrl:r.imageUrl ?? undefined, imageAlt:r.imageAlt,
    status:r.status, audience:eventAudienceLabel[audienceCode], audienceCode, canEdit:r.canEdit,
  };
}

/** Er arrangementet over (startet og ikke lenger åpent for svar)? Tidligere arrangementer vises for seg. */
export const isPastEvent = (e:Pick<Event,'endsAt'|'status'>, now:Date = new Date())=>e.status==='completed' || new Date(e.endsAt)<=now;
/** Kan det fortsatt svares på arrangementet (interesse og påmelding)? Serveren sjekker det samme. */
export const isOpenEvent = (e:Pick<Event,'startsAt'|'status'>, now:Date = new Date())=>e.status==='published' && new Date(e.startsAt)>now;
export const isRegistrationOpen = (e:Pick<Event,'startsAt'|'status'|'deadlineAt'>, now:Date = new Date())=>isOpenEvent(e,now) && (!e.deadlineAt || new Date(e.deadlineAt)>now);

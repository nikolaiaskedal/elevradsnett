import type { OrganizationType } from '@/lib/domain/types';

// Meldinger (§9). Alltid mellom personer: direktemeldinger, vanlige grupper og systemstyrte grupper for
// skoler og styrer. Organisasjoner er aldri avsender eller mottaker.

export type ConversationKind = 'direct'|'group'|'managed';
/** Et vedlegg. Filen ligger privat og vises via en tidsbegrenset lenke (getAttachmentUrl). */
export type MessageAttachment = { id:string; path:string; mimeType:string; byteSize:number; fileName:string };
/** readBy er bare satt på egne meldinger når brukeren har slått på lest-status: hvor mange andre som har lest. */
export type Message = { id:string; senderId:string; from:string; mine:boolean; text:string; time:string; createdAt:string; attachments:MessageAttachment[]; readBy?:number|null };
export type ConversationPreview = { text:string; time:string; mine:boolean; createdAt:string };
/**
 * En samtale brukeren er med i. Navnet er den andre personen (direkte), gruppenavnet eller organisasjonen (systemstyrt).
 * isAdmin og muted kommer fra serveren; klienten avgjør ikke selv hva brukeren kan gjøre.
 */
export type Conversation = { id:string; kind:ConversationKind; name:string; initials:string; organizationId?:string; otherUserId?:string; unread:number; muted:boolean; members:number; isAdmin:boolean; lastMessage?:ConversationPreview; createdAt:string };
export type ConversationMember = { userId:string; name:string; schoolName?:string; isAdmin:boolean; me:boolean };
export type RecipientSearchResult =
  | { kind:'person'; id:string; name:string; schoolName?:string }
  | { kind:'organization'; id:string; name:string; county:string; type:OrganizationType };
/** Offentlig kontaktperson i en organisasjon: en person med aktivt, offentlig verv. */
export type OrganizationContact = { userId:string; name:string; publicTitle:string; me:boolean };
export type BlockedUser = { userId:string; name:string };
export type MessageSettings = { readReceipts:boolean };
export type ReportCategory = 'harassment'|'spam'|'inappropriate'|'other';
export const reportCategoryLabel:Record<ReportCategory,string> = { harassment:'Trakassering eller mobbing', spam:'Spam', inappropriate:'Upassende innhold', other:'Annet' };

const TIME_ZONE = 'Europe/Oslo';
const dayKey = (date:Date)=>new Intl.DateTimeFormat('en-CA',{ timeZone:TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
const clock = (date:Date)=>new Intl.DateTimeFormat('nb-NO',{ timeZone:TIME_ZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(date);

/** Tidspunkt for en melding i norsk tid: «09:12» i dag, «i går 09:12», ellers «12. sep.» (med år hvis det er et annet år). */
export function formatMessageTime(iso:string, now:Date = new Date()) {
  const date = new Date(iso);
  const today = dayKey(now);
  if (dayKey(date)===today) return clock(date);
  if (dayKey(date)===dayKey(new Date(now.getTime()-24*3600*1000))) return `i går ${clock(date)}`;
  const sameYear = dayKey(date).slice(0,4)===today.slice(0,4);
  return new Intl.DateTimeFormat('nb-NO',{ timeZone:TIME_ZONE, day:'numeric', month:'short', ...(sameYear?{}:{ year:'numeric' }) }).format(date);
}

/** Forhåndsvisning i samtalelisten. */
export function previewText(text:string, hasAttachment:boolean) {
  return text || (hasAttachment?'Vedlegg':'');
}

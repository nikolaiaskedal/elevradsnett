// Varsler og styreoverføring (§5, prompt 11). Delt mellom web, iOS og Android.

export const NOTIFICATION_CATEGORIES = ['messages','events','handover','roles','organization','other'] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

/** Et varsel i plattformen. link er en intern adresse (#/…). count > 1 betyr flere hendelser samlet i ett varsel. */
export type AppNotification = { id:string; type:string; category:NotificationCategory; title:string; body?:string; link?:string; count:number; read:boolean; createdAt:string };

/** Kanalene brukeren har slått på, og kategoriene som er slått av per kanal. Alt er på som standard. */
export type NotificationPreferences = { inApp:boolean; email:boolean; inAppOff:NotificationCategory[]; emailOff:NotificationCategory[] };
export const DEFAULT_NOTIFICATION_PREFERENCES:NotificationPreferences = { inApp:true, email:true, inAppOff:[], emailOff:[] };

export const notificationCategoryLabel:Record<NotificationCategory,{ label:string; description:string }> = {
  messages:{ label:'Meldinger', description:'Nye meldinger i samtalene dine. Innholdet vises aldri i varselet.' },
  events:{ label:'Arrangementer', description:'Delegatinvitasjoner og avlysninger.' },
  handover:{ label:'Styreoverføring', description:'Invitasjoner til nytt styre og påminnelser før styreskiftet.' },
  roles:{ label:'Verv og rettigheter', description:'Nye verv, rettigheter og svar på forespørsler.' },
  organization:{ label:'Venneråd', description:'Forespørsler og svar om venneråd.' },
  other:{ label:'Annet', description:'Andre beskjeder fra Elevrådsnett.' },
};

export type HandoverStatus = 'awaiting_acceptance'|'scheduled'|'completed'|'cancelled';
export type HandoverInviteStatus = 'pending'|'accepted'|'declined'|'expired';
/** Rollene en styreoverføring kan gi ved en skole. Styreadministrator gis bare av superadministrator. */
export type HandoverRole = 'school_admin'|'content_manager';

export type HandoverInvite = { id:string; userId?:string; name:string; email?:string; publicTitle?:string; adminRole?:HandoverRole; status:HandoverInviteStatus; respondedAt?:string };
export type Handover = { id:string; status:HandoverStatus; activationDate:string; oldBoardEndsOn:string; recovery:boolean; recoveryReason?:string;
  startedByName:string; createdAt:string; completedAt?:string; invites:HandoverInvite[] };
/** Dagens styre slik veiviseren viser det: aktive verv og rettigheter ved skolen. */
export type BoardMember = { userId:string; name:string; offices:string[]; roles:HandoverRole[] };
/**
 * Alt veiviseren trenger for én skole. canManage, canRecover og overdueDays er serverens svar:
 * skoleadministrator gjennomfører overføringen, styret i området kan gjenopprette den når den er forsinket.
 */
export type HandoverOverview = { organizationId:string; name:string; expectedHandoverOn?:string; termStartsOn?:string; overdueDays:number; adminCount:number;
  canManage:boolean; canRecover:boolean; members:BoardMember[]; handover:Handover|null };

/** En invitasjon til den innloggede. atSchool er false hvis personen må velge skolen før invitasjonen kan godtas. */
export type MyHandoverInvite = { id:string; organizationId:string; organizationName:string; publicTitle?:string; adminRole?:HandoverRole; activationDate:string; invitedByName:string; createdAt:string; atSchool:boolean };

export const handoverStatusLabel:Record<HandoverStatus,string> = { awaiting_acceptance:'Venter på ny administrator', scheduled:'Planlagt', completed:'Fullført', cancelled:'Avlyst' };
export const handoverInviteStatusLabel:Record<HandoverInviteStatus,string> = { pending:'Venter på svar', accepted:'Godtatt', declined:'Takket nei', expired:'Utløpt' };
export const handoverRoleLabel:Record<HandoverRole,string> = { school_admin:'Skoleadministrator', content_manager:'Innholdsansvarlig' };

/** «Elevrådsleder og skoleadministrator»: det invitasjonen gir. */
export function inviteSummary(invite:{ publicTitle?:string; adminRole?:HandoverRole }) {
  return [invite.publicTitle, invite.adminRole?handoverRoleLabel[invite.adminRole].toLowerCase():undefined].filter(Boolean).join(' og ');
}

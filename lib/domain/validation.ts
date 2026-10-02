import { z } from 'zod';
import { COUNTIES } from '@/lib/domain/counties';
import type { Audience, OrganizationType } from '@/lib/domain/types';
import { NOTIFICATION_CATEGORIES } from '@/lib/domain/notifications';
import { SEARCH_MAX_LENGTH } from '@/lib/domain/search';

// Valideringsskjemaer for alt som skrives. Delt mellom web, iOS og Android; databasen validerer i tillegg.

export const idSchema = z.string().trim().min(1, 'Mangler id.');
export const audienceSchema = z.enum(['public','county','local','friends']);
export const countySchema = z.enum(COUNTIES, 'Ukjent fylke.');
export const schoolLevelSchema = z.enum(['upper_secondary','lower_secondary'], 'Ugyldig skoleform.');

export const POST_MAX_LENGTH = 6000;
export const COMMENT_MAX_LENGTH = 3000;
export const MESSAGE_MAX_LENGTH = 5000;

export const POLL_MAX_OPTIONS = 10;
/** Avstemning i et nytt innlegg. Sluttdato er valgfri, men må være frem i tid og innen ett år (som add_post_poll). */
export const pollInputSchema = z.object({
  question:z.string().transform(v=>cleanText(v)).pipe(z.string().min(1,'Skriv et spørsmål til avstemningen.').max(300,'Spørsmålet kan ha maks 300 tegn.')),
  options:z.array(z.string().trim().max(200,'Et svaralternativ kan ha maks 200 tegn.')).transform(list=>list.filter(Boolean))
    .pipe(z.array(z.string()).min(2, 'En avstemning trenger minst to svaralternativer.').max(POLL_MAX_OPTIONS, `Maks ${POLL_MAX_OPTIONS} svaralternativer.`)),
  closesAt:z.iso.datetime({ offset:true, message:'Ugyldig sluttdato.' }).optional()
    .refine(v=>!v || (new Date(v).getTime()>Date.now() && new Date(v).getTime()<=Date.now()+366*24*3600*1000),'Sluttdatoen må være frem i tid og innen ett år.'),
});
export type PollInput = z.input<typeof pollInputSchema>;

/** Bilder i innlegg kodes om i nettleseren (EXIF og GPS fjernes), og serveren kontrollerer filen (process-media). */
export const POST_IMAGE_MAX_BYTES = 10*1024*1024;
export const POST_IMAGE_MAX_COUNT = 4;
export const ALT_TEXT_MAX_LENGTH = 300;
export const postImageSchema = z.object({
  type:z.enum(['image/webp','image/jpeg'],'Bildet må være WebP eller JPEG.'),
  size:z.number().int().positive('Bildet er tomt.').max(POST_IMAGE_MAX_BYTES,'Bildet kan være maks 10 MB.'),
  alt:z.string().transform(v=>cleanText(v)).pipe(z.string().max(ALT_TEXT_MAX_LENGTH,`Bildeteksten kan ha maks ${ALT_TEXT_MAX_LENGTH} tegn.`)),
});
/** Profil- og coverbilde for organisasjoner. */
export const organizationImageSchema = z.object({
  kind:z.enum(['profile','cover']),
  type:z.enum(['image/webp','image/jpeg','image/png'],'Bildet må være WebP, JPEG eller PNG.'),
  size:z.number().int().positive('Bildet er tomt.').max(5*1024*1024,'Bildet kan være maks 5 MB.'),
});

export const REPORT_CATEGORIES = ['harassment','spam','inappropriate','other'] as const;
export const reportPostSchema = z.object({
  postId:idSchema,
  category:z.enum(REPORT_CATEGORIES, 'Velg hva rapporten gjelder.'),
  description:z.string().trim().max(1000, 'Beskrivelsen kan ha maks 1000 tegn.').optional(),
});
export type ReportPostInput = z.input<typeof reportPostSchema>;

/**
 * Rensing av tekst før lagring (XSS, §7): fjerner HTML-tagger, styretegn og usynlige retningstegn, og trimmer.
 * Teksten vises alltid som ren tekst. Databasen gjør det samme i clean_text, så regelen gjelder også andre klienter.
 */
export function cleanText(value:string) {
  return value.replace(/\r\n/g,'\n')
    .replace(/<\/?[A-Za-z!][^>]*>/g,'')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'')
    .trim();
}
const cleaned = (min:string,max:number,maxMessage:string)=>z.string().transform(cleanText).pipe(z.string().min(1,min).max(max,maxMessage));

export const schoolLevelTargetSchema = z.enum(['both','upper_secondary','lower_secondary'], 'Ugyldig skoleform.');
export const postBodySchema = cleaned('Skriv noe før du publiserer.',POST_MAX_LENGTH,`Innlegget kan ha maks ${POST_MAX_LENGTH} tegn.`);
/** Innholdet i et innlegg eller utkast. Serveren sjekker i tillegg at målgruppen passer avsenderen og at arrangementet er publisert. */
export const postContentSchema = z.object({
  body:postBodySchema,
  audience:audienceSchema,
  schoolLevel:schoolLevelTargetSchema.default('both'),
  eventId:idSchema.optional(),
});
/** Publiser et nytt innlegg, eller et utkast (draftId). */
export const publishPostSchema = postContentSchema.extend({
  representationId:idSchema,
  draftId:idSchema.optional(),
  poll:pollInputSchema.optional(),
  images:z.array(postImageSchema).max(POST_IMAGE_MAX_COUNT,`Et innlegg kan ha maks ${POST_IMAGE_MAX_COUNT} bilder.`).default([]),
});
/** Bildene er ferdig omkodet (preparePostImage) og lastes opp av tjenesten; skjemaet sjekker type, størrelse og bildetekst. */
export type PostImageInput = { file:Blob; alt:string };
export type PublishPostInput = Omit<z.input<typeof publishPostSchema>,'images'> & { images?:PostImageInput[] };
/** Skjemaets form av et innlegg med bilder. */
export const publishPostFields = (input:PublishPostInput)=>({ ...input, images:(input.images ?? []).map(i=>({ type:i.file.type, size:i.file.size, alt:i.alt })) });
export const saveDraftSchema = postContentSchema.extend({ representationId:idSchema, draftId:idSchema.optional() });
export type SaveDraftInput = z.input<typeof saveDraftSchema>;
export const editPostSchema = postContentSchema.extend({ postId:idSchema });
export type EditPostInput = z.input<typeof editPostSchema>;

/** Målgrupper som passer avsenderen (samme regel som audience_fits_organization i databasen). */
export function audiencesFor(type:OrganizationType, hasLocalBoard:boolean):Audience[] {
  if (type==='school') return hasLocalBoard?['public','county','local','friends']:['public','county','friends'];
  if (type==='local_board') return ['public','county','local'];
  if (type==='county_board') return ['public','county'];
  return ['public'];
}

export const friendRequestSchema = z.object({ schoolId:idSchema, targetSchoolId:z.string().trim().min(1, 'Velg en skole.') });
export type FriendRequestInput = z.input<typeof friendRequestSchema>;
export const decideFriendRequestSchema = z.object({ connectionId:idSchema, accept:z.boolean() });
export type DecideFriendRequestInput = z.input<typeof decideFriendRequestSchema>;

export const commentSchema = z.object({
  postId:idSchema,
  representationId:idSchema,
  body:cleaned('Kommentaren er tom.',COMMENT_MAX_LENGTH,`Kommentaren kan ha maks ${COMMENT_MAX_LENGTH} tegn.`),
});
export type AddCommentInput = z.input<typeof commentSchema>;

/** Vedlegg i meldinger: bilder (kodes om i nettleseren, så EXIF og GPS forsvinner) og PDF. Bøtta tar maks 25 MB. */
export const MESSAGE_ATTACHMENT_MAX_BYTES = 25*1024*1024;
export const MESSAGE_ATTACHMENT_MAX_COUNT = 5;
export const MESSAGE_ATTACHMENT_TYPES = ['image/jpeg','image/png','image/webp','application/pdf'] as const;
export const messageAttachmentSchema = z.object({
  name:z.string().trim().min(1, 'Vedlegget mangler filnavn.').max(200, 'Filnavnet kan ha maks 200 tegn.'),
  type:z.enum(MESSAGE_ATTACHMENT_TYPES, 'Vedlegg må være et bilde (JPEG, PNG eller WebP) eller en PDF.'),
  size:z.number().int().positive('Vedlegget er tomt.').max(MESSAGE_ATTACHMENT_MAX_BYTES, 'Vedlegg kan være maks 25 MB.'),
});
export const messageSchema = z.object({
  conversationId:idSchema,
  body:z.string().trim().max(MESSAGE_MAX_LENGTH, `Meldingen kan ha maks ${MESSAGE_MAX_LENGTH} tegn.`),
  attachments:z.array(messageAttachmentSchema).max(MESSAGE_ATTACHMENT_MAX_COUNT, `Du kan legge ved maks ${MESSAGE_ATTACHMENT_MAX_COUNT} filer.`).default([]),
}).refine(m=>m.body.length>0 || m.attachments.length>0, 'Meldingen er tom.');
/** Filene lastes opp av tjenesten; skjemaet sjekker navn, type og størrelse. */
export type SendMessageInput = Omit<z.input<typeof messageSchema>,'attachments'> & { attachments?:File[] };

export const GROUP_NAME_MAX_LENGTH = 80;
export const GROUP_MAX_MEMBERS = 100;
export const createGroupSchema = z.object({
  name:z.string().trim().min(1, 'Gi gruppen et navn.').max(GROUP_NAME_MAX_LENGTH, `Gruppenavnet kan ha maks ${GROUP_NAME_MAX_LENGTH} tegn.`),
  memberIds:z.array(idSchema).min(1, 'Velg minst én person.').max(GROUP_MAX_MEMBERS-1, `En gruppe kan ha maks ${GROUP_MAX_MEMBERS} medlemmer.`),
});
export type CreateGroupInput = z.input<typeof createGroupSchema>;
export const addMembersSchema = z.object({ conversationId:idSchema, userIds:z.array(idSchema).min(1, 'Velg minst én person.').max(GROUP_MAX_MEMBERS-1) });
export type AddMembersInput = z.input<typeof addMembersSchema>;
export const REPORT_TEXT_MAX_LENGTH = 1000;
export const reportMessageSchema = z.object({
  messageId:idSchema,
  category:z.enum(['harassment','spam','inappropriate','other'], 'Velg hva rapporten gjelder.'),
  description:z.string().trim().max(REPORT_TEXT_MAX_LENGTH, `Beskrivelsen kan ha maks ${REPORT_TEXT_MAX_LENGTH} tegn.`).optional(),
});
export type ReportMessageInput = z.input<typeof reportMessageSchema>;

export const voteSchema = z.object({ postId:idSchema, optionId:idSchema, organizationId:idSchema });
export type VoteInput = z.input<typeof voteSchema>;

// ---- Arrangementer (§8) ----
export const EVENT_CATEGORIES = ['landsmote','kurs','samling','mote','digitalt','annet'] as const;
export const EVENT_TITLE_MAX_LENGTH = 120;
export const EVENT_SUMMARY_MAX_LENGTH = 280;
export const EVENT_DESCRIPTION_MAX_LENGTH = 5000;
const optionalText = (max:number,message:string)=>z.string().trim().max(max,message).optional().transform(v=>v || undefined);
const isoDateTime = z.iso.datetime({ offset:true, message:'Ugyldig tidspunkt.' });

/** Et arrangement som opprettes eller endres. Databasen sjekker det samme (save_event). */
export const eventInputSchema = z.object({
  id:idSchema.optional(),
  organizerId:idSchema,
  title:z.string().trim().min(3,'Tittelen må ha minst tre tegn.').max(EVENT_TITLE_MAX_LENGTH,`Tittelen kan ha maks ${EVENT_TITLE_MAX_LENGTH} tegn.`),
  summary:optionalText(EVENT_SUMMARY_MAX_LENGTH,`Ingressen kan ha maks ${EVENT_SUMMARY_MAX_LENGTH} tegn.`),
  description:z.string().trim().min(1,'Skriv en beskrivelse.').max(EVENT_DESCRIPTION_MAX_LENGTH,`Beskrivelsen kan ha maks ${EVENT_DESCRIPTION_MAX_LENGTH} tegn.`),
  category:z.enum(EVENT_CATEGORIES,'Velg en type.'),
  startsAt:isoDateTime,
  endsAt:isoDateTime,
  location:optionalText(200,'Stedet kan ha maks 200 tegn.'),
  digitalUrl:z.string().trim().max(500,'Lenken er for lang.').regex(/^https:\/\/\S+$/,'Lenken må begynne med https://.').optional().or(z.literal('').transform(()=>undefined)),
  registrationDeadline:isoDateTime.optional(),
  capacity:z.number().int('Kapasiteten må være et heltall.').min(1,'Kapasiteten må være minst 1.').max(100000).optional(),
  seatsPerOrganization:z.number().int('Plassene må være et heltall.').min(1,'Minst én plass per organisasjon.').max(50,'Maks 50 plasser per organisasjon.').optional(),
  price:optionalText(60,'Prisen kan ha maks 60 tegn.'),
  audience:z.enum(['public','county','local'],'Velg målgruppe.'),
  status:z.enum(['draft','published']),
})
  .refine(e=>new Date(e.endsAt)>new Date(e.startsAt),{ message:'Slutten må være etter starten.', path:['endsAt'] })
  .refine(e=>new Date(e.endsAt).getTime()-new Date(e.startsAt).getTime()<=31*24*3600*1000,{ message:'Et arrangement kan vare maks 31 dager.', path:['endsAt'] })
  .refine(e=>!!e.location || !!e.digitalUrl,{ message:'Oppgi sted eller lenke til digitalt møte.', path:['location'] })
  .refine(e=>!e.registrationDeadline || new Date(e.registrationDeadline)<=new Date(e.startsAt),{ message:'Påmeldingsfristen må være før arrangementet starter.', path:['registrationDeadline'] });
export type EventInput = z.input<typeof eventInputSchema>;

export const eventStatusChangeSchema = z.object({ eventId:idSchema, status:z.enum(['cancelled','completed']) });
export type EventStatusChangeInput = z.input<typeof eventStatusChangeSchema>;
export const eventInterestSchema = z.object({ eventId:idSchema, interested:z.boolean() });
export type EventInterestInput = z.input<typeof eventInterestSchema>;
export const eventRegistrationSchema = z.object({ eventId:idSchema, organizationId:idSchema, registered:z.boolean() });
export type EventRegistrationInput = z.input<typeof eventRegistrationSchema>;
export const addDelegateSchema = z.object({ registrationId:idSchema, userId:z.string().trim().min(1,'Velg en person.') });
export type AddDelegateInput = z.input<typeof addDelegateSchema>;
export const delegationResponseSchema = z.object({ delegateId:idSchema, accept:z.boolean() });
export type DelegationResponseInput = z.input<typeof delegationResponseSchema>;
export const attendanceSchema = z.object({ delegateId:idSchema, attended:z.boolean() });
export type AttendanceInput = z.input<typeof attendanceSchema>;
/** Arrangementsbildet kodes om i nettleseren (EXIF og GPS fjernes). */
export const EVENT_IMAGE_MAX_BYTES = 5*1024*1024;
export const eventImageSchema = z.object({
  type:z.enum(['image/webp','image/jpeg','image/png'],'Bildet må være WebP, JPEG eller PNG.'),
  size:z.number().int().positive('Bildet er tomt.').max(EVENT_IMAGE_MAX_BYTES,'Bildet kan være maks 5 MB.'),
});

export const displayNameSchema = z.string().trim().min(2, 'Navnet må ha minst to tegn.').max(120, 'Navnet kan ha maks 120 tegn.');
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Skriv inn en gyldig e-postadresse.'));
export const LOGIN_CODE_LENGTH = 6;
export const loginCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Koden har seks sifre.');

export const requestLoginCodeSchema = z.object({ email:emailSchema });
export type RequestLoginCodeInput = z.input<typeof requestLoginCodeSchema>;
export const verifyLoginCodeSchema = z.object({ email:emailSchema, code:loginCodeSchema });
export type VerifyLoginCodeInput = z.input<typeof verifyLoginCodeSchema>;

/** Dato (ÅÅÅÅ-MM-DD) for neste valg: fra i dag og inntil to år frem. Databasen sjekker det samme. */
export const MAX_ELECTION_DAYS_AHEAD = 730;
export const isoDate = (date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const electionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato.').refine(value=>{
  const today = new Date();
  const latest = new Date(today.getFullYear(),today.getMonth(),today.getDate()+MAX_ELECTION_DAYS_AHEAD);
  return value>=isoDate(today) && value<=isoDate(latest);
}, 'Velg en dato fra i dag og inntil to år frem.');

export const onboardingSchema = z.object({
  schoolId:idSchema,
  displayName:displayNameSchema,
  nextElection:electionDateSchema.optional(),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

export const updateProfileSchema = z.object({ displayName:displayNameSchema });
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const changeSchoolSchema = z.object({ schoolId:idSchema });
export type ChangeSchoolInput = z.input<typeof changeSchoolSchema>;

export const internalRoleSchema = z.enum(['super_admin','board_admin','school_admin','content_manager'], 'Ukjent rettighet.');
export const OFFICE_TITLE_MAX_LENGTH = 80;
export const officeTitleSchema = z.string().trim().min(2, 'Vervet må ha minst to tegn.').max(OFFICE_TITLE_MAX_LENGTH, `Vervet kan ha maks ${OFFICE_TITLE_MAX_LENGTH} tegn.`);

export const assignPublicOfficeSchema = z.object({ organizationId:idSchema, userId:z.string().trim().min(1, 'Velg en person.'), title:officeTitleSchema });
export type AssignPublicOfficeInput = z.input<typeof assignPublicOfficeSchema>;
export const assignRoleSchema = z.object({ organizationId:idSchema, userId:z.string().trim().min(1, 'Velg en person.'), role:internalRoleSchema });
export type AssignRoleInput = z.input<typeof assignRoleSchema>;

export const REQUEST_TEXT_MAX_LENGTH = 1000;
export const schoolAdminRequestSchema = z.object({ schoolId:idSchema, message:z.string().trim().max(REQUEST_TEXT_MAX_LENGTH, `Meldingen kan ha maks ${REQUEST_TEXT_MAX_LENGTH} tegn.`).optional() });
export type SchoolAdminRequestInput = z.input<typeof schoolAdminRequestSchema>;
export const decideSchoolAdminRequestSchema = z.object({ requestId:idSchema, approve:z.boolean(), reason:z.string().trim().max(REQUEST_TEXT_MAX_LENGTH, `Begrunnelsen kan ha maks ${REQUEST_TEXT_MAX_LENGTH} tegn.`).optional() });
export type DecideSchoolAdminRequestInput = z.input<typeof decideSchoolAdminRequestSchema>;

/** Profilbildet kodes om i nettleseren før opplasting (fjerner EXIF og GPS). Bøtta tar maks 5 MB. */
export const AVATAR_MAX_BYTES = 5*1024*1024;
export const AVATAR_TYPES = ['image/webp','image/jpeg','image/png'] as const;
export const avatarSchema = z.object({
  type:z.enum(AVATAR_TYPES, 'Profilbildet må være WebP, JPEG eller PNG.'),
  size:z.number().int().positive('Bildet er tomt.').max(AVATAR_MAX_BYTES, 'Profilbildet kan være maks 5 MB.'),
});

/** Første lesbare feilmelding fra zod, ellers selve feilmeldingen. */
export function errorMessage(error:unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Ugyldige data.';
  if (error instanceof Error) return error.message;
  return 'Noe gikk galt.';
}

// ---- Varsler og styreoverføring (§5, prompt 11) ----
const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES, 'Ukjent varseltype.');
export const notificationPreferencesSchema = z.object({
  inApp:z.boolean(), email:z.boolean(),
  inAppOff:z.array(notificationCategorySchema).max(NOTIFICATION_CATEGORIES.length),
  emailOff:z.array(notificationCategorySchema).max(NOTIFICATION_CATEGORIES.length),
});
export type NotificationPreferencesInput = z.input<typeof notificationPreferencesSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato.');
const daysFromToday = (days:number)=>{ const d = new Date(); return isoDate(new Date(d.getFullYear(),d.getMonth(),d.getDate()+days)); };
/** Dato for styreskiftet. Kan være litt tilbake i tid hvis overføringen er forsinket. Databasen sjekker det samme. */
export const handoverDateSchema = dateString.refine(v=>v>=daysFromToday(-60) && v<=daysFromToday(MAX_ELECTION_DAYS_AHEAD), 'Velg en dato fra to måneder tilbake og inntil to år frem.');
export const setElectionDateSchema = z.object({ organizationId:idSchema, date:handoverDateSchema });
export type SetElectionDateInput = z.input<typeof setElectionDateSchema>;

export const HANDOVER_MAX_INVITES = 40;
export const handoverInviteSchema = z.object({
  userId:z.string().trim().min(1).optional(),
  email:emailSchema.optional(),
  /** Navnet vises bare for invitasjoner på e-post, til personen har laget profil. */
  name:z.string().trim().max(120, 'Navnet kan ha maks 120 tegn.').optional(),
  publicTitle:officeTitleSchema.optional(),
  adminRole:z.enum(['school_admin','content_manager'], 'Ukjent rettighet.').optional(),
}).refine(v=>!!v.userId !== !!v.email, 'Velg en person, eller skriv inn e-postadressen til en ny bruker.')
  .refine(v=>!!v.publicTitle || !!v.adminRole, 'Gi hver person et verv eller en rettighet.');
export type HandoverInviteInput = z.input<typeof handoverInviteSchema>;

/** Rekkefølgen er styreskifte, sluttdato for det gamle styret og aktivering: det gamle styret slutter senest når det nye aktiveres. */
const handoverDatesSchema = z.object({
  activationDate:dateString.refine(v=>v>=daysFromToday(0) && v<=daysFromToday(365), 'Aktiveringsdatoen må være fra i dag og inntil ett år frem.'),
  oldBoardEndsOn:dateString.refine(v=>v>=daysFromToday(-60), 'Sluttdatoen kan ikke være mer enn to måneder tilbake.'),
});
export const startHandoverSchema = z.object({
  organizationId:idSchema,
  handoverOn:handoverDateSchema,
  ...handoverDatesSchema.shape,
  invites:z.array(handoverInviteSchema).min(1, 'Velg det nye styret.').max(HANDOVER_MAX_INVITES, `Maks ${HANDOVER_MAX_INVITES} personer i én overføring.`)
    .refine(list=>list.some(i=>i.adminRole==='school_admin'), 'Velg minst én ny skoleadministrator.')
    .refine(list=>new Set(list.map(i=>i.userId ?? i.email?.trim().toLowerCase())).size===list.length, 'Samme person er valgt to ganger.'),
  /** Bare ved gjenoppretting (styreadministrator i området). */
  recoveryReason:z.string().transform(v=>cleanText(v)).pipe(z.string().min(5, 'Skriv en begrunnelse på minst fem tegn.').max(1000, 'Begrunnelsen kan ha maks 1000 tegn.')).optional(),
}).refine(v=>v.oldBoardEndsOn<=v.activationDate, { message:'Det gamle styret må slutte senest den dagen det nye aktiveres.', path:['oldBoardEndsOn'] });
export type StartHandoverInput = z.input<typeof startHandoverSchema>;

export const rescheduleHandoverSchema = z.object({ handoverId:idSchema, ...handoverDatesSchema.shape })
  .refine(v=>v.oldBoardEndsOn<=v.activationDate, { message:'Det gamle styret må slutte senest den dagen det nye aktiveres.', path:['oldBoardEndsOn'] });
export type RescheduleHandoverInput = z.input<typeof rescheduleHandoverSchema>;
export const handoverResponseSchema = z.object({ inviteId:idSchema, accept:z.boolean() });
export type HandoverResponseInput = z.input<typeof handoverResponseSchema>;

// ---- Søk (§6, prompt 8) ----
export const searchInputSchema = z.object({
  query:z.string().transform(v=>v.trim().slice(0,SEARCH_MAX_LENGTH)),
  kinds:z.array(z.enum(['national','county_board','local_board','school','person','event','post'])).optional(),
  includeFormer:z.boolean().optional(),
});
export type SearchInput = z.input<typeof searchInputSchema>;

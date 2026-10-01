import { z } from 'zod';
import { COUNTIES } from '@/lib/domain/counties';

// Valideringsskjemaer for alt som skrives. Delt mellom web, iOS og Android; databasen validerer i tillegg.

export const idSchema = z.string().trim().min(1, 'Mangler id.');
export const audienceSchema = z.enum(['public','county','local','friends']);
export const countySchema = z.enum(COUNTIES, 'Ukjent fylke.');
export const schoolLevelSchema = z.enum(['upper_secondary','lower_secondary'], 'Ugyldig skoleform.');
export const eventResponseSchema = z.enum(['going','interested']);

export const POST_MAX_LENGTH = 6000;
export const COMMENT_MAX_LENGTH = 3000;
export const MESSAGE_MAX_LENGTH = 5000;

export const pollInputSchema = z.object({
  options:z.array(z.string().trim().min(1).max(200)).min(2, 'En avstemning trenger minst to svaralternativer.').max(10),
});

export const publishPostSchema = z.object({
  representationId:idSchema,
  body:z.string().trim().min(1, 'Skriv noe før du publiserer.').max(POST_MAX_LENGTH),
  audience:audienceSchema,
  status:z.enum(['draft','published']),
  poll:pollInputSchema.optional(),
  withImage:z.boolean().optional(),
});
export type PublishPostInput = z.input<typeof publishPostSchema>;

export const commentSchema = z.object({
  postId:idSchema,
  representationId:idSchema,
  body:z.string().trim().min(1, 'Kommentaren er tom.').max(COMMENT_MAX_LENGTH),
});
export type AddCommentInput = z.input<typeof commentSchema>;

export const messageSchema = z.object({
  conversationId:idSchema,
  body:z.string().trim().min(1, 'Meldingen er tom.').max(MESSAGE_MAX_LENGTH),
});
export type SendMessageInput = z.input<typeof messageSchema>;

export const voteSchema = z.object({ postId:idSchema, optionId:idSchema, organizationId:idSchema });
export type VoteInput = z.input<typeof voteSchema>;

export const eventResponseInputSchema = z.object({ eventId:idSchema, organizationId:idSchema, response:eventResponseSchema.nullable() });
export type SetEventResponseInput = z.input<typeof eventResponseInputSchema>;

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

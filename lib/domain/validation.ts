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

export const onboardingSchema = z.object({
  schoolId:idSchema,
  displayName:z.string().trim().min(2, 'Navnet må ha minst to tegn.').max(120),
  leaderMonth:z.number().int().min(1).max(12).optional(),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

/** Første lesbare feilmelding fra zod, ellers selve feilmeldingen. */
export function errorMessage(error:unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Ugyldige data.';
  if (error instanceof Error) return error.message;
  return 'Noe gikk galt.';
}

export type OrganizationType = 'national' | 'county_board' | 'local_board' | 'school';
export type OrganizationStatus = 'active' | 'deactivated' | 'archived';
export type Audience = 'public' | 'county' | 'local' | 'friends';
export type EventCategory = 'landsmote' | 'kurs' | 'samling' | 'mote' | 'digitalt' | 'annet';
export type EventResponse = 'going' | 'interested';
/** En tilknytning brukeren kan opptre på vegne av. canPublish regnes ut av serveren. Verv i deaktiverte organisasjoner vises, men kan ikke brukes. */
export type Representation = { id:string; organizationId:string; name:string; initials:string; publicRole:string; canPublish:boolean; type:OrganizationType; organizationStatus:OrganizationStatus };
export type PublicOfficer = { id:string; name:string; publicTitle:string };
export type OrganizationPriority = { id:string; title:string; description:string };
export type Organization = { id:string; type:OrganizationType; name:string; schoolName?:string; initials:string; county:string; place?:string; localBoard?:string; schoolLevel?:'upper_secondary'|'lower_secondary'; status:OrganizationStatus; bio:string; contactEmail?:string; studentCount?:number; memberCount?:number; followers:number; following?:boolean; officersTitle?:string; officers?:PublicOfficer[]; officerCount?:number; prioritiesTitle?:string; priorities?:OrganizationPriority[] };
export type Comment = { id:string; organizationId:string; organizationName:string; actorName:string; createdAt:string; body:string };
export type PostMedia = { id:string; type:'image'|'video'; alt:string; url?:string };
export type Post = { id:string; organizationId:string; initials:string; organizationName:string; actorName:string; actorRole:string; createdAt:string; body:string; audience:Audience; priority?:boolean; edited?:boolean; likes:number; supported?:boolean; comments:number; commentItems?:Comment[]; tags?:string[]; media?:PostMedia[]; poll?:{ question:string; options:{ id:string; label:string; votes:number }[]; closesAt:string; resultsVisibility?:'after_vote'|'after_close'|'always' }; eventId?:string };
export type Event = { id:string; hostId:string; host:string; title:string; summary:string; description:string; category:EventCategory; startsAt:string; start:string; end:string; place:string; digital?:boolean; deadline?:string; price?:string; seatsPerOrganization?:number; capacity:number; registered:number; interested:number; imageAlt?:string; status:'draft'|'published'|'cancelled'|'completed'; audience:string };
export type { Conversation, Message } from '@/lib/domain/messaging';
export type CurrentUser = { id:string; name:string; initials:string; schoolId:string|null; email:string; avatarUrl?:string };
/**
 * Hvem som bruker appen. «onboarding» betyr innlogget uten profil: brukeren må velge skole og navn først.
 * «deactivated» er en profil som er deaktivert; den kan lese offentlig innhold, men ikke gjøre noe.
 */
export type Session =
  | { status:'anonymous' }
  | { status:'onboarding'; email:string }
  | { status:'active'|'deactivated'; user:CurrentUser; representations:Representation[]; activeRepresentationId:string|null };
export type SignedInSession = Extract<Session,{ status:'active'|'deactivated' }>;
export type SchoolHistoryEntry = { schoolId:string; schoolName:string; county:string; startedAt:string; endedAt:string|null };

/** Interne rettigheter (§4). Er adskilt fra offentlige verv og vises aldri offentlig. */
export type InternalRole = 'super_admin' | 'board_admin' | 'school_admin' | 'content_manager';
export type GrantStatus = 'invited' | 'active' | 'ended' | 'revoked';
/** Egne verv (kind 'office') og rettigheter (kind 'role'), også avsluttede. */
export type MyRole = { id:string; kind:'office'|'role'; organizationId:string; organizationName:string; organizationStatus:OrganizationStatus; title:string; role?:InternalRole; startDate:string; endDate:string|null; status:GrantStatus };
/** En organisasjon brukeren administrerer, og hvilke rettigheter serveren lar brukeren tildele der. */
export type AdminOrganization = { id:string; type:OrganizationType; name:string; county:string; status:OrganizationStatus; myRole:InternalRole; grantableRoles:InternalRole[] };
/** Verv og rettigheter i en organisasjon, slik administratoren ser dem. canChange er serverens svar. */
export type OrganizationRoleEntry = { id:string; kind:'office'|'role'; userId:string; userName:string; userActive:boolean; title:string; role?:InternalRole; startDate:string; endDate:string|null; status:GrantStatus; grantedByName?:string; canChange:boolean };
export type AssignablePerson = { id:string; name:string; schoolName?:string };
export type SchoolAdminRequest = { id:string; userId:string; userName:string; schoolId:string; schoolName:string; message?:string; status:'pending'|'approved'|'rejected'|'cancelled'; createdAt:string; decidedAt?:string; decisionReason?:string; mine:boolean; canDecide:boolean };
export type AuditEntry = { id:string; createdAt:string; actorName:string; action:string; subjectName?:string; details:Record<string,unknown> };

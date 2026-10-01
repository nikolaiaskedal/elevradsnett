export type OrganizationType = 'national' | 'county_board' | 'local_board' | 'school';
export type OrganizationStatus = 'active' | 'deactivated' | 'archived';
export type Audience = 'public' | 'county' | 'local' | 'friends';
export type SchoolLevelTarget = 'both' | 'upper_secondary' | 'lower_secondary';
export type EventCategory = 'landsmote' | 'kurs' | 'samling' | 'mote' | 'digitalt' | 'annet';
/** En tilknytning brukeren kan opptre på vegne av. canPublish regnes ut av serveren. Verv i deaktiverte organisasjoner vises, men kan ikke brukes. */
export type Representation = { id:string; organizationId:string; name:string; initials:string; publicRole:string; canPublish:boolean; type:OrganizationType; organizationStatus:OrganizationStatus };
export type PublicOfficer = { id:string; name:string; publicTitle:string };
export type OrganizationPriority = { id:string; title:string; description:string };
export type Organization = { id:string; type:OrganizationType; name:string; schoolName?:string; initials:string; county:string; place?:string; localBoard?:string; schoolLevel?:'upper_secondary'|'lower_secondary'; status:OrganizationStatus; bio:string; contactEmail?:string; studentCount?:number; memberCount?:number; followers:number; following?:boolean; officersTitle?:string; officers?:PublicOfficer[]; officerCount?:number; prioritiesTitle?:string; priorities?:OrganizationPriority[] };
export type Comment = { id:string; organizationId:string; organizationName:string; actorName:string; createdAt:string; body:string };
export type PostMedia = { id:string; type:'image'|'video'; alt:string; url?:string };
export type Post = { id:string; organizationId:string; initials:string; organizationName:string; actorName:string; actorRole:string; createdAt:string; body:string; audience:Audience; priority?:boolean; edited?:boolean; likes:number; supported?:boolean; comments:number; commentItems?:Comment[]; tags?:string[]; media?:PostMedia[]; poll?:{ question:string; options:{ id:string; label:string; votes:number }[]; closesAt:string; resultsVisibility?:'after_vote'|'after_close'|'always' }; eventId?:string;
  /** Skoleform innlegget er rettet mot. */
  schoolLevel?:SchoolLevelTarget;
  /** Serverens svar: kan brukeren redigere og slette innlegget og se historikken? */
  canManage?:boolean };
/** Et lagret utkast. Bare de som kan publisere for organisasjonen ser det. */
export type PostDraft = { id:string; organizationId:string; body:string; audience:Audience; schoolLevel:SchoolLevelTarget; eventId?:string; updatedAt:string; actorName:string };
/** En tidligere versjon av et publisert innlegg (§7). Bare for administratorer. */
export type PostRevision = { id:string; body:string; audience:Audience; schoolLevel:SchoolLevelTarget; editedByName:string; createdAt:string };
/** Venneråd sett fra egen skole: ventende eller godkjent. canDecide er serverens svar. */
export type FriendConnection = { id:string; schoolId:string; schoolName:string; county:string; status:'pending'|'accepted'; direction:'incoming'|'outgoing'; createdAt:string; approvedAt?:string; canDecide:boolean };
export type EventStatus = 'draft'|'published'|'cancelled'|'completed';
export type EventAudience = 'public'|'county'|'local';
/**
 * Et arrangement slik det vises. start, end, place, deadline og audience er ferdige tekster; resten er rådata,
 * så arrangøren kan redigere. digitalUrl finnes bare for arrangøren og deltakerne. canEdit er serverens svar.
 */
export type Event = { id:string; hostId:string; host:string; title:string; summary:string; description:string; category:EventCategory; startsAt:string; endsAt:string; start:string; end:string;
  place:string; location?:string; digital?:boolean; digitalUrl?:string; deadline?:string; deadlineAt?:string; price?:string; seatsPerOrganization?:number; capacity:number;
  registered:number; interested:number; interestedByMe?:boolean; imageUrl?:string; imageAlt?:string; status:EventStatus; audience:string; audienceCode:EventAudience; canEdit?:boolean };
/** Organisasjoner brukeren kan opprette arrangementer for. */
export type EventOrganizer = { id:string; name:string; type:OrganizationType; county:string };
export type RegistrationStatus = 'registered'|'waitlisted'|'cancelled'|'attended';
export type DelegateStatus = 'invited'|'confirmed'|'declined'|'attended'|'absent';
export type EventDelegate = { id:string; userId:string; name:string; status:DelegateStatus; officeTitle?:string };
/** En organisasjon brukeren kan melde på (allowed: innenfor målgruppen), med påmelding og delegater. */
export type EventRegistrationEntry = { organizationId:string; organizationName:string; type:OrganizationType; allowed:boolean; registrationId?:string; status?:RegistrationStatus; delegates:EventDelegate[] };
export type EventInvitation = { delegateId:string; registrationId:string; organizationId:string; organizationName:string; status:DelegateStatus; officeTitle?:string };
/** Påmeldingene arrangøren ser, for å bekrefte oppmøte. */
export type EventAttendanceEntry = { registrationId:string; organizationId:string; organizationName:string; status:RegistrationStatus; delegates:EventDelegate[] };
/** Alt om brukerens forhold til ett arrangement. Interesse, påmelding, delegater og oppmøte holdes adskilt (§8). */
export type EventParticipation = { interested:boolean; canEdit:boolean; invitations:EventInvitation[]; organizations:EventRegistrationEntry[]; attendance:EventAttendanceEntry[]|null };
export type DelegateCandidate = { id:string; name:string; officeTitle?:string };

/** CV for en person (§8): offentlige verv og arrangementer med bekreftet oppmøte. Invitasjoner vises bare for personen selv. */
export type CvOffice = { id:string; organizationId:string; organizationName:string; title:string; startDate:string; endDate:string|null; active:boolean };
export type CvEvent = { eventId:string; title:string; startsAt:string; category:EventCategory; organizerName:string; organizationId:string; organizationName:string; officeTitle?:string; elevtinget:boolean };
export type CvInvitation = { delegateId:string; eventId:string; title:string; startsAt:string; organizationName:string; status:DelegateStatus };
export type PersonCv = { id:string; name:string; initials:string; avatarUrl?:string; schoolName?:string; active:boolean; offices:CvOffice[]; events:CvEvent[]; stars:number; invitations:CvInvitation[] };
/** Skolens CV: én rad per person som representerte skolen på et arrangement. userId mangler for deaktiverte personer. */
export type OrganizationCvEntry = { eventId:string; title:string; startsAt:string; category:EventCategory; organizerName:string; elevtinget:boolean; userId?:string; name:string; officeTitle?:string };
export type Message = { id:string; from:string; mine?:boolean; text:string; time:string };
export type Conversation = { id:string; name:string; initials:string; subtitle?:string; organizationId?:string; kind:'direct'|'group'|'managed'; unread:number; muted?:boolean; members:number; messages:Message[] };
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

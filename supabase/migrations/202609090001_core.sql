-- Elevrådsnett core model. PostgreSQL / Supabase.
create extension if not exists pgcrypto;

create type public.organization_type as enum ('national','county_board','local_board','school');
create type public.organization_status as enum ('active','deactivated','archived');
create type public.membership_status as enum ('invited','active','ended','revoked');
create type public.admin_role as enum ('super_admin','board_admin','school_admin','content_manager');
create type public.content_status as enum ('draft','published','deleted');
create type public.audience_type as enum ('public','county','local','friends');
create type public.moderation_status as enum ('pending','visible','hidden','removed');
create type public.event_status as enum ('draft','published','cancelled','completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  email text not null,
  avatar_path text,
  current_school_id uuid,
  active_membership_id uuid,
  status organization_status not null default 'active',
  deactivated_by_user boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), type organization_type not null,
  external_id text unique, name text not null, slug text not null unique,
  organization_number text, county text not null, local_board_id uuid,
  school_level text check (school_level in ('upper_secondary','lower_secondary') or school_level is null),
  contact_email text, contact_phone text, bio text,
  profile_image_path text, cover_image_path text,
  default_profile_image_path text, default_cover_image_path text,
  image_locked boolean not null default false, is_placeholder boolean not null default false,
  status organization_status not null default 'active', deactivation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((type <> 'school') or (school_level is not null))
);
alter table public.organizations add constraint organizations_local_board_fk foreign key(local_board_id) references public.organizations(id);
alter table public.profiles add constraint profiles_school_fk foreign key(current_school_id) references public.organizations(id);

create table public.organization_relations (
  id uuid primary key default gen_random_uuid(), parent_id uuid not null references public.organizations(id), child_id uuid not null references public.organizations(id), relation_type text not null check(relation_type in ('county_contains','local_contains','oversees')), created_at timestamptz not null default now(), unique(parent_id,child_id,relation_type), check(parent_id<>child_id)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), organization_id uuid not null references public.organizations(id), public_title text, start_date date not null, end_date date, status membership_status not null default 'invited', granted_by uuid references public.profiles(id), granted_at timestamptz not null default now(), revoked_by uuid references public.profiles(id), revoked_at timestamptz, accepted_at timestamptz, created_at timestamptz not null default now(), check(end_date is null or end_date>=start_date)
);
create unique index memberships_one_active_title on public.memberships(user_id,organization_id,public_title) where status='active' and end_date is null;
alter table public.profiles add constraint profiles_active_membership_fk foreign key(active_membership_id) references public.memberships(id);
create table public.role_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), organization_id uuid not null references public.organizations(id), membership_id uuid references public.memberships(id), role admin_role not null, start_date date not null, end_date date, status membership_status not null default 'invited', granted_by uuid not null references public.profiles(id), granted_at timestamptz not null default now(), revoked_by uuid references public.profiles(id), revoked_at timestamptz, accepted_at timestamptz, check(end_date is null or end_date>=start_date)
);
create unique index role_grants_one_active on public.role_grants(user_id,organization_id,role) where status='active' and end_date is null;
create table public.board_terms (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), starts_on date not null, ends_on date, status text not null check(status in ('planned','active','completed')), created_at timestamptz not null default now());
create table public.election_schedules (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), expected_handover_on date not null, updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(), unique(organization_id));
create table public.handover_processes (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), current_term_id uuid references public.board_terms(id), target_term_id uuid references public.board_terms(id), activation_date date not null, old_board_ends_on date not null, status text not null check(status in ('draft','awaiting_acceptance','scheduled','completed','cancelled','recovery')), started_by uuid not null references public.profiles(id), confirmed_by uuid references public.profiles(id), completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.handover_invites (id uuid primary key default gen_random_uuid(), handover_id uuid not null references public.handover_processes(id) on delete cascade, user_id uuid references public.profiles(id), email text, public_title text, admin_role admin_role, status text not null check(status in ('pending','accepted','declined','expired')), token_hash text, expires_at timestamptz, accepted_at timestamptz, created_at timestamptz not null default now(), check(user_id is not null or email is not null));

create table public.posts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), actor_user_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 6000), status content_status not null default 'draft', audience audience_type not null default 'public', school_level_target text not null default 'both' check(school_level_target in ('upper_secondary','lower_secondary','both')), priority boolean not null default false, moderation_status moderation_status not null default 'visible', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create index posts_feed_idx on public.posts(status,moderation_status,published_at desc);
create table public.post_media (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, storage_path text not null unique, media_type text not null check(media_type in ('image','video')), mime_type text not null, byte_size bigint not null check(byte_size>0), width int, height int, duration_seconds numeric, thumbnail_path text, processing_status text not null check(processing_status in ('pending','ready','failed')), is_placeholder boolean not null default false, created_at timestamptz not null default now());
create table public.tags (id uuid primary key default gen_random_uuid(), slug text not null unique, label text not null);
create table public.post_tags (post_id uuid references public.posts(id) on delete cascade, tag_id uuid references public.tags(id) on delete cascade, primary key(post_id,tag_id));
create table public.comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, organization_id uuid not null references public.organizations(id), actor_user_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 3000), moderation_status moderation_status not null default 'visible', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.reactions (post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id), reaction text not null default 'support' check(reaction in ('support')), created_at timestamptz not null default now(), primary key(post_id,user_id));
create table public.follows (user_id uuid not null references public.profiles(id), organization_id uuid not null references public.organizations(id), created_at timestamptz not null default now(), primary key(user_id,organization_id));
create table public.organization_connections (id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.organizations(id), recipient_id uuid not null references public.organizations(id), status text not null check(status in ('pending','accepted','rejected','ended')), approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(), check(requester_id<>recipient_id), unique(requester_id,recipient_id));
create table public.polls (id uuid primary key default gen_random_uuid(), post_id uuid not null unique references public.posts(id) on delete cascade, question text not null, closes_at timestamptz, results_visibility text not null default 'after_vote' check(results_visibility in ('after_vote','after_close','always')));
create table public.poll_options (id uuid primary key default gen_random_uuid(), poll_id uuid not null references public.polls(id) on delete cascade, label text not null, position smallint not null, unique(poll_id,position));
create table public.poll_votes (poll_id uuid not null references public.polls(id) on delete cascade, option_id uuid not null references public.poll_options(id) on delete cascade, organization_id uuid not null references public.organizations(id), actor_user_id uuid not null references public.profiles(id), updated_at timestamptz not null default now(), primary key(poll_id,organization_id));

create table public.events (id uuid primary key default gen_random_uuid(), organizer_id uuid not null references public.organizations(id), created_by uuid not null references public.profiles(id), title text not null, description text not null, starts_at timestamptz not null, ends_at timestamptz not null, place text, digital_url text, registration_deadline timestamptz, capacity int check(capacity>0), audience audience_type not null default 'public', image_path text, status event_status not null default 'draft', is_placeholder boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at), check(place is not null or digital_url is not null));
create table public.event_organization_registrations (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), organization_id uuid not null references public.organizations(id), registered_by uuid not null references public.profiles(id), status text not null check(status in ('registered','waitlisted','cancelled','attended')), created_at timestamptz not null default now(), unique(event_id,organization_id));
create table public.event_delegates (id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.event_organization_registrations(id) on delete cascade, user_id uuid not null references public.profiles(id), status text not null check(status in ('invited','confirmed','declined','attended','absent')), notified_at timestamptz, confirmed_at timestamptz, attendance_confirmed_by uuid references public.profiles(id), attendance_confirmed_at timestamptz, unique(registration_id,user_id));

create table public.conversations (id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('direct','group','managed')), name text, managed_organization_id uuid references public.organizations(id), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.conversation_members (conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references public.profiles(id), joined_at timestamptz not null default now(), left_at timestamptz, history_starts_at timestamptz not null default now(), is_admin boolean not null default false, muted_until timestamptz, last_read_at timestamptz, primary key(conversation_id,user_id));
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_user_id uuid not null default auth.uid() references public.profiles(id), body text check(body is null or char_length(body)<=5000), created_at timestamptz not null default now(), deleted_at timestamptz, reported_at timestamptz);
create index messages_conversation_idx on public.messages(conversation_id,created_at desc);
create table public.message_attachments (id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade, storage_path text not null unique, mime_type text not null, byte_size bigint not null check(byte_size>0), created_at timestamptz not null default now());

create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), type text not null, title text not null, body text, link text, read_at timestamptz, email_sent_at timestamptz, push_sent_at timestamptz, created_at timestamptz not null default now());
create table public.notification_preferences (user_id uuid primary key references public.profiles(id), in_app boolean not null default true, email boolean not null default true, push boolean not null default false, updated_at timestamptz not null default now());
create table public.moderation_reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), target_type text not null check(target_type in ('post','comment','profile','media','message')), target_id uuid not null, category text not null, description text, shared_message_excerpt text, status text not null check(status in ('open','reviewing','resolved','appealed','closed')), assigned_to uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.moderation_actions (id uuid primary key default gen_random_uuid(), report_id uuid not null references public.moderation_reports(id), moderator_id uuid not null references public.profiles(id), action text not null check(action in ('hide','delete','warn','restrict','deactivate','restore','no_action')), reason text not null, created_at timestamptz not null default now());
create table public.audit_logs (id bigint generated always as identity primary key, actor_user_id uuid references public.profiles(id), organization_id uuid references public.organizations(id), action text not null, target_type text not null, target_id text, details jsonb not null default '{}', ip_hash text, created_at timestamptz not null default now());
create index audit_logs_scope_idx on public.audit_logs(organization_id,created_at desc);
create table public.import_batches (id uuid primary key default gen_random_uuid(), uploaded_by uuid not null references public.profiles(id), county text, filename text not null, status text not null check(status in ('validated','awaiting_confirmation','applied','failed')), summary jsonb not null default '{}', row_results jsonb not null default '[]', created_at timestamptz not null default now(), applied_at timestamptz);
create table public.legal_document_versions (id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('privacy','terms','cookies')), version text not null, body text not null, published_at timestamptz not null, unique(kind,version));
create table public.consent_records (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), anonymous_id text, legal_version text not null, purposes jsonb not null, granted_at timestamptz not null default now(), withdrawn_at timestamptz, check(user_id is not null or anonymous_id is not null));

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','organizations','handover_processes','posts','comments','events','moderation_reports'] loop execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',t,t); end loop; end $$;

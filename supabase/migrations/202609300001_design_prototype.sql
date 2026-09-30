-- Datamodell for nytt design (docs/design/elevradsnett.dc.html):
-- skolenavn og elevtall, prioriterte saker, offentlige tillitsvalgte, arrangementstype,
-- «Interessert» på arrangementer, alt-tekst på media og valgmåned fra onboarding.

-- Organisasjoner: offisielt skolenavn (fra skoleregisteret), elevtall og overskrift for prioriterte saker.
alter table public.organizations
  add column school_name text,
  add column student_count int check (student_count is null or student_count >= 0),
  add column priorities_heading text check (priorities_heading is null or char_length(priorities_heading) <= 80);

create table public.organization_priorities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  position smallint not null check (position >= 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, position)
);
alter table public.organization_priorities enable row level security;
alter table public.organization_priorities force row level security;
create trigger organization_priorities_touch before update on public.organization_priorities for each row execute function public.touch_updated_at();
create policy priorities_public_read on public.organization_priorities for select to anon,authenticated
  using (exists (select 1 from organizations o where o.id = organization_id and o.status = 'active'));
create policy priorities_admin_write on public.organization_priorities for all to authenticated
  using (public.has_role(organization_id, array['content_manager','school_admin','board_admin']::admin_role[]))
  with check (public.has_role(organization_id, array['content_manager','school_admin','board_admin']::admin_role[]));

-- Offentlige tillitsvalgte. Medlemskap er ikke offentlig lesbare, så dette er en smal, sikker projeksjon:
-- bare navn og offentlig verv for aktive verv i aktive organisasjoner. Ingen e-post, ingen interne roller.
create or replace function public.get_public_officers(p_organization uuid)
returns table (membership_id uuid, display_name text, public_title text)
language sql stable security definer set search_path = public as $$
  select m.id, p.display_name, m.public_title
  from memberships m
  join profiles p on p.id = m.user_id and p.status = 'active'
  join organizations o on o.id = m.organization_id and o.status = 'active'
  where m.organization_id = p_organization and m.status = 'active' and m.public_title is not null
    and m.start_date <= current_date and (m.end_date is null or m.end_date >= current_date)
  order by m.start_date, p.display_name;
$$;

-- Medier: alt-tekst er påkrevd for tilgjengelighet i nye opplastinger.
alter table public.post_media add column alt_text text check (alt_text is null or char_length(alt_text) <= 300);

-- Arrangementer: type (merket på kortet), kort ingress, pris og plasser per elevråd.
alter table public.events
  add column category text not null default 'annet' check (category in ('landsmote','kurs','samling','mote','digitalt','annet')),
  add column summary text check (summary is null or char_length(summary) <= 280),
  add column price_label text check (price_label is null or char_length(price_label) <= 60),
  add column seats_per_organization int check (seats_per_organization is null or seats_per_organization > 0);

-- «Interessert» registreres per organisasjon, adskilt fra bindende påmelding («Skal»).
create table public.event_organization_interests (
  event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  marked_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (event_id, organization_id)
);
alter table public.event_organization_interests enable row level security;
alter table public.event_organization_interests force row level security;
create policy event_interests_org_read on public.event_organization_interests for select to authenticated
  using (public.has_active_membership(organization_id));

-- Aggregerte tall kan vises offentlig uten å avsløre hvilke skoler som har svart.
create or replace function public.get_event_engagement(p_event uuid)
returns table (registered int, interested int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from event_organization_registrations r where r.event_id = p_event and r.status in ('registered','attended')),
    (select count(*)::int from event_organization_interests i where i.event_id = p_event)
  from events e where e.id = p_event and e.status in ('published','completed');
$$;

-- Én handling for «Skal», «Interessert» og angre. Påmelding krever publiserings-/administratorrett,
-- interesse krever aktivt verv. Svarene utelukker hverandre.
create or replace function public.set_event_response(p_event uuid, p_organization uuid, p_response text)
returns void language plpgsql security definer set search_path = public as $$ begin
  if p_response not in ('going','interested','none') then raise exception 'invalid response'; end if;
  if not public.is_active_user() or not public.has_active_membership(p_organization) then raise exception 'not authorized'; end if;
  if p_response = 'going' and not public.has_role(p_organization, array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if not exists (select 1 from events where id = p_event and status = 'published' and (registration_deadline is null or registration_deadline > now())) then raise exception 'event closed'; end if;
  delete from event_organization_interests where event_id = p_event and organization_id = p_organization;
  if p_response = 'going' then
    insert into event_organization_registrations(event_id, organization_id, registered_by, status)
    values (p_event, p_organization, auth.uid(), 'registered')
    on conflict (event_id, organization_id) do update set status = 'registered', registered_by = auth.uid();
  else
    update event_organization_registrations set status = 'cancelled' where event_id = p_event and organization_id = p_organization and status = 'registered';
    if p_response = 'interested' then
      insert into event_organization_interests(event_id, organization_id, marked_by) values (p_event, p_organization, auth.uid());
    end if;
  end if;
  insert into audit_logs(actor_user_id, organization_id, action, target_type, target_id, details)
  values (auth.uid(), p_organization, 'event.response', 'event', p_event::text, jsonb_build_object('response', p_response));
end $$;

-- Kommentarer publiseres, som innlegg, på vegne av aktiv representasjon.
create or replace function public.add_comment(p_post uuid, p_organization uuid, p_body text)
returns public.comments language plpgsql security definer set search_path = public as $$ declare result comments; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization) then raise exception 'not authorized'; end if;
  if char_length(trim(p_body)) not between 1 and 3000 then raise exception 'invalid comment'; end if;
  if not exists (select 1 from posts p where p.id = p_post and public.can_view_post(p, auth.uid())) then raise exception 'post not found'; end if;
  insert into comments(post_id, organization_id, actor_user_id, body) values (p_post, p_organization, auth.uid(), trim(p_body)) returning * into result;
  return result;
end $$;

-- Valgmåned fra onboarding: dato er ikke kjent ennå, bare måned.
alter table public.election_schedules
  alter column expected_handover_on drop not null,
  add column expected_month smallint check (expected_month between 1 and 12),
  add constraint election_schedules_date_or_month check (expected_handover_on is not null or expected_month is not null);

-- Onboarding: kobler brukeren til skolen og foreslår valgmåned hvis skolen ikke har en plan fra før.
-- Eksisterende valgplaner overskrives aldri herfra; det gjør bare skoleadministrator.
create or replace function public.complete_onboarding(p_school uuid, p_display_name text, p_leader_month smallint default null)
returns void language plpgsql security definer set search_path = public as $$ begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'not authorized'; end if;
  if char_length(trim(p_display_name)) not between 2 and 120 then raise exception 'invalid name'; end if;
  if not exists (select 1 from organizations where id = p_school and type = 'school' and status = 'active') then raise exception 'school not found'; end if;
  if p_leader_month is not null and p_leader_month not between 1 and 12 then raise exception 'invalid month'; end if;
  update profiles set display_name = trim(p_display_name), current_school_id = p_school where id = auth.uid();
  if p_leader_month is not null then
    insert into election_schedules(organization_id, expected_month, updated_by) values (p_school, p_leader_month, auth.uid())
    on conflict (organization_id) do nothing;
  end if;
end $$;

revoke all on function public.get_public_officers(uuid), public.get_event_engagement(uuid), public.set_event_response(uuid,uuid,text), public.add_comment(uuid,uuid,text), public.complete_onboarding(uuid,text,smallint) from public;
grant execute on function public.get_public_officers(uuid), public.get_event_engagement(uuid) to anon, authenticated;
grant execute on function public.set_event_response(uuid,uuid,text), public.add_comment(uuid,uuid,text), public.complete_onboarding(uuid,text,smallint) to authenticated;

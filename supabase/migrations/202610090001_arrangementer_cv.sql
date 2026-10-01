-- Prompt 9: arrangementer og CV (docs/PROMPTPLAN.md, KRAVSPEC §8, §4, §17).
-- Fire ting holdes adskilt: en persons interesse, en organisasjons påmelding, navngitte delegater
-- og bekreftet faktisk deltakelse. Bare bekreftet deltakelse havner på CV-en til personen og skolen.
-- Arrangementer opprettes og endres av styreadministrator i arrangørorganisasjonen, aldri direkte i tabellen.

-- ---------------------------------------------------------------------------
-- 1. Datamodell
-- ---------------------------------------------------------------------------
-- Interesse er personlig (§8). Tabellen event_organization_interests fra prompt 1 brukes ikke lenger;
-- eksisterende markeringer flyttes til personen som gjorde dem.
create table public.event_interests (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id,user_id)
);
alter table public.event_interests enable row level security;
alter table public.event_interests force row level security;
create policy event_interests_own_read on public.event_interests for select to authenticated using (user_id=auth.uid());
create index event_interests_user_idx on public.event_interests(user_id);
insert into public.event_interests(event_id,user_id,created_at)
  select i.event_id,i.marked_by,i.created_at from public.event_organization_interests i join public.profiles p on p.id=i.marked_by
  on conflict do nothing;
comment on table public.event_organization_interests is 'Erstattet av event_interests (personlig interesse) i prompt 9. Skrives ikke lenger.';

-- Delegater: hvem som inviterte, når personen svarte, og vervet personen hadde da (vises på skolens CV).
alter table public.event_delegates
  add column invited_by uuid references public.profiles(id),
  add column responded_at timestamptz,
  add column office_title text check (office_title is null or char_length(office_title)<=80),
  add column created_at timestamptz not null default now();
create index event_delegates_user_idx on public.event_delegates(user_id);
create index event_registrations_org_idx on public.event_organization_registrations(organization_id);
create index event_registrations_event_idx on public.event_organization_registrations(event_id,status,created_at);

-- Organisasjonen ser egne delegater (som påmeldingen), og arrangøren ser alle til sitt arrangement.
create policy event_delegates_organizer_read on public.event_delegates for select to authenticated using (exists(
  select 1 from event_organization_registrations r join events e on e.id=r.event_id
  where r.id=registration_id and public.has_role(e.organizer_id,array['board_admin']::admin_role[])));
create policy event_registrations_organizer_read on public.event_organization_registrations for select to authenticated using (exists(
  select 1 from events e where e.id=event_id and public.has_role(e.organizer_id,array['board_admin']::admin_role[])));

-- ---------------------------------------------------------------------------
-- 2. Hvem kan gjøre hva (§4)
-- ---------------------------------------------------------------------------
-- Arrangementer opprettes og administreres av styreadministrator (og superadministrator) i et aktivt styre
-- eller i EO nasjonalt. Skoler arrangerer ikke arrangementer i Elevrådsnett.
create or replace function public.can_organize_events(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user() and exists(select 1 from organizations o where o.id=p_org and o.type<>'school' and o.status='active')
    and public.has_role(p_org,array['board_admin']::admin_role[]);
$$;
create or replace function public.can_manage_event(p_event uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from events e where e.id=p_event and public.can_organize_events(e.organizer_id));
$$;
-- Påmelding og delegater: skoleadministrator eller innholdsansvarlig i skolen, styreadministrator eller
-- innholdsansvarlig i et styre (§8). Organisasjonen må være aktiv.
create or replace function public.can_register_for(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user() and exists(select 1 from organizations o where o.id=p_org and o.status='active')
    and public.has_role(p_org,array['content_manager','school_admin','board_admin']::admin_role[]);
$$;
-- Målgruppen bestemmer hvem som kan melde seg på: alle, organisasjoner i arrangørens fylke, eller i lokallaget.
create or replace function public.event_audience_allows(p_event uuid,p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select case e.audience
      when 'county' then o.type='national' or g.county=o.county
      when 'local' then case o.type when 'local_board' then g.id=o.id or g.local_board_id=o.id when 'county_board' then g.county=o.county when 'school' then g.id=o.id else true end
      else true end
    from events e join organizations o on o.id=e.organizer_id, organizations g where e.id=p_event and g.id=p_org),false);
$$;
-- Deltar brukeren i arrangementet (delegat som ikke har takket nei, eller kan administrere en påmeldt organisasjon)?
-- Da får brukeren se lenken til digitale arrangementer.
create or replace function public.is_event_participant(p_event uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(select 1 from event_organization_registrations r where r.event_id=p_event and r.status in ('registered','attended') and (
    public.can_register_for(r.organization_id)
    or exists(select 1 from event_delegates d where d.registration_id=r.id and d.user_id=auth.uid() and d.status<>'declined')));
$$;
-- Personer som kan være delegat for organisasjonen: elever ved skolen, eller personer med aktivt verv i styret.
create or replace function public.can_be_delegate(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles p join organizations o on o.id=p_org where p.id=p_user and p.status='active' and (
    (o.type='school' and p.current_school_id=o.id)
    or exists(select 1 from memberships m where m.user_id=p.id and m.organization_id=o.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))));
$$;

-- ---------------------------------------------------------------------------
-- 3. Lesing av arrangementer
-- ---------------------------------------------------------------------------
-- Publiserte, avlyste og avsluttede arrangementer for alle. Utkast bare for arrangøren. Lenken til digitale
-- arrangementer vises bare for arrangøren og deltakerne. Tallene er aggregerte og sier ikke hvem som har svart.
create or replace function public.list_events()
returns table (id uuid,organizer_id uuid,organizer_name text,title text,summary text,description text,category text,starts_at timestamptz,ends_at timestamptz,
  place text,digital boolean,digital_url text,registration_deadline timestamptz,capacity int,price_label text,seats_per_organization int,status event_status,
  audience audience_type,image_path text,registered int,interested int,interested_by_me boolean,can_edit boolean)
language sql stable security definer set search_path=public as $$
  select e.id,e.organizer_id,o.name,e.title,e.summary,e.description,e.category,e.starts_at,e.ends_at,e.place,e.digital_url is not null,
    case when public.can_manage_event(e.id) or public.is_event_participant(e.id) then e.digital_url end,
    e.registration_deadline,e.capacity,e.price_label,e.seats_per_organization,e.status,e.audience,e.image_path,
    (select count(*)::int from event_organization_registrations r where r.event_id=e.id and r.status in ('registered','attended')),
    (select count(*)::int from event_interests i join profiles p on p.id=i.user_id and p.status='active' where i.event_id=e.id),
    auth.uid() is not null and exists(select 1 from event_interests i where i.event_id=e.id and i.user_id=auth.uid()),
    public.can_manage_event(e.id)
  from events e join organizations o on o.id=e.organizer_id and o.status='active'
  where e.status in ('published','completed','cancelled') or (e.status='draft' and public.can_manage_event(e.id))
  order by e.starts_at;
$$;

-- Organisasjonene brukeren kan opprette arrangementer for.
create or replace function public.list_my_event_organizers()
returns table (id uuid,name text,type organization_type,county text)
language sql stable security definer set search_path=public as $$
  select o.id,o.name,o.type,o.county from organizations o
  where o.type<>'school' and o.status='active' and public.can_organize_events(o.id)
  order by case o.type when 'national' then 0 when 'county_board' then 1 else 2 end,o.name;
$$;

-- ---------------------------------------------------------------------------
-- 4. Opprette og endre arrangementer
-- ---------------------------------------------------------------------------
create or replace function public.save_event(p_event uuid,p_organizer uuid,p_title text,p_summary text,p_description text,p_category text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_place text,p_digital_url text,p_registration_deadline timestamptz,p_capacity int,
  p_seats_per_organization int,p_price_label text,p_audience audience_type,p_status event_status)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_old events; v_id uuid; v_registered int;
  v_title text:=trim(coalesce(p_title,'')); v_summary text:=nullif(trim(coalesce(p_summary,'')),''); v_description text:=trim(coalesce(p_description,''));
  v_place text:=nullif(trim(coalesce(p_place,'')),''); v_url text:=nullif(trim(coalesce(p_digital_url,'')),''); v_price text:=nullif(trim(coalesce(p_price_label,'')),'');
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_event is not null then
    select * into v_old from events where id=p_event for update;
    if not found then raise exception 'event not found'; end if;
    if p_organizer is distinct from v_old.organizer_id then raise exception 'invalid organizer'; end if;
  end if;
  if not public.can_organize_events(p_organizer) then raise exception 'not authorized'; end if;
  if v_old.status in ('cancelled','completed') then raise exception 'event locked'; end if;
  if p_status not in ('draft','published') or (v_old.status='published' and p_status='draft') then raise exception 'invalid status'; end if;
  if char_length(v_title) not between 3 and 120 or char_length(v_summary)>280 or char_length(v_description) not between 1 and 5000
    or p_category not in ('landsmote','kurs','samling','mote','digitalt','annet') or char_length(v_place)>200 or char_length(v_price)>60
    or (v_url is not null and (char_length(v_url)>500 or v_url !~ '^https://[^\s]+$')) or (v_place is null and v_url is null)
    or p_audience not in ('public','county','local')
    or (p_capacity is not null and p_capacity not between 1 and 100000) or (p_seats_per_organization is not null and p_seats_per_organization not between 1 and 50) then
    raise exception 'invalid event';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '31 days' or p_starts_at>now()+interval '3 years'
    or ((v_old.id is null or p_starts_at is distinct from v_old.starts_at) and p_starts_at<now())
    or (p_registration_deadline is not null and p_registration_deadline>p_starts_at) then
    raise exception 'invalid event date';
  end if;
  if v_old.id is not null and p_capacity is not null then
    select count(*) into v_registered from event_organization_registrations where event_id=p_event and status in ('registered','attended');
    if p_capacity<v_registered then raise exception 'capacity below registrations'; end if;
  end if;
  if v_old.id is null then
    insert into events(organizer_id,created_by,title,summary,description,category,starts_at,ends_at,place,digital_url,registration_deadline,capacity,
      seats_per_organization,price_label,audience,status)
    values(p_organizer,auth.uid(),v_title,v_summary,v_description,p_category,p_starts_at,p_ends_at,v_place,v_url,p_registration_deadline,p_capacity,
      p_seats_per_organization,v_price,p_audience,p_status) returning id into v_id;
    insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
      values(auth.uid(),p_organizer,'event.created','event',v_id::text,jsonb_build_object('title',v_title,'status',p_status));
  else
    v_id:=p_event;
    update events set title=v_title,summary=v_summary,description=v_description,category=p_category,starts_at=p_starts_at,ends_at=p_ends_at,place=v_place,
      digital_url=v_url,registration_deadline=p_registration_deadline,capacity=p_capacity,seats_per_organization=p_seats_per_organization,price_label=v_price,
      audience=p_audience,status=p_status where id=p_event;
    insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
      values(auth.uid(),p_organizer,case when v_old.status='draft' and p_status='published' then 'event.published' else 'event.updated' end,'event',v_id::text,jsonb_build_object('title',v_title));
  end if;
  return v_id;
end $$;

-- Avlyse eller avslutte. Avlysning varsler delegatene. Et avsluttet arrangement må ha startet.
create or replace function public.set_event_status(p_event uuid,p_status event_status) returns void language plpgsql security definer set search_path=public as $$
declare e events;
begin
  select * into e from events where id=p_event for update;
  if not found then raise exception 'event not found'; end if;
  if not public.can_organize_events(e.organizer_id) then raise exception 'not authorized'; end if;
  if p_status='cancelled' then
    if e.status not in ('draft','published') then raise exception 'invalid status'; end if;
  elsif p_status='completed' then
    if e.status<>'published' or e.starts_at>now() then raise exception 'invalid status'; end if;
  else
    raise exception 'invalid status';
  end if;
  update events set status=p_status where id=p_event;
  if p_status='cancelled' then
    insert into notifications(user_id,type,title,body,link)
      select d.user_id,'event.cancelled','Arrangementet er avlyst',e.title||' er avlyst.','#/arrangementer/'||e.id
      from event_delegates d join event_organization_registrations r on r.id=d.registration_id
      where r.event_id=p_event and d.status in ('invited','confirmed');
  end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),e.organizer_id,'event.'||p_status::text,'event',p_event::text,jsonb_build_object('title',e.title));
end $$;

-- Bildet lastes opp til public-content/<arrangør>/events/<arrangement>/ (storage-regelen organization_media_upload),
-- og omkodes i nettleseren først (EXIF og GPS fjernes). Returnerer forrige sti, så klienten kan slette den.
create or replace function public.set_event_image(p_event uuid,p_path text default null) returns text language plpgsql security definer set search_path=public as $$
declare e events;
begin
  select * into e from events where id=p_event for update;
  if not found then raise exception 'event not found'; end if;
  if not public.can_organize_events(e.organizer_id) then raise exception 'not authorized'; end if;
  if p_path is not null and (p_path not like e.organizer_id::text||'/events/'||e.id::text||'/%' or p_path like '%..%'
    or not exists(select 1 from storage.objects where bucket_id='public-content' and name=p_path)) then
    raise exception 'invalid image';
  end if;
  update events set image_path=p_path where id=p_event;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),e.organizer_id,'event.image_changed','event',p_event::text,jsonb_build_object('title',e.title));
  return e.image_path;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Interesse og påmelding
-- ---------------------------------------------------------------------------
-- Personlig interesse. Krever bare innlogging. Kan fjernes når som helst.
create or replace function public.set_event_interest(p_event uuid,p_interested boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_interested then
    if not exists(select 1 from events where id=p_event and status='published' and ends_at>now()) then raise exception 'event closed'; end if;
    insert into event_interests(event_id,user_id) values(p_event,auth.uid()) on conflict do nothing;
  else
    delete from event_interests where event_id=p_event and user_id=auth.uid();
  end if;
end $$;

-- Påmelding av organisasjonen. Er arrangementet fullt, havner organisasjonen på venteliste. Avmelding fjerner
-- delegatene som ikke har deltatt, og gir plassen til den første på ventelisten.
create or replace function public.register_for_event(p_event uuid,p_org uuid,p_register boolean) returns text language plpgsql security definer set search_path=public as $$
declare e events; r event_organization_registrations; v_count int; v_status text; v_next event_organization_registrations;
begin
  if not public.can_register_for(p_org) then raise exception 'not authorized'; end if;
  select * into e from events where id=p_event for update;
  if not found or e.status not in ('published','completed','cancelled') then raise exception 'event not found'; end if;
  select * into r from event_organization_registrations where event_id=p_event and organization_id=p_org for update;
  if p_register then
    if e.status<>'published' or e.starts_at<=now() or (e.registration_deadline is not null and e.registration_deadline<=now()) then raise exception 'event closed'; end if;
    if not public.event_audience_allows(p_event,p_org) then raise exception 'outside audience'; end if;
    if r.status in ('registered','waitlisted','attended') then return r.status; end if;
    select count(*) into v_count from event_organization_registrations where event_id=p_event and status in ('registered','attended');
    v_status:=case when e.capacity is not null and v_count>=e.capacity then 'waitlisted' else 'registered' end;
    insert into event_organization_registrations(event_id,organization_id,registered_by,status) values(p_event,p_org,auth.uid(),v_status)
      on conflict (event_id,organization_id) do update set status=v_status,registered_by=auth.uid(),created_at=now();
    insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
      values(auth.uid(),p_org,case v_status when 'waitlisted' then 'event.waitlisted' else 'event.registered' end,'event',p_event::text,jsonb_build_object('title',e.title));
    return v_status;
  end if;
  if r.id is null or r.status='cancelled' then return 'cancelled'; end if;
  if r.status='attended' or e.status<>'published' or e.starts_at<=now() then raise exception 'event closed'; end if;
  update event_organization_registrations set status='cancelled' where id=r.id;
  delete from event_delegates where registration_id=r.id and status in ('invited','confirmed','declined');
  if r.status='registered' and e.capacity is not null then
    select * into v_next from event_organization_registrations where event_id=p_event and status='waitlisted' order by created_at limit 1 for update;
    if v_next.id is not null then
      update event_organization_registrations set status='registered' where id=v_next.id;
      insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
        values(auth.uid(),v_next.organization_id,'event.registered','event',p_event::text,jsonb_build_object('title',e.title,'from_waitlist',true));
    end if;
  end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,'event.unregistered','event',p_event::text,jsonb_build_object('title',e.title));
  return 'cancelled';
end $$;

-- Erstatter versjonen fra prompt 1/2: «Interessert» er nå personlig, og «Skal» er påmelding av organisasjonen.
create or replace function public.set_event_response(p_event uuid,p_organization uuid,p_response text) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_response not in ('going','interested','none') then raise exception 'invalid response'; end if;
  if p_response='going' then perform public.register_for_event(p_event,p_organization,true);
  elsif p_response='interested' then perform public.set_event_interest(p_event,true);
  else
    perform public.set_event_interest(p_event,false);
    if public.can_register_for(p_organization) then perform public.register_for_event(p_event,p_organization,false); end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Delegater
-- ---------------------------------------------------------------------------
-- Personer som kan meldes på som delegat for organisasjonen. Bare navn og verv, ingen e-post.
create or replace function public.list_delegate_candidates(p_registration uuid,p_query text default '')
returns table (id uuid,display_name text,office_title text)
language plpgsql stable security definer set search_path=public as $$
declare r event_organization_registrations; v_query text:=lower(trim(coalesce(p_query,'')));
begin
  select * into r from event_organization_registrations where event_organization_registrations.id=p_registration;
  if not found or not public.can_register_for(r.organization_id) then raise exception 'not authorized'; end if;
  return query
  select p.id,p.display_name,(select m.public_title from memberships m where m.user_id=p.id and m.organization_id=r.organization_id and m.status='active'
      and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date) order by m.start_date limit 1)
  from profiles p
  where public.can_be_delegate(r.organization_id,p.id)
    and (v_query='' or position(v_query in lower(p.display_name))>0)
    and not exists(select 1 from event_delegates d where d.registration_id=r.id and d.user_id=p.id and d.status<>'declined')
  order by p.display_name
  limit 20;
end $$;

-- Melder på en delegat. Personen varsles og må bekrefte selv. Plassene per organisasjon gjelder alle som ikke har takket nei.
create or replace function public.add_event_delegate(p_registration uuid,p_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r event_organization_registrations; e events; v_id uuid; v_used int; v_title text; v_org text;
begin
  select * into r from event_organization_registrations where id=p_registration for update;
  if not found or not public.can_register_for(r.organization_id) then raise exception 'not authorized'; end if;
  if r.status not in ('registered','waitlisted') then raise exception 'registration not active'; end if;
  select * into e from events where id=r.event_id for update;
  if e.status<>'published' or e.starts_at<=now() then raise exception 'event closed'; end if;
  if not public.can_be_delegate(r.organization_id,p_user) then raise exception 'person not eligible'; end if;
  if exists(select 1 from event_delegates where registration_id=r.id and user_id=p_user and status<>'declined') then raise exception 'delegate already added'; end if;
  select count(*) into v_used from event_delegates where registration_id=r.id and status<>'declined';
  if e.seats_per_organization is not null and v_used>=e.seats_per_organization then raise exception 'no seats left'; end if;
  select m.public_title into v_title from memberships m where m.user_id=p_user and m.organization_id=r.organization_id and m.status='active'
    and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date) order by m.start_date limit 1;
  insert into event_delegates(registration_id,user_id,status,notified_at,invited_by,office_title) values(r.id,p_user,'invited',now(),auth.uid(),v_title)
    on conflict (registration_id,user_id) do update set status='invited',notified_at=now(),invited_by=auth.uid(),office_title=excluded.office_title,responded_at=null,confirmed_at=null
    returning id into v_id;
  select name into v_org from organizations where id=r.organization_id;
  insert into notifications(user_id,type,title,body,link)
    values(p_user,'event.delegate_invited','Du er meldt på som delegat',v_org||' har meldt deg på '||e.title||'. Bekreft om du kommer.','#/arrangementer/'||e.id);
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),r.organization_id,'event.delegate_added','event_delegate',v_id::text,jsonb_build_object('user_id',p_user,'title',e.title));
  return v_id;
end $$;

-- Fjerner en delegat før arrangementet. Deltakelse som er bekreftet av arrangøren, kan ikke fjernes.
create or replace function public.remove_event_delegate(p_delegate uuid) returns void language plpgsql security definer set search_path=public as $$
declare d event_delegates; r event_organization_registrations; e events;
begin
  select * into d from event_delegates where id=p_delegate for update;
  if not found then raise exception 'delegate not found'; end if;
  select * into r from event_organization_registrations where id=d.registration_id;
  if not public.can_register_for(r.organization_id) then raise exception 'not authorized'; end if;
  select * into e from events where id=r.event_id;
  if d.status in ('attended','absent') or e.starts_at<=now() then raise exception 'event closed'; end if;
  delete from event_delegates where id=p_delegate;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),r.organization_id,'event.delegate_removed','event_delegate',p_delegate::text,jsonb_build_object('user_id',d.user_id,'title',e.title));
end $$;

-- Delegaten bekrefter eller takker nei selv, frem til arrangementet starter.
create or replace function public.respond_event_delegation(p_delegate uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$
declare d event_delegates; r event_organization_registrations; e events; v_used int;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into d from event_delegates where id=p_delegate for update;
  if not found or d.user_id<>auth.uid() then raise exception 'delegate not found'; end if;
  select * into r from event_organization_registrations where id=d.registration_id;
  select * into e from events where id=r.event_id;
  if d.status not in ('invited','confirmed','declined') or r.status not in ('registered','waitlisted') or e.status<>'published' or e.starts_at<=now() then raise exception 'event closed'; end if;
  if p_accept and d.status='declined' then
    select count(*) into v_used from event_delegates where registration_id=r.id and status<>'declined';
    if e.seats_per_organization is not null and v_used>=e.seats_per_organization then raise exception 'no seats left'; end if;
  end if;
  update event_delegates set status=case when p_accept then 'confirmed' else 'declined' end,responded_at=now(),
    confirmed_at=case when p_accept then now() end where id=p_delegate;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),r.organization_id,case when p_accept then 'event.delegate_confirmed' else 'event.delegate_declined' end,'event_delegate',p_delegate::text,
      jsonb_build_object('user_id',d.user_id,'title',e.title));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Bekreftet deltakelse (grunnlaget for CV)
-- ---------------------------------------------------------------------------
-- Arrangøren bekrefter oppmøte etter at arrangementet har startet. Bare delegater som har bekreftet selv, kan
-- registreres. Påmeldingen får status «attended» når minst én delegat har møtt. Erstatter versjonen fra prompt 1,
-- der organisasjonen selv kunne bekrefte deltakelse på egen CV.
create or replace function public.confirm_event_attendance(p_delegate uuid,p_attended boolean) returns void language plpgsql security definer set search_path=public as $$
declare d event_delegates; r event_organization_registrations; e events;
begin
  select * into d from event_delegates where id=p_delegate for update;
  if not found then raise exception 'delegate not found'; end if;
  select * into r from event_organization_registrations where id=d.registration_id for update;
  select * into e from events where id=r.event_id;
  if not public.can_organize_events(e.organizer_id) then raise exception 'not authorized'; end if;
  if e.status not in ('published','completed') or e.starts_at>now() then raise exception 'event not started'; end if;
  if d.status not in ('confirmed','attended','absent') then raise exception 'delegate not confirmed'; end if;
  update event_delegates set status=case when p_attended then 'attended' else 'absent' end,attendance_confirmed_by=auth.uid(),attendance_confirmed_at=now() where id=p_delegate;
  update event_organization_registrations set status=case when exists(select 1 from event_delegates x where x.registration_id=r.id and x.status='attended') then 'attended' else 'registered' end
    where id=r.id and status in ('registered','attended');
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),e.organizer_id,'event.attendance_confirmed','event_delegate',p_delegate::text,jsonb_build_object('user_id',d.user_id,'attended',p_attended,'title',e.title));
end $$;

-- Bekrefter oppmøte for alle delegater som har bekreftet selv og ikke er registrert ennå. Returnerer antallet.
create or replace function public.confirm_all_event_attendance(p_event uuid) returns int language plpgsql security definer set search_path=public as $$
declare e events; v_count int;
begin
  select * into e from events where id=p_event for update;
  if not found then raise exception 'event not found'; end if;
  if not public.can_organize_events(e.organizer_id) then raise exception 'not authorized'; end if;
  if e.status not in ('published','completed') or e.starts_at>now() then raise exception 'event not started'; end if;
  with updated as (
    update event_delegates d set status='attended',attendance_confirmed_by=auth.uid(),attendance_confirmed_at=now()
    from event_organization_registrations r where r.id=d.registration_id and r.event_id=p_event and r.status in ('registered','attended') and d.status='confirmed'
    returning d.registration_id)
  select count(*) into v_count from updated;
  update event_organization_registrations r set status='attended' where r.event_id=p_event and r.status='registered'
    and exists(select 1 from event_delegates x where x.registration_id=r.id and x.status='attended');
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),e.organizer_id,'event.attendance_confirmed','event',p_event::text,jsonb_build_object('count',v_count,'title',e.title));
  return v_count;
end $$;

-- Alt brukeren trenger på arrangementsiden: egen interesse, egne delegatinvitasjoner, organisasjonene brukeren
-- kan melde på (med delegater), og for arrangøren påmeldingene med delegater for oppmøte.
create or replace function public.get_event_participation(p_event uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e events; v_orgs jsonb; v_invites jsonb; v_attendance jsonb;
begin
  select * into e from events where id=p_event;
  if not found or (e.status='draft' and not public.can_manage_event(p_event)) then raise exception 'event not found'; end if;
  if auth.uid() is null or not public.is_active_user() then
    return jsonb_build_object('interested',false,'can_edit',false,'invitations','[]'::jsonb,'organizations','[]'::jsonb,'attendance',null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('delegate_id',d.id,'registration_id',r.id,'organization_id',o.id,'organization_name',o.name,'status',d.status,
      'office_title',d.office_title,'registration_status',r.status) order by o.name),'[]'::jsonb) into v_invites
    from event_delegates d join event_organization_registrations r on r.id=d.registration_id and r.event_id=p_event join organizations o on o.id=r.organization_id
    where d.user_id=auth.uid() and r.status<>'cancelled';
  select coalesce(jsonb_agg(jsonb_build_object('organization_id',o.id,'organization_name',o.name,'type',o.type,
      'allowed',public.event_audience_allows(p_event,o.id),'registration_id',r.id,'status',r.status,
      'delegates',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'user_id',d.user_id,'display_name',p.display_name,'status',d.status,'office_title',d.office_title)
        order by p.display_name),'[]'::jsonb) from event_delegates d join profiles p on p.id=d.user_id where d.registration_id=r.id))
      order by case o.type when 'school' then 0 when 'local_board' then 1 when 'county_board' then 2 else 3 end,o.name),'[]'::jsonb) into v_orgs
    from organizations o left join event_organization_registrations r on r.event_id=p_event and r.organization_id=o.id
    where o.status='active' and public.can_register_for(o.id) and (
      exists(select 1 from role_grants g where g.user_id=auth.uid() and g.organization_id=o.id and g.role in ('content_manager','school_admin','board_admin')
        and g.status='active' and g.start_date<=current_date and (g.end_date is null or g.end_date>=current_date))
      or (o.type='local_board' and exists(select 1 from role_grants g join organizations cb on cb.id=g.organization_id and cb.type='county_board' and cb.county=o.county
        where g.user_id=auth.uid() and g.role='board_admin' and g.status='active' and g.start_date<=current_date and (g.end_date is null or g.end_date>=current_date))));
  if public.can_manage_event(p_event) then
    select coalesce(jsonb_agg(jsonb_build_object('registration_id',r.id,'organization_id',o.id,'organization_name',o.name,'status',r.status,
        'delegates',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'user_id',d.user_id,'display_name',p.display_name,'status',d.status,'office_title',d.office_title)
          order by p.display_name),'[]'::jsonb) from event_delegates d join profiles p on p.id=d.user_id where d.registration_id=r.id))
        order by r.status='waitlisted',o.name),'[]'::jsonb) into v_attendance
      from event_organization_registrations r join organizations o on o.id=r.organization_id
      where r.event_id=p_event and r.status in ('registered','waitlisted','attended');
  end if;
  return jsonb_build_object(
    'interested',exists(select 1 from event_interests i where i.event_id=p_event and i.user_id=auth.uid()),
    'can_edit',public.can_manage_event(p_event),
    'invitations',v_invites,'organizations',v_orgs,'attendance',v_attendance);
end $$;

-- ---------------------------------------------------------------------------
-- 8. CV (§8)
-- ---------------------------------------------------------------------------
-- Personens CV: offentlige verv (aktive og tidligere) og arrangementer der arrangøren har bekreftet oppmøte.
-- Én stjerne per bekreftet deltakelse på Elevtinget (landsmøte arrangert av EO nasjonalt). Interne rettigheter
-- vises aldri. Deaktiverte personer vises bare for seg selv. Egne ubesvarte invitasjoner vises bare for personen selv.
create or replace function public.get_person_cv(p_user uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p profiles; v_school text; v_self boolean:=auth.uid() is not null and auth.uid()=p_user;
begin
  select * into p from profiles where id=p_user;
  if not found or (p.status<>'active' and not v_self) then return null; end if;
  select coalesce(school_name,name) into v_school from organizations where id=p.current_school_id;
  return jsonb_build_object(
    'id',p.id,'display_name',p.display_name,'avatar_path',p.avatar_path,'school_name',v_school,'active',p.status='active',
    'offices',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'organization_id',o.id,'organization_name',o.name,'title',m.public_title,
        'start_date',m.start_date,'end_date',m.end_date,'active',m.status='active' and (m.end_date is null or m.end_date>=current_date))
        order by m.status<>'active',m.start_date desc),'[]'::jsonb)
      from memberships m join organizations o on o.id=m.organization_id and o.status in ('active','deactivated')
      where m.user_id=p.id and m.public_title is not null and m.status in ('active','ended') and m.start_date<=current_date),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('event_id',e.id,'title',e.title,'starts_at',e.starts_at,'category',e.category,
        'organizer_name',og.name,'organization_id',o.id,'organization_name',o.name,'office_title',d.office_title,
        'elevtinget',e.category='landsmote' and og.type='national') order by e.starts_at desc),'[]'::jsonb)
      from event_delegates d join event_organization_registrations r on r.id=d.registration_id join events e on e.id=r.event_id
      join organizations o on o.id=r.organization_id join organizations og on og.id=e.organizer_id
      where d.user_id=p.id and d.status='attended' and e.status in ('published','completed')),
    'invitations',case when v_self then (select coalesce(jsonb_agg(jsonb_build_object('delegate_id',d.id,'event_id',e.id,'title',e.title,'starts_at',e.starts_at,
        'organization_name',o.name,'status',d.status) order by e.starts_at),'[]'::jsonb)
      from event_delegates d join event_organization_registrations r on r.id=d.registration_id and r.status in ('registered','waitlisted')
      join events e on e.id=r.event_id and e.status='published' and e.starts_at>now() join organizations o on o.id=r.organization_id
      where d.user_id=p.id and d.status in ('invited','confirmed')) else '[]'::jsonb end);
end $$;

-- Skolens (eller styrets) CV: arrangementer organisasjonen har deltatt på, hvem som representerte den, og vervet
-- de hadde. Deaktiverte personer vises uten navn og uten lenke, som «Tidligere tillitsvalgt».
create or replace function public.get_organization_cv(p_org uuid)
returns table (event_id uuid,title text,starts_at timestamptz,category text,organizer_name text,elevtinget boolean,user_id uuid,display_name text,office_title text)
language sql stable security definer set search_path=public as $$
  select e.id,e.title,e.starts_at,e.category,og.name,e.category='landsmote' and og.type='national',
    case when p.status='active' then p.id end,case when p.status='active' then p.display_name else 'Tidligere tillitsvalgt' end,d.office_title
  from event_organization_registrations r join organizations o on o.id=r.organization_id and o.status in ('active','deactivated')
  join events e on e.id=r.event_id and e.status in ('published','completed') join organizations og on og.id=e.organizer_id
  join event_delegates d on d.registration_id=r.id and d.status='attended' join profiles p on p.id=d.user_id
  where r.organization_id=p_org
  order by e.starts_at desc,p.display_name
  limit 500;
$$;

-- ---------------------------------------------------------------------------
-- 9. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.can_organize_events(uuid),public.can_manage_event(uuid),public.can_register_for(uuid),public.event_audience_allows(uuid,uuid),
  public.is_event_participant(uuid),public.can_be_delegate(uuid,uuid),public.list_events(),public.list_my_event_organizers(),
  public.save_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text,timestamptz,int,int,text,audience_type,event_status),
  public.set_event_status(uuid,event_status),public.set_event_image(uuid,text),public.set_event_interest(uuid,boolean),public.register_for_event(uuid,uuid,boolean),
  public.set_event_response(uuid,uuid,text),public.list_delegate_candidates(uuid,text),public.add_event_delegate(uuid,uuid),public.remove_event_delegate(uuid),
  public.respond_event_delegation(uuid,boolean),public.confirm_event_attendance(uuid,boolean),public.confirm_all_event_attendance(uuid),
  public.get_event_participation(uuid),public.get_person_cv(uuid),public.get_organization_cv(uuid) from public,anon;
grant execute on function public.can_organize_events(uuid),public.can_manage_event(uuid),public.can_register_for(uuid),public.event_audience_allows(uuid,uuid),
  public.is_event_participant(uuid),public.can_be_delegate(uuid,uuid),public.list_events(),public.list_my_event_organizers(),
  public.save_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text,timestamptz,int,int,text,audience_type,event_status),
  public.set_event_status(uuid,event_status),public.set_event_image(uuid,text),public.set_event_interest(uuid,boolean),public.register_for_event(uuid,uuid,boolean),
  public.set_event_response(uuid,uuid,text),public.list_delegate_candidates(uuid,text),public.add_event_delegate(uuid,uuid),public.remove_event_delegate(uuid),
  public.respond_event_delegation(uuid,boolean),public.confirm_event_attendance(uuid,boolean),public.confirm_all_event_attendance(uuid),
  public.get_event_participation(uuid),public.get_person_cv(uuid),public.get_organization_cv(uuid) to authenticated;
-- Offentlig lesing (§1): arrangementer og CV for personer og skoler. get_event_participation svarer tomt uten innlogging.
grant execute on function public.list_events(),public.get_person_cv(uuid),public.get_organization_cv(uuid),public.get_event_participation(uuid) to anon;

-- Prompt 3: innlogging, profiler og offentlig lesing (docs/PROMPTPLAN.md, KRAVSPEC §1, §3, §10, §17).
-- Profilen opprettes ved onboarding, profilfelt endres bare via RPC-er, skolebytte beholder historikken,
-- og offentlige sider kan leses uten innlogging via smale, sikre projeksjoner.

-- ---------------------------------------------------------------------------
-- 1. Profiler: bare tillatte felt kan endres direkte (§10, §17)
-- ---------------------------------------------------------------------------
-- profiles_self_update lot brukeren endre alle kolonner i egen profil, også status og skole.
-- Nå endres profilen via update_profile, set_avatar, change_school og complete_onboarding.
drop policy profiles_self_update on public.profiles;

-- Administratorregelen (profiles_admin_update) står til prompt 12, men kan bare endre navn og bilde.
-- Status, skole, e-post og representasjon endres bare av serverfunksjoner (som kjører som eier).
create or replace function public.guard_profile_update() returns trigger language plpgsql set search_path=public as $$ begin
  if current_user::text not in ('authenticated','anon') then return new; end if;
  if new.id is distinct from old.id or new.email is distinct from old.email or new.status is distinct from old.status
    or new.deactivated_by_user is distinct from old.deactivated_by_user or new.current_school_id is distinct from old.current_school_id
    or new.active_membership_id is distinct from old.active_membership_id or new.created_at is distinct from old.created_at then
    raise exception 'field requires server function';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- 2. Skolehistorikk: skolebytte på egen hånd uten at historikken forsvinner (§1, §3)
-- ---------------------------------------------------------------------------
create table public.profile_school_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.organizations(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at>=started_at)
);
create unique index profile_school_history_one_current on public.profile_school_history(user_id) where ended_at is null;
alter table public.profile_school_history enable row level security;
alter table public.profile_school_history force row level security;
-- Brukeren ser sin egen historikk. Skrives bare av complete_onboarding og change_school.
create policy school_history_own_read on public.profile_school_history for select to authenticated using (user_id=auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Økt: hvem er innlogget, og hvilke organisasjoner kan brukeren representere (§3)
-- ---------------------------------------------------------------------------
-- Publiseringsretten regnes ut her fra levende rettigheter, ikke i klienten og ikke fra JWT (§17).
create or replace function public.get_my_session() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_profile profiles; v_email text;
begin
  if auth.uid() is null then return jsonb_build_object('status','anonymous'); end if;
  select * into v_profile from profiles where id=auth.uid();
  if not found then
    select email into v_email from auth.users where id=auth.uid();
    return jsonb_build_object('status','onboarding','email',coalesce(v_email,''));
  end if;
  return jsonb_build_object(
    'status',case when v_profile.status='active' then 'active' else 'deactivated' end,
    'profile',jsonb_build_object('id',v_profile.id,'display_name',v_profile.display_name,'email',v_profile.email,
      'avatar_path',v_profile.avatar_path,'current_school_id',v_profile.current_school_id),
    'active_membership_id',v_profile.active_membership_id,
    'representations',coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'organization_id',o.id,'name',o.name,'type',o.type,
        'public_title',coalesce(m.public_title,''),
        'can_publish',public.has_role(o.id,array['content_manager','school_admin','board_admin']::admin_role[]))
        order by case o.type when 'school' then 0 when 'local_board' then 1 when 'county_board' then 2 else 3 end,o.name)
      from memberships m join organizations o on o.id=m.organization_id and o.status='active'
      where m.user_id=v_profile.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
    ),'[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Onboarding: profilen opprettes når brukeren har valgt skole og navn (§3)
-- ---------------------------------------------------------------------------
-- Erstatter versjonen med valgmåned. Nå oppgis dato for neste valg, som er det skolen trenger
-- for påminnelser om styreoverføring (§5). En eksisterende valgplan overskrives aldri herfra.
drop function public.complete_onboarding(uuid,text,smallint);
create function public.complete_onboarding(p_school uuid,p_display_name text,p_next_election date default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_profile profiles; v_email text;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if char_length(trim(coalesce(p_display_name,''))) not between 2 and 120 then raise exception 'invalid name'; end if;
  if not exists (select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'school not found'; end if;
  if p_next_election is not null and (p_next_election<current_date or p_next_election>current_date+730) then raise exception 'invalid election date'; end if;
  select * into v_profile from profiles where id=auth.uid();
  if found then
    if v_profile.status<>'active' then raise exception 'not authorized'; end if;
    if v_profile.current_school_id is not null then raise exception 'already onboarded'; end if;
    update profiles set display_name=trim(p_display_name),current_school_id=p_school where id=auth.uid();
  else
    select email into v_email from auth.users where id=auth.uid();
    insert into profiles(id,display_name,email,current_school_id) values(auth.uid(),trim(p_display_name),coalesce(v_email,''),p_school);
  end if;
  insert into profile_school_history(user_id,school_id) values(auth.uid(),p_school);
  if p_next_election is not null then
    insert into election_schedules(organization_id,expected_handover_on,updated_by) values(p_school,p_next_election,auth.uid())
    on conflict (organization_id) do nothing;
  end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),p_school,'profile.onboarded','profile',auth.uid()::text);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Profilredigering og profilbilde (§10, §11)
-- ---------------------------------------------------------------------------
create or replace function public.update_profile(p_display_name text) returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if char_length(trim(coalesce(p_display_name,''))) not between 2 and 120 then raise exception 'invalid name'; end if;
  update profiles set display_name=trim(p_display_name) where id=auth.uid();
end $$;

-- Bildet lastes opp til public-avatars/<bruker-id>/ først (storage-reglene under), deretter pekes profilen dit.
-- null fjerner profilbildet. Returnerer forrige sti, så klienten kan slette den gamle filen.
create or replace function public.set_avatar(p_path text default null) returns text language plpgsql security definer set search_path=public as $$
declare v_previous text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_path is not null and (
    p_path !~ ('^'||auth.uid()::text||'/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$')
    or not exists (select 1 from storage.objects where bucket_id='public-avatars' and name=p_path)) then
    raise exception 'invalid avatar';
  end if;
  select avatar_path into v_previous from profiles where id=auth.uid();
  update profiles set avatar_path=p_path where id=auth.uid();
  return v_previous;
end $$;

create policy own_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id='public-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 6. Skolebytte (§1, §3)
-- ---------------------------------------------------------------------------
-- Brukeren kan selv velge ny skole. Verv og rettigheter ved gammel skole avsluttes med sluttdato og
-- beholdes som historikk. Ingen rettigheter følger med til ny skole. Er brukeren siste skoleadministrator
-- ved gammel skole, må administratorrollen overføres først.
create or replace function public.change_school(p_school uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_old uuid; v_created timestamptz; v_today date:=current_date;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if not exists (select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'school not found'; end if;
  select current_school_id,created_at into v_old,v_created from profiles where id=auth.uid() for update;
  if v_old=p_school then raise exception 'same school'; end if;
  if v_old is not null then
    if exists (select 1 from role_grants r where r.user_id=auth.uid() and r.organization_id=v_old and r.role='school_admin' and r.status='active'
                 and r.start_date<=v_today and (r.end_date is null or r.end_date>=v_today))
       and not exists (select 1 from role_grants r where r.user_id<>auth.uid() and r.organization_id=v_old and r.role='school_admin' and r.status='active'
                 and r.start_date<=v_today and (r.end_date is null or r.end_date>=v_today)) then
      raise exception 'last school administrator';
    end if;
    update memberships set status='ended',end_date=greatest(start_date,v_today)
      where user_id=auth.uid() and organization_id=v_old and status in ('active','invited') and (end_date is null or end_date>=v_today);
    update role_grants set status='ended',end_date=greatest(start_date,v_today)
      where user_id=auth.uid() and organization_id=v_old and status in ('active','invited') and (end_date is null or end_date>=v_today);
    -- Profiler fra før historikken fantes får en rad for gammel skole.
    if not exists (select 1 from profile_school_history where user_id=auth.uid() and ended_at is null) then
      insert into profile_school_history(user_id,school_id,started_at) values(auth.uid(),v_old,v_created);
    end if;
    update profile_school_history set ended_at=now() where user_id=auth.uid() and ended_at is null;
  end if;
  update profiles set current_school_id=p_school,
    active_membership_id=case when active_membership_id in (select id from memberships where user_id=auth.uid() and status='active') then active_membership_id end
    where id=auth.uid();
  insert into profile_school_history(user_id,school_id) values(auth.uid(),p_school);
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_school,'profile.school_changed','profile',auth.uid()::text,jsonb_build_object('from',v_old,'to',p_school));
end $$;

-- Egen skolehistorikk med skolenavn, også for skoler som senere er deaktivert.
create or replace function public.get_my_school_history()
returns table (school_id uuid,school_name text,county text,started_at timestamptz,ended_at timestamptz)
language sql stable security definer set search_path=public as $$
  select h.school_id,coalesce(o.school_name,o.name),o.county,h.started_at,h.ended_at
  from profile_school_history h join organizations o on o.id=h.school_id
  where h.user_id=auth.uid()
  order by h.ended_at is not null,h.started_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. Offentlig lesing uten innlogging (§1)
-- ---------------------------------------------------------------------------
-- Aktive organisasjoner med offentlige felt og tall. Ingen interne roller eller private data.
create or replace function public.list_public_organizations()
returns table (id uuid,type organization_type,name text,school_name text,slug text,county text,local_board_id uuid,local_board_name text,
  school_level text,status organization_status,bio text,contact_email text,student_count int,member_count int,follower_count int,
  following boolean,officer_count int,priorities_heading text,priorities jsonb)
language sql stable security definer set search_path=public as $$
  select o.id,o.type,o.name,o.school_name,o.slug,o.county,o.local_board_id,lb.name,o.school_level,o.status,o.bio,o.contact_email,o.student_count,
    case o.type
      when 'national' then (select count(*)::int from organizations s where s.type='school' and s.status='active')
      when 'county_board' then (select count(*)::int from organizations s where s.type='school' and s.status='active' and s.county=o.county)
      when 'local_board' then (select count(*)::int from organizations s where s.type='school' and s.status='active' and s.local_board_id=o.id)
    end,
    (select count(*)::int from follows f join profiles p on p.id=f.user_id and p.status='active' where f.organization_id=o.id),
    auth.uid() is not null and exists(select 1 from follows f where f.organization_id=o.id and f.user_id=auth.uid()),
    (select count(*)::int from memberships m join profiles p on p.id=m.user_id and p.status='active'
      where m.organization_id=o.id and m.status='active' and m.public_title is not null and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),
    o.priorities_heading,
    (select jsonb_agg(jsonb_build_object('id',pr.id,'title',pr.title,'description',pr.description) order by pr.position)
      from organization_priorities pr where pr.organization_id=o.id)
  from organizations o left join organizations lb on lb.id=o.local_board_id
  where o.status='active'
  order by case o.type when 'national' then 0 when 'county_board' then 1 when 'local_board' then 2 else 3 end,o.name;
$$;

-- Rangeringen fra prompt 2 returnerte setof posts med en fast kolonneliste. Etter at posts fikk
-- search_vector stemte ikke listen lenger, og funksjonen feilet. Nå returnerer den bare innlegg og poeng,
-- og get_post_cards henter resten. Rangeringen er den samme.
drop function public.get_ranked_feed(uuid,text);
create function public.get_ranked_feed(p_representation_id uuid,p_mode text default 'recommended')
returns table (post_id uuid,score double precision)
language sql stable security definer set search_path=public as $$
  with context as (select m.organization_id,o.county,o.local_board_id,o.school_level from memberships m join organizations o on o.id=m.organization_id where m.id=p_representation_id and m.user_id=auth.uid() and m.status='active'), ranked as (
    select p.id,p.published_at,(case when p.priority then 120 else 0 end
      + case when po.local_board_id=c.local_board_id and c.local_board_id is not null then 45 when po.county=c.county then 30 else 0 end
      + case when f.organization_id is not null then 40 else 0 end
      + case when (po.school_level=c.school_level or p.school_level_target=c.school_level) and c.school_level is not null then 12 else 0 end
      + greatest(0,36-extract(epoch from(now()-p.published_at))/3600)
      + least(30,(select count(*) from reactions r where r.post_id=p.id)+(select count(*) from comments cm where cm.post_id=p.id))*.2)::double precision as score
    from posts p join organizations po on po.id=p.organization_id cross join context c left join follows f on f.organization_id=p.organization_id and f.user_id=auth.uid()
    where public.can_view_post(p,auth.uid()) and (p.school_level_target='both' or c.school_level is null or p.school_level_target=c.school_level)
  ) select r.id,r.score from ranked r order by case when p_mode='chronological' then extract(epoch from r.published_at) else r.score end desc;
$$;

-- Innlegg som kort: avsender, navnet på personen under, tall, kommentarer og avstemning.
-- Synlighet avgjøres av can_view_post for den som spør. Med representasjon brukes rangeringen
-- fra get_ranked_feed, ellers kronologisk. p_organization gir innleggene på en organisasjonsside.
-- Avstemningsresultater vises når innstillingen sier «alltid» eller fristen er ute. Prompt 7 utvider dette.
create or replace function public.get_post_cards(p_representation_id uuid default null,p_mode text default 'chronological',p_organization uuid default null,p_limit int default 50)
returns table (id uuid,organization_id uuid,organization_name text,actor_name text,actor_title text,body text,audience audience_type,
  priority boolean,edited boolean,published_at timestamptz,support_count int,comment_count int,supported boolean,comments jsonb,poll jsonb)
language sql stable security definer set search_path=public as $$
  with ranked as (
    select r.post_id as id,r.ordinality as ord from get_ranked_feed(p_representation_id,coalesce(p_mode,'chronological')) with ordinality as r
    where p_representation_id is not null and auth.uid() is not null
  ), picked as (
    select p.*,coalesce(rk.ord,0) as ord from posts p left join ranked rk on rk.id=p.id
    where public.can_view_post(p,auth.uid()) and p.deleted_at is null
      and (p_organization is null or p.organization_id=p_organization)
      and (p_representation_id is null or p_organization is not null or rk.id is not null)
    order by case when p_representation_id is not null and p_organization is null then coalesce(rk.ord,0) end, p.published_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  )
  select p.id,p.organization_id,o.name,
    (select pr.display_name from profiles pr where pr.id=p.actor_user_id and pr.status='active'),
    (select m.public_title from memberships m where m.user_id=p.actor_user_id and m.organization_id=p.organization_id and m.public_title is not null
      order by (m.status='active') desc,m.start_date desc limit 1),
    p.body,p.audience,p.priority,p.edited_at is not null,p.published_at,
    (select count(*)::int from reactions r where r.post_id=p.id),
    (select count(*)::int from comments c where c.post_id=p.id and c.moderation_status='visible' and c.deleted_at is null),
    auth.uid() is not null and exists(select 1 from reactions r where r.post_id=p.id and r.user_id=auth.uid()),
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'organization_id',c.organization_id,'organization_name',co.name,'created_at',c.created_at,'body',c.body) order by c.created_at)
      from comments c join organizations co on co.id=c.organization_id where c.post_id=p.id and c.moderation_status='visible' and c.deleted_at is null),'[]'::jsonb),
    (select jsonb_build_object('question',pl.question,'closes_at',pl.closes_at,'results_visibility',pl.results_visibility,
       'options',(select jsonb_agg(jsonb_build_object('id',po.id,'label',po.label,
          'votes',case when pl.results_visibility='always' or pl.closes_at<now() then (select count(*)::int from poll_votes v where v.option_id=po.id) else 0 end) order by po.position)
        from poll_options po where po.poll_id=pl.id))
      from polls pl where pl.post_id=p.id)
  from picked p join organizations o on o.id=p.organization_id
  order by p.ord=0, p.ord, p.published_at desc;
$$;

-- Publiserte arrangementer med arrangør og aggregerte tall (samme tall som get_event_engagement).
create or replace function public.list_public_events()
returns table (id uuid,organizer_id uuid,organizer_name text,title text,summary text,description text,category text,starts_at timestamptz,ends_at timestamptz,
  place text,digital boolean,registration_deadline timestamptz,capacity int,price_label text,seats_per_organization int,status event_status,audience audience_type,
  registered int,interested int)
language sql stable security definer set search_path=public as $$
  select e.id,e.organizer_id,o.name,e.title,e.summary,e.description,e.category,e.starts_at,e.ends_at,e.place,e.digital_url is not null,
    e.registration_deadline,e.capacity,e.price_label,e.seats_per_organization,e.status,e.audience,
    (select count(*)::int from event_organization_registrations r where r.event_id=e.id and r.status in ('registered','attended')),
    (select count(*)::int from event_organization_interests i where i.event_id=e.id)
  from events e join organizations o on o.id=e.organizer_id and o.status='active'
  where e.status in ('published','completed')
  order by e.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- 8. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.get_ranked_feed(uuid,text),public.get_my_session(),public.complete_onboarding(uuid,text,date),public.update_profile(text),public.set_avatar(text),
  public.change_school(uuid),public.get_my_school_history(),public.list_public_organizations(),public.get_post_cards(uuid,text,uuid,int),
  public.list_public_events(),public.guard_profile_update() from public,anon;
grant execute on function public.get_ranked_feed(uuid,text),public.get_my_session(),public.complete_onboarding(uuid,text,date),public.update_profile(text),public.set_avatar(text),
  public.change_school(uuid),public.get_my_school_history() to authenticated;
grant execute on function public.get_my_session(),public.list_public_organizations(),public.get_post_cards(uuid,text,uuid,int),public.list_public_events() to anon,authenticated;

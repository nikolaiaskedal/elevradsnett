-- Prompt 2: datamodellen som manglet før piloten (docs/PROMPTPLAN.md, KRAVSPEC §2, §4, §6, §7, §9, §10, §14, §17).
-- Skoleform på innlegg, endringshistorikk, blokkering, forespørsel om skoleadministrator,
-- forespørsler om eksport/sletting, fylkesstyreregelen, bildehierarki med lås, søk og sanntid.

-- ---------------------------------------------------------------------------
-- 1. Rettigheter: fylkesstyreadministrator får samme rettigheter i eget lokallag (§4)
-- ---------------------------------------------------------------------------
-- «Eget lokallag» er lokallaget til brukerens nåværende skole, og bare hvis lokallaget
-- ligger i samme fylke som fylkesstyret. Andre lokallag i fylket gir ingen tilgang.
create or replace function public.has_role(p_org uuid,p_roles admin_role[],p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from role_grants r where r.user_id=p_user and r.organization_id=p_org and r.role=any(p_roles) and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date))
  or exists(select 1 from role_grants r where r.user_id=p_user and r.role='super_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date))
  or ('board_admin'=any(p_roles) and exists(
    select 1 from organizations lb
    join profiles pr on pr.id=p_user
    join organizations s on s.id=pr.current_school_id and s.local_board_id=lb.id
    join organizations cb on cb.type='county_board' and cb.county=lb.county
    join role_grants r on r.organization_id=cb.id and r.user_id=p_user and r.role='board_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
    where lb.id=p_org and lb.type='local_board'));
$$;

-- Styreadministrator har myndighet over skolene i sitt område: lokallaget skolen hører til,
-- eller fylkesstyret i skolens fylke. For andre organisasjoner er det det samme som has_role.
create or replace function public.has_area_role(p_org uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select public.has_role(p_org,array['school_admin','board_admin']::admin_role[],p_user)
  or exists(select 1 from organizations s where s.id=p_org and s.type='school' and (
    (s.local_board_id is not null and public.has_role(s.local_board_id,array['board_admin']::admin_role[],p_user))
    or exists(select 1 from organizations cb where cb.type='county_board' and cb.county=s.county and public.has_role(cb.id,array['board_admin']::admin_role[],p_user))));
$$;
revoke all on function public.has_area_role(uuid,uuid) from public;
grant execute on function public.has_area_role(uuid,uuid) to authenticated;

-- Deaktivering av skole gjøres av skolens egen administrator eller styreadministrator i området.
create or replace function public.deactivate_school(p_school uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$ begin
  if not exists(select 1 from organizations where id=p_school and type='school') then raise exception 'school not found'; end if;
  if not public.has_area_role(p_school) then raise exception 'not authorized'; end if;
  if char_length(trim(p_reason))<10 then raise exception 'documented reason required'; end if;
  update organizations set status='deactivated',deactivation_reason=trim(p_reason) where id=p_school;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),p_school,'school.deactivated','organization',p_school::text,jsonb_build_object('reason',trim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Organisasjoner: felt som bare superadministrator eller serverfunksjoner kan endre (§14, §17)
-- ---------------------------------------------------------------------------
-- organizations_admin_update lar administratorer oppdatere sin egen side. Status, type, geografi,
-- placeholder-merking og bildelåsen endres bare av superadministrator eller via RPC-er
-- (som kjører som eier og derfor ikke som rollen authenticated).
create or replace function public.guard_organization_update() returns trigger language plpgsql set search_path=public as $$ begin
  if current_user::text not in ('authenticated','anon') or public.has_role(new.id,array['super_admin']::admin_role[]) then return new; end if;
  if new.type is distinct from old.type or new.external_id is distinct from old.external_id or new.county is distinct from old.county
    or new.local_board_id is distinct from old.local_board_id or new.status is distinct from old.status
    or new.deactivation_reason is distinct from old.deactivation_reason or new.is_placeholder is distinct from old.is_placeholder
    or new.image_locked is distinct from old.image_locked then
    raise exception 'field requires super administrator';
  end if;
  if old.image_locked and (new.profile_image_path is distinct from old.profile_image_path or new.cover_image_path is distinct from old.cover_image_path) then
    raise exception 'image is locked';
  end if;
  return new;
end $$;
create trigger organizations_guard before update on public.organizations for each row execute function public.guard_organization_update();

-- ---------------------------------------------------------------------------
-- 3. Bildehierarki (§14): eget bilde → lokallag → fylke → global, med lås
-- ---------------------------------------------------------------------------
-- Eget bilde vinner, med mindre superadministrator har låst bildet. Da brukes arvet standard.
-- Standardene fra lokallag og fylke gjelder skolene i området. Styrene selv faller tilbake til global.
-- Kilden returneres så adminpanelet kan vise om bildet er eget eller arvet.
create or replace function public.resolve_organization_images(p_org uuid)
returns table (profile_image_path text, profile_image_source text, cover_image_path text, cover_image_source text)
language sql stable security definer set search_path=public as $$
  with o as (select * from organizations where id=p_org and status='active'),
  candidates as (
    select 1 as prio,'own'::text as source,o.profile_image_path as profile,o.cover_image_path as cover from o where not o.image_locked
    union all select 2,'local_board',lb.default_profile_image_path,lb.default_cover_image_path from o join organizations lb on lb.id=o.local_board_id where o.type='school'
    union all select 3,'county',cb.default_profile_image_path,cb.default_cover_image_path from o join organizations cb on cb.type='county_board' and cb.county=o.county where o.type='school'
    union all select 4,'global',n.default_profile_image_path,n.default_cover_image_path from organizations n where n.type='national' and exists(select 1 from o)
  )
  select (select profile from candidates where profile is not null order by prio limit 1),
         coalesce((select source from candidates where profile is not null order by prio limit 1),'none'),
         (select cover from candidates where cover is not null order by prio limit 1),
         coalesce((select source from candidates where cover is not null order by prio limit 1),'none')
  where exists(select 1 from o);
$$;
revoke all on function public.resolve_organization_images(uuid) from public;
grant execute on function public.resolve_organization_images(uuid) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4. Innlegg: skoleform som målgruppe og endringshistorikk (§7)
-- ---------------------------------------------------------------------------
alter table public.posts add column edited_at timestamptz;

create table public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null,
  audience audience_type not null,
  school_level_target text not null,
  edited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index post_revisions_post_idx on public.post_revisions(post_id,created_at desc);
alter table public.post_revisions enable row level security;
alter table public.post_revisions force row level security;
-- Bare administratorer for organisasjonen ser historikken. Ingen skriver direkte; triggeren gjør det.
create policy post_revisions_admin_read on public.post_revisions for select to authenticated
  using (exists (select 1 from posts p where p.id=post_id and public.has_role(p.organization_id,array['content_manager','school_admin','board_admin']::admin_role[])));

-- Når et publisert innlegg endres, lagres forrige versjon og innlegget merkes som redigert.
create or replace function public.record_post_revision() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if old.status='published' and (new.body is distinct from old.body or new.audience is distinct from old.audience or new.school_level_target is distinct from old.school_level_target) then
    insert into post_revisions(post_id,body,audience,school_level_target,edited_by) values(old.id,old.body,old.audience,old.school_level_target,auth.uid());
    new.edited_at=now();
  end if;
  return new;
end $$;
create trigger posts_record_revision before update on public.posts for each row execute function public.record_post_revision();

-- publish_post får skoleform (vgs, ungdomsskole eller begge).
drop function public.publish_post(uuid,text,audience_type,content_status);
create function public.publish_post(p_organization_id uuid,p_body text,p_audience audience_type,p_status content_status,p_school_level_target text default 'both') returns public.posts language plpgsql security definer set search_path=public as $$ declare result posts; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization_id) or not public.has_role(p_organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_status not in ('draft','published') or char_length(trim(p_body)) not between 1 and 6000 then raise exception 'invalid post'; end if;
  if p_school_level_target not in ('upper_secondary','lower_secondary','both') then raise exception 'invalid school level'; end if;
  insert into posts(organization_id,actor_user_id,body,audience,status,school_level_target,published_at) values(p_organization_id,auth.uid(),trim(p_body),p_audience,p_status,p_school_level_target,case when p_status='published' then now() end) returning * into result;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),p_organization_id,'post.created','post',result.id::text);
  return result;
end $$;

-- Redigering av innlegg. Historikken skrives av triggeren over.
create or replace function public.edit_post(p_post uuid,p_body text,p_audience audience_type,p_school_level_target text default 'both') returns public.posts language plpgsql security definer set search_path=public as $$ declare v_org uuid; result posts; begin
  select organization_id into v_org from posts where id=p_post and status<>'deleted' for update;
  if v_org is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v_org,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if char_length(trim(p_body)) not between 1 and 6000 then raise exception 'invalid post'; end if;
  if p_school_level_target not in ('upper_secondary','lower_secondary','both') then raise exception 'invalid school level'; end if;
  update posts set body=trim(p_body),audience=p_audience,school_level_target=p_school_level_target where id=p_post returning * into result;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),v_org,'post.edited','post',p_post::text);
  return result;
end $$;

-- Feeden: innlegg rettet mot en annen skoleform enn representasjonens vises ikke,
-- og innlegg for samme skoleform får ekstra vekt.
drop function public.get_ranked_feed(uuid,text);
create function public.get_ranked_feed(p_representation_id uuid,p_mode text default 'recommended') returns setof public.posts language sql stable security definer set search_path=public as $$
  with context as (select m.organization_id,o.county,o.local_board_id,o.school_level from memberships m join organizations o on o.id=m.organization_id where m.id=p_representation_id and m.user_id=auth.uid() and m.status='active'), ranked as (
    select p.*,case when p.priority then 120 else 0 end
      + case when po.local_board_id=c.local_board_id and c.local_board_id is not null then 45 when po.county=c.county then 30 else 0 end
      + case when f.organization_id is not null then 40 else 0 end
      + case when (po.school_level=c.school_level or p.school_level_target=c.school_level) and c.school_level is not null then 12 else 0 end
      + greatest(0,36-extract(epoch from(now()-p.published_at))/3600)
      + least(30,(select count(*) from reactions r where r.post_id=p.id)+(select count(*) from comments cm where cm.post_id=p.id))*.2 as score
    from posts p join organizations po on po.id=p.organization_id cross join context c left join follows f on f.organization_id=p.organization_id and f.user_id=auth.uid()
    where public.can_view_post(p,auth.uid()) and (p.school_level_target='both' or c.school_level is null or p.school_level_target=c.school_level)
  ) select p.id,p.organization_id,p.actor_user_id,p.body,p.status,p.audience,p.school_level_target,p.priority,p.moderation_status,p.published_at,p.created_at,p.updated_at,p.deleted_at,p.edited_at from ranked p order by case when p_mode='chronological' then extract(epoch from p.published_at) else p.score end desc;
$$;

revoke all on function public.publish_post(uuid,text,audience_type,content_status,text),public.edit_post(uuid,text,audience_type,text),public.get_ranked_feed(uuid,text) from public;
grant execute on function public.publish_post(uuid,text,audience_type,content_status,text),public.edit_post(uuid,text,audience_type,text),public.get_ranked_feed(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Blokkering i meldinger (§9)
-- ---------------------------------------------------------------------------
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id<>blocked_id)
);
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;
-- Bare den som blokkerer ser blokkeringen. Den blokkerte får ikke vite det.
create policy user_blocks_own_read on public.user_blocks for select to authenticated using (blocker_id=auth.uid());
create policy user_blocks_own_insert on public.user_blocks for insert to authenticated with check (blocker_id=auth.uid() and public.is_active_user());
create policy user_blocks_own_delete on public.user_blocks for delete to authenticated using (blocker_id=auth.uid());

create or replace function public.is_blocked_between(p_a uuid,p_b uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from user_blocks where (blocker_id=p_a and blocked_id=p_b) or (blocker_id=p_b and blocked_id=p_a));
$$;
revoke all on function public.is_blocked_between(uuid,uuid) from public;
grant execute on function public.is_blocked_between(uuid,uuid) to authenticated;

-- Direktemeldinger kan ikke sendes når en av partene har blokkert den andre.
drop policy messages_member_insert on public.messages;
create policy messages_member_insert on public.messages for insert to authenticated with check(
  sender_user_id=auth.uid() and public.is_active_user() and public.is_conversation_member(conversation_id)
  and not exists(select 1 from conversations c join conversation_members cm on cm.conversation_id=c.id and cm.user_id<>auth.uid() and cm.left_at is null
    where c.id=messages.conversation_id and c.kind='direct' and public.is_blocked_between(auth.uid(),cm.user_id)));
-- Meldinger fra noen brukeren har blokkert skjules for brukeren, også i grupper.
drop policy messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using(
  exists(select 1 from conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid() and cm.left_at is null and messages.created_at>=cm.history_starts_at)
  and not exists(select 1 from user_blocks b where b.blocker_id=auth.uid() and b.blocked_id=messages.sender_user_id));

-- ---------------------------------------------------------------------------
-- 6. Forespørsel om å bli skoleadministrator (§4)
-- ---------------------------------------------------------------------------
create table public.school_admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  school_id uuid not null references public.organizations(id),
  message text check (message is null or char_length(message)<=1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason)<=1000),
  created_at timestamptz not null default now(),
  check ((status in ('approved','rejected')) = (decided_by is not null and decided_at is not null))
);
create unique index school_admin_requests_one_pending on public.school_admin_requests(user_id,school_id) where status='pending';
alter table public.school_admin_requests enable row level security;
alter table public.school_admin_requests force row level security;
-- Søkeren ser egne forespørsler. Styreadministrator i området (og superadministrator) ser forespørsler for sine skoler.
create policy school_admin_requests_read on public.school_admin_requests for select to authenticated
  using (user_id=auth.uid() or public.has_area_role(school_id));

create or replace function public.request_school_admin(p_school uuid,p_message text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'not authorized'; end if;
  if not exists(select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'school not found'; end if;
  if not exists(select 1 from profiles where id=auth.uid() and current_school_id=p_school) then raise exception 'only for own school'; end if;
  if public.has_role(p_school,array['school_admin']::admin_role[]) then raise exception 'already administrator'; end if;
  insert into school_admin_requests(user_id,school_id,message) values(auth.uid(),p_school,nullif(trim(p_message),'')) returning id into v_id;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),p_school,'school_admin.requested','school_admin_request',v_id::text);
  return v_id;
end $$;

-- Godkjennes av styreadministrator i området. Søkeren kan ikke godkjenne sin egen forespørsel.
create or replace function public.decide_school_admin_request(p_request uuid,p_approve boolean,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$ declare r school_admin_requests; v_grant uuid; begin
  select * into r from school_admin_requests where id=p_request for update;
  if r is null or r.status<>'pending' then raise exception 'request not pending'; end if;
  if r.user_id=auth.uid() then raise exception 'self escalation is not allowed'; end if;
  if not exists(select 1 from organizations s where s.id=r.school_id and s.type='school' and (
      (s.local_board_id is not null and public.has_role(s.local_board_id,array['board_admin']::admin_role[]))
      or exists(select 1 from organizations cb where cb.type='county_board' and cb.county=s.county and public.has_role(cb.id,array['board_admin']::admin_role[])))) then
    raise exception 'not authorized';
  end if;
  update school_admin_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now(),decision_reason=nullif(trim(p_reason),'') where id=p_request;
  if p_approve then
    insert into role_grants(user_id,organization_id,role,start_date,status,granted_by,accepted_at) values(r.user_id,r.school_id,'school_admin',current_date,'active',auth.uid(),now())
    on conflict do nothing returning id into v_grant;
  end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),r.school_id,case when p_approve then 'school_admin.approved' else 'school_admin.rejected' end,'school_admin_request',p_request::text,jsonb_build_object('user_id',r.user_id,'role_grant_id',v_grant));
end $$;

create or replace function public.cancel_school_admin_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  update school_admin_requests set status='cancelled' where id=p_request and user_id=auth.uid() and status='pending';
  if not found then raise exception 'request not pending'; end if;
end $$;

revoke all on function public.request_school_admin(uuid,text),public.decide_school_admin_request(uuid,boolean,text),public.cancel_school_admin_request(uuid) from public;
grant execute on function public.request_school_admin(uuid,text),public.decide_school_admin_request(uuid,boolean,text),public.cancel_school_admin_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Forespørsler om eksport og sletting av egne personopplysninger (§10, §16)
-- ---------------------------------------------------------------------------
create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('export','deletion')),
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','cancelled')),
  handled_by uuid references public.profiles(id),
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index data_subject_requests_one_open on public.data_subject_requests(user_id,kind) where status in ('pending','processing');
create trigger data_subject_requests_touch before update on public.data_subject_requests for each row execute function public.touch_updated_at();
alter table public.data_subject_requests enable row level security;
alter table public.data_subject_requests force row level security;
-- Brukeren ser egne forespørsler. Behandling gjøres av superadministrator.
create policy data_requests_own_or_super_read on public.data_subject_requests for select to authenticated
  using (user_id=auth.uid() or public.has_role(null,array['super_admin']::admin_role[]));
create policy data_requests_super_update on public.data_subject_requests for update to authenticated
  using (public.has_role(null,array['super_admin']::admin_role[])) with check (public.has_role(null,array['super_admin']::admin_role[]));

create or replace function public.request_personal_data(p_kind text) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid()) then raise exception 'not authorized'; end if;
  if p_kind not in ('export','deletion') then raise exception 'invalid request'; end if;
  insert into data_subject_requests(user_id,kind) values(auth.uid(),p_kind) returning id into v_id;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'privacy.requested','data_subject_request',v_id::text,jsonb_build_object('kind',p_kind));
  return v_id;
end $$;
revoke all on function public.request_personal_data(text) from public;
grant execute on function public.request_personal_data(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Søk på norsk (§6)
-- ---------------------------------------------------------------------------
alter table public.organizations add column search_vector tsvector generated always as (
  setweight(to_tsvector('simple',coalesce(name,'')||' '||coalesce(school_name,'')),'A')
  || setweight(to_tsvector('simple',coalesce(county,'')),'B')
  || setweight(to_tsvector('norwegian',coalesce(bio,'')),'C')) stored;
create index organizations_search_idx on public.organizations using gin(search_vector);

alter table public.posts add column search_vector tsvector generated always as (to_tsvector('norwegian',body)) stored;
create index posts_search_idx on public.posts using gin(search_vector);

alter table public.events add column search_vector tsvector generated always as (
  setweight(to_tsvector('norwegian',title),'A')
  || setweight(to_tsvector('norwegian',coalesce(summary,'')),'B')
  || setweight(to_tsvector('norwegian',description||' '||coalesce(place,'')),'C')) stored;
create index events_search_idx on public.events using gin(search_vector);

create index profiles_name_search_idx on public.profiles using gin(to_tsvector('simple',display_name));

-- Gjør fritekst om til et prefikssøk («elveb» finner «Elvebakken»). Bare bokstaver og tall slipper gjennom.
create or replace function public.search_tsquery(p_query text,p_config regconfig) returns tsquery language sql immutable set search_path=public as $$
  select case when count(*)=0 then null else to_tsquery(p_config,string_agg(t||':*',' & ')) end
  from unnest(regexp_split_to_array(lower(left(coalesce(p_query,''),100)),'[^[:alnum:]]+')) t where t<>'';
$$;

-- Ett søk for skoler, styrer, personer, arrangementer og innlegg. Returnerer bare offentlige felt.
-- Deaktiverte skoler og personer vises ikke, med mindre p_include_former er satt: da tas tidligere
-- tillitsvalgte med (personer med avsluttede offentlige verv).
create or replace function public.search(p_query text,p_kinds text[] default null,p_include_former boolean default false,p_limit int default 20)
returns table (kind text,id uuid,title text,subtitle text,organization_id uuid,rank real)
language plpgsql stable security definer set search_path=public as $$
#variable_conflict use_column
declare q_simple tsquery:=public.search_tsquery(p_query,'simple'); q_nor tsquery:=public.search_tsquery(p_query,'norwegian'); v_limit int:=least(greatest(coalesce(p_limit,20),1),50);
begin
  if q_simple is null then return; end if;
  return query
  select * from (
    select o.type::text,o.id,coalesce(o.school_name,o.name),o.county,o.id,ts_rank(o.search_vector,q_simple||coalesce(q_nor,q_simple))
    from organizations o
    where (p_kinds is null or o.type::text=any(p_kinds)) and (o.status='active' or (p_include_former and o.status='deactivated'))
      and (o.search_vector@@q_simple or o.search_vector@@q_nor)
    union all
    select 'person',pr.id,pr.display_name,
      coalesce((select string_agg(m.public_title||', '||og.name,' · ') from memberships m join organizations og on og.id=m.organization_id
                where m.user_id=pr.id and m.status='active' and m.public_title is not null and (m.end_date is null or m.end_date>=current_date)),
               (select 'Tidligere: '||string_agg(m.public_title||', '||og.name,' · ') from memberships m join organizations og on og.id=m.organization_id
                where m.user_id=pr.id and m.public_title is not null and (m.status='ended' or m.end_date<current_date))),
      pr.current_school_id,ts_rank(to_tsvector('simple',pr.display_name),q_simple)
    from profiles pr
    where (p_kinds is null or 'person'=any(p_kinds)) and to_tsvector('simple',pr.display_name)@@q_simple
      and (pr.status='active' or (p_include_former and exists(select 1 from memberships m where m.user_id=pr.id and m.public_title is not null and (m.status='ended' or m.end_date<current_date))))
    union all
    select 'event',e.id,e.title,e.summary,e.organizer_id,ts_rank(e.search_vector,coalesce(q_nor,q_simple))
    from events e join organizations og on og.id=e.organizer_id and og.status='active'
    where (p_kinds is null or 'event'=any(p_kinds)) and e.status in ('published','completed') and (e.search_vector@@q_nor or e.search_vector@@q_simple)
    union all
    select 'post',p.id,left(p.body,120),og.name,p.organization_id,ts_rank(p.search_vector,coalesce(q_nor,q_simple))
    from posts p join organizations og on og.id=p.organization_id
    where (p_kinds is null or 'post'=any(p_kinds)) and (p.search_vector@@q_nor or p.search_vector@@q_simple) and public.can_view_post(p,auth.uid())
  ) r order by 6 desc,3 limit v_limit;
end $$;
revoke all on function public.search_tsquery(text,regconfig),public.search(text,text[],boolean,int) from public;
grant execute on function public.search_tsquery(text,regconfig),public.search(text,text[],boolean,int) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sanntid (§9): meldinger, medlemskap i samtaler og varsler. RLS gjelder også for sanntid.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.messages,public.conversation_members,public.notifications;
  end if;
end $$;

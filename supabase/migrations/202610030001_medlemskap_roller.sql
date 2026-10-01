-- Prompt 4: medlemskap, roller og aktiv representasjon (docs/PROMPTPLAN.md, KRAVSPEC §3, §4, §17).
-- Offentlige verv (memberships) og interne rettigheter (role_grants) tildeles og avsluttes via RPC-er
-- som sjekker rettighetene selv, stopper selvtildeling og fjerning av siste administrator, og logger alt.
-- Deaktiverte organisasjoner kan ikke representeres, men vises fortsatt med historikken sin.

-- ---------------------------------------------------------------------------
-- 1. Aktiv representasjon (§3)
-- ---------------------------------------------------------------------------
-- Et verv i en deaktivert organisasjon gir ikke lenger rett til å opptre på vegne av den.
-- Brukes av publisering, kommentarer, avstemninger og arrangementssvar.
create or replace function public.has_active_membership(p_org uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m join organizations o on o.id=m.organization_id and o.status='active'
    where m.user_id=p_user and m.organization_id=p_org and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date));
$$;

create or replace function public.set_active_representation(p_membership_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if not exists(select 1 from memberships m join organizations o on o.id=m.organization_id and o.status='active'
    where m.id=p_membership_id and m.user_id=auth.uid() and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) then
    raise exception 'invalid representation';
  end if;
  update profiles set active_membership_id=p_membership_id where id=auth.uid();
end $$;

-- Økten viser alle tilknytninger, også verv i deaktiverte organisasjoner (merket, og uten publiseringsrett).
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
      select jsonb_agg(jsonb_build_object('id',m.id,'organization_id',o.id,'name',o.name,'type',o.type,'organization_status',o.status,
        'public_title',coalesce(m.public_title,''),
        'can_publish',o.status='active' and public.has_role(o.id,array['content_manager','school_admin','board_admin']::admin_role[]))
        order by o.status<>'active',case o.type when 'school' then 0 when 'local_board' then 1 when 'county_board' then 2 else 3 end,o.name)
      from memberships m join organizations o on o.id=m.organization_id and o.status in ('active','deactivated')
      where m.user_id=v_profile.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
    ),'[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Hvem kan tildele hva (§4, §17)
-- ---------------------------------------------------------------------------
-- Rollen må passe organisasjonstypen: superadministrator hører til EO nasjonalt, styreadministrator til
-- et styre og skoleadministrator til en skole. Innholdsansvarlig finnes i alle organisasjoner.
create or replace function public.role_fits_organization(p_org uuid,p_role admin_role) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select case p_role
    when 'super_admin' then o.type='national'
    when 'board_admin' then o.type in ('national','county_board','local_board')
    when 'school_admin' then o.type='school'
    else true end
  from organizations o where o.id=p_org),false);
$$;

-- Superadministrator tildeler alle rettigheter. Styreadministrator kan bare gjøres av superadministrator.
-- Skoleadministrator (invitere ny administrator) og innholdsansvarlig tildeles av organisasjonens administrator,
-- og for skoler også av styreadministrator i området (§4).
create or replace function public.can_grant_role(p_org uuid,p_role admin_role) returns boolean language sql stable security definer set search_path=public as $$
  select public.role_fits_organization(p_org,p_role) and case p_role
    when 'super_admin' then public.has_role(null,array['super_admin']::admin_role[])
    when 'board_admin' then public.has_role(null,array['super_admin']::admin_role[])
    else public.has_area_role(p_org) end;
$$;

-- Styreadministrator over skolen: lokallaget skolen hører til eller fylkesstyret i skolens fylke.
-- Det er dem som avgjør forespørsler om å bli skoleadministrator.
create or replace function public.is_area_board_admin(p_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from organizations s where s.id=p_school and s.type='school' and (
    (s.local_board_id is not null and public.has_role(s.local_board_id,array['board_admin']::admin_role[]))
    or exists(select 1 from organizations cb where cb.type='county_board' and cb.county=s.county and public.has_role(cb.id,array['board_admin']::admin_role[]))));
$$;

-- ---------------------------------------------------------------------------
-- 3. Interne rettigheter: tildeling og tilbakekalling (§4, §17)
-- ---------------------------------------------------------------------------
-- Erstatter versjonen fra prompt 1. Ingen kan tildele seg selv noe, rollen må passe organisasjonen,
-- og på en skole må personen gå på skolen. Tildelingen gjelder fra startdatoen.
create or replace function public.assign_role(p_user uuid,p_org uuid,p_role admin_role,p_starts date,p_ends date default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_org organizations; v_target profiles;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_user=auth.uid() then raise exception 'self escalation is not allowed'; end if;
  select * into v_org from organizations where id=p_org;
  if not found or v_org.status<>'active' then raise exception 'organization not found'; end if;
  if not public.role_fits_organization(p_org,p_role) then raise exception 'invalid role'; end if;
  if not public.can_grant_role(p_org,p_role) then raise exception 'not authorized'; end if;
  select * into v_target from profiles where id=p_user;
  if not found or v_target.status<>'active' then raise exception 'person not found'; end if;
  if v_org.type='school' and v_target.current_school_id is distinct from p_org then raise exception 'person not at school'; end if;
  if p_starts is null or p_starts<current_date-366 or p_starts>current_date+366 or (p_ends is not null and p_ends<p_starts) then raise exception 'invalid date range'; end if;
  if exists(select 1 from role_grants where user_id=p_user and organization_id=p_org and role=p_role and status='active' and (end_date is null or end_date>=current_date)) then
    raise exception 'role already assigned';
  end if;
  insert into role_grants(user_id,organization_id,role,start_date,end_date,status,granted_by,accepted_at)
    values(p_user,p_org,p_role,p_starts,p_ends,'active',auth.uid(),now()) returning id into v_id;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,'role.assigned','role_grant',v_id::text,jsonb_build_object('user_id',p_user,'role',p_role));
  return v_id;
end $$;

-- Tilbakekalling gjøres av den som kan tildele rollen, eller av personen selv (gå av).
-- Siste administrator kan ikke fjernes: en etterfølger må få rollen først (§17).
create or replace function public.revoke_role(p_grant uuid) returns void language plpgsql security definer set search_path=public as $$
declare g role_grants;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into g from role_grants where id=p_grant;
  if not found then raise exception 'role not found'; end if;
  if g.user_id<>auth.uid() and not public.can_grant_role(g.organization_id,g.role) then raise exception 'not authorized'; end if;
  -- Lås alle aktive tildelinger av samme rolle, så to samtidige tilbakekallinger ikke fjerner begge de siste.
  perform 1 from role_grants r where r.role=g.role and r.status='active' and (g.role='super_admin' or r.organization_id=g.organization_id) for update;
  select * into g from role_grants where id=p_grant;
  if g.status<>'active' or (g.end_date is not null and g.end_date<current_date) then raise exception 'role not active'; end if;
  if g.role in ('super_admin','board_admin','school_admin') and not exists(
    select 1 from role_grants r join profiles p on p.id=r.user_id and p.status='active'
    where r.id<>g.id and r.user_id<>g.user_id and r.role=g.role and (g.role='super_admin' or r.organization_id=g.organization_id)
      and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)) then
    raise exception 'last administrator';
  end if;
  update role_grants set status='revoked',end_date=greatest(start_date,current_date),revoked_by=auth.uid(),revoked_at=now() where id=p_grant;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),g.organization_id,'role.revoked','role_grant',p_grant::text,jsonb_build_object('user_id',g.user_id,'role',g.role));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Offentlige verv: tildeling og avslutning (§3, §4)
-- ---------------------------------------------------------------------------
-- Skoleadministrator og styreadministrator (også i området) gir verv. Et verv gir rett til å representere
-- organisasjonen (kommentere, stemme), men ikke til å publisere; det krever en intern rettighet.
-- En administrator kan gi seg selv et verv i egen organisasjon, men ikke via områderetten.
create or replace function public.assign_public_office(p_user uuid,p_org uuid,p_title text,p_starts date default current_date) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_org organizations; v_target profiles; v_title text:=trim(coalesce(p_title,''));
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into v_org from organizations where id=p_org;
  if not found or v_org.status<>'active' then raise exception 'organization not found'; end if;
  if not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  if p_user=auth.uid() and not public.has_role(p_org,array['school_admin','board_admin']::admin_role[]) then raise exception 'self escalation is not allowed'; end if;
  if char_length(v_title) not between 2 and 80 then raise exception 'invalid title'; end if;
  select * into v_target from profiles where id=p_user;
  if not found or v_target.status<>'active' then raise exception 'person not found'; end if;
  if v_org.type='school' and v_target.current_school_id is distinct from p_org then raise exception 'person not at school'; end if;
  if p_starts is null or p_starts<current_date-366 or p_starts>current_date+366 then raise exception 'invalid date range'; end if;
  if exists(select 1 from memberships where user_id=p_user and organization_id=p_org and lower(public_title)=lower(v_title) and status='active' and (end_date is null or end_date>=current_date)) then
    raise exception 'office already assigned';
  end if;
  insert into memberships(user_id,organization_id,public_title,start_date,status,granted_by,granted_at,accepted_at)
    values(p_user,p_org,v_title,p_starts,'active',auth.uid(),now(),now()) returning id into v_id;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,'office.assigned','membership',v_id::text,jsonb_build_object('user_id',p_user,'title',v_title));
  return v_id;
end $$;

-- Vervet avsluttes med sluttdato og blir stående som historikk. Personen kan selv gå av.
create or replace function public.end_public_office(p_membership uuid) returns void language plpgsql security definer set search_path=public as $$
declare m memberships;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into m from memberships where id=p_membership for update;
  if not found then raise exception 'office not found'; end if;
  if m.user_id<>auth.uid() and not public.has_area_role(m.organization_id) then raise exception 'not authorized'; end if;
  if m.status<>'active' or (m.end_date is not null and m.end_date<current_date) then raise exception 'office not active'; end if;
  update memberships set status='ended',end_date=greatest(start_date,current_date),revoked_by=auth.uid(),revoked_at=now() where id=p_membership;
  update profiles set active_membership_id=null where active_membership_id=p_membership;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),m.organization_id,'office.ended','membership',p_membership::text,jsonb_build_object('user_id',m.user_id,'title',m.public_title));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Administrasjon: organisasjoner, verv og rettigheter, personer og revisjonslogg (§4, §12)
-- ---------------------------------------------------------------------------
-- Organisasjonene brukeren administrerer, med hvilke rettigheter brukeren kan tildele der.
-- Klienten viser bare det denne funksjonen svarer; den avgjør ingenting selv.
create or replace function public.list_my_admin_organizations()
returns table (id uuid,type organization_type,name text,school_name text,county text,status organization_status,my_role admin_role,grantable_roles admin_role[])
language sql stable security definer set search_path=public as $$
  with me as (select public.is_active_user() as active,public.has_role(null,array['super_admin']::admin_role[]) as super)
  select o.id,o.type,o.name,o.school_name,o.county,o.status,
    case when me.super then 'super_admin'::admin_role
      when o.type='school' and public.has_role(o.id,array['school_admin']::admin_role[]) then 'school_admin'::admin_role
      else 'board_admin'::admin_role end,
    array(select r from unnest(enum_range(null::admin_role)) r where public.can_grant_role(o.id,r))
  from organizations o cross join me
  where me.active and o.status in ('active','deactivated') and (me.super or public.has_area_role(o.id))
  order by o.status<>'active',case o.type when 'national' then 0 when 'county_board' then 1 when 'local_board' then 2 else 3 end,o.name;
$$;

-- Verv og interne rettigheter i en organisasjon, også avsluttede (historikk). Bare for administratorer
-- av organisasjonen eller området, så innholdsansvarlig er aldri synlig for andre (§4).
create or replace function public.list_organization_roles(p_org uuid)
returns table (kind text,id uuid,user_id uuid,display_name text,user_active boolean,title text,role admin_role,
  start_date date,end_date date,status membership_status,granted_by_name text,granted_at timestamptz,can_change boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_active_user() or not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  return query
  select * from (
    select 'office'::text as kind,m.id,m.user_id,p.display_name,p.status='active' as user_active,coalesce(m.public_title,'') as title,null::admin_role as role,
      m.start_date,m.end_date,m.status,gb.display_name as granted_by_name,m.granted_at,true as can_change
    from memberships m join profiles p on p.id=m.user_id left join profiles gb on gb.id=m.granted_by
    where m.organization_id=p_org
    union all
    select 'role',r.id,r.user_id,p.display_name,p.status='active',null,r.role,
      r.start_date,r.end_date,r.status,gb.display_name,r.granted_at,public.can_grant_role(p_org,r.role)
    from role_grants r join profiles p on p.id=r.user_id left join profiles gb on gb.id=r.granted_by
    where r.organization_id=p_org
  ) x
  order by x.status<>'active',x.display_name,x.start_date desc
  limit 300;
end $$;

-- Personer administratoren kan gi verv eller rettigheter: elever ved skolen, ved skolene i lokallaget
-- eller fylket, eller alle for EO nasjonalt. Bare navn og skole, ingen e-post (§17, kontoopplisting).
create or replace function public.list_assignable_people(p_org uuid,p_query text default '')
returns table (id uuid,display_name text,school_name text)
language plpgsql stable security definer set search_path=public as $$
declare v_org organizations; v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if not public.is_active_user() or not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  select * into v_org from organizations o where o.id=p_org;
  return query
  select p.id,p.display_name,coalesce(s.school_name,s.name)
  from profiles p left join organizations s on s.id=p.current_school_id
  where p.status='active'
    and (v_query='' or position(v_query in lower(p.display_name))>0)
    and (case v_org.type
      when 'school' then p.current_school_id=v_org.id
      when 'local_board' then s.local_board_id=v_org.id
      when 'county_board' then s.county=v_org.county
      else true end
      or exists(select 1 from memberships m where m.user_id=p.id and m.organization_id=v_org.id and m.status='active'))
  order by p.display_name
  limit 20;
end $$;

-- Revisjonslogg for organisasjonen, med navn på den som gjorde endringen og den det gjaldt.
create or replace function public.list_audit_log(p_org uuid,p_limit int default 30)
returns table (id bigint,created_at timestamptz,actor_name text,action text,subject_name text,details jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_active_user() or not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  return query
  select a.id,a.created_at,ap.display_name,a.action,sp.display_name,a.details
  from audit_logs a
  left join profiles ap on ap.id=a.actor_user_id
  left join profiles sp on sp.id::text=a.details->>'user_id'
  where a.organization_id=p_org
  order by a.created_at desc,a.id desc
  limit least(greatest(coalesce(p_limit,30),1),100);
end $$;

-- Egne verv og rettigheter, også avsluttede. Personen ser alltid sine egne, også innholdsansvarlig.
create or replace function public.get_my_roles()
returns table (kind text,id uuid,organization_id uuid,organization_name text,organization_status organization_status,title text,role admin_role,
  start_date date,end_date date,status membership_status)
language sql stable security definer set search_path=public as $$
  select * from (
    select 'office'::text as kind,m.id,o.id as organization_id,o.name as organization_name,o.status as organization_status,coalesce(m.public_title,'') as title,
      null::admin_role as role,m.start_date,m.end_date,m.status
    from memberships m join organizations o on o.id=m.organization_id where m.user_id=auth.uid()
    union all
    select 'role',r.id,o.id,o.name,o.status,null,r.role,r.start_date,r.end_date,r.status
    from role_grants r join organizations o on o.id=r.organization_id where r.user_id=auth.uid()
  ) x
  order by x.status<>'active',x.start_date desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. Forespørsel om å bli skoleadministrator (§4)
-- ---------------------------------------------------------------------------
-- Godkjenning krever i tillegg at skolen er aktiv og at søkeren fortsatt går der. Avslag går alltid.
create or replace function public.decide_school_admin_request(p_request uuid,p_approve boolean,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare r school_admin_requests; v_grant uuid;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into r from school_admin_requests where id=p_request for update;
  if r is null or r.status<>'pending' then raise exception 'request not pending'; end if;
  if r.user_id=auth.uid() then raise exception 'self escalation is not allowed'; end if;
  if not public.is_area_board_admin(r.school_id) then raise exception 'not authorized'; end if;
  if p_approve and not exists(select 1 from profiles p join organizations s on s.id=p.current_school_id and s.status='active'
    where p.id=r.user_id and p.status='active' and p.current_school_id=r.school_id) then
    raise exception 'request outdated';
  end if;
  update school_admin_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now(),decision_reason=nullif(trim(p_reason),'') where id=p_request;
  if p_approve then
    insert into role_grants(user_id,organization_id,role,start_date,status,granted_by,accepted_at) values(r.user_id,r.school_id,'school_admin',current_date,'active',auth.uid(),now())
    on conflict do nothing returning id into v_grant;
  end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),r.school_id,case when p_approve then 'school_admin.approved' else 'school_admin.rejected' end,'school_admin_request',p_request::text,jsonb_build_object('user_id',r.user_id,'role_grant_id',v_grant));
end $$;

create or replace function public.cancel_school_admin_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_school uuid;
begin
  update school_admin_requests set status='cancelled' where id=p_request and user_id=auth.uid() and status='pending' returning school_id into v_school;
  if not found then raise exception 'request not pending'; end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),v_school,'school_admin.cancelled','school_admin_request',p_request::text,jsonb_build_object('user_id',auth.uid()));
end $$;

-- Egne forespørsler, og ventende forespørsler brukeren kan avgjøre som styreadministrator i området.
create or replace function public.list_school_admin_requests()
returns table (id uuid,user_id uuid,display_name text,school_id uuid,school_name text,message text,status text,created_at timestamptz,
  decided_at timestamptz,decision_reason text,mine boolean,can_decide boolean)
language sql stable security definer set search_path=public as $$
  select r.id,r.user_id,p.display_name,r.school_id,coalesce(s.school_name,s.name),r.message,r.status,r.created_at,r.decided_at,r.decision_reason,
    r.user_id=auth.uid(),r.status='pending' and r.user_id<>auth.uid() and public.is_area_board_admin(r.school_id)
  from school_admin_requests r join profiles p on p.id=r.user_id join organizations s on s.id=r.school_id
  where public.is_active_user() and (r.user_id=auth.uid() or (r.status='pending' and public.is_area_board_admin(r.school_id)))
  order by r.status<>'pending',r.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 7. Deaktiverte organisasjoner vises tydelig (§1, §2)
-- ---------------------------------------------------------------------------
-- Én organisasjon, også deaktivert, så gamle innlegg og lenker fortsatt viser siden med historikken.
-- Arkiverte organisasjoner vises ikke. Samme offentlige felt som list_public_organizations.
create or replace function public.get_public_organization(p_org uuid)
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
      where o.status='active' and m.organization_id=o.id and m.status='active' and m.public_title is not null and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),
    o.priorities_heading,
    (select jsonb_agg(jsonb_build_object('id',pr.id,'title',pr.title,'description',pr.description) order by pr.position)
      from organization_priorities pr where pr.organization_id=o.id)
  from organizations o left join organizations lb on lb.id=o.local_board_id
  where o.id=p_org and o.status in ('active','deactivated');
$$;

-- ---------------------------------------------------------------------------
-- 8. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.role_fits_organization(uuid,admin_role),public.can_grant_role(uuid,admin_role),public.is_area_board_admin(uuid),
  public.revoke_role(uuid),public.assign_public_office(uuid,uuid,text,date),public.end_public_office(uuid),public.list_my_admin_organizations(),
  public.list_organization_roles(uuid),public.list_assignable_people(uuid,text),public.list_audit_log(uuid,int),public.get_my_roles(),
  public.list_school_admin_requests(),public.get_public_organization(uuid) from public,anon;
grant execute on function public.role_fits_organization(uuid,admin_role),public.can_grant_role(uuid,admin_role),public.is_area_board_admin(uuid),
  public.revoke_role(uuid),public.assign_public_office(uuid,uuid,text,date),public.end_public_office(uuid),public.list_my_admin_organizations(),
  public.list_organization_roles(uuid),public.list_assignable_people(uuid,text),public.list_audit_log(uuid,int),public.get_my_roles(),
  public.list_school_admin_requests(),public.get_public_organization(uuid) to authenticated;
grant execute on function public.get_public_organization(uuid) to anon;

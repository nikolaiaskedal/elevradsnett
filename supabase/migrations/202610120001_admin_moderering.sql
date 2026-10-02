-- Prompt 12: adminpanel og moderering (KRAVSPEC §12, §14, §15 og §17).
-- Alle operasjoner avgrenses server-side til organisasjonen administratoren faktisk har ansvar for.

create table public.profile_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  report_id uuid not null references public.moderation_reports(id),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now()+interval '7 days'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
alter table public.profile_restrictions enable row level security;
alter table public.profile_restrictions force row level security;
create policy profile_restrictions_own_read on public.profile_restrictions for select to authenticated using(user_id=auth.uid());

-- En superadministrator får ikke superrettigheten før den aktuelle økten er verifisert med TOTP (AAL2).
-- Andre aktive roller virker som før, også dersom samme person i tillegg er superadministrator.
create or replace function public.has_role(p_org uuid,p_roles admin_role[],p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from role_grants r
    where r.user_id=p_user and r.organization_id=p_org and r.role=any(p_roles)
      and (r.role<>'super_admin' or p_user<>auth.uid() or coalesce(auth.jwt()->>'aal','aal1')='aal2')
      and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
  ) or (
    (p_user<>auth.uid() or coalesce(auth.jwt()->>'aal','aal1')='aal2') and exists(
      select 1 from role_grants r where r.user_id=p_user and r.role='super_admin' and r.status='active'
        and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
    )
  ) or ('board_admin'=any(p_roles) and exists(
    select 1 from organizations lb
    join profiles pr on pr.id=p_user
    join organizations s on s.id=pr.current_school_id and s.local_board_id=lb.id
    join organizations cb on cb.type='county_board' and cb.county=lb.county
    join role_grants r on r.organization_id=cb.id and r.user_id=p_user and r.role='board_admin' and r.status='active'
      and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
    where lb.id=p_org and lb.type='local_board'));
$$;

create or replace function public.is_super_admin_account() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from role_grants r where r.user_id=auth.uid() and r.role='super_admin' and r.status='active'
    and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date));
$$;

create or replace function public.admin_scope_allows(p_scope uuid,p_target uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_area_role(p_scope) and coalesce((
    select case s.type
      when 'national' then true
      when 'county_board' then t.county=s.county
      when 'local_board' then t.id=s.id or t.local_board_id=s.id
      else t.id=s.id end
    from organizations s cross join organizations t where s.id=p_scope and t.id=p_target
  ),false);
$$;

create or replace function public.moderation_report_in_scope(p_report uuid,p_scope uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from moderation_reports r where r.id=p_report and (
      (r.target_type='post' and exists(select 1 from posts p where p.id=r.target_id and public.admin_scope_allows(p_scope,p.organization_id)))
      or (r.target_type='comment' and exists(select 1 from comments c where c.id=r.target_id and public.admin_scope_allows(p_scope,c.organization_id)))
      or (r.target_type='profile' and exists(select 1 from profiles p where p.id=r.target_id and public.admin_scope_allows(p_scope,p.current_school_id)))
      or (r.target_type='media' and exists(select 1 from post_media pm join posts p on p.id=pm.post_id where pm.id=r.target_id and public.admin_scope_allows(p_scope,p.organization_id)))
      or (r.target_type='message' and public.has_role(null,array['super_admin']::admin_role[]))
    ));
$$;

create or replace function public.get_admin_dashboard(p_scope uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s organizations; result jsonb;
begin
  select * into s from organizations where id=p_scope;
  if s is null or not public.has_area_role(p_scope) then raise exception 'not authorized'; end if;
  with allowed_orgs as (
    select o.* from organizations o where public.admin_scope_allows(p_scope,o.id)
  ), allowed_schools as (
    select * from allowed_orgs where type='school'
  ), resolved as (
    select * from public.resolve_organization_images(p_scope)
  )
  select jsonb_build_object(
    'stats',jsonb_build_object(
      'activeUsers',(select count(*) from profiles p where p.status='active' and p.current_school_id in(select id from allowed_schools)),
      'activeSchools',(select count(*) from allowed_schools where status='active'),
      'newUsers30Days',(select count(*) from profiles p where p.created_at>=now()-interval '30 days' and p.current_school_id in(select id from allowed_schools)),
      'publishedPosts',(select count(*) from posts p where p.status='published' and p.organization_id in(select id from allowed_orgs)),
      'comments',(select count(*) from comments c where c.organization_id in(select id from allowed_orgs)),
      'reactions',(select count(*) from reactions r join posts p on p.id=r.post_id where p.organization_id in(select id from allowed_orgs)),
      'eventRegistrations',(select count(*) from event_organization_registrations r join events e on e.id=r.event_id where e.organizer_id in(select id from allowed_orgs)),
      'completedHandovers',(select count(*) from handover_processes h where h.status='completed' and h.organization_id in(select id from allowed_orgs)),
      'openModerationCases',(select count(*) from moderation_reports mr where mr.status in ('open','reviewing','appealed') and public.moderation_report_in_scope(mr.id,p_scope))
    ),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'schoolId',p.current_school_id,'schoolName',coalesce(sc.school_name,sc.name,''),'status',p.status,'deactivatedByUser',p.deactivated_by_user) order by p.display_name)
      from profiles p left join organizations sc on sc.id=p.current_school_id where p.current_school_id in(select id from allowed_schools)),'[]'::jsonb),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',sc.id,'name',coalesce(sc.school_name,sc.name),'county',sc.county,'localBoardName',coalesce(lb.name,''),'status',sc.status,'administratorCount',(select count(*) from role_grants rg where rg.organization_id=sc.id and rg.role='school_admin' and rg.status='active'),'deactivationReason',sc.deactivation_reason) order by sc.status<>'active',coalesce(sc.school_name,sc.name)) from allowed_schools sc left join organizations lb on lb.id=sc.local_board_id),'[]'::jsonb),
    'content',coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (
      select jsonb_build_object('id',p.id,'type','post','title',left(p.body,100),'organizationName',o.name,'status',p.status::text||' / '||p.moderation_status::text,'createdAt',p.created_at) x from posts p join allowed_orgs o on o.id=p.organization_id
      union all select jsonb_build_object('id',c.id,'type','comment','title',left(c.body,100),'organizationName',o.name,'status',c.moderation_status::text,'createdAt',c.created_at) from comments c join allowed_orgs o on o.id=c.organization_id
      union all select jsonb_build_object('id',e.id,'type','event','title',e.title,'organizationName',o.name,'status',e.status::text,'createdAt',e.created_at) from events e join allowed_orgs o on o.id=e.organizer_id
    ) content_rows),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(x) from (
      select o.id,'profile'::text as type,o.name as "ownerName",o.profile_image_path as path,'ready'::text as "processingStatus",o.is_placeholder as "isPlaceholder" from allowed_orgs o where o.profile_image_path is not null
      union all select o.id,'cover',o.name,o.cover_image_path,'ready',o.is_placeholder from allowed_orgs o where o.cover_image_path is not null
      union all select pm.id,'post',o.name,pm.storage_path,pm.processing_status,pm.is_placeholder from post_media pm join posts p on p.id=pm.post_id join allowed_orgs o on o.id=p.organization_id
      union all select e.id,'event',o.name,e.image_path,'ready',e.is_placeholder from events e join allowed_orgs o on o.id=e.organizer_id where e.image_path is not null
    ) x),'[]'::jsonb),
    'placeholders',coalesce((select jsonb_agg(x) from (
      select o.id,'organization'::text as type,o.name as title,o.name as "organizationName" from allowed_orgs o where o.is_placeholder
      union all select pm.id,'post_media',left(p.body,80),o.name from post_media pm join posts p on p.id=pm.post_id join allowed_orgs o on o.id=p.organization_id where pm.is_placeholder
      union all select e.id,'event',e.title,o.name from events e join allowed_orgs o on o.id=e.organizer_id where e.is_placeholder
    ) x),'[]'::jsonb),
    'images',jsonb_build_object('organizationId',s.id,'locked',s.image_locked,'ownProfilePath',s.profile_image_path,'ownCoverPath',s.cover_image_path,'defaultProfilePath',s.default_profile_image_path,'defaultCoverPath',s.default_cover_image_path,
      'profile',jsonb_build_object('path',(select profile_image_path from resolved),'sourceLevel',coalesce((select profile_image_source from resolved),'none'),'sourceName',coalesce((select profile_image_source from resolved),'Ingen')),
      'cover',jsonb_build_object('path',(select cover_image_path from resolved),'sourceLevel',coalesce((select cover_image_source from resolved),'none'),'sourceName',coalesce((select cover_image_source from resolved),'Ingen')))
  ) into result;
  return result;
end $$;

create or replace function public.admin_manage_user(p_scope uuid,p_user uuid,p_action text,p_school uuid default null,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare target profiles; old_school uuid;
begin
  select * into target from profiles where id=p_user for update;
  if target is null or target.current_school_id is null or not public.admin_scope_allows(p_scope,target.current_school_id) then raise exception 'not authorized'; end if;
  if p_user=auth.uid() then raise exception 'cannot administer yourself'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'documented reason required'; end if;
  old_school:=target.current_school_id;
  if p_action in ('change_school','deactivate','delete') and exists(
    select 1 from role_grants current_grant
    where current_grant.user_id=p_user and current_grant.role<>'content_manager' and current_grant.status='active'
      and current_grant.start_date<=current_date and (current_grant.end_date is null or current_grant.end_date>=current_date)
      and not exists(
        select 1 from role_grants replacement join profiles replacement_profile on replacement_profile.id=replacement.user_id and replacement_profile.status='active'
        where replacement.id<>current_grant.id and replacement.user_id<>p_user and replacement.role=current_grant.role and replacement.status='active'
          and (current_grant.role='super_admin' or replacement.organization_id=current_grant.organization_id)
          and replacement.start_date<=current_date and (replacement.end_date is null or replacement.end_date>=current_date)
      )
  ) then raise exception 'last administrator'; end if;
  if p_action='change_school' then
    if p_school is null or not public.admin_scope_allows(p_scope,p_school) or not exists(select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'school not found'; end if;
    update profile_school_history set ended_at=coalesce(ended_at,now()) where user_id=p_user and ended_at is null;
    insert into profile_school_history(user_id,school_id,started_at,changed_by) values(p_user,p_school,now(),auth.uid());
    update profiles set current_school_id=p_school,active_membership_id=null where id=p_user;
  elsif p_action='deactivate' then
    update profiles set status='deactivated',deactivated_by_user=false,active_membership_id=null where id=p_user;
  elsif p_action='restore' then
    if target.deactivated_by_user then raise exception 'user consent required'; end if;
    update profiles set status='active' where id=p_user;
  elsif p_action='delete' then
    update memberships set status='ended',end_date=current_date,revoked_by=auth.uid(),revoked_at=now() where user_id=p_user and status='active';
    update role_grants set status='revoked',end_date=current_date,revoked_by=auth.uid(),revoked_at=now() where user_id=p_user and status='active';
    update profiles set display_name='Slettet bruker',email='slettet-'||p_user::text||'@example.invalid',avatar_path=null,current_school_id=null,active_membership_id=null,status='archived' where id=p_user;
  else raise exception 'invalid action'; end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),old_school,'user.'||p_action,'profile',p_user::text,jsonb_build_object('user_id',p_user,'school_id',p_school,'reason',trim(p_reason)));
end $$;

create or replace function public.set_organization_status(p_scope uuid,p_organization uuid,p_status organization_status,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('active','deactivated') or not public.admin_scope_allows(p_scope,p_organization) then raise exception 'not authorized'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'documented reason required'; end if;
  update organizations set status=p_status,deactivation_reason=case when p_status='deactivated' then trim(p_reason) else null end where id=p_organization;
  if not found then raise exception 'organization not found'; end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_organization,'organization.'||p_status::text,'organization',p_organization::text,jsonb_build_object('reason',trim(p_reason)));
end $$;

create or replace function public.set_admin_images(p_scope uuid,p_organization uuid,p_default_profile text,p_default_cover text,p_locked boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.admin_scope_allows(p_scope,p_organization) then raise exception 'not authorized'; end if;
  if p_locked and not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'only super administrator can lock images'; end if;
  update organizations set default_profile_image_path=nullif(trim(p_default_profile),''),default_cover_image_path=nullif(trim(p_default_cover),''),image_locked=p_locked where id=p_organization;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_organization,'organization.images_updated','organization',p_organization::text,jsonb_build_object('locked',p_locked));
end $$;

create or replace function public.delete_placeholder(p_scope uuid,p_type text,p_id uuid) returns text[]
language plpgsql security definer set search_path=public as $$
declare paths text[]:='{}'; target_org uuid;
begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_type='organization' then
    select id into target_org from organizations where id=p_id and is_placeholder;
    if not public.admin_scope_allows(p_scope,target_org) then raise exception 'not authorized'; end if;
    update organizations set status='archived',is_placeholder=false where id=p_id returning array_remove(array[profile_image_path,cover_image_path,default_profile_image_path,default_cover_image_path],null) into paths;
  elsif p_type='post_media' then
    select p.organization_id into target_org from post_media pm join posts p on p.id=pm.post_id where pm.id=p_id and pm.is_placeholder;
    if not public.admin_scope_allows(p_scope,target_org) then raise exception 'not authorized'; end if;
    delete from post_media where id=p_id and is_placeholder returning array[storage_path,thumbnail_path] into paths;
  elsif p_type='event' then
    select organizer_id into target_org from events where id=p_id and is_placeholder;
    if not public.admin_scope_allows(p_scope,target_org) then raise exception 'not authorized'; end if;
    update events set status='cancelled',is_placeholder=false,image_path=null where id=p_id returning array[image_path] into paths;
  else raise exception 'invalid placeholder type'; end if;
  if target_org is null then raise exception 'placeholder not found'; end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),target_org,'placeholder.deleted',p_type,p_id::text);
  return array_remove(paths,null);
end $$;

create or replace function public.delete_all_placeholders(p_scope uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item record; paths text[]:='{}'; removed int:=0; more text[];
begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  for item in
    select 'organization'::text type,o.id from organizations o where o.is_placeholder and public.admin_scope_allows(p_scope,o.id)
    union all select 'post_media',pm.id from post_media pm join posts p on p.id=pm.post_id where pm.is_placeholder and public.admin_scope_allows(p_scope,p.organization_id)
    union all select 'event',e.id from events e where e.is_placeholder and public.admin_scope_allows(p_scope,e.organizer_id)
  loop
    more:=public.delete_placeholder(p_scope,item.type,item.id); paths:=paths||coalesce(more,'{}'); removed:=removed+1;
  end loop;
  return jsonb_build_object('count',removed,'paths',to_jsonb(paths));
end $$;

create or replace function public.list_moderation_queue(p_scope uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_area_role(p_scope) then raise exception 'not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'targetType',r.target_type,'targetId',r.target_id,'targetSummary',case r.target_type
      when 'post' then coalesce((select left(body,180) from posts where id=r.target_id),'Slettet innlegg')
      when 'comment' then coalesce((select left(body,180) from comments where id=r.target_id),'Slettet kommentar')
      when 'profile' then coalesce((select display_name from profiles where id=r.target_id),'Slettet profil')
      when 'media' then coalesce((select storage_path from post_media where id=r.target_id),'Slettet medium')
      else coalesce(r.shared_message_excerpt,'Rapportert melding') end,
    'category',r.category,'description',r.description,'sharedMessageExcerpt',r.shared_message_excerpt,'status',r.status,
    'reporterName',reporter.display_name,'assignedToName',assignee.display_name,'createdAt',r.created_at,
    'actions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'reason',a.reason,'moderatorName',m.display_name,'createdAt',a.created_at) order by a.created_at) from moderation_actions a join profiles m on m.id=a.moderator_id where a.report_id=r.id),'[]'::jsonb)
  ) order by case r.status when 'appealed' then 0 when 'open' then 1 when 'reviewing' then 2 else 3 end,r.created_at)
  from moderation_reports r join profiles reporter on reporter.id=r.reporter_id left join profiles assignee on assignee.id=r.assigned_to
  where public.moderation_report_in_scope(r.id,p_scope)),'[]'::jsonb);
end $$;

create or replace function public.apply_moderation_action(p_report uuid,p_action text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare r moderation_reports; scope uuid; target_user uuid;
begin
  select * into r from moderation_reports where id=p_report for update;
  if r is null then raise exception 'report not found'; end if;
  select o.id into scope from organizations o where public.moderation_report_in_scope(r.id,o.id) and public.has_area_role(o.id) order by case o.type when 'school' then 0 when 'local_board' then 1 when 'county_board' then 2 else 3 end limit 1;
  if scope is null then raise exception 'not authorized'; end if;
  if p_action not in ('hide','delete','warn','restrict','deactivate','restore','no_action') or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'invalid action'; end if;
  if r.target_type='post' then
    update posts set moderation_status=case when p_action='restore' then 'visible'::moderation_status when p_action='delete' then 'removed'::moderation_status when p_action='hide' then 'hidden'::moderation_status else moderation_status end,
      deleted_at=case when p_action='delete' then now() when p_action='restore' then null else deleted_at end where id=r.target_id returning actor_user_id into target_user;
  elsif r.target_type='comment' then
    update comments set moderation_status=case when p_action='restore' then 'visible'::moderation_status when p_action='delete' then 'removed'::moderation_status when p_action='hide' then 'hidden'::moderation_status else moderation_status end,
      deleted_at=case when p_action='delete' then now() when p_action='restore' then null else deleted_at end where id=r.target_id returning actor_user_id into target_user;
  elsif r.target_type='profile' then target_user:=r.target_id;
  elsif r.target_type='message' then
    update messages set deleted_at=case when p_action in ('delete','hide') then now() when p_action='restore' then null else deleted_at end where id=r.target_id returning sender_user_id into target_user;
  elsif r.target_type='media' and p_action='delete' then delete from post_media where id=r.target_id;
  end if;
  if p_action='deactivate' and target_user is not null then update profiles set status='deactivated',active_membership_id=null where id=target_user;
  elsif p_action='restore' and r.target_type='profile' and target_user is not null then update profiles set status='active' where id=target_user and not deactivated_by_user;
  elsif p_action='restrict' and target_user is not null then insert into profile_restrictions(user_id,report_id,reason,created_by) values(target_user,r.id,trim(p_reason),auth.uid());
  elsif p_action='warn' and target_user is not null then insert into notifications(user_id,type,title,body,link) values(target_user,'moderation_warning','Advarsel fra moderator',trim(p_reason),'#/profile'); end if;
  insert into moderation_actions(report_id,moderator_id,action,reason) values(r.id,auth.uid(),p_action,trim(p_reason));
  update moderation_reports set status='resolved',assigned_to=auth.uid() where id=r.id;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),scope,'moderation.applied',r.target_type,r.target_id::text,jsonb_build_object('action',p_action,'reason',trim(p_reason),'report_id',r.id));
end $$;

create or replace function public.report_content(p_target_type text,p_target uuid,p_category text,p_description text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare report_id uuid;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_target_type not in ('post','comment','profile','media') then raise exception 'invalid target type'; end if;
  if char_length(trim(coalesce(p_category,'')))<2 or char_length(coalesce(p_description,''))>1000 then raise exception 'invalid report'; end if;
  if (p_target_type='post' and not exists(select 1 from posts p where p.id=p_target and public.can_view_post(p,auth.uid())))
    or (p_target_type='comment' and not exists(select 1 from comments c where c.id=p_target and c.moderation_status='visible' and exists(select 1 from posts p where p.id=c.post_id and public.can_view_post(p,auth.uid()))))
    or (p_target_type='profile' and not exists(select 1 from profiles p where p.id=p_target and p.status='active'))
    or (p_target_type='media' and not exists(select 1 from post_media pm join posts p on p.id=pm.post_id where pm.id=p_target and public.can_view_post(p,auth.uid()))) then raise exception 'content not found'; end if;
  if exists(select 1 from moderation_reports r where r.reporter_id=auth.uid() and r.target_type=p_target_type and r.target_id=p_target and r.status in ('open','reviewing')) then raise exception 'already reported'; end if;
  insert into moderation_reports(reporter_id,target_type,target_id,category,description,status)
    values(auth.uid(),p_target_type,p_target,trim(p_category),nullif(trim(p_description),''),'open') returning id into report_id;
  return report_id;
end $$;

create or replace function public.appeal_moderation_report(p_report uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare r moderation_reports;
begin
  select * into r from moderation_reports where id=p_report for update;
  if r is null or r.status not in ('resolved','closed') or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'report cannot be appealed'; end if;
  if r.reporter_id<>auth.uid() and not (
    (r.target_type='post' and exists(select 1 from posts where id=r.target_id and actor_user_id=auth.uid())) or
    (r.target_type='comment' and exists(select 1 from comments where id=r.target_id and actor_user_id=auth.uid())) or
    (r.target_type='profile' and r.target_id=auth.uid()) or
    (r.target_type='message' and exists(select 1 from messages where id=r.target_id and sender_user_id=auth.uid()))
  ) then raise exception 'not authorized'; end if;
  update moderation_reports set status='appealed',assigned_to=null,description=concat_ws(E'\n\n',description,'Klage: '||trim(p_reason)) where id=p_report;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'moderation.appealed',r.target_type,r.target_id::text,jsonb_build_object('report_id',r.id));
end $$;

revoke all on function public.is_super_admin_account(),public.admin_scope_allows(uuid,uuid),public.moderation_report_in_scope(uuid,uuid),public.get_admin_dashboard(uuid),
  public.admin_manage_user(uuid,uuid,text,uuid,text),public.set_organization_status(uuid,uuid,organization_status,text),public.set_admin_images(uuid,uuid,text,text,boolean),
  public.delete_placeholder(uuid,text,uuid),public.delete_all_placeholders(uuid),public.list_moderation_queue(uuid),public.apply_moderation_action(uuid,text,text),public.appeal_moderation_report(uuid,text) from public;
grant execute on function public.is_super_admin_account(),public.get_admin_dashboard(uuid),public.admin_manage_user(uuid,uuid,text,uuid,text),
  public.set_organization_status(uuid,uuid,organization_status,text),public.set_admin_images(uuid,uuid,text,text,boolean),public.delete_placeholder(uuid,text,uuid),
  public.delete_all_placeholders(uuid),public.list_moderation_queue(uuid),public.apply_moderation_action(uuid,text,text),public.appeal_moderation_report(uuid,text) to authenticated;
revoke all on function public.report_content(text,uuid,text,text) from public;
grant execute on function public.report_content(text,uuid,text,text) to authenticated;

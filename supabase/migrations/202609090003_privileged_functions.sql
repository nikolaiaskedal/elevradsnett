create or replace function public.get_ranked_feed(p_representation_id uuid,p_mode text default 'recommended') returns setof public.posts language sql stable security definer set search_path=public as $$
  with context as (select m.organization_id,o.county,o.local_board_id,o.school_level from memberships m join organizations o on o.id=m.organization_id where m.id=p_representation_id and m.user_id=auth.uid() and m.status='active'), ranked as (
    select p.*,case when p.priority then 120 else 0 end + case when po.local_board_id=c.local_board_id and c.local_board_id is not null then 45 when po.county=c.county then 30 else 0 end + case when f.organization_id is not null then 40 else 0 end + case when po.school_level=c.school_level and c.school_level is not null then 12 else 0 end + greatest(0,36-extract(epoch from(now()-p.published_at))/3600) + least(30,(select count(*) from reactions r where r.post_id=p.id)+(select count(*) from comments cm where cm.post_id=p.id))*.2 as score
    from posts p join organizations po on po.id=p.organization_id cross join context c left join follows f on f.organization_id=p.organization_id and f.user_id=auth.uid() where public.can_view_post(p,auth.uid())
  ) select p.id,p.organization_id,p.actor_user_id,p.body,p.status,p.audience,p.school_level_target,p.priority,p.moderation_status,p.published_at,p.created_at,p.updated_at,p.deleted_at from ranked p order by case when p_mode='chronological' then extract(epoch from p.published_at) else p.score end desc;
$$;

create or replace function public.assign_role(p_user uuid,p_org uuid,p_role admin_role,p_starts date,p_ends date default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin
  if p_user=auth.uid() then raise exception 'self escalation is not allowed'; end if;
  if p_role='super_admin' and not public.has_role(p_org,array['super_admin']::admin_role[]) then raise exception 'only super administrators may grant this role'; end if;
  if p_role<>'super_admin' and not public.has_role(p_org,array['school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_ends is not null and p_ends<p_starts then raise exception 'invalid date range'; end if;
  insert into role_grants(user_id,organization_id,role,start_date,end_date,status,granted_by,accepted_at) values(p_user,p_org,p_role,p_starts,p_ends,'active',auth.uid(),now()) returning id into v_id;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),p_org,'role.assigned','role_grant',v_id::text,jsonb_build_object('user_id',p_user,'role',p_role)); return v_id;
end $$;

create or replace function public.complete_handover(p_handover uuid) returns void language plpgsql security definer set search_path=public as $$ declare h handover_processes; begin
  select * into h from handover_processes where id=p_handover for update; if h is null or h.status not in ('awaiting_acceptance','scheduled','recovery') then raise exception 'handover not ready'; end if;
  if not public.has_role(h.organization_id,array['school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from handover_invites where handover_id=p_handover and admin_role='school_admin' and status='accepted') then raise exception 'accepted successor required'; end if;
  update memberships set status='ended',end_date=h.old_board_ends_on where organization_id=h.organization_id and status='active' and id not in(select membership_id from role_grants where id in(select id from role_grants where accepted_at is not null));
  update role_grants set status='ended',end_date=h.old_board_ends_on where organization_id=h.organization_id and status='active' and role in ('school_admin','content_manager');
  update role_grants r set status='active',accepted_at=coalesce(r.accepted_at,now()) from handover_invites i where i.handover_id=p_handover and i.status='accepted' and r.user_id=i.user_id and r.organization_id=h.organization_id and r.role=i.admin_role;
  update handover_processes set status='completed',completed_at=now(),confirmed_by=auth.uid() where id=p_handover;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),h.organization_id,'handover.completed','handover',p_handover::text);
end $$;

create or replace function public.deactivate_school(p_school uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$ begin
  if not exists(select 1 from organizations where id=p_school and type='school') then raise exception 'school not found'; end if;
  if not public.has_role(p_school,array['school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if char_length(trim(p_reason))<10 then raise exception 'documented reason required'; end if;
  update organizations set status='deactivated',deactivation_reason=trim(p_reason) where id=p_school;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),p_school,'school.deactivated','organization',p_school::text,jsonb_build_object('reason',trim(p_reason)));
end $$;

create or replace function public.apply_moderation_action(p_report uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path=public as $$ declare r moderation_reports; begin
  select * into r from moderation_reports where id=p_report for update; if r is null then raise exception 'report not found'; end if;
  if not exists(select 1 from role_grants where user_id=auth.uid() and role in ('super_admin','board_admin') and status='active') then raise exception 'not authorized'; end if;
  if p_action not in ('hide','delete','warn','restrict','deactivate','restore','no_action') or char_length(trim(p_reason))<5 then raise exception 'invalid action'; end if;
  insert into moderation_actions(report_id,moderator_id,action,reason) values(p_report,auth.uid(),p_action,trim(p_reason)); update moderation_reports set status='resolved',assigned_to=auth.uid() where id=p_report;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'moderation.applied',r.target_type,r.target_id::text,jsonb_build_object('action',p_action,'reason',trim(p_reason)));
end $$;

create or replace function public.confirm_event_attendance(p_delegate uuid,p_attended boolean) returns void language plpgsql security definer set search_path=public as $$ declare d event_delegates; v_org uuid; begin
  select * into d from event_delegates where id=p_delegate for update; select r.organization_id into v_org from event_organization_registrations r where r.id=d.registration_id;
  if d is null or not public.has_role(v_org,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  update event_delegates set status=case when p_attended then 'attended' else 'absent' end,attendance_confirmed_by=auth.uid(),attendance_confirmed_at=now() where id=p_delegate;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details) values(auth.uid(),v_org,'event.attendance_confirmed','event_delegate',p_delegate::text,jsonb_build_object('attended',p_attended));
end $$;

create or replace function public.apply_school_import(p_batch uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare b import_batches; begin
  select * into b from import_batches where id=p_batch for update; if b is null or b.status<>'awaiting_confirmation' then raise exception 'validated batch required'; end if;
  if not exists(select 1 from role_grants where user_id=auth.uid() and role in ('super_admin','board_admin') and status='active') then raise exception 'not authorized'; end if;
  -- A server-side Edge Function validates MIME/UTF-8 and writes normalized rows to row_results.
  insert into organizations(external_id,name,slug,county,local_board_id,contact_email,status,type,school_level)
  select r->>'external_id',r->>'name',r->>'slug',r->>'county',nullif(r->>'local_board_id','')::uuid,r->>'contact_email',coalesce((r->>'status')::organization_status,'active'),'school',r->>'school_level'
  from jsonb_array_elements(b.row_results) r where coalesce(r->>'valid','false')='true'
  on conflict(external_id) do update set name=excluded.name,slug=excluded.slug,county=excluded.county,local_board_id=excluded.local_board_id,contact_email=excluded.contact_email,status=excluded.status,school_level=excluded.school_level;
  update import_batches set status='applied',applied_at=now() where id=p_batch;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'schools.imported','import_batch',p_batch::text,b.summary); return b.summary;
end $$;

grant execute on function public.get_ranked_feed(uuid,text),public.set_active_representation(uuid),public.publish_post(uuid,text,audience_type,content_status),public.cast_organization_vote(uuid,uuid,uuid),public.assign_role(uuid,uuid,admin_role,date,date),public.complete_handover(uuid),public.deactivate_school(uuid,text),public.apply_moderation_action(uuid,text,text),public.confirm_event_attendance(uuid,boolean),public.apply_school_import(uuid) to authenticated;

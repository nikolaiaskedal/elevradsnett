-- Gjenstår fra prompt 9: de tre funksjonene som sletter rader (personlig interesse, avmelding og fjerning av delegat).
-- Resten av 202610090001_arrangementer_cv.sql er kjørt i pilotprosjektet. Supabase-koblingen fra Claude krever en
-- bekreftelse for SQL med «delete» som ikke kan gis fra en økt, så denne delen limes inn i SQL Editor og kjøres der.
-- Innholdet er det samme som i migrasjonen.

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

-- Kontroll: skal gi tre rader.
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('set_event_interest','register_for_event','remove_event_delegate');

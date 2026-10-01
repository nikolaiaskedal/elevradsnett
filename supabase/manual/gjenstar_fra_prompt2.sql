-- Gjenstår fra prompt 2. Kjøres manuelt i SQL Editor i Supabase-prosjektet elevradsnett-pilot.
-- Lim inn hele filen og trykk «Run». Supabase spør om bekreftelse fordi filen inneholder «drop».
--
-- Innholdet er det samme som i migrasjonene, så lokal Supabase og CI trenger ikke denne filen:
--   1. set_event_response fra 202609300001_design_prototype.sql (mangler i pilotprosjektet).
--   2. Ny publish_post med skoleform fra 202610010001_datamodell_pilot.sql (pilotprosjektet har
--      fortsatt den gamle versjonen uten p_school_level_target).
-- Filen kan kjøres flere ganger uten å gjøre skade.

begin;

-- 1. «Skal», «Interessert» og angre for arrangementer.
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

-- 2. publish_post får skoleform (vgs, ungdomsskole eller begge).
drop function if exists public.publish_post(uuid,text,audience_type,content_status);
create or replace function public.publish_post(p_organization_id uuid,p_body text,p_audience audience_type,p_status content_status,p_school_level_target text default 'both') returns public.posts language plpgsql security definer set search_path=public as $$ declare result posts; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization_id) or not public.has_role(p_organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_status not in ('draft','published') or char_length(trim(p_body)) not between 1 and 6000 then raise exception 'invalid post'; end if;
  if p_school_level_target not in ('upper_secondary','lower_secondary','both') then raise exception 'invalid school level'; end if;
  insert into posts(organization_id,actor_user_id,body,audience,status,school_level_target,published_at) values(p_organization_id,auth.uid(),trim(p_body),p_audience,p_status,p_school_level_target,case when p_status='published' then now() end) returning * into result;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),p_organization_id,'post.created','post',result.id::text);
  return result;
end $$;

-- Bare innloggede brukere kan kalle funksjonene (samme regel som 202610010002_function_grants.sql).
revoke all on function public.set_event_response(uuid,uuid,text), public.publish_post(uuid,text,audience_type,content_status,text) from public, anon;
grant execute on function public.set_event_response(uuid,uuid,text), public.publish_post(uuid,text,audience_type,content_status,text) to authenticated;

commit;

-- Kontroll: skal gi to rader, og publish_post skal ha p_school_level_target.
select p.proname, pg_get_function_identity_arguments(p.oid) as argumenter
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('publish_post','set_event_response');

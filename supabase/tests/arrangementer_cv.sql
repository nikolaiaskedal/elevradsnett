-- Atferdstester for prompt 9: arrangementer og CV.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Organisasjoner (i tillegg til demo-skolen Elvebakken i Oslo Sentrum lokallag og fylkesstyret i Oslo):
--   V  skole i Vestland
insert into public.organizations(id,type,name,slug,county,local_board_id,school_level,status) values
('e0000000-0000-4000-8000-0000000000a2','school','Arrangementskole Vestland','arrangementskole-vestland','Vestland',null,'upper_secondary','active');

-- Testbrukere:
--   F  styreadministrator i Oslo (arrangør)        A  skoleadministrator på Elvebakken
--   C  innholdsansvarlig på Elvebakken             D  elev på Elvebakken med verv (delegat)
--   E  elev på Elvebakken uten verv (delegat)      G  elev på Elvebakken, blir deaktivert
--   V  skoleadministrator i Vestland               X  elev uten rettigheter
insert into auth.users(id,email) values
('e1000000-0000-4000-8000-00000000000f','f@example.invalid'),('e1000000-0000-4000-8000-00000000000a','a@example.invalid'),
('e1000000-0000-4000-8000-00000000000c','c@example.invalid'),('e1000000-0000-4000-8000-00000000000d','d@example.invalid'),
('e1000000-0000-4000-8000-00000000000e','e@example.invalid'),('e1000000-0000-4000-8000-000000000009','g@example.invalid'),
('e1000000-0000-4000-8000-000000000002','v@example.invalid'),('e1000000-0000-4000-8000-000000000003','x@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('e1000000-0000-4000-8000-00000000000f','Frode Fylke','f@example.invalid',null,'active'),
('e1000000-0000-4000-8000-00000000000a','Anne Admin','a@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('e1000000-0000-4000-8000-00000000000c','Cecilie Innhold','c@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('e1000000-0000-4000-8000-00000000000d','Didrik Delegat','d@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('e1000000-0000-4000-8000-00000000000e','Emma Elev','e@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('e1000000-0000-4000-8000-000000000009','Gro Går','g@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('e1000000-0000-4000-8000-000000000002','Vegard Vest','v@example.invalid','e0000000-0000-4000-8000-0000000000a2','active'),
('e1000000-0000-4000-8000-000000000003','Xenia Uten','x@example.invalid','00000000-0000-4000-8000-000000000020','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('e1000000-0000-4000-8000-00000000000f',(select id from public.organizations where type='county_board' and county='Oslo'),'board_admin',current_date-10,'active','e1000000-0000-4000-8000-00000000000f'),
('e1000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','school_admin',current_date-10,'active','e1000000-0000-4000-8000-00000000000f'),
('e1000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000020','content_manager',current_date-10,'active','e1000000-0000-4000-8000-00000000000a'),
('e1000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-0000000000a2','school_admin',current_date-10,'active','e1000000-0000-4000-8000-00000000000f');
insert into public.memberships(user_id,organization_id,public_title,start_date,status) values
('e1000000-0000-4000-8000-00000000000d','00000000-0000-4000-8000-000000000020','Nestleder',current_date-10,'active'),
('e1000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000020','Elevrådsmedlem',current_date-10,'active');

create temp table ids(name text primary key,id uuid);
grant all on ids to authenticated,anon;

-- Anon kan lese arrangementer og CV-er, men ikke endre noe.
do $$ begin
  if not has_function_privilege('anon','public.list_events()','execute') then raise exception 'anon kan ikke lese arrangementer'; end if;
  if not has_function_privilege('anon','public.get_person_cv(uuid)','execute') then raise exception 'anon kan ikke lese CV'; end if;
  if has_function_privilege('anon','public.save_event(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text,timestamptz,int,int,text,audience_type,event_status)','execute') then raise exception 'anon kan opprette arrangementer'; end if;
  if has_function_privilege('anon','public.register_for_event(uuid,uuid,boolean)','execute') then raise exception 'anon kan melde på'; end if;
  if has_function_privilege('anon','public.confirm_event_attendance(uuid,boolean)','execute') then raise exception 'anon kan bekrefte oppmøte'; end if;
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='event_interests' and rowsecurity) then raise exception 'event_interests mangler RLS'; end if;
end $$;

-- Arrangøren (styreadministrator i Oslo) oppretter et utkast og publiserer det. Skoler kan ikke arrangere.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
do $$ declare v_org uuid:=(select id from public.organizations where type='county_board' and county='Oslo'); v uuid; begin
  if not exists(select 1 from public.list_my_event_organizers() where id=v_org) then raise exception 'arrangøren får ikke opprette for fylket'; end if;
  begin perform public.save_event(null,v_org,'X','','Beskrivelse','kurs',now()+interval '10 days',now()+interval '10 days 3 hours',
      'Oslo',null,null,null,null,null,'county','draft'); raise exception 'for kort tittel';
  exception when raise_exception then if sqlerrm<>'invalid event' then raise; end if; end;
  begin perform public.save_event(null,v_org,'Kurs i fortiden','','Beskrivelse','kurs',now()-interval '1 day',now(),
      'Oslo',null,null,null,null,null,'county','draft'); raise exception 'arrangement i fortiden';
  exception when raise_exception then if sqlerrm<>'invalid event date' then raise; end if; end;
  begin perform public.save_event(null,v_org,'Uten sted','','Beskrivelse','kurs',now()+interval '1 day',now()+interval '2 days',
      null,null,null,null,null,null,'county','draft'); raise exception 'uten sted eller lenke';
  exception when raise_exception then if sqlerrm<>'invalid event' then raise; end if; end;
  begin perform public.save_event(null,v_org,'Usikker lenke','','Beskrivelse','digitalt',now()+interval '1 day',now()+interval '2 days',
      null,'http://example.invalid',null,null,null,null,'county','draft'); raise exception 'lenke uten https';
  exception when raise_exception then if sqlerrm<>'invalid event' then raise; end if; end;
  v:=public.save_event(null,v_org,'Fylkessamling test','Kort ingress','Lang beskrivelse','samling',now()+interval '10 days',now()+interval '11 days',
      'Sundvolden',null,now()+interval '5 days',1,2,'Gratis','county','draft');
  insert into ids values('event',v);
  v:=public.save_event(null,v_org,'Digitalt møte test','','Beskrivelse','digitalt',now()+interval '3 days',now()+interval '3 days 1 hour',
      null,'https://meet.example.invalid/abc',null,null,null,null,'public','published');
  insert into ids values('digital',v);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.list_events() where id=(select id from ids where name='event')) then raise exception 'utkast er synlig for anon'; end if;
  if not exists(select 1 from public.list_events() where id=(select id from ids where name='digital') and digital and digital_url is null) then raise exception 'lenken til digitalt møte er offentlig'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
do $$ begin
  if exists(select 1 from public.list_events() where id=(select id from ids where name='event')) then raise exception 'utkast er synlig for andre enn arrangøren'; end if;
  if exists(select 1 from public.list_my_event_organizers()) then raise exception 'skoleadministrator kan arrangere'; end if;
  begin perform public.save_event(null,'00000000-0000-4000-8000-000000000020','Skolens eget','','Beskrivelse','annet',now()+interval '3 days',now()+interval '4 days',
      'Aulaen',null,null,null,null,null,'public','published'); raise exception 'skole opprettet arrangement';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.set_event_status((select id from ids where name='digital'),'cancelled'); raise exception 'andre enn arrangøren kunne avlyse';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.register_for_event((select id from ids where name='event'),'00000000-0000-4000-8000-000000000020',true); raise exception 'påmelding til utkast';
  exception when raise_exception then if sqlerrm<>'event not found' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
do $$ declare v uuid:=(select id from ids where name='event'); v_org uuid:=(select id from public.organizations where type='county_board' and county='Oslo'); begin
  perform public.save_event(v,v_org,'Fylkessamling test','Kort ingress','Lang beskrivelse','samling',now()+interval '10 days',now()+interval '11 days',
      'Sundvolden',null,now()+interval '5 days',1,2,'Gratis','county','published');
  begin perform public.save_event(v,v_org,'Fylkessamling test','','Lang beskrivelse','samling',now()+interval '10 days',now()+interval '11 days',
      'Sundvolden',null,null,1,2,null,'county','draft'); raise exception 'publisert ble utkast igjen';
  exception when raise_exception then if sqlerrm<>'invalid status' then raise; end if; end;
  if not exists(select 1 from public.list_events() where id=v and can_edit and status='published') then raise exception 'arrangøren kan ikke redigere'; end if;
end $$;

-- Interesse er personlig og krever ikke verv eller rettigheter.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
do $$ declare v uuid:=(select id from ids where name='event'); begin
  perform public.set_event_interest(v,true);
  perform public.set_event_interest(v,true);
  if not exists(select 1 from public.list_events() where id=v and interested=1 and interested_by_me and registered=0) then raise exception 'interessen telles feil'; end if;
  begin perform public.register_for_event(v,'00000000-0000-4000-8000-000000000020',true); raise exception 'elev uten rettigheter meldte på skolen';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  if (public.get_event_participation(v)->'organizations')<>'[]'::jsonb then raise exception 'elev uten rettigheter får melde på'; end if;
end $$;

-- Innholdsansvarlig melder på skolen. Kapasiteten er én organisasjon, så neste havner på venteliste.
-- Arrangementet er for fylket, så skolen i Vestland kan ikke melde seg på.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000c',true);
do $$ declare v uuid:=(select id from ids where name='event'); p jsonb; begin
  if public.register_for_event(v,'00000000-0000-4000-8000-000000000020',true)<>'registered' then raise exception 'påmeldingen ble ikke registrert'; end if;
  if exists(select 1 from public.list_events() where id=v and (registered<>1 or interested<>1)) then raise exception 'påmelding og interesse blandes'; end if;
  p:=public.get_event_participation(v);
  if p->'organizations'->0->>'status'<>'registered' or (p->'organizations'->0->>'allowed')::boolean is not true then raise exception 'påmeldingen vises ikke: %',p; end if;
  insert into ids values('registration',(p->'organizations'->0->>'registration_id')::uuid);
  if exists(select 1 from public.list_delegate_candidates((select id from ids where name='registration'),'') where display_name='Vegard Vest') then raise exception 'elev ved annen skole kan bli delegat'; end if;
  if not exists(select 1 from public.list_delegate_candidates((select id from ids where name='registration'),'didrik') where office_title='Nestleder') then raise exception 'finner ikke delegat med verv'; end if;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
do $$ declare v uuid:=(select id from ids where name='event'); begin
  begin perform public.register_for_event(v,'e0000000-0000-4000-8000-0000000000a2',true); raise exception 'skole utenfor fylket meldte seg på';
  exception when raise_exception then if sqlerrm<>'outside audience' then raise; end if; end;
  if public.register_for_event((select id from ids where name='digital'),'e0000000-0000-4000-8000-0000000000a2',true)<>'registered' then raise exception 'åpent arrangement'; end if;
  if (select digital_url from public.list_events() where id=(select id from ids where name='digital')) is null then raise exception 'påmeldt ser ikke lenken'; end if;
end $$;
reset role;
-- En annen skole i Oslo fyller ventelisten.
insert into public.organizations(id,type,name,slug,county,school_level,status) values
('e0000000-0000-4000-8000-0000000000a3','school','Ventelisteskolen','ventelisteskolen','Oslo','upper_secondary','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('e1000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-0000000000a3','school_admin',current_date-1,'active','e1000000-0000-4000-8000-00000000000f');
update public.profiles set current_school_id='e0000000-0000-4000-8000-0000000000a3' where id='e1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.register_for_event((select id from ids where name='event'),'e0000000-0000-4000-8000-0000000000a3',true)<>'waitlisted' then raise exception 'full kapasitet ga ikke venteliste'; end if;
end $$;

-- Skoleadministrator melder på delegater. Plassene per organisasjon (2) holder. Delegatene varsles.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
do $$ declare r uuid:=(select id from ids where name='registration'); v uuid; begin
  v:=public.add_event_delegate(r,'e1000000-0000-4000-8000-00000000000d'); insert into ids values('delegate_d',v);
  v:=public.add_event_delegate(r,'e1000000-0000-4000-8000-00000000000e'); insert into ids values('delegate_e',v);
  begin perform public.add_event_delegate(r,'e1000000-0000-4000-8000-000000000009'); raise exception 'for mange delegater';
  exception when raise_exception then if sqlerrm<>'no seats left' then raise; end if; end;
  begin perform public.add_event_delegate(r,'e1000000-0000-4000-8000-00000000000d'); raise exception 'samme delegat to ganger';
  exception when raise_exception then if sqlerrm<>'delegate already added' then raise; end if; end;
  begin perform public.add_event_delegate(r,'e1000000-0000-4000-8000-000000000002'); raise exception 'elev ved annen skole som delegat';
  exception when raise_exception then if sqlerrm<>'person not eligible' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.notifications where type='event.delegate_invited' and user_id in ('e1000000-0000-4000-8000-00000000000d','e1000000-0000-4000-8000-00000000000e'))<>2 then raise exception 'delegatene ble ikke varslet'; end if;
  if (select office_title from public.event_delegates where id=(select id from ids where name='delegate_d'))<>'Nestleder' then raise exception 'vervet ble ikke lagret på delegaten'; end if;
end $$;
set local role authenticated;

-- Delegatene svarer selv. Ingen andre kan svare for dem. E takker nei, så plassen blir ledig for G.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
do $$ begin
  begin perform public.respond_event_delegation((select id from ids where name='delegate_d'),true); raise exception 'administrator svarte for delegaten';
  exception when raise_exception then if sqlerrm<>'delegate not found' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000d',true);
do $$ declare cv jsonb; begin
  cv:=public.get_person_cv(auth.uid());
  if jsonb_array_length(cv->'invitations')<>1 or cv->'invitations'->0->>'status'<>'invited' then raise exception 'invitasjonen vises ikke på egen profil: %',cv; end if;
  perform public.respond_event_delegation((select id from ids where name='delegate_d'),true);
  if public.get_event_participation((select id from ids where name='event'))->'invitations'->0->>'status'<>'confirmed' then raise exception 'bekreftelsen er ikke lagret'; end if;
  begin perform public.confirm_event_attendance((select id from ids where name='delegate_d'),true); raise exception 'delegaten bekreftet eget oppmøte';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000e',true);
select public.respond_event_delegation((select id from ids where name='delegate_e'),false);
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000c',true);
do $$ declare v uuid; begin
  v:=public.add_event_delegate((select id from ids where name='registration'),'e1000000-0000-4000-8000-000000000009'); insert into ids values('delegate_g',v);
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000009',true);
select public.respond_event_delegation((select id from ids where name='delegate_g'),true);

-- Påmelding og delegater er ikke deltakelse: ingenting på CV-en før arrangøren har bekreftet oppmøte.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
do $$ begin
  if jsonb_array_length(public.get_person_cv('e1000000-0000-4000-8000-00000000000d')->'events')<>0 then raise exception 'påmelding havnet på CV-en'; end if;
  if exists(select 1 from public.get_organization_cv('00000000-0000-4000-8000-000000000020') where event_id=(select id from ids where name='event')) then raise exception 'påmelding havnet på skolens CV'; end if;
  begin perform public.confirm_event_attendance((select id from ids where name='delegate_d'),true); raise exception 'oppmøte før start';
  exception when raise_exception then if sqlerrm<>'event not started' then raise; end if; end;
  begin perform public.set_event_status((select id from ids where name='event'),'completed'); raise exception 'avsluttet før start';
  exception when raise_exception then if sqlerrm<>'invalid status' then raise; end if; end;
  if jsonb_array_length(public.get_event_participation((select id from ids where name='event'))->'attendance')<>2 then raise exception 'arrangøren ser ikke påmeldingene'; end if;
end $$;
reset role;
-- Arrangementet har startet (flyttes bakover i tid, og gjøres til Elevtinget hos EO nasjonalt for stjernen).
update public.events set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day',registration_deadline=null where id=(select id from ids where name='event');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
do $$ begin
  begin perform public.register_for_event((select id from ids where name='event'),'00000000-0000-4000-8000-000000000020',false); raise exception 'avmelding etter start';
  exception when raise_exception then if sqlerrm<>'event closed' then raise; end if; end;
  begin perform public.confirm_event_attendance((select id from ids where name='delegate_d'),true); raise exception 'skolen bekreftet egen deltakelse';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
do $$ begin
  begin perform public.confirm_event_attendance((select id from ids where name='delegate_e'),true); raise exception 'oppmøte for delegat som takket nei';
  exception when raise_exception then if sqlerrm<>'delegate not confirmed' then raise; end if; end;
  if public.confirm_all_event_attendance((select id from ids where name='event'))<>2 then raise exception 'feil antall bekreftet'; end if;
  perform public.confirm_event_attendance((select id from ids where name='delegate_g'),false);
  perform public.set_event_status((select id from ids where name='event'),'completed');
end $$;
reset role;
update public.events e set organizer_id='00000000-0000-4000-8000-000000000001',category='landsmote' where e.id=(select id from ids where name='event');
-- G blir deaktivert: vises uten navn på skolens CV.
update public.profiles set status='deactivated' where id='e1000000-0000-4000-8000-000000000009';
update public.event_delegates set status='attended' where id=(select id from ids where name='delegate_g');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare cv jsonb; begin
  cv:=public.get_person_cv('e1000000-0000-4000-8000-00000000000d');
  if jsonb_array_length(cv->'events')<>1 or (cv->'events'->0->>'elevtinget')::boolean is not true or cv->'events'->0->>'office_title'<>'Nestleder' then raise exception 'CV-en mangler arrangementet: %',cv; end if;
  if jsonb_array_length(cv->'offices')<>1 or cv->'offices'->0->>'title'<>'Nestleder' then raise exception 'CV-en mangler vervet: %',cv; end if;
  if cv->'invitations'<>'[]'::jsonb then raise exception 'invitasjoner er synlige for andre'; end if;
  if cv::text like '%content_manager%' or cv::text like '%school_admin%' then raise exception 'interne rettigheter på CV-en'; end if;
  if jsonb_array_length(public.get_person_cv('e1000000-0000-4000-8000-00000000000e')->'events')<>0 then raise exception 'delegat som takket nei har deltakelse'; end if;
  if public.get_person_cv('e1000000-0000-4000-8000-000000000009') is not null then raise exception 'deaktivert person har offentlig CV'; end if;
  if (select count(*) from public.get_organization_cv('00000000-0000-4000-8000-000000000020') where event_id=(select id from ids where name='event'))<>2 then raise exception 'skolens CV har feil antall'; end if;
  if not exists(select 1 from public.get_organization_cv('00000000-0000-4000-8000-000000000020') where display_name='Didrik Delegat' and office_title='Nestleder' and elevtinget) then raise exception 'skolens CV mangler delegaten'; end if;
  if not exists(select 1 from public.get_organization_cv('00000000-0000-4000-8000-000000000020') where display_name='Tidligere tillitsvalgt' and user_id is null) then raise exception 'deaktivert person vises med navn'; end if;
  if (public.get_event_participation((select id from ids where name='event'))->>'can_edit')::boolean then raise exception 'anon kan redigere'; end if;
end $$;
reset role;

-- Avlysning varsler delegatene, og avmelding gir plassen til ventelisten.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
do $$ declare v_org uuid:=(select id from public.organizations where type='county_board' and county='Oslo'); v uuid; begin
  v:=public.save_event(null,v_org,'Kurs som avlyses','','Beskrivelse','kurs',now()+interval '7 days',now()+interval '7 days 2 hours',
      'Oslo',null,null,1,null,null,'public','published');
  insert into ids values('cancel',v);
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
select public.register_for_event((select id from ids where name='cancel'),'00000000-0000-4000-8000-000000000020',true);
do $$ declare r uuid; begin
  select id into r from public.event_organization_registrations where event_id=(select id from ids where name='cancel') and organization_id='00000000-0000-4000-8000-000000000020';
  perform public.add_event_delegate(r,'e1000000-0000-4000-8000-00000000000e');
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.register_for_event((select id from ids where name='cancel'),'e0000000-0000-4000-8000-0000000000a3',true)<>'waitlisted' then raise exception 'venteliste'; end if;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000a',true);
do $$ begin
  perform public.register_for_event((select id from ids where name='cancel'),'00000000-0000-4000-8000-000000000020',false);
end $$;
reset role;
do $$ begin
  if (select status from public.event_organization_registrations where event_id=(select id from ids where name='cancel') and organization_id='e0000000-0000-4000-8000-0000000000a3')<>'registered' then raise exception 'ventelisten rykket ikke opp'; end if;
  if exists(select 1 from public.event_delegates d join public.event_organization_registrations r on r.id=d.registration_id where r.event_id=(select id from ids where name='cancel') and r.organization_id='00000000-0000-4000-8000-000000000020') then raise exception 'delegater ble stående etter avmelding'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
do $$ declare r uuid; begin
  select id into r from public.event_organization_registrations where event_id=(select id from ids where name='cancel') and organization_id='e0000000-0000-4000-8000-0000000000a3';
  perform public.add_event_delegate(r,'e1000000-0000-4000-8000-000000000003');
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-00000000000f',true);
select public.set_event_status((select id from ids where name='cancel'),'cancelled');
do $$ begin
  begin perform public.save_event((select id from ids where name='cancel'),(select id from public.organizations where type='county_board' and county='Oslo'),'Kurs som avlyses','','Beskrivelse','kurs',
      now()+interval '7 days',now()+interval '7 days 2 hours','Oslo',null,null,1,null,null,'public','published'); raise exception 'avlyst arrangement ble endret';
  exception when raise_exception then if sqlerrm<>'event locked' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.notifications where type='event.cancelled' and user_id='e1000000-0000-4000-8000-000000000003') then raise exception 'delegaten ble ikke varslet om avlysning'; end if;
  if (select count(distinct action) from public.audit_logs where action in ('event.created','event.published','event.registered','event.waitlisted','event.unregistered',
      'event.delegate_added','event.delegate_confirmed','event.delegate_declined','event.attendance_confirmed','event.completed','event.cancelled'))<>11 then
    raise exception 'revisjonsloggen mangler arrangementshandlinger';
  end if;
end $$;

rollback;

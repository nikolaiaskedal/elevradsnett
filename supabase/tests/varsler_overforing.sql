-- Atferdstester for prompt 11: varsler, innstillinger, styreoverføring, påminnelser, gjenoppretting og rolleutløp.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Organisasjoner: Elvebakken (demo, Oslo Sentrum lokallag) og T, en testskole i Oslo Vest lokallag.
insert into public.organizations(id,type,name,slug,county,local_board_id,school_level,status) values
('fb000000-0000-4000-8000-0000000000a1','school','Testskole Påminnelse','testskole-paaminnelse','Oslo','00000000-0000-4000-8000-000000000012','upper_secondary','active');

-- Testbrukere:
--   S  superadministrator        F  styreadministrator i Oslo fylkesstyre
--   A  skoleadministrator på Elvebakken (starter overføringen)
--   B  elev på Elvebakken som blir ny leder og skoleadministrator
--   C  elev på Elvebakken som takker nei       N  ny bruker, invitert på e-post før profilen fantes
--   W  skoleadministrator på T (påminnelser)    X  elev på T med en rettighet som utløper
insert into auth.users(id,email) values
('fb100000-0000-4000-8000-000000000005','s@example.invalid'),('fb100000-0000-4000-8000-000000000006','f@example.invalid'),
('fb100000-0000-4000-8000-00000000000a','a@example.invalid'),('fb100000-0000-4000-8000-00000000000b','b@example.invalid'),
('fb100000-0000-4000-8000-00000000000c','c@example.invalid'),('fb100000-0000-4000-8000-00000000000e','ny@example.invalid'),
('fb100000-0000-4000-8000-000000000001','w@example.invalid'),('fb100000-0000-4000-8000-000000000002','x@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('fb100000-0000-4000-8000-000000000005','Siri Super','s@example.invalid',null,'active'),
('fb100000-0000-4000-8000-000000000006','Frida Fylke','f@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('fb100000-0000-4000-8000-00000000000a','Anders Admin','a@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('fb100000-0000-4000-8000-00000000000b','Berit Elev','b@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('fb100000-0000-4000-8000-00000000000c','Carl Elev','c@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('fb100000-0000-4000-8000-000000000001','Wenche Vest','w@example.invalid','fb000000-0000-4000-8000-0000000000a1','active'),
('fb100000-0000-4000-8000-000000000002','Xavier Vest','x@example.invalid','fb000000-0000-4000-8000-0000000000a1','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('fb100000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','super_admin',current_date-30,'active','fb100000-0000-4000-8000-000000000005'),
('fb100000-0000-4000-8000-000000000006',(select id from public.organizations where type='county_board' and county='Oslo'),'board_admin',current_date-30,'active','fb100000-0000-4000-8000-000000000005'),
('fb100000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','school_admin',current_date-30,'active','fb100000-0000-4000-8000-000000000005'),
('fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','school_admin',current_date-30,'active','fb100000-0000-4000-8000-000000000005');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status,granted_by) values
('fb200000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-300,'active',null);

create temporary table ids(name text primary key,id uuid) on commit drop;
grant all on ids to authenticated,anon;

-- Tilgang: anon kan ingenting nytt, innloggede kan ikke kalle de interne funksjonene.
do $$ begin
  if has_function_privilege('anon','public.list_notifications(int)','execute') then raise exception 'anon kan lese varsler'; end if;
  if has_function_privilege('anon','public.start_handover(uuid,date,date,date,jsonb,text)','execute') then raise exception 'anon kan starte overføring'; end if;
  if has_function_privilege('authenticated','public.activate_handover(uuid)','execute') then raise exception 'innlogget kan aktivere direkte'; end if;
  if has_function_privilege('authenticated','public.run_daily_jobs(date)','execute') then raise exception 'innlogget kan kjøre nattjobbene'; end if;
  if has_function_privilege('authenticated','public.notify_user(uuid,text,text,text,text,text)','execute') then raise exception 'innlogget kan lage varsler'; end if;
  if has_function_privilege('authenticated','public.pending_email_digests(int)','execute') then raise exception 'innlogget kan lese andres e-postsammendrag'; end if;
  if not has_function_privilege('service_role','public.pending_email_digests(int)','execute') then raise exception 'service role kan ikke lese sammendraget'; end if;
  if has_table_privilege('authenticated','public.notifications','insert') or has_table_privilege('authenticated','public.notifications','update') then raise exception 'varsler kan skrives direkte'; end if;
  if has_table_privilege('authenticated','public.handover_processes','insert') then raise exception 'overføringer kan skrives direkte'; end if;
  if not exists(select 1 from pg_class where relname='handover_reminders' and relrowsecurity and relforcerowsecurity) then raise exception 'RLS mangler på handover_reminders'; end if;
end $$;

-- Innstillinger: B slår av e-post for meldinger, og begge kanalene for venneråd.
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000b',true);
do $$ begin
  perform public.set_notification_preferences(true,true,array['organization'],array['messages','organization']);
  begin perform public.set_notification_preferences(true,true,array['tull'],'{}'); raise exception 'ukjent kategori ble godtatt';
  exception when raise_exception then if sqlerrm<>'invalid preferences' then raise; end if; end;
  if (select email_off from public.get_notification_preferences())<>array['messages','organization'] then raise exception 'innstillingene ble ikke lagret'; end if;
end $$;

-- Meldinger: ett ulest varsel per samtale, uten innholdet. Ikke for avsenderen.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  v:=public.start_direct_conversation('fb100000-0000-4000-8000-00000000000b');
  insert into ids values('conversation',v);
  perform public.send_message(v,'Hemmelig innhold');
  perform public.send_message(v,'Mer hemmelig innhold');
end $$;
reset role;
do $$ declare n notifications; begin
  select * into n from public.notifications where user_id='fb100000-0000-4000-8000-00000000000b' and type='message.new';
  if n.id is null then raise exception 'mottakeren ble ikke varslet'; end if;
  if (select count(*) from public.notifications where user_id='fb100000-0000-4000-8000-00000000000b' and type='message.new')<>1 or n.item_count<>2 then raise exception 'meldingsvarslene ble ikke slått sammen'; end if;
  if n.title<>'Ny melding fra Anders Admin' or coalesce(n.body,'') like '%hemmelig%' then raise exception 'varselet viser meldingsinnhold'; end if;
  if n.send_email or not n.show_in_app or n.category<>'messages' then raise exception 'innstillingene for meldinger ble ikke fulgt'; end if;
  if exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000a' and type='message.new') then raise exception 'avsenderen ble varslet'; end if;
end $$;

-- Dempet samtale: ingen nye varsler. Lesing og liste gjelder bare egne varsler.
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000b',true);
do $$ declare v uuid:=(select id from ids where name='conversation'); begin
  if (select count(*) from public.list_notifications())<>1 then raise exception 'feil antall varsler i listen'; end if;
  if public.mark_notifications_read()<>1 then raise exception 'varselet ble ikke merket som lest'; end if;
  if exists(select 1 from public.list_notifications() where read_at is null) then raise exception 'uleste varsler etter merking'; end if;
  perform public.set_conversation_muted(v,true);
end $$;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000a',true);
do $$ begin
  perform public.send_message((select id from ids where name='conversation'),'Dempet');
  if exists(select 1 from public.list_notifications() where type='message.new') then raise exception 'A ser varsler for B'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000b' and type='message.new' and read_at is null) then raise exception 'dempet samtale ga varsel'; end if;
end $$;

-- Verv og rettigheter gir varsel til personen.
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000a',true);
do $$ begin perform public.assign_public_office('fb100000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000020','Elevrådsmedlem'); end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000c' and type='office.assigned' and category='roles') then raise exception 'vervet ga ikke varsel'; end if;
end $$;

-- Styreoverføring: bare skoleadministrator starter, og det må finnes en ny skoleadministrator.
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000b',true);
do $$ begin
  begin perform public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+3,current_date+3,'[{"user_id":"fb100000-0000-4000-8000-00000000000b","admin_role":"school_admin"}]'); raise exception 'elev startet overføring';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.get_handover_overview('00000000-0000-4000-8000-000000000020'); raise exception 'elev så overføringen';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  begin perform public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+3,current_date+3,'[{"user_id":"fb100000-0000-4000-8000-00000000000c","admin_role":"content_manager"}]'); raise exception 'overføring uten skoleadministrator';
  exception when raise_exception then if sqlerrm<>'school admin required' then raise; end if; end;
  begin perform public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+3,current_date+3,'[{"user_id":"fb100000-0000-4000-8000-000000000002","admin_role":"school_admin"}]'); raise exception 'elev ved annen skole invitert';
  exception when raise_exception then if sqlerrm<>'person not at school' then raise; end if; end;
  begin perform public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+5,current_date+3,'[{"user_id":"fb100000-0000-4000-8000-00000000000b","admin_role":"school_admin"}]'); raise exception 'gammelt styre slutter etter aktivering';
  exception when raise_exception then if sqlerrm<>'invalid handover dates' then raise; end if; end;
  v:=public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+2,current_date+3,
    '[{"user_id":"fb100000-0000-4000-8000-00000000000b","public_title":" Elevrådsleder ","admin_role":"school_admin"},
      {"user_id":"fb100000-0000-4000-8000-00000000000c","admin_role":"content_manager"},
      {"email":"NY@example.invalid","name":"Nora Ny","public_title":"Nestleder"}]');
  insert into ids values('handover',v);
  begin perform public.start_handover('00000000-0000-4000-8000-000000000020',current_date+3,current_date+3,current_date+3,'[{"user_id":"fb100000-0000-4000-8000-00000000000b","admin_role":"school_admin"}]'); raise exception 'to åpne overføringer';
  exception when raise_exception then if sqlerrm<>'handover already open' then raise; end if; end;
  if (public.get_handover_overview('00000000-0000-4000-8000-000000000020')->'handover'->>'status')<>'awaiting_acceptance' then raise exception 'feil status i oversikten'; end if;
  if jsonb_array_length(public.get_handover_overview('00000000-0000-4000-8000-000000000020')->'handover'->'invites')<>3 then raise exception 'invitasjonene mangler i oversikten'; end if;
end $$;

-- B godtar (overføringen blir planlagt), C takker nei. Gammel administrator beholder tilgangen til aktivering.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000b',true);
do $$ declare v uuid; begin
  if (select count(*) from public.list_my_handover_invites())<>1 then raise exception 'B ser ikke invitasjonen'; end if;
  v:=(select id from public.list_my_handover_invites());
  perform public.respond_handover_invite(v,true);
  begin perform public.respond_handover_invite(v,true); raise exception 'svarte to ganger';
  exception when raise_exception then if sqlerrm<>'invite not pending' then raise; end if; end;
  if public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[]) then raise exception 'B ble administrator før aktivering'; end if;
end $$;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000c',true);
do $$ begin
  begin perform public.respond_handover_invite((select i.id from public.handover_invites i where i.user_id='fb100000-0000-4000-8000-00000000000b'),true); raise exception 'C svarte for B';
  exception when raise_exception then if sqlerrm<>'invite not found' then raise; end if; end;
  perform public.respond_handover_invite((select id from public.list_my_handover_invites()),false);
end $$;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000a',true);
do $$ begin
  if (select status from public.handover_processes where id=(select id from ids where name='handover'))<>'scheduled' then raise exception 'overføringen ble ikke planlagt'; end if;
  if not public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[]) then raise exception 'A mistet tilgangen før aktivering'; end if;
  -- Aktiver nå i stedet for på datoen.
  perform public.complete_handover((select id from ids where name='handover'));
end $$;
reset role;
do $$ begin
  if (select status from public.handover_processes where id=(select id from ids where name='handover'))<>'completed' then raise exception 'overføringen ble ikke fullført'; end if;
  if not public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[],'fb100000-0000-4000-8000-00000000000b') then raise exception 'B ble ikke skoleadministrator'; end if;
  if public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[],'fb100000-0000-4000-8000-00000000000a') then raise exception 'A er fortsatt skoleadministrator'; end if;
  if not exists(select 1 from public.memberships where user_id='fb100000-0000-4000-8000-00000000000b' and public_title='Elevrådsleder' and status='active') then raise exception 'B fikk ikke vervet'; end if;
  if (select status from public.memberships where id='fb200000-0000-4000-8000-00000000000a')<>'ended' then raise exception 'As verv ble ikke avsluttet'; end if;
  if (select end_date from public.memberships where id='fb200000-0000-4000-8000-00000000000a') is null then raise exception 'As verv mangler sluttdato'; end if;
  if exists(select 1 from public.role_grants where user_id='fb100000-0000-4000-8000-00000000000c' and role='content_manager') then raise exception 'C fikk rollen uten å godta'; end if;
  if not exists(select 1 from public.board_terms where organization_id='00000000-0000-4000-8000-000000000020' and status='active') then raise exception 'ny styreperiode mangler'; end if;
  if (select expected_handover_on from public.election_schedules where organization_id='00000000-0000-4000-8000-000000000020')<=current_date+300 then raise exception 'neste styreskifte ble ikke flyttet'; end if;
  if not exists(select 1 from public.audit_logs where action='handover.completed' and target_id=(select id::text from ids where name='handover')) then raise exception 'fullføringen ble ikke logget'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000b' and type='handover.invited') then raise exception 'B ble ikke invitert med varsel'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000a' and type='handover.declined') then raise exception 'A fikk ikke vite at C takket nei'; end if;
  -- E-postinvitasjonen venter på å bli sendt.
  if (select count(*) from public.pending_handover_invite_emails() where email='ny@example.invalid')<>1 then raise exception 'e-postinvitasjonen mangler'; end if;
end $$;

-- N oppretter profil ved skolen med e-postadressen og godtar etter at overføringen er fullført: vervet gis med en gang.
insert into public.profiles(id,display_name,email,current_school_id,status) values('fb100000-0000-4000-8000-00000000000e','Nora Ny','ny@example.invalid','00000000-0000-4000-8000-000000000020','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-00000000000e',true);
do $$ begin
  perform public.respond_handover_invite((select id from public.list_my_handover_invites()),true);
  if not public.has_active_membership('00000000-0000-4000-8000-000000000020') then raise exception 'N fikk ikke vervet etter fullført overføring'; end if;
end $$;

-- Påminnelser: 14 dager før til skoleadministrator, ikke to ganger. Etter 7 dager til styret, etter 21 til superadministrator.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000001',true);
do $$ begin perform public.set_election_date('fb000000-0000-4000-8000-0000000000a1',current_date+14); end $$;
reset role;
do $$ begin
  if public.run_handover_reminders(current_date)<>1 then raise exception 'påminnelsen 14 dager før ble ikke sendt'; end if;
  if public.run_handover_reminders(current_date)<>0 then raise exception 'påminnelsen ble sendt to ganger'; end if;
  if public.run_handover_reminders(current_date+1)<>0 then raise exception 'påminnelse på feil dag'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-000000000001' and type='handover.reminder' and category='handover') then raise exception 'W fikk ikke påminnelsen'; end if;
  perform public.run_handover_reminders(current_date+13);
  if public.run_handover_reminders(current_date+21)<>2 then raise exception 'ukentlig påminnelse og eskalering til styret mangler'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-000000000006' and type='handover.escalated') then raise exception 'styreadministrator ble ikke varslet'; end if;
  if exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-000000000005' and type='handover.escalated') then raise exception 'superadministrator ble varslet for tidlig'; end if;
  if public.run_handover_reminders(current_date+35)<>2 then raise exception 'eskalering til superadministrator mangler'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-000000000005' and type='handover.escalated') then raise exception 'superadministrator ble ikke varslet'; end if;
end $$;

-- Gjenoppretting: bare styret i området, med begrunnelse, og bare når overføringen er forsinket eller skolen mangler administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000006',true);
do $$ begin
  begin perform public.start_handover('fb000000-0000-4000-8000-0000000000a1',current_date,current_date,current_date,'[{"user_id":"fb100000-0000-4000-8000-000000000002","admin_role":"school_admin"}]','Valget er gjennomført'); raise exception 'gjenoppretting før fristen';
  exception when raise_exception then if sqlerrm<>'recovery not allowed' then raise; end if; end;
  begin perform public.start_handover('fb000000-0000-4000-8000-0000000000a1',current_date,current_date,current_date,'[{"user_id":"fb100000-0000-4000-8000-000000000002","admin_role":"school_admin"}]'); raise exception 'styret startet vanlig overføring';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
reset role;
update public.election_schedules set expected_handover_on=current_date-10 where organization_id='fb000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000006',true);
do $$ declare v uuid; begin
  if not (public.get_handover_overview('fb000000-0000-4000-8000-0000000000a1')->>'can_recover')::boolean then raise exception 'styret kan ikke gjenopprette'; end if;
  begin perform public.start_handover('fb000000-0000-4000-8000-0000000000a1',current_date-10,current_date,current_date,'[{"user_id":"fb100000-0000-4000-8000-000000000002","admin_role":"school_admin"}]','kort'); raise exception 'for kort begrunnelse';
  exception when raise_exception then if sqlerrm<>'invalid reason' then raise; end if; end;
  v:=public.start_handover('fb000000-0000-4000-8000-0000000000a1',current_date-10,current_date,current_date,'[{"user_id":"fb100000-0000-4000-8000-000000000002","admin_role":"school_admin"}]','Valget er gjennomført, men overføringen er ikke gjort.');
  if not (select is_recovery from public.handover_processes where id=v) then raise exception 'gjenopprettingen er ikke merket'; end if;
end $$;
-- X godtar, og overføringen aktiveres med en gang fordi aktiveringsdatoen er i dag.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000002',true);
do $$ begin
  perform public.respond_handover_invite((select id from public.list_my_handover_invites()),true);
  if not public.has_role('fb000000-0000-4000-8000-0000000000a1',array['school_admin']::admin_role[]) then raise exception 'gjenopprettingen ga ikke X rollen'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.audit_logs where action='handover.recovery_started' and organization_id='fb000000-0000-4000-8000-0000000000a1') then raise exception 'gjenopprettingen ble ikke logget'; end if;
end $$;

-- Rolleutløp: rettigheter med passert sluttdato avsluttes. Mister skolen siste administrator, varsles styret.
update public.role_grants set start_date=current_date-5,end_date=current_date-1 where organization_id='fb000000-0000-4000-8000-0000000000a1' and role='school_admin' and status='active';
do $$ begin
  if public.has_role('fb000000-0000-4000-8000-0000000000a1',array['school_admin']::admin_role[],'fb100000-0000-4000-8000-000000000002') then raise exception 'utløpt rolle gir fortsatt tilgang'; end if;
  if public.expire_roles(current_date)<1 then raise exception 'ingen roller utløp'; end if;
  if exists(select 1 from public.role_grants where organization_id='fb000000-0000-4000-8000-0000000000a1' and status='active' and end_date<current_date) then raise exception 'utløpt rolle har fortsatt status aktiv'; end if;
  if not exists(select 1 from public.audit_logs where action='role.expired' and organization_id='fb000000-0000-4000-8000-0000000000a1') then raise exception 'utløpet ble ikke logget'; end if;
  if not exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-000000000006' and type='handover.no_admin') then raise exception 'styret ble ikke varslet om skole uten administrator'; end if;
  if (public.run_daily_jobs(current_date)->>'expired')::int<>0 then raise exception 'nattjobben avsluttet roller to ganger'; end if;
end $$;

-- E-postsammendrag: ett per bruker, bare uleste varsler med e-post på, og merkes som sendt.
do $$ declare d record; begin
  select * into d from public.pending_email_digests() where user_id='fb100000-0000-4000-8000-00000000000b';
  if d.user_id is null then raise exception 'B mangler sammendrag'; end if;
  if exists(select 1 from jsonb_array_elements(d.items) x where x->>'title' like 'Ny melding%') then raise exception 'meldinger kom med i e-posten selv om det er slått av'; end if;
  perform public.mark_email_digest_sent(d.user_id,d.until);
  if exists(select 1 from public.pending_email_digests() where user_id='fb100000-0000-4000-8000-00000000000b') then raise exception 'sammendraget ble sendt to ganger'; end if;
end $$;

-- Deaktiverte brukere får ingen varsler.
update public.profiles set status='deactivated' where id='fb100000-0000-4000-8000-00000000000c';
do $$ begin
  perform public.notify_user('fb100000-0000-4000-8000-00000000000c','role.assigned','Test');
  if exists(select 1 from public.notifications where user_id='fb100000-0000-4000-8000-00000000000c' and title='Test') then raise exception 'deaktivert bruker fikk varsel'; end if;
end $$;

rollback;

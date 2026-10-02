-- Atferdstester for prompt 4: medlemskap, roller og aktiv representasjon.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Organisasjoner (i tillegg til demo-skolen Elvebakken i Oslo Sentrum lokallag):
--   W  skole i Oslo Vest lokallag   V  skole i Vestland   Z  skole som deaktiveres
insert into public.organizations(id,type,name,slug,county,local_board_id,school_level,status) values
('f0000000-0000-4000-8000-0000000000a1','school','Testskole Vest','testskole-vest','Oslo','00000000-0000-4000-8000-000000000012','upper_secondary','active'),
('f0000000-0000-4000-8000-0000000000a2','school','Testskole Vestland','testskole-vestland','Vestland',null,'upper_secondary','active'),
('f0000000-0000-4000-8000-0000000000a3','school','Testskole Nedlagt','testskole-nedlagt','Oslo',null,'lower_secondary','active');

-- Testbrukere:
--   S  superadministrator                         F  styreadministrator i Oslo, går på Elvebakken
--   A  eneste skoleadministrator på Elvebakken     B  elev på Elvebakken uten rettigheter
--   C  elev på Elvebakken som ber om å bli skoleadministrator
--   D  elev på Elvebakken som ber om det samme, men bytter skole
--   W  elev på Testskole Vest                      X  elev i Vestland
--   Z  elev med verv på skolen som deaktiveres
insert into auth.users(id,email) values
('f1000000-0000-4000-8000-000000000005','s@example.invalid'),('f1000000-0000-4000-8000-000000000006','f@example.invalid'),
('f1000000-0000-4000-8000-00000000000a','a@example.invalid'),('f1000000-0000-4000-8000-00000000000b','b@example.invalid'),
('f1000000-0000-4000-8000-00000000000c','c@example.invalid'),('f1000000-0000-4000-8000-00000000000d','d@example.invalid'),
('f1000000-0000-4000-8000-000000000001','w@example.invalid'),('f1000000-0000-4000-8000-000000000002','x@example.invalid'),
('f1000000-0000-4000-8000-000000000003','z@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('f1000000-0000-4000-8000-000000000005','Siri Super','s@example.invalid',null,'active'),
('f1000000-0000-4000-8000-000000000006','Frida Fylke','f@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f1000000-0000-4000-8000-00000000000a','Anders Admin','a@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f1000000-0000-4000-8000-00000000000b','Berit Elev','b@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f1000000-0000-4000-8000-00000000000c','Carl Søker','c@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f1000000-0000-4000-8000-00000000000d','Dina Bytter','d@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f1000000-0000-4000-8000-000000000001','Wenche Vest','w@example.invalid','f0000000-0000-4000-8000-0000000000a1','active'),
('f1000000-0000-4000-8000-000000000002','Xavier Vestland','x@example.invalid','f0000000-0000-4000-8000-0000000000a2','active'),
('f1000000-0000-4000-8000-000000000003','Zara Nedlagt','z@example.invalid','f0000000-0000-4000-8000-0000000000a3','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('f1000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','super_admin',current_date-10,'active','f1000000-0000-4000-8000-000000000005'),
('f1000000-0000-4000-8000-000000000006',(select id from public.organizations where type='county_board' and county='Oslo'),'board_admin',current_date-10,'active','f1000000-0000-4000-8000-000000000005'),
('f1000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','school_admin',current_date-10,'active','f1000000-0000-4000-8000-000000000005');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status) values
('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-0000000000a3','Elevrådsleder',current_date-10,'active');
update public.profiles set active_membership_id='f2000000-0000-4000-8000-000000000003' where id='f1000000-0000-4000-8000-000000000003';

-- Anon kan bare lese en enkelt organisasjon, ikke kalle noe av det nye.
do $$ begin
  if has_function_privilege('anon','public.assign_public_office(uuid,uuid,text,date)','execute') then raise exception 'anon kan gi verv'; end if;
  if has_function_privilege('anon','public.revoke_role(uuid)','execute') then raise exception 'anon kan fjerne roller'; end if;
  if has_function_privilege('anon','public.list_organization_roles(uuid)','execute') then raise exception 'anon kan liste roller'; end if;
  if has_function_privilege('anon','public.list_audit_log(uuid,int)','execute') then raise exception 'anon kan lese revisjonsloggen'; end if;
  if not has_function_privilege('anon','public.get_public_organization(uuid)','execute') then raise exception 'anon kan ikke lese en organisasjon'; end if;
end $$;

-- Skoleadministrator A gir B et offentlig verv. Vervet gir representasjon, men ikke publiseringsrett.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  v:=public.assign_public_office('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','  Nestleder ');
  begin perform public.assign_public_office('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','nestleder'); raise exception 'samme verv to ganger';
  exception when raise_exception then if sqlerrm<>'office already assigned' then raise; end if; end;
  begin perform public.assign_public_office('f1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','Medlem'); raise exception 'verv til elev ved annen skole';
  exception when raise_exception then if sqlerrm<>'person not at school' then raise; end if; end;
  begin perform public.assign_public_office('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','X'); raise exception 'for kort tittel';
  exception when raise_exception then if sqlerrm<>'invalid title' then raise; end if; end;
  -- En administrator kan gi seg selv et verv i egen organisasjon, men ingen intern rettighet.
  perform public.assign_public_office(auth.uid(),'00000000-0000-4000-8000-000000000020','Elevrådsleder');
  begin perform public.assign_role(auth.uid(),'00000000-0000-4000-8000-000000000020','content_manager',current_date); raise exception 'selvtildeling ble godtatt';
  exception when raise_exception then if sqlerrm<>'self escalation is not allowed' then raise; end if; end;
  begin perform public.assign_role('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','board_admin',current_date); raise exception 'styreadministrator på skole';
  exception when raise_exception then if sqlerrm<>'invalid role' then raise; end if; end;
  begin perform public.assign_role('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000001','super_admin',current_date); raise exception 'skoleadmin ga superadministrator';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.assign_public_office('f1000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-0000000000a1','Medlem'); raise exception 'skoleadmin ga verv ved annen skole';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000b',true);
do $$ declare s jsonb; begin
  s:=public.get_my_session();
  if jsonb_array_length(s->'representations')<>1 or s->'representations'->0->>'public_title'<>'Nestleder' or (s->'representations'->0->>'can_publish')::boolean then raise exception 'feil representasjon etter verv: %',s; end if;
  if s->'representations'->0->>'organization_status'<>'active' then raise exception 'organisasjonsstatus mangler i økten'; end if;
  perform public.set_active_representation((s->'representations'->0->>'id')::uuid);
  begin perform public.list_organization_roles('00000000-0000-4000-8000-000000000020'); raise exception 'elev uten rettigheter kan liste roller';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  if exists(select 1 from public.list_my_admin_organizations()) then raise exception 'elev uten rettigheter har administrasjon'; end if;
end $$;

-- A gir B rollen innholdsansvarlig: nå kan B publisere. Innholdsansvarlig kan ikke tildele roller.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000a',true);
select public.assign_role('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','content_manager',current_date);
do $$ begin
  begin perform public.assign_role('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','content_manager',current_date); raise exception 'samme rolle to ganger';
  exception when raise_exception then if sqlerrm<>'role already assigned' then raise; end if; end;
  if not exists(select 1 from public.list_my_admin_organizations() where id='00000000-0000-4000-8000-000000000020' and my_role='school_admin'
    and grantable_roles @> array['school_admin','content_manager']::admin_role[] and not grantable_roles && array['board_admin','super_admin']::admin_role[]) then
    raise exception 'skoleadministrator får feil organisasjoner eller roller å tildele';
  end if;
  if (select count(*) from public.list_my_admin_organizations())<>1 then raise exception 'skoleadministrator administrerer mer enn egen skole'; end if;
  if not exists(select 1 from public.list_organization_roles('00000000-0000-4000-8000-000000000020') where kind='role' and role='content_manager' and display_name='Berit Elev' and can_change) then raise exception 'administrator ser ikke innholdsansvarlig'; end if;
  if not exists(select 1 from public.list_assignable_people('00000000-0000-4000-8000-000000000020','berit') where display_name='Berit Elev') then raise exception 'finner ikke elev ved skolen'; end if;
  if exists(select 1 from public.list_assignable_people('00000000-0000-4000-8000-000000000020','') where display_name in ('Wenche Vest','Xavier Vestland')) then raise exception 'personsøket viser elever ved andre skoler'; end if;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if not (public.get_my_session()->'representations'->0->>'can_publish')::boolean then raise exception 'innholdsansvarlig kan ikke publisere'; end if;
  if not exists(select 1 from public.get_my_roles() where kind='role' and role='content_manager') then raise exception 'personen ser ikke sin egen rolle'; end if;
  begin perform public.assign_public_office('f1000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000020','Medlem'); raise exception 'innholdsansvarlig ga verv';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.assign_role('f1000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000020','content_manager',current_date); raise exception 'innholdsansvarlig tildelte rolle';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;

-- Innholdsansvarlig er skjult for andre: en elev ved en annen skole ser ingen roller, og offentlige verv har ingen roller.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.role_grants where user_id='f1000000-0000-4000-8000-00000000000b') then raise exception 'rollen er synlig for uvedkommende'; end if;
  begin perform public.list_organization_roles('00000000-0000-4000-8000-000000000020'); raise exception 'uvedkommende kan liste roller';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  if not exists(select 1 from public.get_public_officers('00000000-0000-4000-8000-000000000020') where public_title='Nestleder') then raise exception 'offentlig verv vises ikke'; end if;
  begin perform public.list_audit_log('00000000-0000-4000-8000-000000000020'); raise exception 'uvedkommende kan lese revisjonsloggen';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;

-- Siste administrator kan ikke fjernes. Når B blir administrator, kan A gå av, og B blir den siste.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000a',true);
do $$ declare v_a uuid; v_b uuid; begin
  select id into v_a from public.role_grants where user_id=auth.uid() and role='school_admin' and status='active';
  begin perform public.revoke_role(v_a); raise exception 'siste skoleadministrator gikk av';
  exception when raise_exception then if sqlerrm<>'last administrator' then raise; end if; end;
  v_b:=public.assign_role('f1000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000020','school_admin',current_date);
  perform public.revoke_role(v_a);
  if public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[]) then raise exception 'A er fortsatt administrator'; end if;
  begin perform public.revoke_role(v_b); raise exception 'tidligere administrator kunne fjerne rolle';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.role_grants where user_id='f1000000-0000-4000-8000-00000000000a' and role='school_admin' and status='revoked'
    and revoked_by='f1000000-0000-4000-8000-00000000000a' and revoked_at is not null and end_date=current_date) then raise exception 'tilbakekallingen er ikke registrert med hvem og når'; end if;
  if not exists(select 1 from public.role_grants where user_id='f1000000-0000-4000-8000-00000000000b' and role='school_admin' and granted_by='f1000000-0000-4000-8000-00000000000a') then raise exception 'tildelingen mangler hvem som tildelte'; end if;
end $$;

-- Styreadministrator F: fylket, eget lokallag (Oslo Sentrum) og skolene i fylket, men ikke Oslo Vest lokallag.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000006',true);
do $$ declare v_cb uuid:=(select id from public.organizations where type='county_board' and county='Oslo'); begin
  if not exists(select 1 from public.list_my_admin_organizations() where id=v_cb and my_role='board_admin') then raise exception 'styreadmin mangler fylkesstyret'; end if;
  if not exists(select 1 from public.list_my_admin_organizations() where id='00000000-0000-4000-8000-000000000013') then raise exception 'styreadmin mangler eget lokallag'; end if;
  if exists(select 1 from public.list_my_admin_organizations() where id='00000000-0000-4000-8000-000000000012') then raise exception 'styreadmin har annet lokallag'; end if;
  if not exists(select 1 from public.list_my_admin_organizations() where id='f0000000-0000-4000-8000-0000000000a1') then raise exception 'styreadmin mangler skole i fylket'; end if;
  if exists(select 1 from public.list_my_admin_organizations() where id='f0000000-0000-4000-8000-0000000000a2') then raise exception 'styreadmin har skole i annet fylke'; end if;
  perform public.assign_role('f1000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000013','content_manager',current_date);
  begin perform public.assign_role('f1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','content_manager',current_date); raise exception 'styreadmin tildelte i annet lokallag';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.assign_role('f1000000-0000-4000-8000-00000000000c',v_cb,'board_admin',current_date); raise exception 'styreadmin tildelte styreadministrator';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  -- Verv ved en skole i området, men ikke til seg selv via områderetten.
  perform public.assign_public_office('f1000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-0000000000a1','Elevrådsleder');
  begin perform public.assign_public_office(auth.uid(),'f0000000-0000-4000-8000-0000000000a1','Elevrådsleder'); raise exception 'styreadmin ga seg selv verv ved skole';
  exception when raise_exception then if sqlerrm<>'self escalation is not allowed' then raise; end if; end;
  -- B er nå eneste skoleadministrator; heller ikke styreadministrator kan fjerne den siste.
  begin perform public.revoke_role((select id from public.list_organization_roles('00000000-0000-4000-8000-000000000020') where kind='role' and role='school_admin' and status='active'));
    raise exception 'styreadmin fjernet siste skoleadministrator';
  exception when raise_exception then if sqlerrm<>'last administrator' then raise; end if; end;
end $$;

-- Superadministrator tildeler styreadministrator, men ikke til seg selv.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
do $$ declare v_cb uuid:=(select id from public.organizations where type='county_board' and county='Vestland'); begin
  perform public.assign_role('f1000000-0000-4000-8000-000000000002',v_cb,'board_admin',current_date);
  begin perform public.assign_role(auth.uid(),v_cb,'board_admin',current_date); raise exception 'superadmin tildelte seg selv';
  exception when raise_exception then if sqlerrm<>'self escalation is not allowed' then raise; end if; end;
  if not exists(select 1 from public.list_my_admin_organizations() where id=v_cb and my_role='super_admin' and grantable_roles @> array['board_admin']::admin_role[]) then raise exception 'superadmin kan ikke tildele styreadministrator'; end if;
  begin perform public.revoke_role((select id from public.role_grants where user_id=auth.uid() and role='super_admin')); raise exception 'siste superadministrator gikk av';
  exception when raise_exception then if sqlerrm<>'last administrator' then raise; end if; end;
end $$;

-- B går av fra vervet selv. Den aktive representasjonen nullstilles, og vervet blir historikk.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000b',true);
do $$ declare v uuid; s jsonb; begin
  select id into v from public.get_my_roles() where kind='office' and status='active';
  perform public.end_public_office(v);
  s:=public.get_my_session();
  if jsonb_array_length(s->'representations')<>0 or s->>'active_membership_id' is not null then raise exception 'vervet er fortsatt aktivt: %',s; end if;
  if not exists(select 1 from public.get_my_roles() where id=v and status='ended' and end_date=current_date) then raise exception 'avsluttet verv mangler i historikken'; end if;
  begin perform public.end_public_office(v); raise exception 'avsluttet verv to ganger';
  exception when raise_exception then if sqlerrm<>'office not active' then raise; end if; end;
  if public.has_active_membership('00000000-0000-4000-8000-000000000020') then raise exception 'avsluttet verv gir fortsatt representasjon'; end if;
end $$;

-- Forespørsel om skoleadministrator: C ber, F (styreadministrator i fylket) godkjenner. A (ikke styre) ser den ikke.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000c',true);
select public.request_school_admin('00000000-0000-4000-8000-000000000020','Jeg er nyvalgt leder.');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000d',true);
select public.request_school_admin('00000000-0000-4000-8000-000000000020');
do $$ begin
  if (select count(*) from public.list_school_admin_requests() where mine and not can_decide)<>1 then raise exception 'søkeren ser ikke egen forespørsel'; end if;
  perform public.change_school('f0000000-0000-4000-8000-0000000000a1');
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if exists(select 1 from public.list_school_admin_requests()) then raise exception 'skoleadministrator ser forespørsler som styret avgjør'; end if;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000006',true);
do $$ declare v_c uuid; v_d uuid; begin
  select id into v_c from public.list_school_admin_requests() where display_name='Carl Søker' and can_decide;
  select id into v_d from public.list_school_admin_requests() where display_name='Dina Bytter' and can_decide;
  if v_c is null or v_d is null then raise exception 'styreadmin ser ikke forespørslene'; end if;
  perform public.decide_school_admin_request(v_c,true,'Bekreftet.');
  if not public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[],'f1000000-0000-4000-8000-00000000000c') then raise exception 'godkjenning ga ikke rollen'; end if;
  begin perform public.decide_school_admin_request(v_d,true); raise exception 'godkjente søker som har byttet skole';
  exception when raise_exception then if sqlerrm<>'request outdated' then raise; end if; end;
  perform public.decide_school_admin_request(v_d,false,'Går ikke lenger på skolen.');
  if exists(select 1 from public.list_school_admin_requests()) then raise exception 'avgjorte forespørsler vises fortsatt som ventende'; end if;
end $$;

-- Revisjonsloggen viser alle endringene med navn, for administratorer i området.
do $$ begin
  if (select count(distinct action) from public.list_audit_log('00000000-0000-4000-8000-000000000020',100)
      where action in ('office.assigned','office.ended','role.assigned','role.revoked','school_admin.requested','school_admin.approved','school_admin.rejected'))<>7 then
    raise exception 'revisjonsloggen mangler handlinger';
  end if;
  if not exists(select 1 from public.list_audit_log('00000000-0000-4000-8000-000000000020',100) where action='role.assigned' and actor_name='Anders Admin' and subject_name='Berit Elev') then raise exception 'revisjonsloggen mangler navn'; end if;
end $$;
reset role;

-- Deaktivert skole: vervet vises fortsatt, men kan ikke brukes til å opptre for skolen.
update public.organizations set status='deactivated',deactivation_reason='Skolen er lagt ned.' where id='f0000000-0000-4000-8000-0000000000a3';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
do $$ declare s jsonb; begin
  s:=public.get_my_session();
  if s->'representations'->0->>'organization_status'<>'deactivated' or (s->'representations'->0->>'can_publish')::boolean then raise exception 'deaktivert skole vises ikke tydelig i økten: %',s; end if;
  if public.has_active_membership('f0000000-0000-4000-8000-0000000000a3') then raise exception 'verv i deaktivert skole gir representasjon'; end if;
  begin perform public.set_active_representation('f2000000-0000-4000-8000-000000000003'); raise exception 'kunne representere deaktivert skole';
  exception when raise_exception then if sqlerrm<>'invalid representation' then raise; end if; end;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if not exists(select 1 from public.get_public_organization('f0000000-0000-4000-8000-0000000000a3') where status='deactivated' and officer_count=0) then raise exception 'deaktivert skole kan ikke åpnes'; end if;
  if exists(select 1 from public.list_public_organizations() where id='f0000000-0000-4000-8000-0000000000a3') then raise exception 'deaktivert skole er i listen'; end if;
end $$;
reset role;

rollback;

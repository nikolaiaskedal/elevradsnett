-- Atferdstester for migrasjonen fra prompt 2. Kjøres med `npm run test:db` etter migrasjoner og seed.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Testbrukere:
--   A  elev ved Elvebakken (lokallag Oslo Sentrum)
--   B  styreadministrator i Fylkesstyret i Oslo, går selv på Elvebakken
--   C  bruker uten rettigheter
--   D  tidligere tillitsvalgt som har deaktivert profilen
insert into auth.users(id,email) values
('a0000000-0000-4000-8000-00000000000a','a@example.invalid'),('a0000000-0000-4000-8000-00000000000b','b@example.invalid'),
('a0000000-0000-4000-8000-00000000000c','c@example.invalid'),('a0000000-0000-4000-8000-00000000000d','d@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('a0000000-0000-4000-8000-00000000000a','Astrid Testelev','a@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('a0000000-0000-4000-8000-00000000000b','Bjørn Fylkesleder','b@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('a0000000-0000-4000-8000-00000000000c','Cecilie Utenfor','c@example.invalid',null,'active'),
('a0000000-0000-4000-8000-00000000000d','Dagfinn Tidligere','d@example.invalid','00000000-0000-4000-8000-000000000020','deactivated');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('a0000000-0000-4000-8000-00000000000b',(select id from public.organizations where type='county_board' and county='Oslo'),'board_admin',current_date-1,'active','a0000000-0000-4000-8000-00000000000c');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,end_date,status) values
('b0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-30,null,'active'),
('b0000000-0000-4000-8000-00000000000d','a0000000-0000-4000-8000-00000000000d','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-400,current_date-40,'ended');

-- Alle tabeller i public har RLS slått på og tvunget.
do $$ declare missing text; begin
  select string_agg(c.relname,', ') into missing from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity);
  if missing is not null then raise exception 'RLS mangler eller er ikke tvunget på: %',missing; end if;
end $$;

-- Fylkesstyreregelen: B får styrerettigheter i eget lokallag (Oslo Sentrum), ikke i andre lokallag i fylket.
do $$ begin
  if not public.has_role('00000000-0000-4000-8000-000000000013',array['board_admin']::admin_role[],'a0000000-0000-4000-8000-00000000000b') then raise exception 'fylkesstyreadmin mangler rettighet i eget lokallag'; end if;
  if public.has_role('00000000-0000-4000-8000-000000000012',array['board_admin']::admin_role[],'a0000000-0000-4000-8000-00000000000b') then raise exception 'fylkesstyreadmin fikk rettighet i annet lokallag'; end if;
  if public.has_role('00000000-0000-4000-8000-000000000013',array['school_admin']::admin_role[],'a0000000-0000-4000-8000-00000000000b') then raise exception 'regelen skal bare gjelde styrerettigheter'; end if;
  if not public.has_area_role('00000000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-00000000000b') then raise exception 'fylkesstyreadmin mangler myndighet over skole i fylket'; end if;
end $$;

-- Bildehierarkiet: uten egne bilder arver skolen EO-logoen globalt.
do $$ declare r record; begin
  select * into r from public.resolve_organization_images('00000000-0000-4000-8000-000000000020');
  if r.profile_image_source<>'global' or r.profile_image_path<>'public-avatars/defaults/eo-logo.png' then raise exception 'forventet global EO-logo, fikk % %',r.profile_image_source,r.profile_image_path; end if;
  if r.cover_image_source<>'none' then raise exception 'forventet ingen cover'; end if;
  update public.organizations set default_cover_image_path='county-cover.webp' where id=(select id from public.organizations where type='county_board' and county='Oslo');
  update public.organizations set default_cover_image_path='local-cover.webp' where id='00000000-0000-4000-8000-000000000013';
  update public.organizations set cover_image_path='own-cover.webp' where id='00000000-0000-4000-8000-000000000020';
  select * into r from public.resolve_organization_images('00000000-0000-4000-8000-000000000020');
  if r.cover_image_source<>'own' then raise exception 'eget bilde skal vinne'; end if;
  update public.organizations set image_locked=true where id='00000000-0000-4000-8000-000000000020';
  select * into r from public.resolve_organization_images('00000000-0000-4000-8000-000000000020');
  if r.cover_image_source<>'local_board' or r.cover_image_path<>'local-cover.webp' then raise exception 'låst bilde skal gi lokallagets standard'; end if;
  update public.organizations set default_cover_image_path=null where id='00000000-0000-4000-8000-000000000013';
  select * into r from public.resolve_organization_images('00000000-0000-4000-8000-000000000020');
  if r.cover_image_source<>'county' then raise exception 'uten lokallagsstandard skal fylket gjelde'; end if;
  update public.organizations set image_locked=false where id='00000000-0000-4000-8000-000000000020';
end $$;

-- Forespørsel om skoleadministrator.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000a',true);
select public.request_school_admin('00000000-0000-4000-8000-000000000020','Jeg er elevrådsleder.');
do $$ begin
  if (select count(*) from public.school_admin_requests)<>1 then raise exception 'søkeren skal se egen forespørsel'; end if;
  begin perform public.request_school_admin('00000000-0000-4000-8000-000000000020'); raise exception 'dobbel forespørsel ble godtatt';
  exception when unique_violation then null; end;
  begin perform public.decide_school_admin_request((select id from public.school_admin_requests limit 1),true); raise exception 'søkeren godkjente seg selv';
  exception when raise_exception then if sqlerrm not like 'self escalation%' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
do $$ begin
  if (select count(*) from public.school_admin_requests)<>0 then raise exception 'uvedkommende ser forespørselen'; end if;
end $$;

reset role;
do $$ declare v uuid:=(select id from public.school_admin_requests limit 1); begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
  begin perform public.decide_school_admin_request(v,true); raise exception 'bruker uten rettigheter godkjente';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000b',true);
  if (select count(*) from public.school_admin_requests)<>1 then raise exception 'styreadmin ser ikke forespørselen'; end if;
  perform public.decide_school_admin_request(v,true,'Bekreftet med rektor.');
  if not public.has_role('00000000-0000-4000-8000-000000000020',array['school_admin']::admin_role[],'a0000000-0000-4000-8000-00000000000a') then raise exception 'godkjenning ga ikke skoleadministrator'; end if;
end $$;

-- Skoleadministrator kan ikke endre bildelåsen eller statusen selv.
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000a',true);
do $$ begin
  begin update public.organizations set image_locked=true where id='00000000-0000-4000-8000-000000000020'; raise exception 'skoleadmin låste bildet';
  exception when raise_exception then if sqlerrm<>'field requires super administrator' then raise; end if; end;
  begin update public.organizations set status='archived' where id='00000000-0000-4000-8000-000000000020'; raise exception 'skoleadmin endret status';
  exception when raise_exception then if sqlerrm<>'field requires super administrator' then raise; end if; end;
  update public.organizations set bio='Ny biografi.' where id='00000000-0000-4000-8000-000000000020';
end $$;

-- Innlegg med skoleform og endringshistorikk.
do $$ declare v_post uuid; begin
  select id into v_post from public.publish_post('00000000-0000-4000-8000-000000000020','Første versjon om skolemat.','public','published','upper_secondary');
  if (select school_level_target from public.posts where id=v_post)<>'upper_secondary' then raise exception 'skoleform ble ikke lagret'; end if;
  perform public.edit_post(v_post,'Andre versjon om skolemat.','public','both');
  if (select edited_at from public.posts where id=v_post) is null then raise exception 'innlegget ble ikke merket redigert'; end if;
  if (select count(*) from public.post_revisions where post_id=v_post and body='Første versjon om skolemat.')<>1 then raise exception 'historikken mangler'; end if;
  begin perform public.publish_post('00000000-0000-4000-8000-000000000020','Ugyldig','public','published','barnehage'); raise exception 'ugyldig skoleform godtatt';
  exception when raise_exception then if sqlerrm<>'invalid school level' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
do $$ begin
  if (select count(*) from public.post_revisions)<>0 then raise exception 'uvedkommende ser endringshistorikk'; end if;
  if (select count(*) from public.posts where body like 'Andre versjon%')<>1 then raise exception 'publisert innlegg skal være offentlig'; end if;
end $$;

-- Blokkering: C blokkerer A, og A kan ikke sende direktemelding til C.
reset role;
insert into public.conversations(id,kind,created_by) values('c0000000-0000-4000-8000-000000000001','direct','a0000000-0000-4000-8000-00000000000a');
insert into public.conversation_members(conversation_id,user_id,history_starts_at) values
('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a',now()-interval '1 day'),
('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000c',now()-interval '1 day');
insert into public.messages(conversation_id,sender_user_id,body,created_at) values('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a','Hei!',now()-interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
do $$ begin
  if (select count(*) from public.messages)<>1 then raise exception 'mottaker ser ikke meldingen før blokkering'; end if;
  insert into public.user_blocks(blocker_id,blocked_id) values('a0000000-0000-4000-8000-00000000000c','a0000000-0000-4000-8000-00000000000a');
  if (select count(*) from public.messages)<>0 then raise exception 'meldinger fra blokkert bruker vises'; end if;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000a',true);
do $$ begin
  if (select count(*) from public.user_blocks)<>0 then raise exception 'den blokkerte ser blokkeringen'; end if;
  begin insert into public.messages(conversation_id,sender_user_id,body) values('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a','Hallo?'); raise exception 'blokkert bruker sendte melding';
  exception when insufficient_privilege then null; end;
end $$;

-- Forespørsler om eksport og sletting.
do $$ begin
  perform public.request_personal_data('export');
  begin perform public.request_personal_data('export'); raise exception 'to åpne eksportforespørsler';
  exception when unique_violation then null; end;
  perform public.request_personal_data('deletion');
  if (select count(*) from public.data_subject_requests)<>2 then raise exception 'brukeren ser ikke egne forespørsler'; end if;
  begin insert into public.data_subject_requests(user_id,kind) values('a0000000-0000-4000-8000-00000000000a','export'); raise exception 'direkte innsetting tillatt';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
do $$ begin
  if (select count(*) from public.data_subject_requests)<>0 then raise exception 'uvedkommende ser andres forespørsler'; end if;
end $$;

-- Søk som anonym: prefikssøk finner skolen, deaktiverte personer skjules uten filteret.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if not exists(select 1 from public.search('elveb') where kind='school' and title='Elvebakken videregående skole') then raise exception 'søk fant ikke skolen'; end if;
  if not exists(select 1 from public.search('skolemat',array['post'])) then raise exception 'søk fant ikke offentlig innlegg'; end if;
  if exists(select 1 from public.search('dagfinn')) then raise exception 'deaktivert person vises i vanlig søk'; end if;
  if not exists(select 1 from public.search('dagfinn',array['person'],true) where subtitle like 'Tidligere:%') then raise exception 'tidligere tillitsvalgt mangler med filter'; end if;
  if exists(select 1 from public.search('<script>')) then raise exception 'søk på bare tegn skal gi tomt resultat'; end if;
end $$;
reset role;

-- Sanntid er slått på for meldinger og varsler (når publikasjonen finnes).
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('messages','conversation_members','notifications'))<>3 then
    raise exception 'sanntid mangler for meldinger eller varsler';
  end if;
end $$;

-- Funksjonstilgang: anon kan bare kalle det som er ment å være offentlig.
do $$ begin
  if has_function_privilege('anon','public.assign_role(uuid,uuid,admin_role,date,date)','execute') then raise exception 'anon kan kalle assign_role'; end if;
  if has_function_privilege('anon','public.has_area_role(uuid,uuid)','execute') then raise exception 'anon kan kalle has_area_role'; end if;
  if has_function_privilege('anon','public.is_blocked_between(uuid,uuid)','execute') then raise exception 'anon kan kalle is_blocked_between'; end if;
  if not has_function_privilege('anon','public.search(text,text[],boolean,int)','execute') then raise exception 'anon kan ikke søke'; end if;
  if not has_function_privilege('authenticated','public.request_personal_data(text)','execute') then raise exception 'innloggede mangler tilgang til RPC'; end if;
end $$;

-- Tredjepart kan ikke finne ut om to andre har blokkert hverandre.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if public.is_blocked_between('a0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-00000000000c') then raise exception 'blokkering lekker til tredjepart'; end if;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000a',true);
do $$ begin
  if not public.is_blocked_between('a0000000-0000-4000-8000-00000000000a','a0000000-0000-4000-8000-00000000000c') then raise exception 'parten ser ikke blokkeringen'; end if;
end $$;
reset role;

rollback;

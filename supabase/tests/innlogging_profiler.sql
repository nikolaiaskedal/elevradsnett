-- Atferdstester for prompt 3: innlogging, profiler, skolebytte og offentlig lesing.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Testbrukere:
--   N  ny bruker uten profil (har bare logget inn)
--   S  elev ved Elvebakken og eneste skoleadministrator der
--   T  elev ved Elvebakken med verv, uten administratorrolle
insert into auth.users(id,email) values
('c0000000-0000-4000-8000-00000000000e','ny@example.invalid'),
('c0000000-0000-4000-8000-00000000000f','s@example.invalid'),
('c0000000-0000-4000-8000-000000000010','t@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('c0000000-0000-4000-8000-00000000000f','Sara Skoleadmin','s@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('c0000000-0000-4000-8000-000000000010','Tor Tillitsvalgt','t@example.invalid','00000000-0000-4000-8000-000000000020','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('c0000000-0000-4000-8000-00000000000f','00000000-0000-4000-8000-000000000020','school_admin',current_date-10,'active','c0000000-0000-4000-8000-00000000000f');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status) values
('d0000000-0000-4000-8000-00000000000f','c0000000-0000-4000-8000-00000000000f','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-10,'active'),
('d0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','Nestleder',current_date-10,'active');
update public.profiles set active_membership_id='d0000000-0000-4000-8000-000000000010' where id='c0000000-0000-4000-8000-000000000010';
insert into public.posts(id,organization_id,actor_user_id,body,status,audience,published_at) values
('e0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-00000000000f','Offentlig innlegg fra elevrådet','published','public',now()-interval '1 hour'),
('e0000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-00000000000f','Bare for fylket','published','county',now()),
('e0000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-00000000000f','Utkast','draft','public',null);
insert into public.comments(post_id,organization_id,actor_user_id,body) values
('e0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-000000000010','Bra!');
insert into public.reactions(post_id,user_id) values('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000010');

-- Anonym: økten sier anonym, og offentlige sider kan leses.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if public.get_my_session()->>'status'<>'anonymous' then raise exception 'anonym økt har feil status'; end if;
  if not exists(select 1 from public.list_public_organizations() where id='00000000-0000-4000-8000-000000000020') then raise exception 'anonym ser ikke skolen'; end if;
  if exists(select 1 from public.list_public_organizations() where status<>'active') then raise exception 'inaktive organisasjoner er offentlige'; end if;
  if not exists(select 1 from public.get_post_cards() where id='e0000000-0000-4000-8000-000000000001' and actor_name='Sara Skoleadmin' and actor_title='Elevrådsleder'
    and support_count=1 and comment_count=1 and comments->0->>'body'='Bra!') then raise exception 'anonym ser ikke det offentlige innlegget med navn og tall'; end if;
  if exists(select 1 from public.get_post_cards() where id='e0000000-0000-4000-8000-000000000003') then raise exception 'anonym ser utkast'; end if;
  if exists(select 1 from public.get_post_cards() where audience<>'public') then raise exception 'anonym ser innlegg som ikke er offentlige'; end if;
  if exists(select 1 from public.get_post_cards(null,'chronological','00000000-0000-4000-8000-000000000020') where organization_id<>'00000000-0000-4000-8000-000000000020') then raise exception 'organisasjonsfilteret virker ikke'; end if;
  if exists(select 1 from public.get_post_cards() where supported) then raise exception 'anonym har støttet innlegg'; end if;
  perform * from public.list_public_events();
end $$;
do $$ begin
  perform public.complete_onboarding('00000000-0000-4000-8000-000000000020','Anonym Person');
  raise exception 'anon kunne fullføre onboarding';
exception when insufficient_privilege then null; end $$;
reset role;

do $$ begin
  if has_function_privilege('anon','public.change_school(uuid)','execute') then raise exception 'anon kan kalle change_school'; end if;
  if has_function_privilege('anon','public.set_avatar(text)','execute') then raise exception 'anon kan kalle set_avatar'; end if;
  if not has_function_privilege('anon','public.get_post_cards(uuid,text,uuid,int)','execute') then raise exception 'anon kan ikke lese innlegg'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_update') then raise exception 'profiles_self_update finnes fortsatt'; end if;
end $$;

-- Ny bruker: økten ber om onboarding, og onboarding oppretter profilen og skolehistorikken.
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-00000000000e',true);
do $$ declare s jsonb; begin
  s:=public.get_my_session();
  if s->>'status'<>'onboarding' or s->>'email'<>'ny@example.invalid' then raise exception 'ny bruker får ikke onboarding: %',s; end if;
  begin perform public.complete_onboarding('00000000-0000-4000-8000-000000000020','N'); raise exception 'for kort navn ble godtatt'; exception when raise_exception then if sqlerrm<>'invalid name' then raise; end if; end;
  begin perform public.complete_onboarding((select id from public.organizations where type='county_board' limit 1),'Nora Ny'); raise exception 'fylkesstyre ble godtatt som skole'; exception when raise_exception then if sqlerrm<>'school not found' then raise; end if; end;
  begin perform public.complete_onboarding('00000000-0000-4000-8000-000000000020','Nora Ny',current_date-1); raise exception 'valgdato i fortiden ble godtatt'; exception when raise_exception then if sqlerrm<>'invalid election date' then raise; end if; end;
  perform public.complete_onboarding('00000000-0000-4000-8000-000000000020','  Nora Ny  ',current_date+60);
  s:=public.get_my_session();
  if s->>'status'<>'active' or s->'profile'->>'display_name'<>'Nora Ny' or s->'profile'->>'current_school_id'<>'00000000-0000-4000-8000-000000000020' then raise exception 'profilen ble ikke opprettet: %',s; end if;
  if jsonb_array_length(s->'representations')<>0 then raise exception 'valg av skole ga representasjon'; end if;
  if not exists(select 1 from public.get_post_cards() where id='e0000000-0000-4000-8000-000000000002') then raise exception 'elev i fylket ser ikke fylkesinnlegget'; end if;
  if public.has_role('00000000-0000-4000-8000-000000000020',array['content_manager','school_admin']::admin_role[]) then raise exception 'valg av skole ga rettigheter'; end if;
  if (select count(*) from public.get_my_school_history())<>1 then raise exception 'skolehistorikk mangler'; end if;
  begin perform public.complete_onboarding('00000000-0000-4000-8000-000000000020','Nora Ny'); raise exception 'onboarding kunne kjøres to ganger'; exception when raise_exception then if sqlerrm<>'already onboarded' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.election_schedules where organization_id='00000000-0000-4000-8000-000000000020' and expected_handover_on=current_date+60) then raise exception 'valgdato ble ikke lagret'; end if;
end $$;

-- Profilen: navn endres via update_profile. Direkte endring av status, skole eller e-post stoppes.
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-00000000000e',true);
do $$ begin
  perform public.update_profile('Nora Nyhus');
  if (select display_name from public.profiles where id=auth.uid())<>'Nora Nyhus' then raise exception 'navnet ble ikke endret'; end if;
  update public.profiles set status='deactivated' where id=auth.uid();
  if (select status from public.profiles where id=auth.uid())<>'active' then raise exception 'brukeren kunne endre egen status direkte'; end if;
end $$;
do $$ begin
  perform public.set_avatar('c0000000-0000-4000-8000-00000000000f/bilde.webp');
  raise exception 'kunne peke profilbildet til en annen brukers mappe';
exception when raise_exception then if sqlerrm<>'invalid avatar' then raise; end if; end $$;
do $$ begin
  perform public.set_avatar('c0000000-0000-4000-8000-00000000000e/finnes-ikke.webp');
  raise exception 'kunne peke profilbildet til en fil som ikke finnes';
exception when raise_exception then if sqlerrm<>'invalid avatar' then raise; end if; end $$;
reset role;

-- Skolebytte: siste skoleadministrator må overføre rollen først.
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-00000000000f',true);
do $$ begin
  perform public.change_school((select id from public.organizations where type='school' and status='active' and id<>'00000000-0000-4000-8000-000000000020' order by name limit 1));
  raise exception 'siste skoleadministrator kunne bytte skole';
exception when raise_exception then if sqlerrm<>'last school administrator' then raise; end if; end $$;

-- Vanlig skolebytte: verv ved gammel skole avsluttes med sluttdato, ingen rettigheter følger med, historikken beholdes.
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000010',true);
do $$ declare s jsonb; begin
  s:=public.get_my_session();
  if s->'representations'->0->>'public_title'<>'Nestleder' or (s->'representations'->0->>'can_publish')::boolean then raise exception 'representasjon eller publiseringsrett er feil: %',s; end if;
  if not exists(select 1 from public.get_post_cards((s->'representations'->0->>'id')::uuid,'recommended') where id='e0000000-0000-4000-8000-000000000001' and supported) then raise exception 'rangert feed mangler innlegg eller egen støtte'; end if;
end $$;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-00000000000f',true);
do $$ begin
  if not ((public.get_my_session()->'representations'->0->>'can_publish')::boolean) then raise exception 'skoleadministrator mangler publiseringsrett i økten'; end if;
end $$;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000010',true);
do $$ declare v_new uuid; s jsonb; begin
  select id into v_new from public.organizations where type='school' and status='active' and id<>'00000000-0000-4000-8000-000000000020' order by name limit 1;
  begin perform public.change_school('00000000-0000-4000-8000-000000000020'); raise exception 'bytte til samme skole ble godtatt'; exception when raise_exception then if sqlerrm<>'same school' then raise; end if; end;
  perform public.change_school(v_new);
  s:=public.get_my_session();
  if s->'profile'->>'current_school_id'<>v_new::text then raise exception 'skolen ble ikke byttet'; end if;
  if jsonb_array_length(s->'representations')<>0 then raise exception 'vervet ved gammel skole er fortsatt aktivt'; end if;
  if s->>'active_membership_id' is not null then raise exception 'aktiv representasjon peker fortsatt på gammel skole'; end if;
  if (select count(*) from public.get_my_school_history())<>2 then raise exception 'historikken mangler gammel skole'; end if;
  if (select count(*) from public.get_my_school_history() where ended_at is null)<>1 then raise exception 'mer enn én nåværende skole'; end if;
  if public.has_active_membership(v_new) then raise exception 'skolebytte ga verv ved ny skole'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.memberships where id='d0000000-0000-4000-8000-000000000010' and status='ended' and end_date=current_date) then raise exception 'vervet ble ikke avsluttet med sluttdato'; end if;
  if not exists(select 1 from public.audit_logs where action='profile.school_changed' and target_id='c0000000-0000-4000-8000-000000000010') then raise exception 'skolebytte ble ikke logget'; end if;
end $$;

-- Skolehistorikk og økt er private: en annen bruker ser ikke Tors historikk.
set local role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-00000000000e',true);
do $$ begin
  if exists(select 1 from public.profile_school_history where user_id<>auth.uid()) then raise exception 'skolehistorikk lekker til andre'; end if;
end $$;
reset role;

rollback;

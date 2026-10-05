-- Atferdstester for prompt 14: vilkår, samtykke, deaktivering og reaktivering, eksport og sletting.
begin;

insert into auth.users(id,email) values
('d1000000-0000-4000-8000-000000000001','elev14@example.invalid'),
('d1000000-0000-4000-8000-000000000002','admin14@example.invalid'),
('d1000000-0000-4000-8000-000000000003','super14@example.invalid'),
('d1000000-0000-4000-8000-000000000004','annen14@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('d1000000-0000-4000-8000-000000000001','Elev Fjorten','elev14@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('d1000000-0000-4000-8000-000000000002','Admin Fjorten','admin14@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('d1000000-0000-4000-8000-000000000003','Super Fjorten','super14@example.invalid',null,'active'),
('d1000000-0000-4000-8000-000000000004','Annen Fjorten','annen14@example.invalid','00000000-0000-4000-8000-000000000020','active');
insert into public.memberships(user_id,organization_id,public_title,start_date,status) values
('d1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','Styremedlem',current_date-10,'active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('d1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','school_admin',current_date-1,'active','d1000000-0000-4000-8000-000000000003'),
('d1000000-0000-4000-8000-000000000003',(select id from organizations where type='national'),'super_admin',current_date-1,'active','d1000000-0000-4000-8000-000000000003');
insert into public.posts(id,organization_id,actor_user_id,body,status,audience,published_at) values
('d2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','d1000000-0000-4000-8000-000000000001','Innlegg fra elev fjorten','published','public',now());
insert into public.follows(user_id,organization_id) values('d1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020');

do $$ begin
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='legal_acceptances' and rowsecurity) then raise exception 'legal_acceptances mangler RLS'; end if;
  if has_function_privilege('anon','public.export_my_data()','execute') then raise exception 'anon kan eksportere'; end if;
  if has_function_privilege('authenticated','public.erase_personal_data(uuid,uuid)','execute') then raise exception 'innloggede kan slette andres data direkte'; end if;
  if has_function_privilege('authenticated','public.end_all_roles(uuid,uuid)','execute') then raise exception 'innloggede kan avslutte andres verv'; end if;
  if not has_function_privilege('anon','public.record_consent(text,text,jsonb)','execute') then raise exception 'samtykke uten innlogging kan ikke lagres'; end if;
  if public.current_legal_version('terms') is null then raise exception 'vilkårene mangler versjon'; end if;
end $$;

-- Uten innlogging: samtykke med nettleser-id, og grensen per time.
set local role anon;
do $$ declare i int; begin
  perform public.record_consent('nettleser-0000000001',public.current_legal_version('cookies'),'{"analytics":false}');
  begin
    perform public.record_consent('kort',public.current_legal_version('cookies'),'{"analytics":true}');
    raise exception 'ugyldig nettleser-id ble godtatt';
  exception when others then if sqlerrm<>'invalid consent' then raise; end if; end;
  begin
    for i in 1..10 loop perform public.record_consent('nettleser-0000000001',public.current_legal_version('cookies'),'{"analytics":true}'); end loop;
    raise exception 'samtykke uten innlogging er ikke begrenset';
  exception when others then if sqlerrm<>'too many requests' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
do $$ declare privacy jsonb; data jsonb; begin
  privacy:=public.get_my_privacy();
  if privacy->>'acceptedTermsVersion' is not null then raise exception 'vilkårene er godtatt før brukeren har gjort det'; end if;
  begin
    perform public.accept_terms('1999-01-01',privacy->>'privacyVersion');
    raise exception 'utdatert versjon ble godtatt';
  exception when others then if sqlerrm<>'outdated legal version' then raise; end if; end;
  perform public.accept_terms(privacy->>'termsVersion',privacy->>'privacyVersion');
  if public.get_my_privacy()->>'acceptedTermsVersion' is distinct from privacy->>'termsVersion' then raise exception 'godkjenningen ble ikke lagret'; end if;

  -- Nytt samtykke trekker tilbake det forrige.
  perform public.record_consent(null,privacy->>'cookiesVersion','{"analytics":true}');
  perform public.record_consent(null,privacy->>'cookiesVersion','{"analytics":false}');
  if (select count(*) from consent_records where user_id=auth.uid() and withdrawn_at is null)<>1 then raise exception 'tidligere samtykke ble ikke trukket tilbake'; end if;
  if (public.get_my_privacy()->'consent'->'purposes'->>'analytics')::boolean then raise exception 'siste valg vises ikke'; end if;

  data:=public.export_my_data();
  if data->'profile'->>'email'<>'elev14@example.invalid' or jsonb_array_length(data->'posts')<>1 or jsonb_array_length(data->'publicOffices')<>1 then raise exception 'eksporten mangler data: %',data; end if;
  if (select count(*) from data_subject_requests where user_id=auth.uid() and kind='export' and status='completed')<>1 then raise exception 'eksporten ble ikke dokumentert'; end if;
end $$;

-- Skrive direkte i tabellene er sperret.
do $$ begin
  begin
    insert into public.legal_acceptances(user_id,terms_version,privacy_version) values(auth.uid(),'x','x');
    raise exception 'godkjenning kunne skrives direkte';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.consent_records(user_id,legal_version,purposes) values(auth.uid(),'x','{}');
    raise exception 'samtykke kunne skrives direkte';
  exception when insufficient_privilege then null; end;
end $$;

-- Deaktivering: verv avsluttes, profilen merkes, og bare brukeren selv kan aktivere den igjen.
do $$ begin
  perform public.deactivate_my_account();
  if (select status from profiles where id=auth.uid())<>'deactivated' or not (select deactivated_by_user from profiles where id=auth.uid()) then raise exception 'profilen ble ikke deaktivert'; end if;
  if exists(select 1 from memberships where user_id=auth.uid() and status='active') then raise exception 'vervet ble ikke avsluttet'; end if;
  if not exists(select 1 from posts where id='d2000000-0000-4000-8000-000000000001' and deleted_at is null) then raise exception 'innlegget forsvant ved deaktivering'; end if;
  -- Deaktivert kan fortsatt eksportere og be om sletting.
  perform public.export_my_data();
  perform public.request_personal_data('deletion');
  perform public.reactivate_my_account();
  if (select status from profiles where id=auth.uid())<>'active' then raise exception 'profilen ble ikke aktivert igjen'; end if;
end $$;

-- Siste skoleadministrator kan ikke deaktivere seg selv.
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
do $$ begin
  perform public.deactivate_my_account();
  raise exception 'siste administrator ble deaktivert';
exception when others then if sqlerrm<>'you are last administrator' then raise; end if;
end $$;
do $$ begin
  perform public.list_data_subject_requests();
  raise exception 'andre enn superadministrator ser forespørslene';
exception when others then if sqlerrm<>'not authorized' then raise; end if;
end $$;

-- Superadministrator gjennomfører slettingen.
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
do $$ declare req uuid; begin
  select id into req from data_subject_requests where user_id='d1000000-0000-4000-8000-000000000001' and kind='deletion' and status='pending';
  if not exists(select 1 from jsonb_array_elements(public.list_data_subject_requests()) r where (r->>'id')::uuid=req) then raise exception 'forespørselen vises ikke'; end if;
  begin
    perform public.decide_data_subject_request(req,'rejected','');
    raise exception 'avslag uten begrunnelse ble godtatt';
  exception when others then if sqlerrm<>'invalid reason' then raise; end if; end;
  perform public.decide_data_subject_request(req,'completed','Slettet etter forespørsel');
end $$;
reset role;
do $$ begin
  if (select display_name from profiles where id='d1000000-0000-4000-8000-000000000001')<>'Slettet bruker' then raise exception 'navnet ble ikke slettet'; end if;
  if (select email from auth.users where id='d1000000-0000-4000-8000-000000000001') like 'elev14%' then raise exception 'e-posten i innloggingen ble ikke slettet'; end if;
  if exists(select 1 from follows where user_id='d1000000-0000-4000-8000-000000000001') then raise exception 'følging ble ikke slettet'; end if;
  if exists(select 1 from legal_acceptances where user_id='d1000000-0000-4000-8000-000000000001') then raise exception 'godkjenningene ble ikke slettet'; end if;
  if not exists(select 1 from posts where id='d2000000-0000-4000-8000-000000000001') then raise exception 'organisasjonens innlegg ble slettet'; end if;
  if (select status from data_subject_requests where user_id='d1000000-0000-4000-8000-000000000001' and kind='deletion')<>'completed' then raise exception 'forespørselen ble ikke fullført'; end if;
end $$;

rollback;

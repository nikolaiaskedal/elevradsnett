-- Atferdstester for prompt 12: adminpanel, områdeavgrensning, moderering og MFA.
begin;

insert into auth.users(id,email) values
('c1000000-0000-4000-8000-000000000001','admin12@example.invalid'),
('c1000000-0000-4000-8000-000000000002','elev12@example.invalid'),
('c1000000-0000-4000-8000-000000000003','super12@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('c1000000-0000-4000-8000-000000000001','Admin Tolv','admin12@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('c1000000-0000-4000-8000-000000000002','Elev Tolv','elev12@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('c1000000-0000-4000-8000-000000000003','Super Tolv','super12@example.invalid',null,'active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('c1000000-0000-4000-8000-000000000001',(select id from organizations where type='county_board' and county='Oslo'),'board_admin',current_date-1,'active','c1000000-0000-4000-8000-000000000003'),
('c1000000-0000-4000-8000-000000000003',(select id from organizations where type='national'),'super_admin',current_date-1,'active','c1000000-0000-4000-8000-000000000003');
insert into public.posts(id,organization_id,actor_user_id,body,status,audience,published_at) values
('c2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','c1000000-0000-4000-8000-000000000002','Rapportert testinnlegg','published','public',now());

do $$ begin
  if has_function_privilege('anon','public.get_admin_dashboard(uuid)','execute') then raise exception 'anon kan lese adminpanelet'; end if;
  if has_function_privilege('anon','public.apply_moderation_action(uuid,text,text)','execute') then raise exception 'anon kan moderere'; end if;
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='profile_restrictions' and rowsecurity) then raise exception 'begrensninger mangler RLS'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$ declare scope uuid:=(select id from organizations where type='county_board' and county='Oslo'); data jsonb; report_id uuid; begin
  data:=public.get_admin_dashboard(scope);
  if (data->'stats'->>'activeUsers')::int<2 or jsonb_array_length(data->'schools')=0 then raise exception 'dashboard mangler områdedata: %',data; end if;
  if exists(select 1 from jsonb_array_elements(data->'schools') s where s->>'county'<>'Oslo') then raise exception 'dashboard lekker skoler utenfor området'; end if;

  perform public.admin_manage_user(scope,'c1000000-0000-4000-8000-000000000002','deactivate',null,'Verv avsluttet');
  if (select status from profiles where id='c1000000-0000-4000-8000-000000000002')<>'deactivated' then raise exception 'bruker ble ikke deaktivert'; end if;
  perform public.admin_manage_user(scope,'c1000000-0000-4000-8000-000000000002','restore',null,'Nytt verv bekreftet');

  report_id:=public.report_post('c2000000-0000-4000-8000-000000000001','inappropriate','Test');
  if jsonb_array_length(public.list_moderation_queue(scope))=0 then raise exception 'modereringssaken vises ikke'; end if;
  perform public.apply_moderation_action(report_id,'hide','Bryter retningslinjene');
  if (select moderation_status from posts where id='c2000000-0000-4000-8000-000000000001')<>'hidden' or (select status from moderation_reports where id=report_id)<>'resolved' then raise exception 'modereringshandlingen ble ikke brukt'; end if;
end $$;

-- Ved AAL1: uten superrettigheter når MFA kreves. I piloten kreves det ikke, og da gjelder rettighetene og porten vises ikke.
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
do $$ begin
  if not public.is_super_admin_account() then raise exception 'superkontoen gjenkjennes ikke'; end if;
  if public.super_admin_mfa_required() then
    if not public.admin_mfa_required() then raise exception 'administrasjonen ber ikke om MFA'; end if;
    if exists(select 1 from public.list_my_admin_organizations()) then raise exception 'superadministrator fikk tilgang uten MFA'; end if;
  else
    if public.admin_mfa_required() then raise exception 'administrasjonen ber om MFA i piloten'; end if;
    if not exists(select 1 from public.list_my_admin_organizations() where type='national') then raise exception 'superadministrator fikk ikke tilgang i piloten'; end if;
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
do $$ begin
  if not exists(select 1 from public.list_my_admin_organizations() where type='national') then raise exception 'superadministrator fikk ikke tilgang med MFA'; end if;
end $$;

rollback;

-- Første superadministrator (bootstrap), kjøres manuelt i Supabase SQL Editor.
-- Appen lar ingen gi seg selv rettigheter (assign_role stopper selvtildeling, docs/KRAVSPEC.md §4 og §17), og
-- klienten avgjør aldri tilgang. Den første superadministratoren må derfor opprettes utenfra, av prosjekteieren,
-- med databasetilgang. Etter det tildeler superadministratoren alt annet fra Administrasjon → Roller og verv.
--
-- Før du kjører:
--   1. Logg inn i appen med e-posten du vil gjøre til superadministrator, og fullfør onboarding (profilen må finnes).
--   2. Bytt ut e-postadressen under (v_email).
--
-- Trygt å kjøre flere ganger: har brukeren allerede en aktiv superadministrator-rettighet, skjer det ingenting.
-- Tildelingen logges i revisjonsloggen som «role.bootstrapped». Fjern rettigheten igjen med revoke_role
-- (krever at en annen superadministrator finnes, siden siste superadministrator ikke kan fjernes).

do $$
declare
  v_email text := 'bytt-til-din-epost@example.com';
  v_user uuid;
  v_national uuid;
  v_grant uuid;
begin
  select p.id into v_user from public.profiles p where lower(p.email)=lower(v_email) and p.status='active';
  if v_user is null then
    raise exception 'Fant ingen aktiv profil for %. Logg inn i appen og fullfør onboarding først.',v_email;
  end if;

  select o.id into v_national from public.organizations o where o.type='national' and o.status='active' order by o.id limit 1;
  if v_national is null then
    raise exception 'Fant ingen aktiv nasjonal organisasjon (type national). Superadministrator knyttes til den.';
  end if;

  if exists(select 1 from public.role_grants r where r.user_id=v_user and r.role='super_admin' and r.status='active'
    and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)) then
    raise notice '% er allerede superadministrator.',v_email;
    return;
  end if;

  insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by,accepted_at)
    values(v_user,v_national,'super_admin',current_date,'active',v_user,now()) returning id into v_grant;
  insert into public.audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(v_user,v_national,'role.bootstrapped','role_grant',v_grant::text,
      jsonb_build_object('user_id',v_user,'role','super_admin','via','supabase/manual/gjor_meg_til_superadmin.sql'));
  raise notice '% er nå superadministrator.',v_email;
end $$;

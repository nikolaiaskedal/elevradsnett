-- Piloten: superadministratorer trenger ikke tofaktor (TOTP/AAL2) for å få superrettighetene.
-- Innloggingen med e-postkode er nok. Før full lansering settes super_admin_mfa_required() til true
-- i en ny migrasjon, så kravet i KRAVSPEC («MFA kreves for superadministratorer») gjelder igjen.

create or replace function public.super_admin_mfa_required() returns boolean
language sql immutable set search_path=public as $$
  select false;
$$;

-- Om den innloggede økten kan bruke superadministratorrettigheter.
create or replace function public.super_admin_session_ok() returns boolean
language sql stable security definer set search_path=public as $$
  select not public.super_admin_mfa_required() or coalesce(auth.jwt()->>'aal','aal1')='aal2';
$$;

-- Om administrasjonen skal be denne brukeren om tofaktor før den åpnes.
create or replace function public.admin_mfa_required() returns boolean
language sql stable security definer set search_path=public as $$
  select public.super_admin_mfa_required() and public.is_super_admin_account();
$$;

create or replace function public.has_role(p_org uuid,p_roles admin_role[],p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from role_grants r
    where r.user_id=p_user and r.organization_id=p_org and r.role=any(p_roles)
      and (r.role<>'super_admin' or p_user<>auth.uid() or public.super_admin_session_ok())
      and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
  ) or (
    (p_user<>auth.uid() or public.super_admin_session_ok()) and exists(
      select 1 from role_grants r where r.user_id=p_user and r.role='super_admin' and r.status='active'
        and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
    )
  ) or ('board_admin'=any(p_roles) and exists(
    select 1 from organizations lb
    join profiles pr on pr.id=p_user
    join organizations s on s.id=pr.current_school_id and s.local_board_id=lb.id
    join organizations cb on cb.type='county_board' and cb.county=lb.county
    join role_grants r on r.organization_id=cb.id and r.user_id=p_user and r.role='board_admin' and r.status='active'
      and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
    where lb.id=p_org and lb.type='local_board'));
$$;

revoke all on function public.super_admin_mfa_required(),public.super_admin_session_ok(),public.admin_mfa_required() from public,anon;
grant execute on function public.admin_mfa_required() to authenticated;

-- Stram inn hvem som kan kalle funksjonene i public (Supabase security advisor, lint 0028).
-- Supabase gir anon og authenticated EXECUTE på alle nye funksjoner, så alle RPC-er kunne kalles
-- uten innlogging. Her får anon bare det som er ment å være offentlig, pluss hjelperne som
-- RLS-reglene for offentlig lesing trenger (can_view_post og has_role i posts-regelen).

alter default privileges in schema public revoke execute on functions from public, anon;

do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

grant execute on function
  public.get_public_officers(uuid),
  public.get_event_engagement(uuid),
  public.resolve_organization_images(uuid),
  public.search(text,text[],boolean,int),
  public.search_tsquery(text,regconfig),
  public.can_view_post(public.posts,uuid),
  public.has_role(uuid,admin_role[],uuid)
to anon;

-- Bare partene selv kan spørre om en blokkering finnes. Andre får alltid false.
create or replace function public.is_blocked_between(p_a uuid,p_b uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() in (p_a,p_b)
    and exists(select 1 from user_blocks where (blocker_id=p_a and blocked_id=p_b) or (blocker_id=p_b and blocked_id=p_a));
$$;

-- Fast search_path også for triggerfunksjonen (lint 0011).
alter function public.touch_updated_at() set search_path=public;

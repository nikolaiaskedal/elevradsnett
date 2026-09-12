-- Run after migrations in an isolated test project.
do $$ declare missing_count int; begin
  select count(*) into missing_count from pg_tables t where t.schemaname='public' and t.tablename in ('profiles','organizations','memberships','role_grants','posts','comments','events','conversations','conversation_members','messages','audit_logs') and not t.rowsecurity;
  if missing_count<>0 then raise exception 'RLS missing on % core tables',missing_count; end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_member_read') then raise exception 'message membership policy missing'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and roles::text like '%anon%') then raise exception 'anonymous message policy must not exist'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_public_and_scoped_read') then raise exception 'post visibility policy missing'; end if;
end $$;

do $$ declare v_user uuid:='10000000-0000-4000-8000-000000000001';v_other uuid:='10000000-0000-4000-8000-000000000002';v_org uuid:='20000000-0000-4000-8000-000000000001'; begin
  -- Function-level invariant: inactive or unrelated users cannot publish.
  if public.has_active_membership(v_org,v_other) then raise exception 'unrelated user gained organization context'; end if;
end $$;

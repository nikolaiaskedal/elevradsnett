
create or replace function public.sync_managed_conversation_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op in ('INSERT','UPDATE') then perform public.sync_managed_conversation(new.organization_id); end if;
  if tg_op='DELETE' or (tg_op='UPDATE' and old.organization_id<>new.organization_id) then perform public.sync_managed_conversation(old.organization_id); end if;
  return null;
end $$;
create trigger memberships_sync_managed_conversation after insert or update or delete on public.memberships
  for each row execute function public.sync_managed_conversation_trigger();

-- Verv som starter eller slutter på en dato endrer ikke tabellen. Gruppene til brukeren synkroniseres derfor
-- også når samtalelisten hentes.
create or replace function public.sync_my_managed_conversations() returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  for v_org in
    select m.organization_id from memberships m where m.user_id=auth.uid() and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
    union
    select c.managed_organization_id from conversations c join conversation_members cm on cm.conversation_id=c.id and cm.user_id=auth.uid() and cm.left_at is null where c.kind='managed'
  loop
    perform public.sync_managed_conversation(v_org);
  end loop;
end $$;

-- Organisasjoner som allerede har verv, får gruppen sin nå.
do $$ declare v_org uuid; begin
  for v_org in select distinct organization_id from public.memberships where status='active' loop perform public.sync_managed_conversation(v_org); end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lesing: samtaler, meldinger, medlemmer og innstillinger
-- ---------------------------------------------------------------------------
-- Samtalene brukeren er med i, med navn, siste synlige melding og antall uleste. Uleste teller ikke egne,
-- skjulte eller blokkerte meldinger. Direktesamtaler får navnet til den andre personen.
create or replace function public.list_my_conversations()
returns table (id uuid,kind text,name text,organization_id uuid,other_user_id uuid,member_count int,unread_count int,muted boolean,
  is_admin boolean,last_message_body text,last_message_at timestamptz,last_message_mine boolean,last_message_has_attachment boolean,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  perform public.sync_my_managed_conversations();
  return query
  select c.id,c.kind,
    case c.kind when 'managed' then coalesce(o.school_name,o.name) when 'direct' then coalesce(other.display_name,'Tidligere bruker') else c.name end,
    c.managed_organization_id,other.id,
    (select count(*)::int from conversation_members x where x.conversation_id=c.id and x.left_at is null),
    (select count(*)::int from messages m where m.conversation_id=c.id and m.sender_user_id<>auth.uid()
      and (cm.last_read_at is null or m.created_at>cm.last_read_at) and public.can_view_message(m.id)),
    cm.muted_until is not null and cm.muted_until>now(),
    cm.is_admin,
    last.body,last.created_at,last.sender_user_id=auth.uid(),last.has_attachment,c.created_at
  from conversation_members cm
  join conversations c on c.id=cm.conversation_id
  left join organizations o on o.id=c.managed_organization_id
  left join lateral (select p.id,p.display_name from conversation_members x join profiles p on p.id=x.user_id
    where c.kind='direct' and x.conversation_id=c.id and x.user_id<>auth.uid() limit 1) other on true
  left join lateral (select m.body,m.created_at,m.sender_user_id,exists(select 1 from message_attachments a where a.message_id=m.id) as has_attachment
    from messages m where m.conversation_id=c.id and public.can_view_message(m.id) order by m.created_at desc limit 1) last on true
  where cm.user_id=auth.uid() and public.is_conversation_member(c.id)
  order by coalesce(last.created_at,c.created_at) desc
  limit 200;
end $$;

-- Meldingene i en samtale, eldste først, med vedlegg. p_before henter eldre meldinger.
-- read_by er bare med på egne meldinger, og bare når brukeren selv har slått på lest-status:
-- antallet andre medlemmer med lest-status på som har lest meldingen.
create or replace function public.get_conversation_messages(p_conversation uuid,p_before timestamptz default null,p_limit int default 50)
returns table (id uuid,sender_user_id uuid,sender_name text,body text,created_at timestamptz,mine boolean,attachments jsonb,read_by int)
language plpgsql stable security definer set search_path=public as $$
declare v_receipts boolean:=coalesce((select s.read_receipts from message_settings s where s.user_id=auth.uid()),false);
begin
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  return query
  select * from (
    select m.id,m.sender_user_id,coalesce(p.display_name,'Tidligere bruker'),m.body,m.created_at,m.sender_user_id=auth.uid(),
      coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'path',a.storage_path,'mime_type',a.mime_type,'byte_size',a.byte_size,'file_name',a.file_name) order by a.created_at)
        from message_attachments a where a.message_id=m.id),'[]'::jsonb),
      case when v_receipts and m.sender_user_id=auth.uid() then
        (select count(*)::int from conversation_members x join message_settings s on s.user_id=x.user_id and s.read_receipts
          where x.conversation_id=m.conversation_id and x.user_id<>auth.uid() and x.left_at is null and x.last_read_at>=m.created_at)
      end
    from messages m left join profiles p on p.id=m.sender_user_id
    where m.conversation_id=p_conversation and (p_before is null or m.created_at<p_before) and public.can_view_message(m.id)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) x order by x.created_at;
end $$;

-- Hvem som er med i samtalen. Bare for medlemmer.
create or replace function public.list_conversation_members(p_conversation uuid)
returns table (user_id uuid,display_name text,school_name text,is_admin boolean,me boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  return query
  select p.id,p.display_name,coalesce(s.school_name,s.name),cm.is_admin,p.id=auth.uid()
  from conversation_members cm join profiles p on p.id=cm.user_id left join organizations s on s.id=p.current_school_id
  where cm.conversation_id=p_conversation and cm.left_at is null
  order by p.id<>auth.uid(),p.display_name;
end $$;

create or replace function public.get_message_settings() returns table (read_receipts boolean) language sql stable security definer set search_path=public as $$
  select coalesce((select s.read_receipts from message_settings s where s.user_id=auth.uid()),false) where auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- 5. Søk: personer og organisasjoner (§9)
-- ---------------------------------------------------------------------------
-- Personer (bare navn og skole, ingen e-post) og organisasjoner. Blokkerte personer vises ikke.
create or replace function public.search_message_recipients(p_query text)
returns table (kind text,id uuid,name text,detail text,organization_type organization_type)
language plpgsql stable security definer set search_path=public as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if char_length(v_query)<2 then return; end if;
  v_query:=left(v_query,100);
  return query
  (select 'person'::text,p.id,p.display_name,coalesce(s.school_name,s.name),null::organization_type
    from profiles p left join organizations s on s.id=p.current_school_id
    where p.status='active' and p.id<>auth.uid() and position(v_query in lower(p.display_name))>0
      and not exists(select 1 from user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=auth.uid()))
    order by position(v_query in lower(p.display_name)),p.display_name limit 10)
  union all
  (select 'organization'::text,o.id,coalesce(o.school_name,o.name),o.county,o.type
    from organizations o
    where o.status='active' and (position(v_query in lower(o.name))>0 or position(v_query in lower(coalesce(o.school_name,'')))>0)
    order by case o.type when 'national' then 0 when 'county_board' then 1 when 'local_board' then 2 else 3 end,o.name limit 10);
end $$;


-- Offentlige kontaktpersoner i en organisasjon: personer med aktivt, offentlig verv. Det er de samme personene
-- som får tilbud om en gruppe via create_organization_group. Organisasjonen selv kan ikke motta meldinger.
create or replace function public.list_organization_contacts(p_org uuid)
returns table (user_id uuid,display_name text,public_title text,me boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  return query
  select p.id,p.display_name,string_agg(m.public_title,', ' order by m.start_date),p.id=auth.uid()
  from memberships m join profiles p on p.id=m.user_id and p.status='active' join organizations o on o.id=m.organization_id and o.status='active'
  where m.organization_id=p_org and m.status='active' and m.public_title is not null and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
  group by p.id,p.display_name
  order by p.display_name
  limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Opprette samtaler (§9)
-- ---------------------------------------------------------------------------
-- Grense mot spam: maks 30 nye samtaler per bruker per døgn.
create or replace function public.check_conversation_rate_limit() returns void language plpgsql security definer set search_path=public as $$
begin
  if (select count(*) from conversations where created_by=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'rate limited'; end if;
end $$;

-- Én direktesamtale per par. Finnes den, returneres den. Kan ikke startes når en av partene har blokkert den andre.
create or replace function public.start_direct_conversation(p_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_key text; v_id uuid;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_user is null or p_user=auth.uid() then raise exception 'person not found'; end if;
  if not public.is_active_user(p_user) then raise exception 'person not found'; end if;
  if exists(select 1 from user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_user) or (b.blocker_id=p_user and b.blocked_id=auth.uid())) then raise exception 'blocked'; end if;
  v_key:=least(auth.uid(),p_user)::text||':'||greatest(auth.uid(),p_user)::text;
  select id into v_id from conversations where direct_key=v_key;
  if v_id is null then
    perform public.check_conversation_rate_limit();
    insert into conversations(kind,created_by,direct_key) values('direct',auth.uid(),v_key) on conflict (direct_key) do nothing returning id into v_id;
    if v_id is null then select id into v_id from conversations where direct_key=v_key; end if;
  end if;
  insert into conversation_members(conversation_id,user_id) values(v_id,auth.uid()),(v_id,p_user) on conflict do nothing;
  return v_id;
end $$;

-- Vanlig gruppe med valgte personer. Den som oppretter gruppen, blir gruppeadministrator. Maks 100 medlemmer.
create or replace function public.create_group_conversation(p_name text,p_members uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare v_name text:=trim(coalesce(p_name,'')); v_id uuid; v_members uuid[];
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'invalid group name'; end if;
  select coalesce(array_agg(distinct p.id),'{}') into v_members from profiles p
  where p.id=any(coalesce(p_members,'{}')) and p.id<>auth.uid() and p.status='active'
    and not exists(select 1 from user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=auth.uid()));
  if cardinality(v_members)=0 then raise exception 'no members'; end if;
  if cardinality(v_members)>99 then raise exception 'too many members'; end if;
  perform public.check_conversation_rate_limit();
  insert into conversations(kind,name,created_by) values('group',v_name,auth.uid()) returning id into v_id;
  insert into conversation_members(conversation_id,user_id,is_admin) values(v_id,auth.uid(),true);
  insert into conversation_members(conversation_id,user_id) select v_id,unnest(v_members);
  return v_id;
end $$;

-- Gruppe med de aktive medlemmene (offentlige verv) i en organisasjon, startet fra meldingssøket.
-- Det er en vanlig gruppe mellom personer, ikke en innboks for organisasjonen.
create or replace function public.create_organization_group(p_org uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_org organizations; v_members uuid[];
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into v_org from organizations where id=p_org;
  if not found or v_org.status<>'active' then raise exception 'organization not found'; end if;
  select coalesce(array_agg(c.user_id),'{}') into v_members from public.list_organization_contacts(p_org) c where not c.me;
  if cardinality(v_members)=0 then raise exception 'no members'; end if;
  return public.create_group_conversation(left(coalesce(v_org.school_name,v_org.name),80),v_members);
end $$;

-- Gruppeadministrator legger til personer i en vanlig gruppe. Nye medlemmer ser bare meldinger fra nå.
create or replace function public.add_conversation_members(p_conversation uuid,p_members uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare v_kind text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select kind into v_kind from conversations where id=p_conversation;
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  if v_kind<>'group' or not exists(select 1 from conversation_members where conversation_id=p_conversation and user_id=auth.uid() and is_admin) then raise exception 'not authorized'; end if;
  insert into conversation_members(conversation_id,user_id,joined_at,history_starts_at)
    select distinct p_conversation,p.id,now(),now() from profiles p
    where p.id=any(coalesce(p_members,'{}')) and p.id<>auth.uid() and p.status='active'
      and not exists(select 1 from user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=auth.uid()))
  on conflict (conversation_id,user_id) do update set left_at=null,joined_at=now(),history_starts_at=now(),last_read_at=null,is_admin=false
    where conversation_members.left_at is not null;
  if (select count(*) from conversation_members where conversation_id=p_conversation and left_at is null)>100 then raise exception 'too many members'; end if;
end $$;

-- Bare vanlige grupper kan forlates. Systemstyrte grupper følger vervene. Forlater siste administrator gruppen,
-- blir den som har vært med lengst administrator.
create or replace function public.leave_conversation(p_conversation uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  if (select kind from conversations where id=p_conversation)<>'group' then raise exception 'cannot leave'; end if;
  update conversation_members set left_at=now(),is_admin=false where conversation_id=p_conversation and user_id=auth.uid();
  if not exists(select 1 from conversation_members where conversation_id=p_conversation and left_at is null and is_admin) then
    update conversation_members set is_admin=true where conversation_id=p_conversation and user_id=(
      select user_id from conversation_members where conversation_id=p_conversation and left_at is null order by joined_at,user_id limit 1);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Sende, lese, dempe og skjule
-- ---------------------------------------------------------------------------
-- Sender en melding med tekst og/eller inntil fem vedlegg som allerede er lastet opp til
-- private-message-attachments/<samtale>/<bruker>/. Grense: 30 meldinger i minuttet.
create or replace function public.send_message(p_conversation uuid,p_body text,p_attachments jsonb default '[]'::jsonb)
returns table (id uuid,created_at timestamptz) language plpgsql security definer set search_path=public as $$
declare v_body text:=nullif(trim(coalesce(p_body,'')),''); v_attachments jsonb:=coalesce(p_attachments,'[]'::jsonb); v_id uuid; v_at timestamptz; a jsonb;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  if exists(select 1 from conversations c join conversation_members cm on cm.conversation_id=c.id and cm.user_id<>auth.uid() and cm.left_at is null
    where c.id=p_conversation and c.kind='direct' and exists(select 1 from user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=cm.user_id) or (b.blocker_id=cm.user_id and b.blocked_id=auth.uid()))) then
    raise exception 'blocked';
  end if;
  if jsonb_typeof(v_attachments)<>'array' or jsonb_array_length(v_attachments)>5 then raise exception 'invalid attachment'; end if;
  if v_body is null and jsonb_array_length(v_attachments)=0 then raise exception 'empty message'; end if;
  if char_length(v_body)>5000 then raise exception 'message too long'; end if;
  if (select count(*) from messages m where m.sender_user_id=auth.uid() and m.created_at>now()-interval '1 minute')>=30 then raise exception 'rate limited'; end if;
  for a in select * from jsonb_array_elements(v_attachments) loop
    if coalesce(a->>'path','') not like p_conversation::text||'/'||auth.uid()::text||'/%'
      or coalesce(a->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      or coalesce((a->>'byte_size')::bigint,0) not between 1 and 26214400
      or char_length(coalesce(a->>'file_name','')) not between 1 and 200
      or not exists(select 1 from storage.objects o where o.bucket_id='private-message-attachments' and o.name=a->>'path')
      or exists(select 1 from message_attachments x where x.storage_path=a->>'path') then
      raise exception 'invalid attachment';
    end if;
  end loop;
  insert into messages(conversation_id,sender_user_id,body) values(p_conversation,auth.uid(),v_body) returning messages.id,messages.created_at into v_id,v_at;
  insert into message_attachments(message_id,storage_path,mime_type,byte_size,file_name)
    select v_id,x->>'path',x->>'mime_type',(x->>'byte_size')::bigint,x->>'file_name' from jsonb_array_elements(v_attachments) x;
  update conversation_members set last_read_at=v_at where conversation_id=p_conversation and user_id=auth.uid();
  return query select v_id,v_at;
end $$;

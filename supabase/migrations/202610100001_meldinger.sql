-- Prompt 10: meldinger (docs/PROMPTPLAN.md, KRAVSPEC §9, §17).
-- Meldinger er alltid personlige: direktemeldinger, vanlige grupper og systemstyrte grupper for skoler og styrer
-- som følger de aktive vervene. Det finnes ingen organisasjonsinnboks. Alt skrives via RPC-er som sjekker
-- medlemskap, blokkering og grenser selv, og ingen administrator kan lese meldinger uten å være med i samtalen.

-- ---------------------------------------------------------------------------
-- 1. Tabeller og kolonner
-- ---------------------------------------------------------------------------
-- Systemstyrte grupper opprettes av databasen, ikke av en bruker.
alter table public.conversations alter column created_by drop not null;
-- Én direktesamtale per par: «<minste id>:<største id>».
alter table public.conversations add column direct_key text unique;
alter table public.conversations add constraint conversations_name_length check (name is null or char_length(name) between 1 and 80);
alter table public.conversations add constraint conversations_managed_organization check ((kind='managed')=(managed_organization_id is not null));
-- Én systemstyrt gruppe per organisasjon.
create unique index conversations_one_managed on public.conversations(managed_organization_id) where kind='managed';
create index conversation_members_user_idx on public.conversation_members(user_id) where left_at is null;
create index messages_sender_idx on public.messages(sender_user_id,created_at desc);

-- Filnavnet vises i samtalen. Selve filen ligger i private-message-attachments/<samtale>/<bruker>/.
alter table public.message_attachments add column file_name text not null default 'vedlegg' check (char_length(file_name) between 1 and 200);

-- Sletting for egen visning: meldingen skjules bare for den som sletter den.
create table public.message_hidden (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id,message_id)
);
alter table public.message_hidden enable row level security;
alter table public.message_hidden force row level security;
create policy message_hidden_own_read on public.message_hidden for select to authenticated using (user_id=auth.uid());

-- Lest-status er av som standard, og vises bare mellom personer som begge har slått den på.
create table public.message_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  read_receipts boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.message_settings enable row level security;
alter table public.message_settings force row level security;
create policy message_settings_own_read on public.message_settings for select to authenticated using (user_id=auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Medlemskap og lesetilgang (§9, §17)
-- ---------------------------------------------------------------------------
-- Aktivt medlem av samtalen. I systemstyrte grupper kreves i tillegg aktivt verv i en aktiv organisasjon,
-- så tilgangen forsvinner samme dag som vervet slutter, også før gruppen er synkronisert.
create or replace function public.is_conversation_member(p_conversation uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversation_members cm join conversations c on c.id=cm.conversation_id
    where cm.conversation_id=p_conversation and cm.user_id=p_user and cm.left_at is null
      and (c.kind<>'managed' or public.has_active_membership(c.managed_organization_id,p_user)));
$$;

-- Om brukeren kan se meldingen: aktivt medlem, sendt etter at brukeren ble med (historikkgrensen),
-- ikke fra noen brukeren har blokkert, og ikke slettet for egen visning.
create or replace function public.can_view_message(p_message uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from messages m join conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=p_user
    where m.id=p_message and m.deleted_at is null and m.created_at>=cm.history_starts_at
      and public.is_conversation_member(m.conversation_id,p_user)
      and not exists(select 1 from user_blocks b where b.blocker_id=p_user and b.blocked_id=m.sender_user_id)
      and not exists(select 1 from message_hidden h where h.user_id=p_user and h.message_id=m.id));
$$;

drop policy messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using (public.can_view_message(id));
-- Meldinger sendes bare via send_message, som sjekker blokkering, vedlegg og grensen for antall meldinger.
drop policy messages_member_insert on public.messages;
-- Vedlegg kan leses når meldingen kan leses. Nye medlemmer ser ikke vedlegg fra før de ble med.
drop policy attachments_member_read on public.message_attachments;
create policy attachments_member_read on public.message_attachments for select to authenticated using (public.can_view_message(message_id));
drop policy private_attachment_read on storage.objects;
create policy private_attachment_read on storage.objects for select to authenticated using (bucket_id='private-message-attachments'
  and exists(select 1 from public.message_attachments a where a.storage_path=storage.objects.name and public.can_view_message(a.message_id)));

-- ---------------------------------------------------------------------------
-- 3. Systemstyrte grupper for skoler og styrer (§9)
-- ---------------------------------------------------------------------------
-- Gruppen opprettes når organisasjonen har aktive verv. Nye medlemmer legges til når vervet starter og ser bare
-- meldinger fra da. Tidligere medlemmer mister tilgangen når vervet slutter. Historikken beholdes for de andre.
-- Organisasjonens administrator er ikke med i gruppen uten selv å ha et verv.
create or replace function public.sync_managed_conversation(p_org uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_conversation uuid; v_status organization_status;
begin
  select status into v_status from organizations where id=p_org;
  if not found then return; end if;
  select id into v_conversation from conversations where kind='managed' and managed_organization_id=p_org;
  if v_conversation is null then
    if v_status<>'active' or not exists(select 1 from memberships m where m.organization_id=p_org and m.status='active'
      and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) then return; end if;
    insert into conversations(kind,managed_organization_id) values('managed',p_org) on conflict do nothing returning id into v_conversation;
    if v_conversation is null then select id into v_conversation from conversations where kind='managed' and managed_organization_id=p_org; end if;
  end if;
  insert into conversation_members(conversation_id,user_id,joined_at,history_starts_at)
    select distinct v_conversation,m.user_id,now(),now() from memberships m join profiles p on p.id=m.user_id and p.status='active'
    where m.organization_id=p_org and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
  on conflict (conversation_id,user_id) do update set left_at=null,joined_at=now(),history_starts_at=now(),last_read_at=null
    where conversation_members.left_at is not null;
  update conversation_members cm set left_at=now() where cm.conversation_id=v_conversation and cm.left_at is null
    and not exists(select 1 from memberships m join profiles p on p.id=m.user_id and p.status='active'
      where m.user_id=cm.user_id and m.organization_id=p_org and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date));
end $$;

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

create or replace function public.mark_conversation_read(p_conversation uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  update conversation_members set last_read_at=now() where conversation_id=p_conversation and user_id=auth.uid();
end $$;

-- Demping gjelder til den slås av. Dempede samtaler teller ikke i antall uleste i menyen, og varsler (prompt 11)
-- skal ikke sendes for dem.
create or replace function public.set_conversation_muted(p_conversation uuid,p_muted boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_conversation_member(p_conversation) then raise exception 'conversation not found'; end if;
  update conversation_members set muted_until=case when p_muted then 'infinity'::timestamptz end where conversation_id=p_conversation and user_id=auth.uid();
end $$;

create or replace function public.hide_message(p_message uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_view_message(p_message) then raise exception 'message not found'; end if;
  insert into message_hidden(user_id,message_id) values(auth.uid(),p_message) on conflict do nothing;
end $$;

create or replace function public.set_read_receipts(p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  insert into message_settings(user_id,read_receipts) values(auth.uid(),coalesce(p_enabled,false))
  on conflict (user_id) do update set read_receipts=excluded.read_receipts,updated_at=now();
end $$;

-- ---------------------------------------------------------------------------
-- 8. Rapportering og blokkering (§9, §15)
-- ---------------------------------------------------------------------------
-- Brukeren rapporterer én konkret melding. Bare den meldingen deles med moderator (shared_message_excerpt);
-- resten av samtalen er fortsatt utilgjengelig for moderator og administratorer.
create or replace function public.report_message(p_message uuid,p_category text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare m messages; v_id uuid;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if not public.can_view_message(p_message) then raise exception 'message not found'; end if;
  select * into m from messages where id=p_message;
  if m.sender_user_id=auth.uid() then raise exception 'cannot report own message'; end if;
  if p_category not in ('harassment','spam','inappropriate','other') then raise exception 'invalid category'; end if;
  if char_length(coalesce(p_description,''))>1000 then raise exception 'invalid description'; end if;
  if exists(select 1 from moderation_reports r where r.reporter_id=auth.uid() and r.target_type='message' and r.target_id=p_message and r.status in ('open','reviewing')) then
    raise exception 'already reported';
  end if;
  insert into moderation_reports(reporter_id,target_type,target_id,category,description,shared_message_excerpt,status)
    values(auth.uid(),'message',p_message,p_category,nullif(trim(p_description),''),coalesce(m.body,'(bare vedlegg)'),'open') returning id into v_id;
  update messages set reported_at=now() where id=p_message and reported_at is null;
  return v_id;
end $$;

-- Den blokkerte får ikke vite det. Direktemeldinger stoppes begge veier, og meldinger fra den blokkerte skjules
-- for den som blokkerer, også i grupper.
create or replace function public.block_user(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_user is null or p_user=auth.uid() or not exists(select 1 from profiles where id=p_user) then raise exception 'person not found'; end if;
  insert into user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user) on conflict do nothing;
end $$;

create or replace function public.unblock_user(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from user_blocks where blocker_id=auth.uid() and blocked_id=p_user;
end $$;

create or replace function public.list_my_blocks() returns table (user_id uuid,display_name text,created_at timestamptz) language sql stable security definer set search_path=public as $$
  select p.id,p.display_name,b.created_at from user_blocks b join profiles p on p.id=b.blocked_id where b.blocker_id=auth.uid() order by p.display_name;
$$;

-- ---------------------------------------------------------------------------
-- 9. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.can_view_message(uuid,uuid),public.sync_managed_conversation(uuid),public.sync_managed_conversation_trigger(),
  public.sync_my_managed_conversations(),public.check_conversation_rate_limit(),
  public.list_my_conversations(),public.get_conversation_messages(uuid,timestamptz,int),public.list_conversation_members(uuid),public.get_message_settings(),
  public.search_message_recipients(text),public.list_organization_contacts(uuid),public.start_direct_conversation(uuid),public.create_group_conversation(text,uuid[]),
  public.create_organization_group(uuid),public.add_conversation_members(uuid,uuid[]),public.leave_conversation(uuid),public.send_message(uuid,text,jsonb),
  public.mark_conversation_read(uuid),public.set_conversation_muted(uuid,boolean),public.hide_message(uuid),public.set_read_receipts(boolean),
  public.report_message(uuid,text,text),public.block_user(uuid),public.unblock_user(uuid),public.list_my_blocks() from public,anon,authenticated;
-- can_view_message brukes av RLS-reglene og må kunne kalles av innloggede.
grant execute on function public.can_view_message(uuid,uuid),
  public.list_my_conversations(),public.get_conversation_messages(uuid,timestamptz,int),public.list_conversation_members(uuid),public.get_message_settings(),
  public.search_message_recipients(text),public.list_organization_contacts(uuid),public.start_direct_conversation(uuid),public.create_group_conversation(text,uuid[]),
  public.create_organization_group(uuid),public.add_conversation_members(uuid,uuid[]),public.leave_conversation(uuid),public.send_message(uuid,text,jsonb),
  public.mark_conversation_read(uuid),public.set_conversation_muted(uuid,boolean),public.hide_message(uuid),public.set_read_receipts(boolean),
  public.report_message(uuid,text,text),public.block_user(uuid),public.unblock_user(uuid),public.list_my_blocks() to authenticated;

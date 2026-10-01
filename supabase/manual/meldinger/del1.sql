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

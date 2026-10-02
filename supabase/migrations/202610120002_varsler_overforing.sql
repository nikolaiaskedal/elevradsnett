-- Prompt 11: varsler og styreoverføring (docs/PROMPTPLAN.md, KRAVSPEC §5, §17).
-- Varsler lagres i notifications. En trigger setter kategori og kanaler ut fra brukerens innstillinger, slår sammen
-- uleste varsler om det samme (group_key), og dropper varselet hvis brukeren har slått av begge kanalene.
-- E-post sendes som ett daglig sammendrag per bruker av Edge-funksjonen send-digest (supabase/functions/send-digest),
-- så gratisgrensen for e-post holder. Push har en egen kolonne (push_sent_at) og kobles på senere.
-- Styreoverføringen går via RPC-er: start_handover, respond_handover_invite, reschedule_handover, cancel_handover og
-- complete_handover. Nye roller aktiveres på aktiveringsdatoen, når minst én ny skoleadministrator har akseptert.
-- run_daily_jobs kjøres hver natt med pg_cron: aktiverer overføringer, avslutter utløpte roller og sender påminnelser.
-- Migrasjonen har ingen drop.

-- ---------------------------------------------------------------------------
-- 1. Varsler: kategori, kanaler og sammenslåing
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column category text not null default 'other' check (category in ('messages','events','handover','roles','organization','other')),
  add column group_key text,
  add column item_count int not null default 1 check (item_count>0),
  add column show_in_app boolean not null default true,
  add column send_email boolean not null default true,
  add column send_push boolean not null default false;
create unique index notifications_open_group on public.notifications(user_id,group_key) where read_at is null and group_key is not null;
create index notifications_user_idx on public.notifications(user_id,created_at desc);
create index notifications_digest_idx on public.notifications(user_id) where send_email and email_sent_at is null and read_at is null;

-- Kategorier brukeren kan slå av per kanal. Tom liste betyr at alt er på, så nye kategorier er på som standard.
alter table public.notification_preferences
  add column in_app_off text[] not null default '{}' check (in_app_off <@ array['messages','events','handover','roles','organization','other']),
  add column email_off text[] not null default '{}' check (email_off <@ array['messages','events','handover','roles','organization','other']);

-- Varsler og innstillinger endres bare via RPC-ene under.
revoke insert,update,delete on public.notifications from anon,authenticated;
revoke insert,update,delete on public.notification_preferences from anon,authenticated;

create or replace function public.notification_category(p_type text) returns text language sql immutable set search_path=public as $$
  select case split_part(coalesce(p_type,''),'.',1)
    when 'message' then 'messages' when 'event' then 'events' when 'handover' then 'handover'
    when 'role' then 'roles' when 'office' then 'roles' when 'school_admin' then 'roles'
    when 'friend' then 'organization' else 'other' end;
$$;

-- Kjøres før hvert nytt varsel, også fra eldre funksjoner som skriver direkte i tabellen.
create or replace function public.prepare_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare p notification_preferences;
begin
  -- Deaktiverte brukere får ingen varsler.
  if not exists(select 1 from profiles where id=new.user_id and status='active') then return null; end if;
  new.category := public.notification_category(new.type);
  select * into p from notification_preferences where user_id=new.user_id;
  new.show_in_app := coalesce(p.in_app,true) and not (new.category=any(coalesce(p.in_app_off,'{}')));
  new.send_email := coalesce(p.email,true) and not (new.category=any(coalesce(p.email_off,'{}')));
  new.send_push := coalesce(p.push,false);
  if not new.show_in_app and not new.send_email then return null; end if;
  -- Et ulest varsel om det samme (f.eks. samme samtale) oppdateres i stedet for å lage et nytt.
  if new.group_key is not null then
    update notifications set title=new.title,body=new.body,link=new.link,item_count=item_count+1,created_at=now(),
      show_in_app=new.show_in_app,send_email=new.send_email,send_push=new.send_push
    where user_id=new.user_id and group_key=new.group_key and read_at is null;
    if found then return null; end if;
  end if;
  return new;
end $$;
create trigger notifications_prepare before insert on public.notifications for each row execute function public.prepare_notification();

-- Én funksjon for alle varsler fra serveren.
create or replace function public.notify_user(p_user uuid,p_type text,p_title text,p_body text default null,p_link text default null,p_group text default null)
returns void language sql security definer set search_path=public as $$
  insert into notifications(user_id,type,title,body,link,group_key) select p_user,p_type,left(p_title,200),left(p_body,500),p_link,p_group where p_user is not null;
$$;

-- Styreadministratorene over en skole: lokallaget skolen hører til og fylkesstyret i skolens fylke.
create or replace function public.area_board_admins(p_school uuid) returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct r.user_id from organizations s
  join organizations b on (b.type='local_board' and b.id=s.local_board_id) or (b.type='county_board' and b.county=s.county)
  join role_grants r on r.organization_id=b.id and r.role='board_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)
  join profiles p on p.id=r.user_id and p.status='active'
  where s.id=p_school and s.type='school';
$$;
create or replace function public.organization_admins(p_org uuid) returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct r.user_id from role_grants r join profiles p on p.id=r.user_id and p.status='active'
  where r.organization_id=p_org and r.role in ('school_admin','board_admin') and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date);
$$;
create or replace function public.super_admins() returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct r.user_id from role_grants r join profiles p on p.id=r.user_id and p.status='active'
  where r.role='super_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date);
$$;

-- ---------------------------------------------------------------------------
-- 2. Hendelser som gir varsler
-- ---------------------------------------------------------------------------
-- Nye meldinger: ett ulest varsel per samtale. Ikke for avsenderen, dempede samtaler eller blokkerte personer.
-- Varselet sier hvem som skrev, men aldri hva (meldinger brukes ikke i e-post eller andre kanaler).
create or replace function public.notify_new_message() returns trigger language plpgsql security definer set search_path=public as $$
declare c conversations; v_sender text;
begin
  select * into c from conversations where id=new.conversation_id;
  select display_name into v_sender from profiles where id=new.sender_user_id;
  insert into notifications(user_id,type,title,link,group_key)
  select cm.user_id,'message.new',
    case when c.kind='direct' then 'Ny melding fra '||coalesce(v_sender,'en person') else 'Ny melding i '||coalesce(c.name,'gruppen') end,
    '#/meldinger','conversation:'||c.id
  from conversation_members cm
  where cm.conversation_id=c.id and cm.user_id<>new.sender_user_id and cm.left_at is null and cm.history_starts_at<=new.created_at
    and (cm.muted_until is null or cm.muted_until<now()) and not public.is_blocked_between(cm.user_id,new.sender_user_id);
  return null;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_new_message();

-- Nye verv og rettigheter. Ikke når personen ga seg selv vervet, eller når raden kommer fra import uten tildeler.
create or replace function public.notify_new_membership() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='active' and new.public_title is not null and new.granted_by is not null and new.granted_by<>new.user_id then
    perform public.notify_user(new.user_id,'office.assigned','Du har fått et verv',
      new.public_title||' i '||(select name from organizations where id=new.organization_id)||'.','#/profil');
  end if;
  return null;
end $$;
create trigger memberships_notify after insert on public.memberships for each row execute function public.notify_new_membership();

create or replace function public.notify_new_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='active' and new.granted_by<>new.user_id then
    perform public.notify_user(new.user_id,'role.assigned','Du har fått en ny rettighet',
      (case new.role when 'super_admin' then 'Superadministrator' when 'board_admin' then 'Styreadministrator' when 'school_admin' then 'Skoleadministrator' else 'Innholdsansvarlig' end)
      ||' i '||(select name from organizations where id=new.organization_id)||'.','#/admin','role:'||new.organization_id||':'||new.role);
  end if;
  return null;
end $$;
create trigger role_grants_notify after insert on public.role_grants for each row execute function public.notify_new_role();

-- Forespørsel om å bli skoleadministrator: styreadministratorene i området varsles, og søkeren får svaret.
create or replace function public.notify_school_admin_request() returns trigger language plpgsql security definer set search_path=public as $$
declare v_school text:=(select coalesce(school_name,name) from organizations where id=new.school_id);
begin
  if tg_op='INSERT' and new.status='pending' then
    perform public.notify_user(a,'school_admin.requested','Ny forespørsel om skoleadministrator',
      (select display_name from profiles where id=new.user_id)||' vil bli skoleadministrator for '||v_school||'.','#/admin','school-admin-requests')
    from public.area_board_admins(new.school_id) a where a<>new.user_id;
  elsif tg_op='UPDATE' and old.status='pending' and new.status in ('approved','rejected') then
    perform public.notify_user(new.user_id,'school_admin.'||new.status,
      case when new.status='approved' then 'Du er nå skoleadministrator' else 'Forespørselen ble avslått' end,
      case when new.status='approved' then 'Forespørselen om å bli skoleadministrator for '||v_school||' er godkjent.'
        else 'Forespørselen om å bli skoleadministrator for '||v_school||' ble avslått.' end,'#/profil','role:'||new.school_id||':school_admin');
  end if;
  return null;
end $$;
create trigger school_admin_requests_notify after insert or update of status on public.school_admin_requests for each row execute function public.notify_school_admin_request();

-- Venneråd: skoleadministratorene hos mottakeren varsles om forespørselen, og avsenderen om svaret.
create or replace function public.notify_friend_connection() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' and new.status='pending' then
    perform public.notify_user(a,'friend.requested','Ny forespørsel om venneråd',(select name from organizations where id=new.requester_id)||' vil bli venneråd med dere.','#/admin')
    from public.organization_admins(new.recipient_id) a;
  elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
    perform public.notify_user(a,'friend.accepted','Nytt venneråd',(select name from organizations where id=new.recipient_id)||' har godtatt forespørselen om venneråd.','#/admin')
    from public.organization_admins(new.requester_id) a;
  end if;
  return null;
end $$;
create trigger organization_connections_notify after insert or update of status on public.organization_connections for each row execute function public.notify_friend_connection();

-- ---------------------------------------------------------------------------
-- 3. Varsler og innstillinger for brukeren
-- ---------------------------------------------------------------------------
create or replace function public.list_notifications(p_limit int default 50)
returns table (id uuid,type text,category text,title text,body text,link text,item_count int,read_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select n.id,n.type,n.category,n.title,n.body,n.link,n.item_count,n.read_at,n.created_at from notifications n
  where n.user_id=auth.uid() and n.show_in_app
  order by n.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
$$;

-- Uten liste: alle uleste. Returnerer antall varsler som ble merket.
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int language plpgsql security definer set search_path=public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  update notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_ids is null or id=any(p_ids));
  get diagnostics v=row_count;
  return v;
end $$;

create or replace function public.get_notification_preferences()
returns table (in_app boolean,email boolean,push boolean,in_app_off text[],email_off text[])
language sql stable security definer set search_path=public as $$
  select coalesce(p.in_app,true),coalesce(p.email,true),coalesce(p.push,false),coalesce(p.in_app_off,'{}'),coalesce(p.email_off,'{}')
  from (select auth.uid() as uid) me left join notification_preferences p on p.user_id=me.uid where me.uid is not null;
$$;

create or replace function public.set_notification_preferences(p_in_app boolean,p_email boolean,p_in_app_off text[] default '{}',p_email_off text[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare v_all text[]:=array['messages','events','handover','roles','organization','other'];
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_in_app is null or p_email is null or not (coalesce(p_in_app_off,'{}')<@v_all) or not (coalesce(p_email_off,'{}')<@v_all) then raise exception 'invalid preferences'; end if;
  insert into notification_preferences(user_id,in_app,email,in_app_off,email_off,updated_at)
    values(auth.uid(),p_in_app,p_email,coalesce(p_in_app_off,'{}'),coalesce(p_email_off,'{}'),now())
  on conflict (user_id) do update set in_app=excluded.in_app,email=excluded.email,in_app_off=excluded.in_app_off,email_off=excluded.email_off,updated_at=now();
end $$;

-- ---------------------------------------------------------------------------
-- 4. Styreoverføring (§5)
-- ---------------------------------------------------------------------------
alter table public.handover_processes
  add column is_recovery boolean not null default false,
  add column recovery_reason text check (recovery_reason is null or char_length(recovery_reason) between 5 and 1000);
alter table public.handover_invites
  add column invited_name text check (invited_name is null or char_length(invited_name)<=120),
  add column responded_at timestamptz,
  add column emailed_at timestamptz,
  add constraint handover_invites_has_role check (public_title is not null or admin_role is not null),
  add constraint handover_invites_school_roles check (admin_role is null or admin_role in ('school_admin','content_manager'));
create unique index handover_one_open on public.handover_processes(organization_id) where status in ('awaiting_acceptance','scheduled');
create index handover_invites_email_idx on public.handover_invites(lower(email)) where status='pending';

-- Påminnelser som er sendt, så hver påminnelse bare sendes én gang selv om jobben kjøres flere ganger.
create table public.handover_reminders (
  organization_id uuid not null references public.organizations(id),
  expected_on date not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,expected_on,kind)
);
alter table public.handover_reminders enable row level security;
alter table public.handover_reminders force row level security;
create policy handover_reminders_admin_read on public.handover_reminders for select to authenticated using (public.has_area_role(organization_id));
revoke insert,update,delete on public.handover_reminders from anon,authenticated;
-- Tabellene for overføring skrives bare via funksjonene under.
revoke insert,update,delete on public.handover_processes,public.handover_invites,public.election_schedules,public.board_terms from anon,authenticated;

-- Dagens styreperiode, eller null.
create or replace function public.current_board_term(p_org uuid) returns public.board_terms language sql stable security definer set search_path=public as $$
  select * from board_terms where organization_id=p_org and status='active' order by starts_on desc limit 1;
$$;

-- Dato for neste styreskifte. Kan endres hvis valget utsettes (§5).
create or replace function public.set_election_date(p_org uuid,p_date date) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_user() or not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  if not exists(select 1 from organizations where id=p_org and type='school' and status='active') then raise exception 'school not found'; end if;
  if p_date is null or p_date<current_date-60 or p_date>current_date+730 then raise exception 'invalid election date'; end if;
  insert into election_schedules(organization_id,expected_handover_on,updated_by,updated_at) values(p_org,p_date,auth.uid(),now())
  on conflict (organization_id) do update set expected_handover_on=excluded.expected_handover_on,updated_by=excluded.updated_by,updated_at=now();
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,'handover.date_set','organization',p_org::text,jsonb_build_object('date',p_date));
end $$;

-- Antall dager siden datoen for styreskiftet, uten fullført overføring etter datoen. 0 hvis den ikke er passert.
create or replace function public.handover_overdue_days(p_org uuid,p_today date default current_date) returns int language sql stable security definer set search_path=public as $$
  select coalesce((select greatest(0,p_today-es.expected_handover_on) from election_schedules es where es.organization_id=p_org
    and not exists(select 1 from handover_processes h where h.organization_id=p_org and h.status='completed' and h.activation_date>=es.expected_handover_on-60)),0);
$$;

-- Det skoleadministrator og styreadministrator i området ser i veiviseren.
create or replace function public.get_handover_overview(p_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare o organizations; es election_schedules; t board_terms; h handover_processes; v_overdue int; v_admins int;
begin
  if not public.is_active_user() or not public.has_area_role(p_org) then raise exception 'not authorized'; end if;
  select * into o from organizations where id=p_org;
  if not found or o.type<>'school' then raise exception 'school not found'; end if;
  select * into es from election_schedules where organization_id=p_org;
  t := public.current_board_term(p_org);
  select * into h from handover_processes where organization_id=p_org and status in ('awaiting_acceptance','scheduled') order by created_at desc limit 1;
  if h.id is null then select * into h from handover_processes where organization_id=p_org order by created_at desc limit 1; end if;
  v_overdue := public.handover_overdue_days(p_org);
  select count(*) into v_admins from role_grants r join profiles p on p.id=r.user_id and p.status='active'
    where r.organization_id=p_org and r.role='school_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date);
  return jsonb_build_object(
    'organization_id',o.id,'name',coalesce(o.school_name,o.name),'status',o.status,
    'expected_handover_on',es.expected_handover_on,
    'term_starts_on',t.starts_on,
    'overdue_days',v_overdue,
    'admin_count',v_admins,
    'can_manage',public.has_role(p_org,array['school_admin']::admin_role[]),
    'can_recover',(public.is_area_board_admin(p_org) or public.has_role(null,array['super_admin']::admin_role[])) and (v_overdue>=7 or v_admins=0),
    'members',coalesce((select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object('user_id',p.id,'name',p.display_name,
        'offices',coalesce((select jsonb_agg(m.public_title order by m.start_date) from memberships m where m.user_id=p.id and m.organization_id=p_org and m.public_title is not null
          and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),'[]'::jsonb),
        'roles',coalesce((select jsonb_agg(distinct r.role) from role_grants r where r.user_id=p.id and r.organization_id=p_org and r.role in ('school_admin','content_manager')
          and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)),'[]'::jsonb)) as x
      from profiles p where p.status='active' and (
        exists(select 1 from memberships m where m.user_id=p.id and m.organization_id=p_org and m.public_title is not null and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))
        or exists(select 1 from role_grants r where r.user_id=p.id and r.organization_id=p_org and r.role in ('school_admin','content_manager') and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)))
    ) members),'[]'::jsonb),
    'handover',case when h.id is null then null else jsonb_build_object(
      'id',h.id,'status',h.status,'activation_date',h.activation_date,'old_board_ends_on',h.old_board_ends_on,'is_recovery',h.is_recovery,'recovery_reason',h.recovery_reason,
      'started_by_name',(select display_name from profiles where id=h.started_by),'created_at',h.created_at,'completed_at',h.completed_at,
      'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'user_id',i.user_id,'name',coalesce(p.display_name,i.invited_name,i.email),'email',case when i.user_id is null then i.email end,
          'public_title',i.public_title,'admin_role',i.admin_role,'status',i.status,'responded_at',i.responded_at) order by i.created_at)
        from handover_invites i left join profiles p on p.id=i.user_id where i.handover_id=h.id),'[]'::jsonb)) end);
end $$;

-- Gir én akseptert invitasjon effekt: verv og rettighet fra aktiveringsdatoen. Brukes ved aktivering, og for
-- invitasjoner som aksepteres etter at overføringen er fullført.
create or replace function public.apply_handover_invite(p_invite uuid) returns void language plpgsql security definer set search_path=public as $$
declare i handover_invites; h handover_processes; v_start date;
begin
  select * into i from handover_invites where id=p_invite;
  select * into h from handover_processes where id=i.handover_id;
  if i.status<>'accepted' or i.user_id is null then return; end if;
  v_start := least(h.activation_date,current_date);
  if i.public_title is not null and not exists(select 1 from memberships m where m.user_id=i.user_id and m.organization_id=h.organization_id
      and lower(m.public_title)=lower(i.public_title) and m.status='active' and (m.end_date is null or m.end_date>=current_date)) then
    insert into memberships(user_id,organization_id,public_title,start_date,status,granted_by,granted_at,accepted_at)
      values(i.user_id,h.organization_id,i.public_title,v_start,'active',h.started_by,now(),i.accepted_at);
  end if;
  if i.admin_role is not null and not exists(select 1 from role_grants r where r.user_id=i.user_id and r.organization_id=h.organization_id
      and r.role=i.admin_role and r.status='active' and (r.end_date is null or r.end_date>=current_date)) then
    insert into role_grants(user_id,organization_id,role,start_date,status,granted_by,granted_at,accepted_at)
      values(i.user_id,h.organization_id,i.admin_role,v_start,'active',h.started_by,now(),i.accepted_at);
  end if;
end $$;

-- Aktiverer en overføring med minst én akseptert ny skoleadministrator: nye verv og rettigheter gis, gamle verv
-- og rettigheter som ikke videreføres får sluttdato, og ny styreperiode starter. Historikken blir stående.
create or replace function public.activate_handover(p_handover uuid) returns void language plpgsql security definer set search_path=public as $$
declare h handover_processes; v_old board_terms; v_term uuid; v_ends date; r record;
begin
  select * into h from handover_processes where id=p_handover for update;
  if not found or h.status<>'scheduled' then raise exception 'handover not ready'; end if;
  if not exists(select 1 from handover_invites i join profiles p on p.id=i.user_id and p.status='active'
      where i.handover_id=h.id and i.admin_role='school_admin' and i.status='accepted') then raise exception 'accepted successor required'; end if;
  perform public.apply_handover_invite(i.id) from handover_invites i where i.handover_id=h.id and i.status='accepted';
  -- Gamle verv og rettigheter som ikke er videreført i overføringen.
  for r in select m.id,m.user_id,m.start_date from memberships m where m.organization_id=h.organization_id and m.public_title is not null and m.status='active'
      and m.start_date<h.activation_date and (m.end_date is null or m.end_date>=current_date)
      and not exists(select 1 from handover_invites i where i.handover_id=h.id and i.status='accepted' and i.user_id=m.user_id and lower(i.public_title)=lower(m.public_title)) loop
    v_ends := greatest(r.start_date,least(h.old_board_ends_on,current_date));
    update memberships set status='ended',end_date=v_ends,revoked_by=auth.uid(),revoked_at=now() where id=r.id;
    update profiles set active_membership_id=null where active_membership_id=r.id;
  end loop;
  update role_grants g set status='ended',end_date=greatest(g.start_date,least(h.old_board_ends_on,current_date)),revoked_by=auth.uid(),revoked_at=now()
  where g.organization_id=h.organization_id and g.role in ('school_admin','content_manager') and g.status='active' and g.start_date<h.activation_date
    and (g.end_date is null or g.end_date>=current_date)
    and not exists(select 1 from handover_invites i where i.handover_id=h.id and i.status='accepted' and i.user_id=g.user_id and i.admin_role=g.role);
  -- Styreperioden.
  v_old := public.current_board_term(h.organization_id);
  if v_old.id is not null then update board_terms set status='completed',ends_on=greatest(starts_on,h.old_board_ends_on) where id=v_old.id; end if;
  insert into board_terms(organization_id,starts_on,status) values(h.organization_id,h.activation_date,'active') returning id into v_term;
  update handover_processes set status='completed',completed_at=now(),confirmed_by=auth.uid(),current_term_id=v_old.id,target_term_id=v_term,updated_at=now() where id=h.id;
  -- Neste styreskifte antas om et år. Skoleadministrator kan endre datoen.
  insert into election_schedules(organization_id,expected_handover_on,updated_by,updated_at) values(h.organization_id,(h.activation_date+interval '1 year')::date,h.started_by,now())
  on conflict (organization_id) do update set expected_handover_on=excluded.expected_handover_on,updated_at=now();
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),h.organization_id,'handover.completed','handover',h.id::text,jsonb_build_object('activation_date',h.activation_date,'old_board_ends_on',h.old_board_ends_on));
  perform public.notify_user(a,'handover.completed','Styreoverføringen er fullført','Det nye styret i '||(select coalesce(school_name,name) from organizations where id=h.organization_id)||' er aktivt.','#/admin')
  from public.organization_admins(h.organization_id) a;
end $$;

-- Starter overføringen: datoer, nye verv og rettigheter, og invitasjoner. Skoleadministrator gjør det for egen skole.
-- Gjenoppretting (§5): styreadministrator i området eller superadministrator, med begrunnelse, når overføringen er
-- minst 7 dager forsinket eller skolen ikke har noen skoleadministrator.
-- p_invites: [{ "user_id": uuid } eller { "email": text, "name": text }, sammen med "public_title" og/eller "admin_role"].
create or replace function public.start_handover(p_org uuid,p_handover_on date,p_old_board_ends_on date,p_activation_date date,p_invites jsonb,p_recovery_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare o organizations; v_id uuid; v_recovery boolean:=p_recovery_reason is not null; v_reason text:=case when p_recovery_reason is not null then public.clean_text(p_recovery_reason) end;
  x jsonb; v_user uuid; v_email text; v_title text; v_role admin_role; v_name text; v_count int:=0; v_admins int:=0; v_seen text[]:='{}'; v_key text; v_org_name text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into o from organizations where id=p_org for update;
  if not found or o.type<>'school' or o.status<>'active' then raise exception 'school not found'; end if;
  v_org_name := coalesce(o.school_name,o.name);
  if v_recovery then
    if char_length(coalesce(v_reason,'')) not between 5 and 1000 then raise exception 'invalid reason'; end if;
    if not (public.is_area_board_admin(p_org) or public.has_role(null,array['super_admin']::admin_role[])) then raise exception 'not authorized'; end if;
    if public.handover_overdue_days(p_org)<7 and exists(select 1 from role_grants r join profiles p on p.id=r.user_id and p.status='active'
        where r.organization_id=p_org and r.role='school_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date)) then
      raise exception 'recovery not allowed';
    end if;
  elsif not public.has_role(p_org,array['school_admin']::admin_role[]) then raise exception 'not authorized';
  end if;
  if exists(select 1 from handover_processes where organization_id=p_org and status in ('awaiting_acceptance','scheduled')) then raise exception 'handover already open'; end if;
  if p_handover_on is null or p_handover_on<current_date-60 or p_handover_on>current_date+730
    or p_activation_date is null or p_activation_date<current_date or p_activation_date>current_date+365
    or p_old_board_ends_on is null or p_old_board_ends_on<current_date-60 or p_old_board_ends_on>p_activation_date then raise exception 'invalid handover dates'; end if;
  if jsonb_typeof(p_invites)<>'array' or jsonb_array_length(p_invites) not between 1 and 40 then raise exception 'invalid invites'; end if;

  insert into handover_processes(organization_id,activation_date,old_board_ends_on,status,started_by,is_recovery,recovery_reason)
    values(p_org,p_activation_date,p_old_board_ends_on,'awaiting_acceptance',auth.uid(),v_recovery,v_reason) returning id into v_id;

  for x in select * from jsonb_array_elements(p_invites) loop
    v_user := nullif(x->>'user_id','')::uuid;
    v_email := lower(trim(coalesce(x->>'email','')));
    v_title := nullif(trim(public.clean_text(coalesce(x->>'public_title',''))),'');
    v_role := nullif(x->>'admin_role','')::admin_role;
    v_name := nullif(trim(public.clean_text(coalesce(x->>'name',''))),'');
    if v_title is not null and char_length(v_title) not between 2 and 80 then raise exception 'invalid title'; end if;
    if v_title is null and v_role is null then raise exception 'invalid invites'; end if;
    if v_role is not null and v_role not in ('school_admin','content_manager') then raise exception 'invalid role'; end if;
    if v_user is not null then
      if not exists(select 1 from profiles where id=v_user and status='active' and current_school_id=p_org) then raise exception 'person not at school'; end if;
      -- Ingen gir seg selv en rettighet de ikke allerede har.
      if v_user=auth.uid() and v_role is not null and not public.has_role(p_org,array[v_role]::admin_role[]) then raise exception 'self escalation is not allowed'; end if;
      v_email := null; v_key := v_user::text;
    else
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email)>254 then raise exception 'invalid email'; end if;
      -- Finnes personen allerede ved skolen, knyttes invitasjonen til profilen.
      select id into v_user from profiles where lower(email)=v_email and status='active' and current_school_id=p_org;
      if v_user=auth.uid() and v_role is not null and not public.has_role(p_org,array[v_role]::admin_role[]) then raise exception 'self escalation is not allowed'; end if;
      v_key := coalesce(v_user::text,v_email);
      if v_user is not null then v_email := null; end if;
    end if;
    if v_key=any(v_seen) then raise exception 'duplicate invite'; end if;
    v_seen := v_seen||v_key;
    insert into handover_invites(handover_id,user_id,email,invited_name,public_title,admin_role,status,expires_at)
      values(v_id,v_user,v_email,case when v_user is null then v_name end,v_title,v_role,'pending',(p_activation_date+30)::timestamptz);
    v_count := v_count+1;
    if v_role='school_admin' then v_admins := v_admins+1; end if;
    perform public.notify_user(v_user,'handover.invited','Du er invitert inn i det nye styret',
      v_org_name||' vil gi deg '||concat_ws(' og ',lower(v_title),case v_role when 'school_admin' then 'rollen skoleadministrator' when 'content_manager' then 'rollen innholdsansvarlig' end)
      ||' fra '||to_char(p_activation_date,'DD.MM.YYYY')||'. Godta eller avslå invitasjonen.','#/varsler');
  end loop;
  if v_admins=0 then raise exception 'school admin required'; end if;

  insert into election_schedules(organization_id,expected_handover_on,updated_by,updated_at) values(p_org,p_handover_on,auth.uid(),now())
  on conflict (organization_id) do update set expected_handover_on=excluded.expected_handover_on,updated_by=excluded.updated_by,updated_at=now();
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,case when v_recovery then 'handover.recovery_started' else 'handover.started' end,'handover',v_id::text,
      jsonb_build_object('invites',v_count,'activation_date',p_activation_date,'reason',v_reason));
  if v_recovery then
    perform public.notify_user(a,'handover.recovery','Styret har startet gjenoppretting','Styreadministrator har startet en gjenoppretting av styreoverføringen for '||v_org_name||'.','#/admin')
    from public.organization_admins(p_org) a where a<>auth.uid();
  end if;
  return v_id;
end $$;

-- Invitasjoner til den innloggede: knyttet til profilen, eller sendt til e-postadressen før profilen fantes.
create or replace function public.list_my_handover_invites()
returns table (id uuid,handover_id uuid,organization_id uuid,organization_name text,public_title text,admin_role admin_role,activation_date date,invited_by_name text,created_at timestamptz,at_school boolean)
language sql stable security definer set search_path=public as $$
  select i.id,h.id,o.id,coalesce(o.school_name,o.name),i.public_title,i.admin_role,h.activation_date,(select display_name from profiles where id=h.started_by),i.created_at,
    me.current_school_id=o.id
  from profiles me join handover_invites i on (i.user_id=me.id or (i.user_id is null and lower(i.email)=lower(me.email)))
  join handover_processes h on h.id=i.handover_id join organizations o on o.id=h.organization_id
  where me.id=auth.uid() and me.status='active' and i.status='pending' and h.status in ('awaiting_acceptance','scheduled','completed')
  order by i.created_at desc;
$$;

-- Den inviterte godtar eller avslår selv. Rollen gjelder først fra aktiveringsdatoen, og bare ved egen skole.
create or replace function public.respond_handover_invite(p_invite uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$
declare i handover_invites; h handover_processes; me profiles; v_org text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into me from profiles where id=auth.uid();
  select * into i from handover_invites where id=p_invite for update;
  if not found or not (i.user_id=me.id or (i.user_id is null and lower(i.email)=lower(me.email))) then raise exception 'invite not found'; end if;
  select * into h from handover_processes where id=i.handover_id for update;
  if i.status<>'pending' or h.status not in ('awaiting_acceptance','scheduled','completed') then raise exception 'invite not pending'; end if;
  if p_accept and me.current_school_id is distinct from h.organization_id then raise exception 'person not at school'; end if;
  update handover_invites set user_id=me.id,status=case when p_accept then 'accepted' else 'declined' end,accepted_at=case when p_accept then now() end,responded_at=now() where id=i.id;
  v_org := (select coalesce(school_name,name) from organizations where id=h.organization_id);
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(me.id,h.organization_id,case when p_accept then 'handover.accepted' else 'handover.declined' end,'handover_invite',i.id::text,
      jsonb_build_object('user_id',me.id,'title',i.public_title,'role',i.admin_role));
  perform public.notify_user(a,case when p_accept then 'handover.accepted' else 'handover.declined' end,
    me.display_name||case when p_accept then ' har godtatt invitasjonen' else ' har takket nei' end,
    'Styreoverføringen i '||v_org||'.','#/admin')
  from (select h.started_by as a union select public.organization_admins(h.organization_id)) admins where a<>me.id;
  if not p_accept then return; end if;
  if h.status='completed' then
    perform public.apply_handover_invite(i.id);
    return;
  end if;
  if i.admin_role='school_admin' and h.status='awaiting_acceptance' then
    update handover_processes set status='scheduled',updated_at=now() where id=h.id;
    h.status := 'scheduled';
  end if;
  if h.status='scheduled' and h.activation_date<=current_date then perform public.activate_handover(h.id); end if;
end $$;

-- Ny dato hvis valget eller aktiveringen utsettes.
create or replace function public.reschedule_handover(p_handover uuid,p_activation_date date,p_old_board_ends_on date) returns void language plpgsql security definer set search_path=public as $$
declare h handover_processes;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into h from handover_processes where id=p_handover for update;
  if not found then raise exception 'handover not found'; end if;
  if not public.has_area_role(h.organization_id) then raise exception 'not authorized'; end if;
  if h.status not in ('awaiting_acceptance','scheduled') then raise exception 'handover not open'; end if;
  if p_activation_date is null or p_activation_date<current_date or p_activation_date>current_date+365
    or p_old_board_ends_on is null or p_old_board_ends_on<current_date-60 or p_old_board_ends_on>p_activation_date then raise exception 'invalid handover dates'; end if;
  update handover_processes set activation_date=p_activation_date,old_board_ends_on=p_old_board_ends_on,updated_at=now() where id=h.id;
  update handover_invites set expires_at=(p_activation_date+30)::timestamptz where handover_id=h.id and status='pending';
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),h.organization_id,'handover.rescheduled','handover',h.id::text,jsonb_build_object('activation_date',p_activation_date,'old_board_ends_on',p_old_board_ends_on));
  if h.status='scheduled' and p_activation_date<=current_date then perform public.activate_handover(h.id); end if;
end $$;

create or replace function public.cancel_handover(p_handover uuid) returns void language plpgsql security definer set search_path=public as $$
declare h handover_processes;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into h from handover_processes where id=p_handover for update;
  if not found then raise exception 'handover not found'; end if;
  if not public.has_area_role(h.organization_id) then raise exception 'not authorized'; end if;
  if h.status not in ('awaiting_acceptance','scheduled') then raise exception 'handover not open'; end if;
  update handover_processes set status='cancelled',updated_at=now() where id=h.id;
  perform public.notify_user(i.user_id,'handover.cancelled','Styreoverføringen er avlyst',
    'Invitasjonen fra '||(select coalesce(school_name,name) from organizations where id=h.organization_id)||' gjelder ikke lenger.','#/varsler')
  from handover_invites i where i.handover_id=h.id and i.status in ('pending','accepted') and i.user_id is not null;
  update handover_invites set status='expired' where handover_id=h.id and status='pending';
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),h.organization_id,'handover.cancelled','handover',h.id::text);
end $$;

-- Erstatter versjonen fra prompt 1: aktiverer en planlagt overføring nå, i stedet for å vente til aktiveringsdatoen.
create or replace function public.complete_handover(p_handover uuid) returns void language plpgsql security definer set search_path=public as $$
declare h handover_processes;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select * into h from handover_processes where id=p_handover for update;
  if not found then raise exception 'handover not found'; end if;
  if not public.has_area_role(h.organization_id) then raise exception 'not authorized'; end if;
  if h.status<>'scheduled' then raise exception 'accepted successor required'; end if;
  if h.activation_date>current_date then
    update handover_processes set activation_date=current_date,old_board_ends_on=least(old_board_ends_on,current_date),updated_at=now() where id=h.id;
  end if;
  perform public.activate_handover(h.id);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Nattlige jobber: aktivering, rolleutløp og påminnelser
-- ---------------------------------------------------------------------------
-- Påminnelser til skoleadministratorene 14, 7 og 1 dag før styreskiftet, deretter ukentlig til overføringen er fullført.
-- Etter 7 dager varsles styreadministratorene i området, etter 21 dager superadministratorene (siste eskaleringsnivå).
-- Skoler med en planlagt overføring (ny administrator har akseptert) får ingen påminnelser.
create or replace function public.run_handover_reminders(p_today date default current_date) returns int language plpgsql security definer set search_path=public as $$
declare s record; v_days int; v_kind text; v_sent int:=0; v_text text; v_count int;
begin
  for s in select o.id,coalesce(o.school_name,o.name) as name,es.expected_handover_on as expected from organizations o join election_schedules es on es.organization_id=o.id
      where o.type='school' and o.status='active'
        and not exists(select 1 from handover_processes h where h.organization_id=o.id and (h.status='scheduled' or (h.status='completed' and h.activation_date>=es.expected_handover_on-60))) loop
    v_days := s.expected-p_today;
    v_kind := case when v_days in (14,7,1) then 'before-'||v_days when v_days<0 and (-v_days)%7=0 then 'after-'||(-v_days) end;
    if v_kind is not null then
      insert into handover_reminders(organization_id,expected_on,kind) values(s.id,s.expected,v_kind) on conflict do nothing;
      get diagnostics v_count=row_count;
      if v_count>0 then
        v_text := case when v_days>1 then 'Styreskiftet i '||s.name||' er om '||v_days||' dager. Start styreoverføringen i administrasjonen.'
          when v_days=1 then 'Styreskiftet i '||s.name||' er i morgen. Start styreoverføringen i administrasjonen.'
          else 'Styreoverføringen i '||s.name||' er '||(-v_days)||' dager forsinket. Fullfør den, eller endre datoen hvis valget er utsatt.' end;
        perform public.notify_user(a,'handover.reminder','Påminnelse om styreoverføring',v_text,'#/admin','handover-reminder:'||s.id)
        from (select r.user_id as a from role_grants r join profiles p on p.id=r.user_id and p.status='active' where r.organization_id=s.id and r.role='school_admin'
          and r.status='active' and r.start_date<=p_today and (r.end_date is null or r.end_date>=p_today)) admins;
        v_sent := v_sent+1;
      end if;
    end if;
    if v_days<=-7 then
      insert into handover_reminders(organization_id,expected_on,kind) values(s.id,s.expected,'escalated-board') on conflict do nothing;
      get diagnostics v_count=row_count;
      if v_count>0 then
        perform public.notify_user(a,'handover.escalated','Styreoverføring ikke fullført',
          s.name||' har ikke fullført styreoverføringen 7 dager etter datoen. Du kan starte en gjenoppretting i administrasjonen.','#/admin')
        from public.area_board_admins(s.id) a;
        v_sent := v_sent+1;
      end if;
    end if;
    if v_days<=-21 then
      insert into handover_reminders(organization_id,expected_on,kind) values(s.id,s.expected,'escalated-super') on conflict do nothing;
      get diagnostics v_count=row_count;
      if v_count>0 then
        perform public.notify_user(a,'handover.escalated','Styreoverføring ikke fullført',
          s.name||' har ikke fullført styreoverføringen 21 dager etter datoen, og styret har ikke gjenopprettet den.','#/admin')
        from public.super_admins() a;
        v_sent := v_sent+1;
      end if;
    end if;
  end loop;
  return v_sent;
end $$;

-- Rolleutløp: verv og rettigheter med passert sluttdato får status «ended». has_role og has_active_membership
-- regner dem allerede som avsluttet; dette holder statusen i samsvar og varsler når en skole mister siste administrator.
create or replace function public.expire_roles(p_today date default current_date) returns int language plpgsql security definer set search_path=public as $$
declare v_offices int; v_roles int; v_orgs uuid[]; v_org uuid;
begin
  with ended as (update memberships set status='ended' where status='active' and end_date is not null and end_date<p_today returning id,user_id,organization_id,public_title)
  , logged as (insert into audit_logs(organization_id,action,target_type,target_id,details)
      select organization_id,'office.expired','membership',id::text,jsonb_build_object('user_id',user_id,'title',public_title) from ended returning 1)
  select count(*) into v_offices from logged;
  update profiles p set active_membership_id=null from memberships m where m.id=p.active_membership_id and m.status<>'active';
  with ended as (update role_grants set status='ended' where status='active' and end_date is not null and end_date<p_today returning id,user_id,organization_id,role)
  , logged as (insert into audit_logs(organization_id,action,target_type,target_id,details)
      select organization_id,'role.expired','role_grant',id::text,jsonb_build_object('user_id',user_id,'role',role) from ended returning organization_id,details)
  select count(*),coalesce(array_agg(distinct organization_id) filter (where details->>'role'='school_admin'),'{}') into v_roles,v_orgs from logged;
  -- Skoler som mistet siste skoleadministrator: styreadministratorene i området varsles.
  foreach v_org in array v_orgs loop
    if exists(select 1 from organizations where id=v_org and type='school' and status='active')
      and not exists(select 1 from role_grants r join profiles p on p.id=r.user_id and p.status='active' where r.organization_id=v_org and r.role='school_admin'
        and r.status='active' and r.start_date<=p_today and (r.end_date is null or r.end_date>=p_today)) then
      perform public.notify_user(a,'handover.no_admin','Skolen mangler skoleadministrator',
        (select coalesce(school_name,name) from organizations where id=v_org)||' har ingen aktiv skoleadministrator lenger. Du kan gi rollen til en elev ved skolen.','#/admin')
      from public.area_board_admins(v_org) a;
    end if;
  end loop;
  -- Invitasjoner som ikke er besvart innen fristen.
  update handover_invites set status='expired' where status='pending' and expires_at is not null and expires_at<p_today::timestamptz;
  return v_offices+v_roles;
end $$;

create or replace function public.run_daily_jobs(p_today date default current_date) returns jsonb language plpgsql security definer set search_path=public as $$
declare h record; v_activated int:=0; v_expired int; v_reminders int;
begin
  for h in select id from handover_processes where status='scheduled' and activation_date<=p_today order by activation_date loop
    begin perform public.activate_handover(h.id); v_activated := v_activated+1;
    exception when others then raise warning 'Kunne ikke aktivere overføring %: %',h.id,sqlerrm; end;
  end loop;
  v_expired := public.expire_roles(p_today);
  v_reminders := public.run_handover_reminders(p_today);
  return jsonb_build_object('activated',v_activated,'expired',v_expired,'reminders',v_reminders);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Daglig sammendrag på e-post (Edge-funksjonen send-digest, med service role)
-- ---------------------------------------------------------------------------
-- Brukere med uleste varsler som skal på e-post og ikke er sendt. Ett sammendrag per bruker.
create or replace function public.pending_email_digests(p_limit int default 300)
returns table (user_id uuid,email text,display_name text,items jsonb,until timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.email,p.display_name,
    jsonb_agg(jsonb_build_object('title',n.title,'body',n.body,'link',n.link,'count',n.item_count,'created_at',n.created_at) order by n.created_at desc),
    max(n.created_at)
  from notifications n join profiles p on p.id=n.user_id and p.status='active' and p.email<>''
  where n.send_email and n.email_sent_at is null and n.read_at is null
  group by p.id,p.email,p.display_name order by min(n.created_at) limit least(greatest(coalesce(p_limit,300),1),500);
$$;
create or replace function public.mark_email_digest_sent(p_user uuid,p_until timestamptz) returns void language sql security definer set search_path=public as $$
  update notifications set email_sent_at=now() where user_id=p_user and send_email and email_sent_at is null and created_at<=p_until;
$$;
-- Invitasjoner til e-postadresser uten profil. Sendes én gang.
create or replace function public.pending_handover_invite_emails(p_limit int default 100)
returns table (id uuid,email text,invited_name text,organization_name text,public_title text,admin_role admin_role,activation_date date)
language sql stable security definer set search_path=public as $$
  select i.id,i.email,i.invited_name,coalesce(o.school_name,o.name),i.public_title,i.admin_role,h.activation_date
  from handover_invites i join handover_processes h on h.id=i.handover_id and h.status in ('awaiting_acceptance','scheduled','completed')
  join organizations o on o.id=h.organization_id
  where i.status='pending' and i.user_id is null and i.email is not null and i.emailed_at is null
  order by i.created_at limit least(greatest(coalesce(p_limit,100),1),500);
$$;
create or replace function public.mark_handover_invite_emailed(p_invite uuid) returns void language sql security definer set search_path=public as $$
  update handover_invites set emailed_at=now() where id=p_invite;
$$;

-- ---------------------------------------------------------------------------
-- 7. Funksjonstilgang og planlagte jobber
-- ---------------------------------------------------------------------------
revoke all on function public.notification_category(text),public.prepare_notification(),public.notify_user(uuid,text,text,text,text,text),
  public.area_board_admins(uuid),public.organization_admins(uuid),public.super_admins(),
  public.notify_new_message(),public.notify_new_membership(),public.notify_new_role(),public.notify_school_admin_request(),public.notify_friend_connection(),
  public.list_notifications(int),public.mark_notifications_read(uuid[]),public.get_notification_preferences(),public.set_notification_preferences(boolean,boolean,text[],text[]),
  public.current_board_term(uuid),public.set_election_date(uuid,date),public.handover_overdue_days(uuid,date),public.get_handover_overview(uuid),
  public.apply_handover_invite(uuid),public.activate_handover(uuid),public.start_handover(uuid,date,date,date,jsonb,text),public.list_my_handover_invites(),
  public.respond_handover_invite(uuid,boolean),public.reschedule_handover(uuid,date,date),public.cancel_handover(uuid),public.complete_handover(uuid),
  public.run_handover_reminders(date),public.expire_roles(date),public.run_daily_jobs(date),
  public.pending_email_digests(int),public.mark_email_digest_sent(uuid,timestamptz),public.pending_handover_invite_emails(int),public.mark_handover_invite_emailed(uuid)
  from public,anon,authenticated;
grant execute on function public.list_notifications(int),public.mark_notifications_read(uuid[]),public.get_notification_preferences(),public.set_notification_preferences(boolean,boolean,text[],text[]),
  public.set_election_date(uuid,date),public.get_handover_overview(uuid),public.start_handover(uuid,date,date,date,jsonb,text),public.list_my_handover_invites(),
  public.respond_handover_invite(uuid,boolean),public.reschedule_handover(uuid,date,date),public.cancel_handover(uuid),public.complete_handover(uuid)
  to authenticated;
grant execute on function public.pending_email_digests(int),public.mark_email_digest_sent(uuid,timestamptz),public.pending_handover_invite_emails(int),public.mark_handover_invite_emailed(uuid),
  public.run_daily_jobs(date) to service_role;

-- pg_cron kjører de nattlige jobbene kl. 03.00 UTC. E-postsammendraget planlegges i supabase/manual/varsler_epost.sql,
-- fordi det trenger adressen til Edge-funksjonen og en hemmelighet som ikke skal ligge i repoet.
do $$ begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then raise notice 'pg_cron er ikke tilgjengelig: %',sqlerrm;
  end;
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $job$select cron.schedule('elevradsnett-daglige-jobber','0 3 * * *','select public.run_daily_jobs()')$job$;
  end if;
end $$;

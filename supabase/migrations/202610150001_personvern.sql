-- Prompt 14: juridiske sider og personvern (docs/PROMPTPLAN.md, KRAVSPEC §10, §16).
-- Versjonerte vilkår og personvernerklæring som brukeren godtar, samtykke til valgfrie tjenester, deaktivering og
-- reaktivering av egen profil, eksport av egne data og forespørsel om sletting, som superadministrator behandler.
-- Selve teksten i vilkårene og personvernerklæringen står i components/views/legal-view.tsx. Versjonen her må være
-- den samme som i lib/domain/legal.ts (sjekkes av tests/personvern.test.ts), og git-historikken viser teksten.

-- ---------------------------------------------------------------------------
-- 1. Versjoner av vilkår, personvernerklæring og informasjon om informasjonskapsler
-- ---------------------------------------------------------------------------
insert into public.legal_document_versions(kind,version,body,published_at) values
  ('privacy','2026-10-05','Personvernerklæring for piloten. Teksten er i components/views/legal-view.tsx i samme versjon.','2026-10-05T00:00:00Z'),
  ('terms','2026-10-05','Vilkår for bruk i piloten. Teksten er i components/views/legal-view.tsx i samme versjon.','2026-10-05T00:00:00Z'),
  ('cookies','2026-10-05','Informasjonskapsler og lokal lagring. Teksten er i components/views/legal-view.tsx i samme versjon.','2026-10-05T00:00:00Z')
on conflict (kind,version) do nothing;

-- Gjeldende versjon av hvert dokument. Nyeste publiserte vinner.
create or replace function public.current_legal_version(p_kind text) returns text language sql stable security definer set search_path=public as $$
  select version from legal_document_versions where kind=p_kind and published_at<=now() order by published_at desc,version desc limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. Godkjenning av vilkår. Er ikke samtykke som behandlingsgrunnlag, bare dokumentasjon av at brukeren har
--    fått og godtatt vilkårene og informasjonen i personvernerklæringen (§16).
-- ---------------------------------------------------------------------------
create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);
create index legal_acceptances_user on public.legal_acceptances(user_id,accepted_at desc);
alter table public.legal_acceptances enable row level security;
alter table public.legal_acceptances force row level security;
-- Brukeren ser egne godkjenninger. De skrives bare av accept_terms.
create policy legal_acceptances_own_read on public.legal_acceptances for select to authenticated using (user_id=auth.uid());

create or replace function public.accept_terms(p_terms_version text,p_privacy_version text) returns void
language plpgsql security definer set search_path=public as $$ begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and status in ('active','deactivated')) then raise exception 'not authorized'; end if;
  if p_terms_version is distinct from public.current_legal_version('terms') or p_privacy_version is distinct from public.current_legal_version('privacy') then
    raise exception 'outdated legal version';
  end if;
  insert into legal_acceptances(user_id,terms_version,privacy_version) values(auth.uid(),p_terms_version,p_privacy_version);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Samtykke til valgfrie tjenester (analyse o.l.). Ingen er slått på i piloten, så banneret vises ikke.
--    Hvert valg lagres som en ny rad med versjonen av informasjonen; tidligere valg merkes som trukket tilbake.
--    Uten innlogging lagres valget med en tilfeldig id fra nettleseren.
-- ---------------------------------------------------------------------------
drop policy consent_own_all on public.consent_records;
create policy consent_own_read on public.consent_records for select to authenticated using (user_id=auth.uid());
create index consent_records_subject on public.consent_records(coalesce(user_id::text,anonymous_id),granted_at desc);

create or replace function public.record_consent(p_anonymous_id text,p_version text,p_purposes jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); k text; v jsonb;
begin
  if v_user is not null and not exists(select 1 from profiles where id=v_user) then v_user:=null; end if;
  if v_user is null and (p_anonymous_id is null or p_anonymous_id!~'^[A-Za-z0-9-]{16,64}$') then raise exception 'invalid consent'; end if;
  if p_version is distinct from public.current_legal_version('cookies') then raise exception 'outdated legal version'; end if;
  if jsonb_typeof(p_purposes)<>'object' or (select count(*) from jsonb_object_keys(p_purposes))>10 then raise exception 'invalid consent'; end if;
  for k,v in select * from jsonb_each(p_purposes) loop
    if k!~'^[a-z_]{2,40}$' or jsonb_typeof(v)<>'boolean' then raise exception 'invalid consent'; end if;
  end loop;
  -- Uten innlogging kan hvem som helst kalle funksjonen, så antall valg per nettleser begrenses.
  if v_user is null and (select count(*) from consent_records where anonymous_id=p_anonymous_id and granted_at>now()-interval '1 hour')>=10 then
    raise exception 'too many requests';
  end if;
  update consent_records set withdrawn_at=now() where withdrawn_at is null
    and ((v_user is not null and user_id=v_user) or (v_user is null and anonymous_id=p_anonymous_id));
  insert into consent_records(user_id,anonymous_id,legal_version,purposes)
    values(v_user,case when v_user is null then p_anonymous_id end,p_version,p_purposes);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Hjelper: om brukeren har en administratorrolle ingen andre aktive har (samme regel som admin_manage_user)
-- ---------------------------------------------------------------------------
create or replace function public.holds_last_admin_role(p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from role_grants current_grant
    where current_grant.user_id=p_user and current_grant.role<>'content_manager' and current_grant.status='active'
      and current_grant.start_date<=current_date and (current_grant.end_date is null or current_grant.end_date>=current_date)
      and not exists(
        select 1 from role_grants replacement join profiles replacement_profile on replacement_profile.id=replacement.user_id and replacement_profile.status='active'
        where replacement.id<>current_grant.id and replacement.user_id<>p_user and replacement.role=current_grant.role and replacement.status='active'
          and (current_grant.role='super_admin' or replacement.organization_id=current_grant.organization_id)
          and replacement.start_date<=current_date and (replacement.end_date is null or replacement.end_date>=current_date)
      )
  )
$$;

-- Avslutter verv og rettigheter. Verv som ikke har startet ennå får sluttdato lik startdatoen.
create or replace function public.end_all_roles(p_user uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  update profiles set active_membership_id=null where id=p_user;
  update role_grants set status='ended',end_date=greatest(start_date,current_date),revoked_by=p_actor,revoked_at=now()
    where user_id=p_user and status in ('active','invited');
  update memberships set status='ended',end_date=greatest(start_date,current_date),revoked_by=p_actor,revoked_at=now()
    where user_id=p_user and status in ('active','invited');
  update school_admin_requests set status='cancelled' where user_id=p_user and status='pending';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Deaktivere og reaktivere egen profil (§10)
-- ---------------------------------------------------------------------------
-- Verv og rettigheter avsluttes og blir stående i historikken. Brukeren går ut av vanlige grupper, og de
-- systemstyrte gruppene følger vervene. Innlegg og kommentarer blir stående hos organisasjonen.
create or replace function public.deactivate_my_account() returns void language plpgsql security definer set search_path=public as $$ begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and status='active') then raise exception 'not authorized'; end if;
  if public.holds_last_admin_role(auth.uid()) then raise exception 'you are last administrator'; end if;
  -- Profilen deaktiveres først, så synkroniseringen av de systemstyrte gruppene tar brukeren ut.
  update profiles set status='deactivated',deactivated_by_user=true,active_membership_id=null where id=auth.uid();
  perform public.end_all_roles(auth.uid(),auth.uid());
  update conversation_members cm set left_at=now(),is_admin=false where cm.user_id=auth.uid() and cm.left_at is null
    and exists(select 1 from conversations c where c.id=cm.conversation_id and c.kind='group');
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'profile.deactivated_by_user','profile',auth.uid()::text,'{}'::jsonb);
end $$;

-- Bare en profil brukeren deaktiverte selv kan aktiveres av brukeren. Verv må gis på nytt.
create or replace function public.reactivate_my_account() returns void language plpgsql security definer set search_path=public as $$ begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and status='deactivated') then raise exception 'not authorized'; end if;
  if not (select deactivated_by_user from profiles where id=auth.uid()) then raise exception 'deactivated by administrator'; end if;
  update profiles set status='active',deactivated_by_user=false where id=auth.uid();
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'profile.reactivated_by_user','profile',auth.uid()::text,'{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Personvernstatus for profilsiden
-- ---------------------------------------------------------------------------
create or replace function public.get_my_privacy() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me profiles; accepted legal_acceptances; consent consent_records;
begin
  select * into me from profiles where id=auth.uid() and status in ('active','deactivated');
  if me.id is null then raise exception 'not authorized'; end if;
  select * into accepted from legal_acceptances where user_id=me.id order by accepted_at desc limit 1;
  select * into consent from consent_records where user_id=me.id and withdrawn_at is null order by granted_at desc limit 1;
  return jsonb_build_object(
    'status',me.status,
    'deactivatedByUser',me.deactivated_by_user,
    'termsVersion',public.current_legal_version('terms'),
    'privacyVersion',public.current_legal_version('privacy'),
    'cookiesVersion',public.current_legal_version('cookies'),
    'acceptedTermsVersion',accepted.terms_version,
    'acceptedPrivacyVersion',accepted.privacy_version,
    'acceptedAt',accepted.accepted_at,
    'consent',case when consent.id is null then null else jsonb_build_object('version',consent.legal_version,'purposes',consent.purposes,'grantedAt',consent.granted_at) end,
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'createdAt',r.created_at,'completedAt',r.completed_at,'notes',r.notes) order by r.created_at desc)
      from data_subject_requests r where r.user_id=me.id and r.kind='deletion'),'[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. Eksport av egne data (§10, §16). Alt som er knyttet til brukeren, som JSON. Filene (profilbilde og vedlegg)
--    er med som navn og sti; selve filene kan brukeren be om på teknisk@elev.no.
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); result jsonb;
begin
  if me is null or not exists(select 1 from profiles where id=me and status in ('active','deactivated')) then raise exception 'not authorized'; end if;
  result:=jsonb_build_object(
    'exportedAt',now(),
    'profile',(select jsonb_build_object('id',p.id,'name',p.display_name,'email',p.email,'avatarPath',p.avatar_path,'status',p.status,
      'deactivatedByUser',p.deactivated_by_user,'currentSchool',(select coalesce(o.school_name,o.name) from organizations o where o.id=p.current_school_id),'createdAt',p.created_at)
      from profiles p where p.id=me),
    'schoolHistory',coalesce((select jsonb_agg(jsonb_build_object('school',coalesce(o.school_name,o.name),'startedAt',h.started_at,'endedAt',h.ended_at) order by h.started_at)
      from profile_school_history h join organizations o on o.id=h.school_id where h.user_id=me),'[]'::jsonb),
    'publicOffices',coalesce((select jsonb_agg(jsonb_build_object('organization',o.name,'title',m.public_title,'startDate',m.start_date,'endDate',m.end_date,'status',m.status) order by m.start_date)
      from memberships m join organizations o on o.id=m.organization_id where m.user_id=me),'[]'::jsonb),
    'internalRoles',coalesce((select jsonb_agg(jsonb_build_object('organization',o.name,'role',g.role,'startDate',g.start_date,'endDate',g.end_date,'status',g.status) order by g.start_date)
      from role_grants g join organizations o on o.id=g.organization_id where g.user_id=me),'[]'::jsonb),
    'schoolAdminRequests',coalesce((select jsonb_agg(jsonb_build_object('school',coalesce(o.school_name,o.name),'message',r.message,'status',r.status,'createdAt',r.created_at,'decisionReason',r.decision_reason))
      from school_admin_requests r join organizations o on o.id=r.school_id where r.user_id=me),'[]'::jsonb),
    'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'organization',o.name,'body',p.body,'status',p.status,'audience',p.audience,'publishedAt',p.published_at,'deletedAt',p.deleted_at) order by p.created_at)
      from posts p join organizations o on o.id=p.organization_id where p.actor_user_id=me),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(jsonb_build_object('postId',c.post_id,'organization',o.name,'body',c.body,'createdAt',c.created_at,'deletedAt',c.deleted_at) order by c.created_at)
      from comments c join organizations o on o.id=c.organization_id where c.actor_user_id=me),'[]'::jsonb),
    'reactions',coalesce((select jsonb_agg(jsonb_build_object('postId',r.post_id,'reaction',r.reaction,'createdAt',r.created_at)) from reactions r where r.user_id=me),'[]'::jsonb),
    'pollVotes',coalesce((select jsonb_agg(jsonb_build_object('pollId',v.poll_id,'organization',o.name,'updatedAt',v.updated_at))
      from poll_votes v join organizations o on o.id=v.organization_id where v.actor_user_id=me),'[]'::jsonb),
    'follows',coalesce((select jsonb_agg(jsonb_build_object('organization',o.name,'createdAt',f.created_at)) from follows f join organizations o on o.id=f.organization_id where f.user_id=me),'[]'::jsonb),
    'eventInterests',coalesce((select jsonb_agg(jsonb_build_object('event',e.title,'createdAt',i.created_at)) from event_interests i join events e on e.id=i.event_id where i.user_id=me),'[]'::jsonb),
    'eventDelegations',coalesce((select jsonb_agg(jsonb_build_object('event',e.title,'organization',o.name,'status',d.status,'officeTitle',d.office_title,'attendanceConfirmedAt',d.attendance_confirmed_at))
      from event_delegates d join event_organization_registrations r on r.id=d.registration_id join events e on e.id=r.event_id join organizations o on o.id=r.organization_id where d.user_id=me),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object('conversationId',cm.conversation_id,'joinedAt',cm.joined_at,'leftAt',cm.left_at,'mutedUntil',cm.muted_until))
      from conversation_members cm where cm.user_id=me),'[]'::jsonb),
    'messagesSent',coalesce((select jsonb_agg(jsonb_build_object('conversationId',m.conversation_id,'body',m.body,'createdAt',m.created_at,'deletedAt',m.deleted_at,
      'attachments',(select coalesce(jsonb_agg(jsonb_build_object('fileName',a.file_name,'type',a.mime_type,'size',a.byte_size)),'[]'::jsonb) from message_attachments a where a.message_id=m.id)) order by m.created_at)
      from messages m where m.sender_user_id=me),'[]'::jsonb),
    'messageSettings',(select jsonb_build_object('readReceipts',s.read_receipts) from message_settings s where s.user_id=me),
    'blockedUsers',(select count(*) from user_blocks b where b.blocker_id=me),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('title',n.title,'body',n.body,'createdAt',n.created_at,'readAt',n.read_at) order by n.created_at desc)
      from notifications n where n.user_id=me),'[]'::jsonb),
    'notificationPreferences',(select to_jsonb(np)-'user_id' from notification_preferences np where np.user_id=me),
    'reportsFiled',coalesce((select jsonb_agg(jsonb_build_object('targetType',r.target_type,'category',r.category,'description',r.description,'status',r.status,'createdAt',r.created_at))
      from moderation_reports r where r.reporter_id=me),'[]'::jsonb),
    'termsAccepted',coalesce((select jsonb_agg(jsonb_build_object('termsVersion',a.terms_version,'privacyVersion',a.privacy_version,'acceptedAt',a.accepted_at) order by a.accepted_at)
      from legal_acceptances a where a.user_id=me),'[]'::jsonb),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('version',c.legal_version,'purposes',c.purposes,'grantedAt',c.granted_at,'withdrawnAt',c.withdrawn_at) order by c.granted_at)
      from consent_records c where c.user_id=me),'[]'::jsonb),
    'privacyRequests',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'status',r.status,'createdAt',r.created_at,'completedAt',r.completed_at) order by r.created_at)
      from data_subject_requests r where r.user_id=me),'[]'::jsonb),
    'auditLog',coalesce((select jsonb_agg(jsonb_build_object('action',l.action,'createdAt',l.created_at) order by l.created_at desc)
      from (select * from audit_logs l where l.actor_user_id=me or l.target_id=me::text order by l.created_at desc limit 1000) l),'[]'::jsonb)
  );
  -- Eksporten dokumenteres som en fullført forespørsel.
  insert into data_subject_requests(user_id,kind,status,completed_at,handled_by) values(me,'export','completed',now(),me);
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(me,'privacy.exported','profile',me::text,'{}'::jsonb);
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Sletting av personopplysninger. Brukeren ber om det, superadministrator gjennomfører.
--    Innlegg og kommentarer er organisasjonens innhold og blir stående, med «Slettet bruker» som avsender.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_personal_data_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  update data_subject_requests set status='cancelled' where id=p_request and user_id=auth.uid() and status='pending';
  if not found then raise exception 'request not pending'; end if;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'privacy.cancelled','data_subject_request',p_request::text,'{}'::jsonb);
end $$;

-- Sletter og anonymiserer alt som identifiserer personen. Kalles bare fra serverfunksjoner som har sjekket rettigheten.
create or replace function public.erase_personal_data(p_user uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_avatar text;
begin
  if public.holds_last_admin_role(p_user) then raise exception 'last administrator'; end if;
  select avatar_path into v_avatar from profiles where id=p_user for update;
  if not found then raise exception 'person not found'; end if;
  perform public.end_all_roles(p_user,p_actor);
  -- Filer slettes av process-media (storage_deletions).
  if v_avatar is not null then insert into storage_deletions(bucket,path,reason) values('public-avatars',v_avatar,'privacy erasure'); end if;
  insert into storage_deletions(bucket,path,reason)
    select 'private-message-attachments',a.storage_path,'privacy erasure' from message_attachments a join messages m on m.id=a.message_id where m.sender_user_id=p_user;
  delete from message_attachments a using messages m where m.id=a.message_id and m.sender_user_id=p_user;
  update messages set body=null,deleted_at=coalesce(deleted_at,now()) where sender_user_id=p_user;
  update conversation_members set left_at=coalesce(left_at,now()),is_admin=false where user_id=p_user;
  delete from notifications where user_id=p_user;
  delete from notification_preferences where user_id=p_user;
  delete from message_settings where user_id=p_user;
  delete from message_hidden where user_id=p_user;
  delete from follows where user_id=p_user;
  delete from reactions where user_id=p_user;
  delete from event_interests where user_id=p_user;
  delete from user_blocks where blocker_id=p_user or blocked_id=p_user;
  delete from profile_school_history where user_id=p_user;
  delete from consent_records where user_id=p_user;
  delete from legal_acceptances where user_id=p_user;
  update handover_invites set email=null,invited_name=null where user_id=p_user;
  update profiles set display_name='Slettet bruker',email='slettet-'||p_user::text||'@example.invalid',avatar_path=null,current_school_id=null,
    active_membership_id=null,status='archived',deactivated_by_user=false where id=p_user;
  -- Innloggingen: e-postadressen fjernes, og alle økter avsluttes, så kontoen ikke kan brukes igjen.
  update auth.users set email='slettet-'||p_user::text||'@example.invalid',phone=null,raw_user_meta_data='{}'::jsonb where id=p_user;
  delete from auth.identities where user_id=p_user;
  delete from auth.sessions where user_id=p_user;
  delete from auth.mfa_factors where user_id=p_user;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details) values(p_actor,'privacy.erased','profile',p_user::text,'{}'::jsonb);
end $$;

-- Forespørslene, for superadministrator.
create or replace function public.list_data_subject_requests() returns jsonb language plpgsql stable security definer set search_path=public as $$ begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'createdAt',r.created_at,'completedAt',r.completed_at,'notes',r.notes,
      'userId',r.user_id,'userName',p.display_name,'email',p.email,'schoolName',(select coalesce(o.school_name,o.name) from organizations o where o.id=p.current_school_id),
      'handledByName',(select h.display_name from profiles h where h.id=r.handled_by))
    order by r.status not in ('pending','processing'),r.created_at desc)
    from data_subject_requests r join profiles p on p.id=r.user_id where r.kind='deletion'),'[]'::jsonb);
end $$;

-- Superadministrator behandler en forespørsel om sletting: under behandling, gjennomført (sletter) eller avslått.
create or replace function public.decide_data_subject_request(p_request uuid,p_status text,p_notes text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r data_subject_requests;
begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_status not in ('processing','completed','rejected') or char_length(coalesce(p_notes,''))>2000 then raise exception 'invalid request'; end if;
  if p_status='rejected' and char_length(trim(coalesce(p_notes,'')))<5 then raise exception 'invalid reason'; end if;
  select * into r from data_subject_requests where id=p_request for update;
  if r.id is null or r.kind<>'deletion' or r.status not in ('pending','processing') then raise exception 'request not pending'; end if;
  if r.user_id=auth.uid() then raise exception 'cannot administer yourself'; end if;
  if p_status='completed' then perform public.erase_personal_data(r.user_id,auth.uid()); end if;
  update data_subject_requests set status=p_status,handled_by=auth.uid(),notes=nullif(trim(coalesce(p_notes,'')),''),
    completed_at=case when p_status in ('completed','rejected') then now() end where id=p_request;
  insert into audit_logs(actor_user_id,action,target_type,target_id,details)
    values(auth.uid(),'privacy.'||p_status,'data_subject_request',p_request::text,jsonb_build_object('kind',r.kind));
end $$;

-- «Slett» i adminpanelet bruker nå den samme slettingen, så også e-postadressen i innloggingen fjernes.
create or replace function public.admin_manage_user(p_scope uuid,p_user uuid,p_action text,p_school uuid default null,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare target profiles; old_school uuid;
begin
  select * into target from profiles where id=p_user for update;
  if target is null or target.current_school_id is null or not public.admin_scope_allows(p_scope,target.current_school_id) then raise exception 'not authorized'; end if;
  if p_user=auth.uid() then raise exception 'cannot administer yourself'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'documented reason required'; end if;
  old_school:=target.current_school_id;
  if p_action in ('change_school','deactivate','delete') and public.holds_last_admin_role(p_user) then raise exception 'last administrator'; end if;
  if p_action='change_school' then
    if p_school is null or not public.admin_scope_allows(p_scope,p_school) or not exists(select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'school not found'; end if;
    update profile_school_history set ended_at=coalesce(ended_at,now()) where user_id=p_user and ended_at is null;
    insert into profile_school_history(user_id,school_id,started_at,changed_by) values(p_user,p_school,now(),auth.uid());
    update profiles set current_school_id=p_school,active_membership_id=null where id=p_user;
  elsif p_action='deactivate' then
    update profiles set status='deactivated',deactivated_by_user=false,active_membership_id=null where id=p_user;
  elsif p_action='restore' then
    if target.deactivated_by_user then raise exception 'user consent required'; end if;
    update profiles set status='active' where id=p_user;
  elsif p_action='delete' then
    perform public.erase_personal_data(p_user,auth.uid());
  else raise exception 'invalid action'; end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),old_school,'user.'||p_action,'profile',p_user::text,jsonb_build_object('user_id',p_user,'school_id',p_school,'reason',trim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- 9. Tilganger
-- ---------------------------------------------------------------------------
revoke all on function public.current_legal_version(text),public.accept_terms(text,text),public.record_consent(text,text,jsonb),
  public.holds_last_admin_role(uuid),public.end_all_roles(uuid,uuid),public.deactivate_my_account(),public.reactivate_my_account(),
  public.get_my_privacy(),public.export_my_data(),public.cancel_personal_data_request(uuid),public.erase_personal_data(uuid,uuid),
  public.list_data_subject_requests(),public.decide_data_subject_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.current_legal_version(text),public.record_consent(text,text,jsonb) to anon,authenticated;
grant execute on function public.accept_terms(text,text),public.deactivate_my_account(),public.reactivate_my_account(),public.get_my_privacy(),
  public.export_my_data(),public.cancel_personal_data_request(uuid),public.list_data_subject_requests(),public.decide_data_subject_request(uuid,text,text) to authenticated;

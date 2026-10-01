
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


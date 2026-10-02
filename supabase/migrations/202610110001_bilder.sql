-- Prompt 6: bilder (docs/PROMPTPLAN.md, KRAVSPEC §11 og §14).
-- Bilder kodes om i nettleseren (EXIF og GPS forsvinner). Edge-funksjonen process-media kontrollerer hver fil på serveren:
-- faktisk MIME-type ut fra innholdet, størrelse, mål og at filen ikke har EXIF-, XMP- eller GPS-data. Resultatet lagres i
-- media_checks, som bare funksjonen kan skrive (service role). RPC-ene som tar et bilde i bruk krever en godkjent kontroll,
-- så en klient som hopper over omkodingen får ikke bildet publisert.
-- Filer slettes når innholdet de hører til slettes: databasen legger stien i storage_deletions, og process-media sletter
-- filene (Storage-filer kan ikke slettes trygt med SQL).
-- Video kommer etter piloten (prompt 20), så public-content tar bare bilder.
-- Migrasjonen har ingen drop.

-- ---------------------------------------------------------------------------
-- 1. Lagringsområdene: bare bilder, med grenser som passer det klienten lager
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit=5242880,allowed_mime_types=array['image/webp','image/jpeg','image/png'] where id='public-avatars';
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/webp','image/jpeg','image/png'] where id='public-covers';
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/webp','image/jpeg','image/png'] where id='public-content';

-- Profilbilder for organisasjoner ligger i public-avatars under organisasjonens id (personer bruker sin egen bruker-id).
create policy organization_avatar_upload on storage.objects for insert to authenticated
  with check (bucket_id='public-avatars' and public.is_active_user() and public.has_role(((storage.foldername(name))[1])::uuid,array['school_admin','board_admin']::admin_role[]));
create policy organization_avatar_remove on storage.objects for delete to authenticated
  using (bucket_id='public-avatars' and public.has_role(((storage.foldername(name))[1])::uuid,array['school_admin','board_admin']::admin_role[]));

-- ---------------------------------------------------------------------------
-- 2. Kontroll av filer (process-media)
-- ---------------------------------------------------------------------------
create table public.media_checks (
  bucket text not null,
  path text not null,
  status text not null check (status in ('ready','failed')),
  mime_type text,
  byte_size bigint,
  width int,
  height int,
  reason text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (bucket,path)
);
alter table public.media_checks enable row level security;
alter table public.media_checks force row level security;
-- Ingen policyer: klientene leser og skriver aldri tabellen direkte.

-- Filer som skal slettes fra Storage. Fylles av databasen, tømmes av process-media.
create table public.storage_deletions (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index storage_deletions_open_idx on public.storage_deletions(created_at) where done_at is null;
alter table public.storage_deletions enable row level security;
alter table public.storage_deletions force row level security;

alter table public.post_media add column uploaded_by uuid references public.profiles(id) on delete set null;
alter table public.post_media add column position smallint not null default 0;

create or replace function public.queue_storage_deletion(p_bucket text,p_path text,p_reason text) returns void language sql security definer set search_path=public as $$
  insert into storage_deletions(bucket,path,reason) select p_bucket,p_path,p_reason where p_path is not null and p_path<>'';
$$;

-- Er filen kontrollert og godkjent? Og finnes den fortsatt?
create or replace function public.media_ready(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from media_checks c where c.bucket=p_bucket and c.path=p_path and c.status='ready')
     and exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path);
$$;

-- Bare for process-media (service role): eier, type og størrelse slik Storage har lagret dem.
create or replace function public.media_object_info(p_bucket text,p_path text)
returns table (owner_id text,mime_type text,byte_size bigint,already_checked boolean)
language sql stable security definer set search_path=public as $$
  select o.owner_id,o.metadata->>'mimetype',(o.metadata->>'size')::bigint,
    exists(select 1 from media_checks c where c.bucket=p_bucket and c.path=p_path)
  from storage.objects o where o.bucket_id=p_bucket and o.name=p_path;
$$;

-- Bare for process-media: lagrer resultatet og oppdaterer behandlingsstatus på innleggsbilder. Avviste filer slettes.
create or replace function public.record_media_check(p_bucket text,p_path text,p_status text,p_mime text,p_size bigint,p_width int,p_height int,p_reason text,p_user uuid)
returns void language plpgsql security definer set search_path=public as $$ begin
  if p_status not in ('ready','failed') then raise exception 'invalid status'; end if;
  insert into media_checks(bucket,path,status,mime_type,byte_size,width,height,reason,checked_by)
  values(p_bucket,p_path,p_status,p_mime,p_size,p_width,p_height,p_reason,p_user)
  on conflict(bucket,path) do update set status=excluded.status,mime_type=excluded.mime_type,byte_size=excluded.byte_size,width=excluded.width,
    height=excluded.height,reason=excluded.reason,checked_by=excluded.checked_by,checked_at=now();
  if p_bucket='public-content' then
    update post_media set processing_status=p_status,width=coalesce(p_width,width),height=coalesce(p_height,height) where storage_path=p_path;
  end if;
  if p_status='failed' then perform public.queue_storage_deletion(p_bucket,p_path,'rejected'); end if;
end $$;

-- Bare for process-media: filer som venter på sletting, og å merke dem som slettet.
create or replace function public.pending_storage_deletions(p_limit int default 100) returns table (id bigint,bucket text,path text)
language sql stable security definer set search_path=public as $$
  select d.id,d.bucket,d.path from storage_deletions d where d.done_at is null order by d.created_at limit least(greatest(coalesce(p_limit,100),1),500);
$$;
create or replace function public.mark_storage_deleted(p_ids bigint[]) returns void language sql security definer set search_path=public as $$
  update storage_deletions set done_at=now() where id=any(p_ids) and done_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 3. Profilbilde og arrangementsbilde krever nå en godkjent kontroll
-- ---------------------------------------------------------------------------
create or replace function public.set_avatar(p_path text default null) returns text language plpgsql security definer set search_path=public as $$
declare v_previous text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_path is not null and (
    p_path !~ ('^'||auth.uid()::text||'/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$')
    or not public.media_ready('public-avatars',p_path)) then
    raise exception 'invalid avatar';
  end if;
  select avatar_path into v_previous from profiles where id=auth.uid();
  update profiles set avatar_path=p_path where id=auth.uid();
  return v_previous;
end $$;

create or replace function public.set_event_image(p_event uuid,p_path text default null) returns text language plpgsql security definer set search_path=public as $$
declare e events;
begin
  select * into e from events where id=p_event for update;
  if not found then raise exception 'event not found'; end if;
  if not public.can_organize_events(e.organizer_id) then raise exception 'not authorized'; end if;
  if p_path is not null and (p_path not like e.organizer_id::text||'/events/'||e.id::text||'/%' or p_path like '%..%'
    or not public.media_ready('public-content',p_path)) then
    raise exception 'invalid image';
  end if;
  update events set image_path=p_path where id=p_event;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),e.organizer_id,'event.image_changed','event',p_event::text,jsonb_build_object('title',e.title));
  return e.image_path;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Bilder i innlegg
-- ---------------------------------------------------------------------------
-- Legger et opplastet bilde til et innlegg. Stien må ligge under organisasjonen og innlegget. Er filen ikke kontrollert ennå,
-- får bildet status «pending» til process-media er ferdig; bare de som kan endre innlegget ser bilder som ikke er klare.
create or replace function public.add_post_media(p_post uuid,p_path text,p_alt text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v posts; v_alt text := nullif(public.clean_text(p_alt),''); v_check media_checks; v_object record; v_id uuid;
begin
  select * into v from posts where id=p_post and status<>'deleted' and deleted_at is null for update;
  if v.id is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_path is null or p_path !~ ('^'||v.organization_id::text||'/posts/'||v.id::text||'/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$') then raise exception 'invalid image'; end if;
  select o.metadata->>'mimetype' as mime,(o.metadata->>'size')::bigint as size into v_object from storage.objects o where o.bucket_id='public-content' and o.name=p_path;
  if v_object.mime is null then raise exception 'invalid image'; end if;
  if char_length(coalesce(v_alt,''))>300 then raise exception 'invalid alt text'; end if;
  if (select count(*) from post_media where post_id=p_post)>=4 then raise exception 'too many images'; end if;
  select * into v_check from media_checks where bucket='public-content' and path=p_path;
  if v_check.status='failed' then raise exception 'invalid image'; end if;
  insert into post_media(post_id,storage_path,media_type,mime_type,byte_size,width,height,processing_status,alt_text,uploaded_by,position)
  values(p_post,p_path,'image',v_object.mime,greatest(coalesce(v_object.size,1),1),v_check.width,v_check.height,coalesce(v_check.status,'pending'),v_alt,auth.uid(),
    (select coalesce(max(position)+1,0) from post_media where post_id=p_post))
  returning id into v_id;
  return v_id;
end $$;

-- Når et innlegg slettes, slettes bildene også.
create or replace function public.queue_post_media_deletion() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.status='deleted' and old.status<>'deleted' then
    insert into storage_deletions(bucket,path,reason) select 'public-content',m.storage_path,'post deleted' from post_media m where m.post_id=new.id;
    update post_media set processing_status='failed' where post_id=new.id;
  end if;
  return new;
end $$;
create trigger posts_queue_media_deletion after update of status on public.posts for each row execute function public.queue_post_media_deletion();

-- Bildene vises bare når innlegget kan ses. Ikke-klare bilder ser bare de som kan endre innlegget.
alter policy post_media_visible_read on public.post_media using (exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid()))
  and (processing_status='ready' or exists(select 1 from posts p where p.id=post_id and public.has_role(p.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]))));
revoke insert,update,delete on public.post_media from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5. Profil- og coverbilde for organisasjoner (§14)
-- ---------------------------------------------------------------------------
-- Bildefeltene endres bare via set_organization_image, så bildet alltid er kontrollert. Låsen og de øvrige feltene som før.
create or replace function public.guard_organization_update() returns trigger language plpgsql set search_path=public as $$ begin
  if current_user::text not in ('authenticated','anon') or public.has_role(new.id,array['super_admin']::admin_role[]) then return new; end if;
  if new.type is distinct from old.type or new.external_id is distinct from old.external_id or new.county is distinct from old.county
    or new.local_board_id is distinct from old.local_board_id or new.status is distinct from old.status
    or new.deactivation_reason is distinct from old.deactivation_reason or new.is_placeholder is distinct from old.is_placeholder
    or new.image_locked is distinct from old.image_locked then
    raise exception 'field requires super administrator';
  end if;
  if new.profile_image_path is distinct from old.profile_image_path or new.cover_image_path is distinct from old.cover_image_path
    or new.default_profile_image_path is distinct from old.default_profile_image_path or new.default_cover_image_path is distinct from old.default_cover_image_path then
    raise exception 'use set_organization_image';
  end if;
  return new;
end $$;

-- Eget profil- eller coverbilde. Skole- og styreadministratorer for organisasjonen. Låst bilde kan ikke endres (bare superadministrator
-- låser, prompt 12). Returnerer forrige sti; den gamle filen slettes.
create or replace function public.set_organization_image(p_org uuid,p_kind text,p_path text default null) returns text language plpgsql security definer set search_path=public as $$
declare o organizations; v_bucket text := case p_kind when 'profile' then 'public-avatars' when 'cover' then 'public-covers' end; v_previous text;
begin
  if v_bucket is null then raise exception 'invalid image'; end if;
  select * into o from organizations where id=p_org for update;
  if o.id is null or o.status<>'active' then raise exception 'organization not found'; end if;
  if not public.is_active_user() or not public.has_role(p_org,array['school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if o.image_locked and not public.has_role(p_org,array['super_admin']::admin_role[]) then raise exception 'image is locked'; end if;
  if p_path is not null and (p_path !~ ('^'||p_org::text||'/(profile|cover)/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$') or not public.media_ready(v_bucket,p_path)) then
    raise exception 'invalid image';
  end if;
  v_previous := case p_kind when 'profile' then o.profile_image_path else o.cover_image_path end;
  if p_kind='profile' then update organizations set profile_image_path=p_path where id=p_org;
  else update organizations set cover_image_path=p_path where id=p_org; end if;
  if v_previous is not null and v_previous like p_org::text||'/%' then perform public.queue_storage_deletion(v_bucket,v_previous,'replaced'); end if;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
    values(auth.uid(),p_org,'organization.image_changed','organization',p_org::text,jsonb_build_object('kind',p_kind,'removed',p_path is null));
  return v_previous;
end $$;

-- Bildene en organisasjonsside viser, etter hierarkiet (eget → lokallag → fylke → global), med kilde og om den som spør
-- kan endre dem. Stiene gjelder public-avatars (profil) og public-covers (cover).
create or replace function public.get_organization_images(p_org uuid)
returns table (profile_image_path text,profile_image_source text,cover_image_path text,cover_image_source text,locked boolean,can_change boolean)
language sql stable security definer set search_path=public as $$
  select r.profile_image_path,r.profile_image_source,r.cover_image_path,r.cover_image_source,o.image_locked,
    auth.uid() is not null and o.status='active' and public.is_active_user() and public.has_role(o.id,array['school_admin','board_admin']::admin_role[])
      and (not o.image_locked or public.has_role(o.id,array['super_admin']::admin_role[]))
  from organizations o cross join lateral public.resolve_organization_images(o.id) r
  where o.id=p_org;
$$;

-- ---------------------------------------------------------------------------
-- 6. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.queue_storage_deletion(text,text,text),public.media_ready(text,text),public.media_object_info(text,text),
  public.record_media_check(text,text,text,text,bigint,int,int,text,uuid),public.pending_storage_deletions(int),public.mark_storage_deleted(bigint[]),
  public.queue_post_media_deletion(),public.add_post_media(uuid,text,text),public.set_organization_image(uuid,text,text),public.get_organization_images(uuid)
  from public,anon,authenticated;
grant execute on function public.media_object_info(text,text),public.record_media_check(text,text,text,text,bigint,int,int,text,uuid),
  public.pending_storage_deletions(int),public.mark_storage_deleted(bigint[]) to service_role;
grant execute on function public.add_post_media(uuid,text,text),public.set_organization_image(uuid,text,text) to authenticated;
grant execute on function public.get_organization_images(uuid) to anon,authenticated;

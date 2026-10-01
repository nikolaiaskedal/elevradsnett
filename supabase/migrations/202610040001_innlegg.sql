-- Prompt 5: innlegg (docs/PROMPTPLAN.md, KRAVSPEC §7).
-- Utkast, publisering, redigering med historikk, sletting, tagging av arrangementer, målgruppe og skoleform,
-- rensing av tekst (XSS) og venneråd mellom skoler. Alt sjekkes her; klienten viser bare det serveren svarer.
-- Migrasjonen har ingen drop. Funksjoner med ny returtype har fått nye navn (list_post_cards, create_post,
-- update_post); publish_post og edit_post er beholdt som tynne innganger til de nye.

-- ---------------------------------------------------------------------------
-- 1. Rensing av tekst (XSS)
-- ---------------------------------------------------------------------------
-- Tekst vises alltid som ren tekst i appene, men renses også før lagring, så HTML aldri ligger i databasen
-- og andre klienter (e-post, eksport, mobil) ikke kan lures. Fjerner HTML-tagger, styretegn og usynlige
-- retningstegn som kan brukes til å skjule tekst. Samme regel som cleanText i lib/domain/validation.ts.
create or replace function public.clean_text(p_text text) returns text language sql immutable set search_path=public as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(replace(coalesce(p_text,''),E'\r\n',E'\n'),
    '</?[A-Za-z!][^>]*>','','g'),
    E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]','','g'),
    E'[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]','','g'));
$$;

-- ---------------------------------------------------------------------------
-- 2. Arrangement på innlegg, og hvilke målgrupper som passer avsenderen
-- ---------------------------------------------------------------------------
alter table public.posts add column event_id uuid references public.events(id) on delete set null;
create index posts_event_idx on public.posts(event_id) where event_id is not null;

-- Skole: alle, fylket, lokallaget (hvis skolen har et) og venneråd. Lokallag: alle, fylket og lokallaget.
-- Fylkesstyre: alle og fylket. EO nasjonalt: alle.
create or replace function public.audience_fits_organization(p_org uuid,p_audience audience_type) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select case o.type
    when 'school' then p_audience in ('public','county','friends') or (p_audience='local' and o.local_board_id is not null)
    when 'local_board' then p_audience in ('public','county','local')
    when 'county_board' then p_audience in ('public','county')
    else p_audience='public' end
  from organizations o where o.id=p_org),false);
$$;

-- Synlighet. I tillegg til reglene fra før: lokallagets egne innlegg til «lokallaget» når skolene i lokallaget,
-- elevene ved avsenderskolen ser skolens innlegg til venneråd, medlemmer av avsenderen ser alltid innleggene,
-- og slettede innlegg vises ikke.
create or replace function public.can_view_post(p public.posts,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
select p.status='published' and p.moderation_status='visible' and p.deleted_at is null and (
 p.audience='public' or
 (p_user is not null and public.has_active_membership(p.organization_id,p_user)) or
 (p_user is not null and p.audience='county' and exists(select 1 from profiles pr join organizations s on s.id=pr.current_school_id join organizations o on o.id=p.organization_id where pr.id=p_user and s.county=o.county)) or
 (p_user is not null and p.audience='local' and exists(select 1 from profiles pr join organizations s on s.id=pr.current_school_id join organizations o on o.id=p.organization_id
   where pr.id=p_user and s.local_board_id is not null and s.local_board_id=case when o.type='local_board' then o.id else o.local_board_id end)) or
 (p_user is not null and p.audience='friends' and exists(select 1 from profiles pr where pr.id=p_user and (pr.current_school_id=p.organization_id or exists(
   select 1 from organization_connections c where c.status='accepted'
     and ((c.requester_id=pr.current_school_id and c.recipient_id=p.organization_id) or (c.recipient_id=pr.current_school_id and c.requester_id=p.organization_id))))))
) $$;

-- ---------------------------------------------------------------------------
-- 3. Opprette, endre og slette innlegg
-- ---------------------------------------------------------------------------
-- Felles kontroller for innhold. Feilkodene oversettes i klienten.
create or replace function public.check_post_content(p_org uuid,p_body text,p_audience audience_type,p_school_level text,p_event uuid) returns void language plpgsql stable security definer set search_path=public as $$ begin
  if char_length(p_body) not between 1 and 6000 then raise exception 'invalid post'; end if;
  if p_school_level is null or p_school_level not in ('upper_secondary','lower_secondary','both') then raise exception 'invalid school level'; end if;
  if p_audience is null or not public.audience_fits_organization(p_org,p_audience) then raise exception 'invalid audience'; end if;
  if p_event is not null and not exists(select 1 from events e join organizations o on o.id=e.organizer_id and o.status='active' where e.id=p_event and e.status in ('published','completed')) then
    raise exception 'event not found';
  end if;
end $$;

-- Nytt innlegg eller utkast på vegne av en organisasjon. Krever aktivt verv og publiseringsrett der.
create or replace function public.create_post(p_organization uuid,p_body text,p_audience audience_type,p_school_level text default 'both',p_event uuid default null,p_publish boolean default true)
returns public.posts language plpgsql security definer set search_path=public as $$ declare v_body text := public.clean_text(p_body); result posts; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization) or not public.has_role(p_organization,array['content_manager','school_admin','board_admin']::admin_role[]) then
    raise exception 'not authorized';
  end if;
  perform public.check_post_content(p_organization,v_body,p_audience,p_school_level,p_event);
  insert into posts(organization_id,actor_user_id,body,audience,school_level_target,event_id,status,published_at)
  values(p_organization,auth.uid(),v_body,p_audience,p_school_level,p_event,case when p_publish then 'published' else 'draft' end::content_status,case when p_publish then now() end)
  returning * into result;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id)
  values(auth.uid(),p_organization,case when p_publish then 'post.created' else 'post.drafted' end,'post',result.id::text);
  return result;
end $$;

-- Endre et utkast eller et publisert innlegg. Med p_publish publiseres et utkast (krever aktivt verv, som ved nytt
-- innlegg). Endringer i publiserte innlegg lagrer forrige versjon i post_revisions og merker innlegget som redigert
-- (triggeren record_post_revision).
create or replace function public.update_post(p_post uuid,p_body text,p_audience audience_type,p_school_level text default 'both',p_event uuid default null,p_publish boolean default false)
returns public.posts language plpgsql security definer set search_path=public as $$ declare v_body text := public.clean_text(p_body); v posts; result posts; begin
  select * into v from posts where id=p_post and status<>'deleted' and deleted_at is null for update;
  if v.id is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_publish and v.status='draft' and not public.has_active_membership(v.organization_id) then raise exception 'not authorized'; end if;
  perform public.check_post_content(v.organization_id,v_body,p_audience,p_school_level,p_event);
  update posts set body=v_body,audience=p_audience,school_level_target=p_school_level,event_id=p_event,
    status=case when p_publish then 'published' else status end,
    published_at=case when p_publish and status='draft' then now() else published_at end
  where id=p_post returning * into result;
  if v.status='published' then
    insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),v.organization_id,'post.edited','post',p_post::text);
  elsif result.status='published' then
    insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),v.organization_id,'post.published','post',p_post::text);
  end if;
  return result;
end $$;

-- Sletting er myk: innlegget skjules for alle, men blir liggende for moderering og revisjon.
create or replace function public.delete_post(p_post uuid) returns void language plpgsql security definer set search_path=public as $$ declare v posts; begin
  select * into v from posts where id=p_post and status<>'deleted' and deleted_at is null for update;
  if v.id is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  update posts set status='deleted',deleted_at=now() where id=p_post;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
  values(auth.uid(),v.organization_id,case when v.status='draft' then 'post.draft_deleted' else 'post.deleted' end,'post',p_post::text,jsonb_build_object('excerpt',left(v.body,80)));
end $$;

-- De gamle inngangene bruker de samme kontrollene, så det finnes ingen vei utenom rensing og målgrupperegler.
create or replace function public.publish_post(p_organization_id uuid,p_body text,p_audience audience_type,p_status content_status,p_school_level_target text default 'both') returns public.posts language plpgsql security definer set search_path=public as $$ begin
  if p_status not in ('draft','published') then raise exception 'invalid post'; end if;
  return public.create_post(p_organization_id,p_body,p_audience,p_school_level_target,null,p_status='published');
end $$;
create or replace function public.edit_post(p_post uuid,p_body text,p_audience audience_type,p_school_level_target text default 'both') returns public.posts language plpgsql security definer set search_path=public as $$ begin
  return public.update_post(p_post,p_body,p_audience,p_school_level_target,(select event_id from posts where id=p_post),false);
end $$;

-- Kommentarer renses på samme måte.
create or replace function public.add_comment(p_post uuid, p_organization uuid, p_body text)
returns public.comments language plpgsql security definer set search_path = public as $$ declare v_body text := public.clean_text(p_body); result comments; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization) then raise exception 'not authorized'; end if;
  if char_length(v_body) not between 1 and 3000 then raise exception 'invalid comment'; end if;
  if not exists (select 1 from posts p where p.id = p_post and public.can_view_post(p, auth.uid())) then raise exception 'post not found'; end if;
  insert into comments(post_id, organization_id, actor_user_id, body) values (p_post, p_organization, auth.uid(), v_body) returning * into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Utkast og endringshistorikk
-- ---------------------------------------------------------------------------
-- Utkastene til en organisasjon, for dem som kan publisere der.
create or replace function public.list_post_drafts(p_org uuid)
returns table (id uuid,organization_id uuid,body text,audience audience_type,school_level text,event_id uuid,updated_at timestamptz,actor_name text)
language plpgsql stable security definer set search_path=public as $$ begin
  if not public.is_active_user() or not public.has_role(p_org,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  return query
  select p.id,p.organization_id,p.body,p.audience,p.school_level_target,p.event_id,p.updated_at,pr.display_name
  from posts p left join profiles pr on pr.id=p.actor_user_id
  where p.organization_id=p_org and p.status='draft' and p.deleted_at is null
  order by p.updated_at desc
  limit 50;
end $$;

-- Tidligere versjoner av et innlegg, nyeste først. Bare for dem som kan redigere innlegget.
create or replace function public.get_post_history(p_post uuid)
returns table (id uuid,body text,audience audience_type,school_level text,edited_by_name text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$ declare v_org uuid; begin
  select organization_id into v_org from posts where posts.id=p_post;
  if v_org is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v_org,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  return query
  select r.id,r.body,r.audience,r.school_level_target,pr.display_name,r.created_at
  from post_revisions r left join profiles pr on pr.id=r.edited_by
  where r.post_id=p_post
  order by r.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Innleggskort
-- ---------------------------------------------------------------------------
-- Som get_post_cards, pluss skoleform, tagget arrangement og can_manage: om den som spør kan redigere og slette
-- innlegget og se historikken. Appen viser knappene ut fra dette svaret.
create or replace function public.list_post_cards(p_representation_id uuid default null,p_mode text default 'chronological',p_organization uuid default null,p_limit int default 50)
returns table (id uuid,organization_id uuid,organization_name text,actor_name text,actor_title text,body text,audience audience_type,school_level text,event_id uuid,
  priority boolean,edited boolean,published_at timestamptz,support_count int,comment_count int,supported boolean,can_manage boolean,comments jsonb,poll jsonb)
language sql stable security definer set search_path=public as $$
  with ranked as (
    select r.post_id as id,r.ordinality as ord from get_ranked_feed(p_representation_id,coalesce(p_mode,'chronological')) with ordinality as r
    where p_representation_id is not null and auth.uid() is not null
  ), picked as (
    select p.*,coalesce(rk.ord,0) as ord from posts p left join ranked rk on rk.id=p.id
    where public.can_view_post(p,auth.uid())
      and (p_organization is null or p.organization_id=p_organization)
      and (p_representation_id is null or p_organization is not null or rk.id is not null)
    order by case when p_representation_id is not null and p_organization is null then coalesce(rk.ord,0) end, p.published_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  )
  select p.id,p.organization_id,o.name,
    (select pr.display_name from profiles pr where pr.id=p.actor_user_id and pr.status='active'),
    (select m.public_title from memberships m where m.user_id=p.actor_user_id and m.organization_id=p.organization_id and m.public_title is not null
      order by (m.status='active') desc,m.start_date desc limit 1),
    p.body,p.audience,p.school_level_target,
    (select e.id from events e where e.id=p.event_id and e.status in ('published','completed')),
    p.priority,p.edited_at is not null,p.published_at,
    (select count(*)::int from reactions r where r.post_id=p.id),
    (select count(*)::int from comments c where c.post_id=p.id and c.moderation_status='visible' and c.deleted_at is null),
    auth.uid() is not null and exists(select 1 from reactions r where r.post_id=p.id and r.user_id=auth.uid()),
    auth.uid() is not null and public.is_active_user() and public.has_role(p.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]),
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'organization_id',c.organization_id,'organization_name',co.name,'created_at',c.created_at,'body',c.body) order by c.created_at)
      from comments c join organizations co on co.id=c.organization_id where c.post_id=p.id and c.moderation_status='visible' and c.deleted_at is null),'[]'::jsonb),
    (select jsonb_build_object('question',pl.question,'closes_at',pl.closes_at,'results_visibility',pl.results_visibility,
       'options',(select jsonb_agg(jsonb_build_object('id',po.id,'label',po.label,
          'votes',case when pl.results_visibility='always' or pl.closes_at<now() then (select count(*)::int from poll_votes v where v.option_id=po.id) else 0 end) order by po.position)
        from poll_options po where po.poll_id=pl.id))
      from polls pl where pl.post_id=p.id)
  from picked p join organizations o on o.id=p.organization_id
  order by p.ord=0, p.ord, p.published_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. Venneråd (§7): gjensidig godkjent forbindelse mellom to skoler
-- ---------------------------------------------------------------------------
-- Én forbindelse per skolepar, uansett retning.
create unique index organization_connections_pair_idx on public.organization_connections(least(requester_id,recipient_id),greatest(requester_id,recipient_id));

-- Tabellen kunne skrives direkte av skoleadministratorer på begge sider, så en side kunne lagre en godkjent
-- forbindelse alene. Nå går alle endringer via funksjonene under, og direkte lesing er bare for partene.
revoke insert,update,delete on public.organization_connections from anon,authenticated;
alter policy connections_school_admin on public.organization_connections
  using (public.has_role(requester_id,array['school_admin']::admin_role[]) or public.has_role(recipient_id,array['school_admin']::admin_role[]))
  with check (false);

create or replace function public.log_friend_event(p_action text,p_connection public.organization_connections) returns void language sql security definer set search_path=public as $$
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id,details)
  select auth.uid(),x.org,p_action,'organization_connection',p_connection.id::text,jsonb_build_object('school_id',x.other,'school_name',o.name)
  from (values (p_connection.requester_id,p_connection.recipient_id),(p_connection.recipient_id,p_connection.requester_id)) as x(org,other)
  join organizations o on o.id=x.other;
$$;

-- Be en annen skole om å bli venneråd. Har den andre skolen allerede spurt, blir forbindelsen godkjent.
create or replace function public.request_friend_school(p_school uuid,p_target uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare c organization_connections; begin
  if not public.is_active_user() or not public.has_role(p_school,array['school_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if not exists(select 1 from organizations where id=p_school and type='school' and status='active') then raise exception 'organization not found'; end if;
  if p_target is null or p_target=p_school or not exists(select 1 from organizations where id=p_target and type='school' and status='active') then raise exception 'school not found'; end if;
  select * into c from organization_connections
  where (requester_id=p_school and recipient_id=p_target) or (requester_id=p_target and recipient_id=p_school)
  for update;
  if c.id is not null and c.status='accepted' then raise exception 'already connected'; end if;
  if c.id is not null and c.status='pending' and c.requester_id=p_school then raise exception 'request already sent'; end if;
  if c.id is not null and c.status='pending' then
    update organization_connections set status='accepted',approved_by=auth.uid(),approved_at=now() where id=c.id returning * into c;
    perform public.log_friend_event('friend.accepted',c);
    return c.id;
  end if;
  if c.id is not null then
    -- En tidligere avslått eller avsluttet forbindelse gjenbrukes, med ny retning.
    update organization_connections set requester_id=p_school,recipient_id=p_target,status='pending',approved_by=null,approved_at=null,created_at=now() where id=c.id returning * into c;
  else
    insert into organization_connections(requester_id,recipient_id,status) values(p_school,p_target,'pending') returning * into c;
  end if;
  perform public.log_friend_event('friend.requested',c);
  return c.id;
end $$;

-- Mottakerskolen godtar eller avslår.
create or replace function public.decide_friend_request(p_connection uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$ declare c organization_connections; begin
  select * into c from organization_connections where id=p_connection for update;
  if c.id is null or c.status<>'pending' then raise exception 'request not pending'; end if;
  if not public.is_active_user() or not public.has_role(c.recipient_id,array['school_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_accept and exists(select 1 from organizations where id in (c.requester_id,c.recipient_id) and status<>'active') then raise exception 'organization not found'; end if;
  update organization_connections set status=case when p_accept then 'accepted' else 'rejected' end,approved_by=auth.uid(),approved_at=now() where id=c.id returning * into c;
  perform public.log_friend_event(case when p_accept then 'friend.accepted' else 'friend.rejected' end,c);
end $$;

-- Avslutte et venneråd, eller trekke en forespørsel. Begge skolene kan avslutte.
create or replace function public.end_friend_connection(p_connection uuid) returns void language plpgsql security definer set search_path=public as $$ declare c organization_connections; begin
  select * into c from organization_connections where id=p_connection for update;
  if c.id is null or c.status not in ('pending','accepted') then raise exception 'connection not active'; end if;
  if not public.is_active_user() or not (public.has_role(c.requester_id,array['school_admin']::admin_role[]) or public.has_role(c.recipient_id,array['school_admin']::admin_role[])) then
    raise exception 'not authorized';
  end if;
  if c.status='pending' and not public.has_role(c.requester_id,array['school_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  update organization_connections set status='ended' where id=c.id returning * into c;
  perform public.log_friend_event('friend.ended',c);
end $$;

-- Ventende og godkjente venneråd for en skole, sett fra skolen.
create or replace function public.list_friend_connections(p_school uuid)
returns table (id uuid,school_id uuid,school_name text,county text,status text,direction text,created_at timestamptz,approved_at timestamptz,can_decide boolean)
language plpgsql stable security definer set search_path=public as $$ begin
  if not public.is_active_user() or not public.has_role(p_school,array['school_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  return query
  select c.id,o.id,o.name,o.county,c.status,case when c.requester_id=p_school then 'outgoing' else 'incoming' end,c.created_at,c.approved_at,
    c.status='pending' and c.recipient_id=p_school
  from organization_connections c
  join organizations o on o.id=case when c.requester_id=p_school then c.recipient_id else c.requester_id end
  where (c.requester_id=p_school or c.recipient_id=p_school) and c.status in ('pending','accepted')
  order by c.status='accepted', c.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.clean_text(text),public.audience_fits_organization(uuid,audience_type),public.check_post_content(uuid,text,audience_type,text,uuid),
  public.create_post(uuid,text,audience_type,text,uuid,boolean),public.update_post(uuid,text,audience_type,text,uuid,boolean),public.delete_post(uuid),
  public.list_post_drafts(uuid),public.get_post_history(uuid),public.list_post_cards(uuid,text,uuid,int),
  public.log_friend_event(text,public.organization_connections),public.request_friend_school(uuid,uuid),public.decide_friend_request(uuid,boolean),
  public.end_friend_connection(uuid),public.list_friend_connections(uuid) from public,anon;
grant execute on function public.clean_text(text),public.audience_fits_organization(uuid,audience_type),
  public.create_post(uuid,text,audience_type,text,uuid,boolean),public.update_post(uuid,text,audience_type,text,uuid,boolean),public.delete_post(uuid),
  public.list_post_drafts(uuid),public.get_post_history(uuid),public.list_post_cards(uuid,text,uuid,int),
  public.request_friend_school(uuid,uuid),public.decide_friend_request(uuid,boolean),public.end_friend_connection(uuid),public.list_friend_connections(uuid) to authenticated;
grant execute on function public.list_post_cards(uuid,text,uuid,int) to anon;
-- Interne hjelpere kan bare brukes av funksjonene over. log_friend_event ville ellers latt hvem som helst skrive i revisjonsloggen.
revoke all on function public.check_post_content(uuid,text,audience_type,text,uuid),public.log_friend_event(text,public.organization_connections) from authenticated;

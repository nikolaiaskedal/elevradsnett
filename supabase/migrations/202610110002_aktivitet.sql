-- Prompt 7: kommentarer, reaksjoner, avstemninger, følging og deling (docs/PROMPTPLAN.md, KRAVSPEC §6 og §7).
-- Alt skrives via RPC-er som sjekker innlogging, synlighet og verv. Bare antall reaksjoner er offentlig.
-- Avstemninger gir én stemme per organisasjon, som kan endres til fristen. Resultatet vises etter stemme eller frist.
-- Migrasjonen har ingen drop. Innleggskortene har fått ny returtype og derfor nytt navn (list_posts).

-- ---------------------------------------------------------------------------
-- 1. Kommentarer
-- ---------------------------------------------------------------------------
-- Kommentarer kunne skrives direkte i tabellen, utenom rensing og grenser. Nå bare via add_comment.
revoke insert,update,delete on public.comments from anon,authenticated;
alter policy comments_org_insert on public.comments with check (false);

-- På vegne av en organisasjon brukeren har aktivt verv i (has_active_membership krever også at organisasjonen er aktiv).
-- Brukeren som skrev lagres. Maks 10 kommentarer i minuttet per bruker (§17).
create or replace function public.add_comment(p_post uuid, p_organization uuid, p_body text)
returns public.comments language plpgsql security definer set search_path = public as $$ declare v_body text := public.clean_text(p_body); result comments; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization) then raise exception 'not authorized'; end if;
  if char_length(v_body) not between 1 and 3000 then raise exception 'invalid comment'; end if;
  if not exists (select 1 from posts p where p.id = p_post and public.can_view_post(p, auth.uid())) then raise exception 'post not found'; end if;
  if (select count(*) from comments c where c.actor_user_id=auth.uid() and c.created_at>now()-interval '1 minute')>=10 then raise exception 'rate limited'; end if;
  insert into comments(post_id, organization_id, actor_user_id, body) values (p_post, p_organization, auth.uid(), v_body) returning * into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Reaksjoner: knyttet til brukeren, men bare antallet er offentlig
-- ---------------------------------------------------------------------------
-- reactions_public_count lot alle lese hvem som hadde reagert. Nå ser hver bruker bare sine egne rader.
alter policy reactions_public_count on public.reactions using (user_id=auth.uid());
revoke insert,update,delete on public.reactions from anon,authenticated;

create or replace function public.set_post_support(p_post uuid,p_supported boolean) returns int language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if not exists(select 1 from posts p where p.id=p_post and public.can_view_post(p,auth.uid())) then raise exception 'post not found'; end if;
  if p_supported then
    insert into reactions(post_id,user_id,reaction) values(p_post,auth.uid(),'support') on conflict(post_id,user_id) do nothing;
  else
    delete from reactions where post_id=p_post and user_id=auth.uid();
  end if;
  return (select count(*)::int from reactions where post_id=p_post);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Følging
-- ---------------------------------------------------------------------------
revoke insert,update,delete on public.follows from anon,authenticated;
create or replace function public.set_follow(p_org uuid,p_following boolean) returns int language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  if p_following then
    if not exists(select 1 from organizations where id=p_org and status='active') then raise exception 'organization not found'; end if;
    insert into follows(user_id,organization_id) values(auth.uid(),p_org) on conflict do nothing;
  else
    delete from follows where user_id=auth.uid() and organization_id=p_org;
  end if;
  return (select count(*)::int from follows f join profiles p on p.id=f.user_id and p.status='active' where f.organization_id=p_org);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Avstemninger
-- ---------------------------------------------------------------------------
-- Legges til et utkast før det publiseres, av dem som kan publisere for organisasjonen. 2–10 svaralternativer.
-- Sluttdato er valgfri, men må være frem i tid og innen ett år.
create or replace function public.add_post_poll(p_post uuid,p_question text,p_options text[],p_closes_at timestamptz default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v posts; v_question text := public.clean_text(p_question); v_options text[]; v_poll uuid;
begin
  select * into v from posts where id=p_post and status='draft' and deleted_at is null for update;
  if v.id is null then raise exception 'post not found'; end if;
  if not public.is_active_user() or not public.has_role(v.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if exists(select 1 from polls where post_id=p_post) then raise exception 'poll exists'; end if;
  select array_agg(o order by i) into v_options from (select public.clean_text(x) as o,i from unnest(p_options) with ordinality as t(x,i)) s where o<>'';
  if char_length(v_question) not between 1 and 300 or coalesce(array_length(v_options,1),0) not between 2 and 10
    or exists(select 1 from unnest(v_options) o where char_length(o)>200) then raise exception 'invalid poll'; end if;
  if p_closes_at is not null and (p_closes_at<=now() or p_closes_at>now()+interval '1 year') then raise exception 'invalid poll'; end if;
  insert into polls(post_id,question,closes_at,results_visibility) values(p_post,v_question,p_closes_at,'after_vote') returning id into v_poll;
  insert into poll_options(poll_id,label,position) select v_poll,o,(i-1)::smallint from unnest(v_options) with ordinality as t(o,i);
  return v_poll;
end $$;

-- Én stemme per organisasjon, som kan endres til fristen. Krever aktivt verv og at innlegget er synlig for brukeren.
create or replace function public.cast_organization_vote(p_poll_id uuid,p_option_id uuid,p_organization_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() or not public.has_active_membership(p_organization_id) then raise exception 'not authorized'; end if;
  if not exists(select 1 from polls pl join posts p on p.id=pl.post_id where pl.id=p_poll_id and public.can_view_post(p,auth.uid())) then raise exception 'post not found'; end if;
  if not exists(select 1 from poll_options o join polls p on p.id=o.poll_id where o.id=p_option_id and p.id=p_poll_id and (p.closes_at is null or p.closes_at>now())) then raise exception 'poll closed or invalid option'; end if;
  insert into poll_votes(poll_id,option_id,organization_id,actor_user_id) values(p_poll_id,p_option_id,p_organization_id,auth.uid())
  on conflict(poll_id,organization_id) do update set option_id=excluded.option_id,actor_user_id=auth.uid(),updated_at=now();
end $$;
revoke insert,update,delete on public.poll_votes,public.polls,public.poll_options from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rapportere innlegg (behandles i modereringskøen, prompt 12)
-- ---------------------------------------------------------------------------
create or replace function public.report_post(p_post uuid,p_category text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_body text;
begin
  if not public.is_active_user() then raise exception 'not authorized'; end if;
  select p.body into v_body from posts p where p.id=p_post and public.can_view_post(p,auth.uid());
  if v_body is null then raise exception 'post not found'; end if;
  if p_category not in ('harassment','spam','inappropriate','other') then raise exception 'invalid category'; end if;
  if char_length(coalesce(p_description,''))>1000 then raise exception 'invalid description'; end if;
  if exists(select 1 from moderation_reports r where r.reporter_id=auth.uid() and r.target_type='post' and r.target_id=p_post and r.status in ('open','reviewing')) then
    raise exception 'post already reported';
  end if;
  insert into moderation_reports(reporter_id,target_type,target_id,category,description,shared_message_excerpt,status)
    values(auth.uid(),'post',p_post,p_category,nullif(public.clean_text(p_description),''),left(v_body,500),'open') returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Innleggskort med bilder, avstemning og egen stemme
-- ---------------------------------------------------------------------------
-- Som list_post_cards, pluss:
--   media: bildene i rekkefølge. Bilder som ikke er klare vises bare for dem som kan endre innlegget.
--   poll: id, frist, om den er avsluttet, egen organisasjons stemme (aktiv representasjon) og antall stemmer.
--         Stemmetallene sendes bare når resultatet kan vises: etter egen stemme, etter fristen, eller når innlegget alltid viser dem.
--   p_post: ett bestemt innlegg (delte lenker).
create or replace function public.list_posts(p_representation_id uuid default null,p_mode text default 'chronological',p_organization uuid default null,p_post uuid default null,p_limit int default 50)
returns table (id uuid,organization_id uuid,organization_name text,actor_name text,actor_title text,body text,audience audience_type,school_level text,event_id uuid,
  priority boolean,edited boolean,published_at timestamptz,support_count int,comment_count int,supported boolean,can_manage boolean,comments jsonb,poll jsonb,media jsonb)
language sql stable security definer set search_path=public as $$
  with voter as (
    select m.organization_id from profiles pr join memberships m on m.id=pr.active_membership_id
    where pr.id=auth.uid() and pr.status='active' and m.user_id=auth.uid() and m.status='active'
  ), ranked as (
    select r.post_id as id,r.ordinality as ord from get_ranked_feed(p_representation_id,coalesce(p_mode,'chronological')) with ordinality as r
    where p_representation_id is not null and auth.uid() is not null and p_post is null
  ), picked as (
    select p.*,coalesce(rk.ord,0) as ord from posts p left join ranked rk on rk.id=p.id
    where public.can_view_post(p,auth.uid())
      and (p_post is null or p.id=p_post)
      and (p_organization is null or p.organization_id=p_organization)
      and (p_post is not null or p_representation_id is null or p_organization is not null or rk.id is not null)
    order by case when p_representation_id is not null and p_organization is null then coalesce(rk.ord,0) end, p.published_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ), managed as (
    select p.id,auth.uid() is not null and public.is_active_user() and public.has_role(p.organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) as can_manage
    from picked p
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
    mg.can_manage,
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'organization_id',c.organization_id,'organization_name',co.name,'created_at',c.created_at,'body',c.body) order by c.created_at)
      from comments c join organizations co on co.id=c.organization_id where c.post_id=p.id and c.moderation_status='visible' and c.deleted_at is null),'[]'::jsonb),
    (select jsonb_build_object('id',pl.id,'question',pl.question,'closes_at',pl.closes_at,'results_visibility',pl.results_visibility,'closed',x.closed,'my_vote',x.my_vote,
       'show_results',x.show,'total',case when x.show then (select count(*)::int from poll_votes v where v.poll_id=pl.id) end,
       'options',(select jsonb_agg(jsonb_build_object('id',po.id,'label',po.label,
          'votes',case when x.show then (select count(*)::int from poll_votes v where v.option_id=po.id) else 0 end) order by po.position)
        from poll_options po where po.poll_id=pl.id))
      from polls pl
      cross join lateral (select pl.closes_at is not null and pl.closes_at<=now() as closed,
        (select v.option_id from poll_votes v join voter on voter.organization_id=v.organization_id where v.poll_id=pl.id) as my_vote) y
      cross join lateral (select y.closed,y.my_vote,
        pl.results_visibility='always' or y.closed or (pl.results_visibility='after_vote' and y.my_vote is not null) as show) x
      where pl.post_id=p.id),
    coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'path',pm.storage_path,'alt',coalesce(pm.alt_text,''),'status',pm.processing_status,'width',pm.width,'height',pm.height)
        order by pm.position,pm.created_at)
      from post_media pm where pm.post_id=p.id and pm.media_type='image' and (pm.processing_status='ready' or (mg.can_manage and p.status<>'deleted'))),'[]'::jsonb)
  from picked p join organizations o on o.id=p.organization_id join managed mg on mg.id=p.id
  order by p.ord=0, p.ord, p.published_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. Funksjonstilgang
-- ---------------------------------------------------------------------------
revoke all on function public.set_post_support(uuid,boolean),public.set_follow(uuid,boolean),public.add_post_poll(uuid,text,text[],timestamptz),
  public.report_post(uuid,text,text),public.list_posts(uuid,text,uuid,uuid,int) from public,anon;
grant execute on function public.set_post_support(uuid,boolean),public.set_follow(uuid,boolean),public.add_post_poll(uuid,text,text[],timestamptz),
  public.report_post(uuid,text,text),public.list_posts(uuid,text,uuid,uuid,int) to authenticated;
grant execute on function public.list_posts(uuid,text,uuid,uuid,int) to anon;

-- Prompt 8: feed og søk (docs/PROMPTPLAN.md, KRAVSPEC §6).
-- Rangeringsmodellen er dokumentert i docs/FEED.md og i kommentaren over get_ranked_feed. Bare offentlige
-- egenskaper ved innlegget og brukerens skole, representasjon og følging brukes; aldri meldinger eller privat aktivitet.
-- Feeden rangeres nå også for innloggede uten verv (ut fra skolen de går på), og beregnes på nytt ved hvert kall,
-- så bytte av skole eller representasjon gir ny feed med en gang.
-- Søket får en ny funksjon (search_directory) med status og tidspunkt, så klienten kan merke tidligere tillitsvalgte
-- og deaktiverte skoler. search fra prompt 2 blir stående for eldre klienter.
-- Migrasjonen har ingen drop.

-- ---------------------------------------------------------------------------
-- 1. Rangering (§6)
-- ---------------------------------------------------------------------------
-- Konteksten er den aktive representasjonen (hvis den er brukerens og aktiv), ellers skolen brukeren går på.
-- Poeng for hvert synlig innlegg:
--   prioritet     100 hvis innlegget er prioritert og kommer fra EO nasjonalt eller fra konteksten sitt fylke, ellers 15
--   geografi      det høyeste av: egen organisasjon eller egen skole 60, lokallaget 45, venneråd 40, fylket 30, EO nasjonalt 20
--   følger        40 hvis brukeren følger avsenderen
--   skoleform     12 hvis innlegget eller avsenderen har samme skoleform som konteksten
--   ferskhet      48 · 0,5^(timer siden publisering / 24), altså halvert hvert døgn
--   engasjement   4 · ln(1 + reaksjoner + 2 · kommentarer), maks 15
-- Innlegg rettet mot en annen skoleform enn konteksten tas ikke med. Kronologisk modus sorterer bare på tid.
-- Uten kontekst (utlogget eller uten skole) teller bare prioritet, ferskhet og engasjement.
create or replace function public.get_ranked_feed(p_representation_id uuid,p_mode text default 'recommended')
returns table (post_id uuid,score double precision)
language sql stable security definer set search_path=public as $$
  with me as (
    select pr.id,pr.current_school_id from profiles pr where pr.id=auth.uid() and pr.status='active'
  ), context as (
    select o.id as org_id,o.county,
      case when o.type='local_board' then o.id else coalesce(o.local_board_id,home.local_board_id) end as local_board_id,
      coalesce(o.school_level,home.school_level) as school_level,
      me.current_school_id as home_id
    from (select 1) one
    left join me on true
    left join organizations o on o.id=coalesce(
      (select m.organization_id from memberships m join organizations mo on mo.id=m.organization_id and mo.status='active'
        where m.id=p_representation_id and m.user_id=me.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),
      me.current_school_id)
    left join organizations home on home.id=me.current_school_id
  ), engagement as (
    select p.id,
      (select count(*) from reactions r where r.post_id=p.id) as reactions,
      (select count(*) from comments cm where cm.post_id=p.id and cm.moderation_status='visible' and cm.deleted_at is null) as comments
    from posts p where p.status='published' and p.deleted_at is null
  ), ranked as (
    select p.id,p.published_at,(
        case when p.priority and (po.type='national' or po.county=c.county) then 100 when p.priority then 15 else 0 end
      + greatest(
          case when p.organization_id in (c.org_id,c.home_id) then 60 else 0 end,
          case when c.local_board_id is not null and (po.local_board_id=c.local_board_id or po.id=c.local_board_id) then 45 else 0 end,
          case when exists(select 1 from organization_connections oc where oc.status='accepted'
            and ((oc.requester_id=p.organization_id and oc.recipient_id in (c.org_id,c.home_id)) or (oc.recipient_id=p.organization_id and oc.requester_id in (c.org_id,c.home_id)))) then 40 else 0 end,
          case when po.county=c.county then 30 else 0 end,
          case when po.type='national' then 20 else 0 end)
      + case when f.organization_id is not null then 40 else 0 end
      + case when c.school_level is not null and (p.school_level_target=c.school_level or po.school_level=c.school_level) then 12 else 0 end
      + 48*power(0.5,greatest(0,extract(epoch from (now()-p.published_at))/3600)/24)
      + least(15,4*ln(1+e.reactions+2*e.comments))
    )::double precision as score
    from posts p join engagement e on e.id=p.id join organizations po on po.id=p.organization_id cross join context c
    left join follows f on f.organization_id=p.organization_id and f.user_id=auth.uid()
    where public.can_view_post(p,auth.uid())
      and (p.school_level_target='both' or c.school_level is null or p.school_level_target=c.school_level)
  )
  select r.id,r.score from ranked r
  order by case when p_mode='chronological' then extract(epoch from r.published_at) else r.score end desc,r.published_at desc;
$$;

-- Som i prompt 7, men innloggede får alltid feeden rangert (eller kronologisk) for sin kontekst, også uten verv.
-- Utlogget: offentlige innlegg, nyeste først.
create or replace function public.list_posts(p_representation_id uuid default null,p_mode text default 'chronological',p_organization uuid default null,p_post uuid default null,p_limit int default 50)
returns table (id uuid,organization_id uuid,organization_name text,actor_name text,actor_title text,body text,audience audience_type,school_level text,event_id uuid,
  priority boolean,edited boolean,published_at timestamptz,support_count int,comment_count int,supported boolean,can_manage boolean,comments jsonb,poll jsonb,media jsonb)
language sql stable security definer set search_path=public as $$
  with voter as (
    select m.organization_id from profiles pr join memberships m on m.id=pr.active_membership_id
    where pr.id=auth.uid() and pr.status='active' and m.user_id=auth.uid() and m.status='active'
  ), ranked as (
    -- Betingelsen bruker bare parametere, så rangeringen kjøres ikke for organisasjonssider og enkeltinnlegg.
    select r.post_id as id,r.ordinality as ord from get_ranked_feed(p_representation_id,coalesce(p_mode,'chronological')) with ordinality as r
    where auth.uid() is not null and p_organization is null and p_post is null
  ), picked as (
    select p.*,coalesce(rk.ord,0) as ord from posts p left join ranked rk on rk.id=p.id
    where public.can_view_post(p,auth.uid())
      and (p_post is null or p.id=p_post)
      and (p_organization is null or p.organization_id=p_organization)
      and (auth.uid() is null or p_organization is not null or p_post is not null or rk.id is not null)
    order by case when auth.uid() is not null and p_organization is null and p_post is null then coalesce(rk.ord,0) end, p.published_at desc
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
-- 2. Søk (§6)
-- ---------------------------------------------------------------------------
-- Fulltekstsøk på norsk (med prefikssøk på navn) etter skoler, styrer, personer, arrangementer og innlegg.
-- Vanlig søk viser bare aktive skoler og personer. Med p_include_former tas også deaktiverte skoler og
-- tidligere tillitsvalgte med: personer med avsluttede offentlige verv, også deaktiverte profiler, men ikke de
-- som har deaktivert kontoen selv. active sier om treffet er aktivt, så klienten kan merke det.
-- Returnerer bare offentlige felt. Innlegg følger can_view_post, arrangementer må være publisert.
create or replace function public.search_directory(p_query text,p_kinds text[] default null,p_include_former boolean default false,p_limit int default 30)
returns table (kind text,id uuid,title text,subtitle text,organization_id uuid,active boolean,starts_at timestamptz,rank real)
language plpgsql stable security definer set search_path=public as $$
#variable_conflict use_column
declare q_simple tsquery:=public.search_tsquery(p_query,'simple'); q_nor tsquery:=public.search_tsquery(p_query,'norwegian');
  v_limit int:=least(greatest(coalesce(p_limit,30),1),60); v_former boolean:=coalesce(p_include_former,false);
begin
  if q_simple is null or char_length(trim(coalesce(p_query,'')))<2 then return; end if;
  return query
  select * from (
    select o.type::text,o.id,coalesce(o.school_name,o.name),
      concat_ws(' · ',nullif(o.county,'Nasjonalt'),(select lb.name from organizations lb where lb.id=o.local_board_id)),
      o.id,o.status='active',null::timestamptz,
      (ts_rank(o.search_vector,q_simple||coalesce(q_nor,q_simple))+case when o.status='active' then 0.1 else 0 end)::real
    from organizations o
    where (p_kinds is null or o.type::text=any(p_kinds)) and (o.status='active' or (v_former and o.status='deactivated'))
      and (o.search_vector@@q_simple or o.search_vector@@q_nor)
    union all
    select 'person',pr.id,pr.display_name,
      coalesce((select string_agg(m.public_title||', '||og.name,' · ' order by m.start_date desc) from memberships m join organizations og on og.id=m.organization_id
                where m.user_id=pr.id and m.status='active' and m.public_title is not null and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)),
               (select 'Tidligere: '||string_agg(m.public_title||', '||og.name,' · ' order by m.start_date desc) from memberships m join organizations og on og.id=m.organization_id
                where m.user_id=pr.id and m.public_title is not null and (m.status='ended' or m.end_date<current_date)),
               (select coalesce(s.school_name,s.name) from organizations s where s.id=pr.current_school_id and s.status='active')),
      case when pr.status='active' then pr.current_school_id end,pr.status='active',null::timestamptz,
      (ts_rank(to_tsvector('simple',pr.display_name),q_simple)
      + case when exists(select 1 from memberships m where m.user_id=pr.id and m.status='active' and m.public_title is not null and (m.end_date is null or m.end_date>=current_date)) then 0.1 else 0 end)::real
    from profiles pr
    where (p_kinds is null or 'person'=any(p_kinds)) and to_tsvector('simple',pr.display_name)@@q_simple
      and (pr.status='active' or (v_former and not pr.deactivated_by_user
        and exists(select 1 from memberships m where m.user_id=pr.id and m.public_title is not null and (m.status='ended' or m.end_date<current_date))))
    union all
    select 'event',e.id,e.title,og.name,e.organizer_id,e.status='published' and e.ends_at>=now(),e.starts_at,
      ts_rank(e.search_vector,coalesce(q_nor,q_simple))
    from events e join organizations og on og.id=e.organizer_id and og.status='active'
    where (p_kinds is null or 'event'=any(p_kinds)) and e.status in ('published','completed') and (e.search_vector@@q_nor or e.search_vector@@q_simple)
    union all
    select 'post',p.id,left(p.body,160),og.name,p.organization_id,true,p.published_at,
      ts_rank(p.search_vector,coalesce(q_nor,q_simple))
    from posts p join organizations og on og.id=p.organization_id
    where (p_kinds is null or 'post'=any(p_kinds)) and p.deleted_at is null and (p.search_vector@@q_nor or p.search_vector@@q_simple) and public.can_view_post(p,auth.uid())
  ) r order by 8 desc,3 limit v_limit;
end $$;

revoke all on function public.search_directory(text,text[],boolean,int) from public,anon,authenticated;
grant execute on function public.search_directory(text,text[],boolean,int) to anon,authenticated;

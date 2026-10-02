-- Atferdstester for prompt 8: rangert og kronologisk feed, skoleform, følging, skolebytte og søk.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Organisasjoner: Elvebakken (demo, vgs i Oslo Sentrum lokallag), H (ungdomsskole i samme lokallag),
-- V (vgs i Vestland) og N (deaktivert skole i Vestland).
insert into public.organizations(id,type,name,slug,county,local_board_id,school_level,status) values
('fc000000-0000-4000-8000-0000000000a1','school','Feedtest Ungdomsskole','feedtest-ungdomsskole','Oslo','00000000-0000-4000-8000-000000000013','lower_secondary','active'),
('fc000000-0000-4000-8000-0000000000a2','school','Feedtest Vestland vgs','feedtest-vestland','Vestland',null,'upper_secondary','active'),
('fc000000-0000-4000-8000-0000000000a3','school','Feedtest Nedlagt vgs','feedtest-nedlagt','Vestland',null,'upper_secondary','deactivated');

-- Testbrukere: E elev på Elvebakken uten verv, A forfatter, D deaktivert tidligere tillitsvalgt,
-- S som har deaktivert kontoen selv (skal aldri finnes i søk).
insert into auth.users(id,email) values
('fc100000-0000-4000-8000-00000000000e','e@example.invalid'),('fc100000-0000-4000-8000-00000000000a','a@example.invalid'),
('fc100000-0000-4000-8000-00000000000d','d@example.invalid'),('fc100000-0000-4000-8000-000000000005','s@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status,deactivated_by_user) values
('fc100000-0000-4000-8000-00000000000e','Eva Feedtest','e@example.invalid','00000000-0000-4000-8000-000000000020','active',false),
('fc100000-0000-4000-8000-00000000000a','Arne Feedtest','a@example.invalid','fc000000-0000-4000-8000-0000000000a2','active',false),
('fc100000-0000-4000-8000-00000000000d','Dagny Feedtest','d@example.invalid','fc000000-0000-4000-8000-0000000000a3','deactivated',false),
('fc100000-0000-4000-8000-000000000005','Svein Feedtest','s@example.invalid','fc000000-0000-4000-8000-0000000000a3','deactivated',true);
insert into public.memberships(user_id,organization_id,public_title,start_date,end_date,status) values
('fc100000-0000-4000-8000-00000000000d','fc000000-0000-4000-8000-0000000000a3','Elevrådsleder',current_date-400,current_date-30,'ended'),
('fc100000-0000-4000-8000-000000000005','fc000000-0000-4000-8000-0000000000a3','Nestleder',current_date-400,current_date-30,'ended');

-- Innlegg: prioritert fra EO (3 døgn), egen skole (2 døgn), vgs i Vestland (1 time), ungdomsskole i lokallaget (1 time, bare for ungdomsskole).
insert into public.posts(id,organization_id,actor_user_id,body,status,audience,school_level_target,priority,published_at) values
('fc200000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-00000000000a','Feedtest prioritert fra EO om skolemiljø','published','public','both',true,now()-interval '3 days'),
('fc200000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','fc100000-0000-4000-8000-00000000000a','Feedtest fra egen skole om kantina','published','public','both',false,now()-interval '2 days'),
('fc200000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-0000000000a2','fc100000-0000-4000-8000-00000000000a','Feedtest fra Vestland om fravær','published','public','both',false,now()-interval '1 hour'),
('fc200000-0000-4000-8000-000000000004','fc000000-0000-4000-8000-0000000000a1','fc100000-0000-4000-8000-00000000000a','Feedtest for ungdomsskolen om leksefri','published','public','lower_secondary',false,now()-interval '1 hour');

create temporary table feed(mode text,ids uuid[]) on commit drop;
grant all on feed to authenticated,anon;

-- Utlogget: offentlige innlegg, nyeste først, også de som er rettet mot en skoleform.
set local role anon;
do $$ declare v uuid[]; begin
  select array_agg(id order by ordinality) into v from public.list_posts() with ordinality where id::text like 'fc2%';
  if v<>array['fc200000-0000-4000-8000-000000000003','fc200000-0000-4000-8000-000000000004','fc200000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000001']::uuid[] then
    raise exception 'utlogget feed er ikke kronologisk: %',v; end if;
end $$;

-- Innlogget uten verv: rangert ut fra skolen. Prioritet fra EO først, så egen skole, så det ferske fra Vestland.
-- Innlegget for ungdomsskolen vises ikke for en vgs-elev.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-00000000000e',true);
do $$ declare v uuid[]; c uuid[]; begin
  select array_agg(id order by ordinality) into v from public.list_posts(null,'recommended') with ordinality where id::text like 'fc2%';
  if v<>array['fc200000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000003']::uuid[] then
    raise exception 'feil anbefalt rekkefølge: %',v; end if;
  select array_agg(id order by ordinality) into c from public.list_posts(null,'chronological') with ordinality where id::text like 'fc2%';
  if c<>array['fc200000-0000-4000-8000-000000000003','fc200000-0000-4000-8000-000000000002','fc200000-0000-4000-8000-000000000001']::uuid[] then
    raise exception 'feil kronologisk rekkefølge: %',c; end if;
  -- Å følge skolen i Vestland løfter innlegget derfra forbi egen skole.
  perform public.set_follow('fc000000-0000-4000-8000-0000000000a2',true);
  select array_agg(id order by ordinality) into v from public.list_posts(null,'recommended') with ordinality where id::text like 'fc2%';
  if v[2]<>'fc200000-0000-4000-8000-000000000003' then raise exception 'følging påvirker ikke rangeringen: %',v; end if;
  -- Skolebytte til ungdomsskolen: feeden beregnes på nytt for den nye skolen og skoleformen.
  perform public.change_school('fc000000-0000-4000-8000-0000000000a1');
  select array_agg(id order by ordinality) into v from public.list_posts(null,'recommended') with ordinality where id::text like 'fc2%';
  if not 'fc200000-0000-4000-8000-000000000004'=any(v) then raise exception 'innlegget for ungdomsskolen mangler etter skolebytte: %',v; end if;
  if v[1]<>'fc200000-0000-4000-8000-000000000001' or v[2]<>'fc200000-0000-4000-8000-000000000004' then raise exception 'feil rekkefølge etter skolebytte: %',v; end if;
  -- Organisasjonssiden er ikke rangert og viser bare den organisasjonen.
  if exists(select 1 from public.list_posts(null,'recommended','fc000000-0000-4000-8000-0000000000a2') where organization_id<>'fc000000-0000-4000-8000-0000000000a2') then
    raise exception 'organisasjonssiden viser andres innlegg'; end if;
end $$;

-- Søk: aktive skoler og personer i vanlig søk. Deaktiverte skoler og tidligere tillitsvalgte bare med filteret.
-- Den som har deaktivert kontoen selv finnes aldri.
reset role;
set local role anon;
do $$ begin
  if (select count(*) from public.search_directory('f'))<>0 then raise exception 'søk med ett tegn ga treff'; end if;
  if not exists(select 1 from public.search_directory('feedtest vestland') where kind='school' and id='fc000000-0000-4000-8000-0000000000a2' and active) then raise exception 'fant ikke skolen'; end if;
  if exists(select 1 from public.search_directory('feedtest') where id='fc000000-0000-4000-8000-0000000000a3') then raise exception 'deaktivert skole i vanlig søk'; end if;
  if not exists(select 1 from public.search_directory('feedtest',null,true) where id='fc000000-0000-4000-8000-0000000000a3' and not active) then raise exception 'deaktivert skole mangler med filteret'; end if;
  if exists(select 1 from public.search_directory('dagny') where kind='person') then raise exception 'deaktivert person i vanlig søk'; end if;
  if not exists(select 1 from public.search_directory('dagny',array['person'],true) where id='fc100000-0000-4000-8000-00000000000d' and not active and subtitle like 'Tidligere: Elevrådsleder%') then
    raise exception 'tidligere tillitsvalgt mangler med filteret'; end if;
  if exists(select 1 from public.search_directory('svein',null,true)) then raise exception 'person som deaktiverte kontoen selv ble funnet'; end if;
  if not exists(select 1 from public.search_directory('arne') where kind='person' and active) then raise exception 'fant ikke aktiv person'; end if;
  -- Norsk ordstamme: «fraværet» finner innlegget om fravær.
  if not exists(select 1 from public.search_directory('fraværet',array['post']) where id='fc200000-0000-4000-8000-000000000003') then raise exception 'norsk fulltekstsøk virker ikke'; end if;
  if exists(select 1 from public.search_directory('feedtest',array['post']) where kind<>'post') then raise exception 'filteret på type virker ikke'; end if;
end $$;

rollback;

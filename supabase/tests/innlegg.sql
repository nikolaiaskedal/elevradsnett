-- Atferdstester for prompt 5: innlegg, utkast, redigering, sletting, målgrupper, XSS-rensing og venneråd.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Organisasjoner (i tillegg til demo-skolen Elvebakken i Oslo Sentrum lokallag):
--   K  skole i Oslo Øst lokallag   V  skole i Vestland uten lokallag
insert into public.organizations(id,type,name,slug,county,local_board_id,school_level,status) values
('f5000000-0000-4000-8000-0000000000a1','school','Testskole Øst','testskole-ost','Oslo','00000000-0000-4000-8000-000000000014','upper_secondary','active'),
('f5000000-0000-4000-8000-0000000000a2','school','Testskole Vestland','testskole-vestland-5','Vestland',null,'upper_secondary','active');

-- Testbrukere:
--   A  skoleadministrator og elevrådsleder på Elvebakken   B  elev på Elvebakken uten verv
--   K  skoleadministrator og leder på Testskole Øst          Y  elev på Testskole Øst
--   X  elev i Vestland                                       L  styreadministrator og leder i Oslo Sentrum lokallag
insert into auth.users(id,email) values
('f6000000-0000-4000-8000-00000000000a','a5@example.invalid'),('f6000000-0000-4000-8000-00000000000b','b5@example.invalid'),
('f6000000-0000-4000-8000-00000000000c','k5@example.invalid'),('f6000000-0000-4000-8000-00000000000d','y5@example.invalid'),
('f6000000-0000-4000-8000-00000000000e','x5@example.invalid'),('f6000000-0000-4000-8000-00000000000f','l5@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('f6000000-0000-4000-8000-00000000000a','Anne Admin','a5@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f6000000-0000-4000-8000-00000000000b','Bjørn Elev','b5@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f6000000-0000-4000-8000-00000000000c','Kari Øst','k5@example.invalid','f5000000-0000-4000-8000-0000000000a1','active'),
('f6000000-0000-4000-8000-00000000000d','Yngve Øst','y5@example.invalid','f5000000-0000-4000-8000-0000000000a1','active'),
('f6000000-0000-4000-8000-00000000000e','Xenia Vest','x5@example.invalid','f5000000-0000-4000-8000-0000000000a2','active'),
('f6000000-0000-4000-8000-00000000000f','Lars Lokallag','l5@example.invalid','00000000-0000-4000-8000-000000000020','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('f6000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','school_admin',current_date-10,'active','f6000000-0000-4000-8000-00000000000a'),
('f6000000-0000-4000-8000-00000000000c','f5000000-0000-4000-8000-0000000000a1','school_admin',current_date-10,'active','f6000000-0000-4000-8000-00000000000a'),
('f6000000-0000-4000-8000-00000000000f','00000000-0000-4000-8000-000000000013','board_admin',current_date-10,'active','f6000000-0000-4000-8000-00000000000a');
insert into public.memberships(user_id,organization_id,public_title,start_date,status) values
('f6000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-10,'active'),
('f6000000-0000-4000-8000-00000000000c','f5000000-0000-4000-8000-0000000000a1','Elevrådsleder',current_date-10,'active'),
('f6000000-0000-4000-8000-00000000000f','00000000-0000-4000-8000-000000000013','Leder',current_date-10,'active');
insert into public.events(id,organizer_id,created_by,title,description,starts_at,ends_at,place,status) values
('f7000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','f6000000-0000-4000-8000-00000000000a','Testmøte','Møte.',now()+interval '7 days',now()+interval '7 days 2 hours','Aulaen','published'),
('f7000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','f6000000-0000-4000-8000-00000000000a','Utkastmøte','Møte.',now()+interval '7 days',now()+interval '7 days 2 hours','Aulaen','draft');

-- Tilgang: anon kan bare lese innleggskort. Interne hjelpere kan ikke kalles av noen.
do $$ begin
  if has_function_privilege('anon','public.create_post(uuid,text,audience_type,text,uuid,boolean)','execute') then raise exception 'anon kan opprette innlegg'; end if;
  if has_function_privilege('anon','public.update_post(uuid,text,audience_type,text,uuid,boolean)','execute') then raise exception 'anon kan endre innlegg'; end if;
  if has_function_privilege('anon','public.delete_post(uuid)','execute') then raise exception 'anon kan slette innlegg'; end if;
  if has_function_privilege('anon','public.list_post_drafts(uuid)','execute') then raise exception 'anon kan lese utkast'; end if;
  if has_function_privilege('anon','public.get_post_history(uuid)','execute') then raise exception 'anon kan lese historikk'; end if;
  if has_function_privilege('anon','public.request_friend_school(uuid,uuid)','execute') then raise exception 'anon kan be om venneråd'; end if;
  if not has_function_privilege('anon','public.list_post_cards(uuid,text,uuid,int)','execute') then raise exception 'anon kan ikke lese innleggskort'; end if;
  if has_function_privilege('authenticated','public.log_friend_event(text,public.organization_connections)','execute') then raise exception 'innloggede kan skrive i revisjonsloggen'; end if;
  if has_function_privilege('authenticated','public.check_post_content(uuid,text,audience_type,text,uuid)','execute') then raise exception 'intern hjelper er åpen'; end if;
  if has_table_privilege('authenticated','public.organization_connections','insert') then raise exception 'venneråd kan skrives direkte'; end if;
end $$;

-- XSS-rensing: tagger, styretegn og usynlige retningstegn fjernes. Vanlige ulikhetstegn står.
do $$ begin
  if public.clean_text(E'  <script>alert(1)</script>Hei <b>du</b>\x07 '||chr(8238)||E'!\r\nNy linje  ')<>E'alert(1)Hei du !\nNy linje' then
    raise exception 'feil rensing: %',public.clean_text(E'  <script>alert(1)</script>Hei <b>du</b>\x07 '||chr(8238)||E'!\r\nNy linje  ');
  end if;
  if public.clean_text('3 < 5 og 7 > 2')<>'3 < 5 og 7 > 2' then raise exception 'ulikhetstegn ble fjernet'; end if;
end $$;

create temporary table ids(name text primary key,id uuid) on commit drop;
grant all on ids to authenticated,anon;

-- A lager et utkast. Det renses, er ikke synlig for andre, og vises i utkastlisten.
set local role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ declare p posts; begin
  p:=public.create_post('00000000-0000-4000-8000-000000000020','<img src=x onerror=alert(1)>Utkast <i>til</i> møte','public','both',null,false);
  if p.status<>'draft' or p.published_at is not null or p.body<>'Utkast til møte' then raise exception 'feil utkast: % %',p.status,p.body; end if;
  insert into ids values('draft',p.id);
  if not exists(select 1 from public.list_post_drafts('00000000-0000-4000-8000-000000000020') d where d.id=p.id and d.actor_name='Anne Admin') then raise exception 'utkastet mangler i listen'; end if;
  if exists(select 1 from public.list_post_cards(null,'chronological','00000000-0000-4000-8000-000000000020') c where c.id=p.id) then raise exception 'utkast vises som innlegg'; end if;
  -- Ugyldig innhold.
  begin perform public.create_post('00000000-0000-4000-8000-000000000020','<b></b>','public'); raise exception 'tomt innlegg ble godtatt';
  exception when raise_exception then if sqlerrm<>'invalid post' then raise; end if; end;
  begin perform public.create_post('00000000-0000-4000-8000-000000000020','Hei','public','alle'); raise exception 'ugyldig skoleform';
  exception when raise_exception then if sqlerrm<>'invalid school level' then raise; end if; end;
  begin perform public.create_post('00000000-0000-4000-8000-000000000020','Hei','public','both','f7000000-0000-4000-8000-000000000002'); raise exception 'upublisert arrangement ble tagget';
  exception when raise_exception then if sqlerrm<>'event not found' then raise; end if; end;
end $$;

-- B uten verv og rettigheter kan ikke publisere, endre eller se utkast.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000b',true);
do $$ begin
  begin perform public.create_post('00000000-0000-4000-8000-000000000020','Hei','public'); raise exception 'elev uten rettigheter publiserte';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.update_post((select id from ids where name='draft'),'Kapret','public'); raise exception 'elev uten rettigheter endret utkast';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.list_post_drafts('00000000-0000-4000-8000-000000000020'); raise exception 'elev uten rettigheter så utkast';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  if exists(select 1 from posts where id=(select id from ids where name='draft')) then raise exception 'utkast synlig via RLS'; end if;
end $$;

-- A publiserer utkastet med arrangement og skoleform. Å publisere er ikke en redigering.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ declare p posts; c record; begin
  p:=public.update_post((select id from ids where name='draft'),'Møte på torsdag','public','upper_secondary','f7000000-0000-4000-8000-000000000001',true);
  if p.status<>'published' or p.published_at is null or p.edited_at is not null then raise exception 'feil etter publisering: % %',p.status,p.edited_at; end if;
  select * into c from public.list_post_cards(null,'chronological','00000000-0000-4000-8000-000000000020') x where x.id=p.id;
  if c.event_id<>'f7000000-0000-4000-8000-000000000001' or c.school_level<>'upper_secondary' or not c.can_manage or c.edited then raise exception 'feil kort: %',c; end if;
  -- Redigering lagrer forrige versjon og merker innlegget.
  p:=public.update_post(p.id,'Møte på fredag','public','upper_secondary','f7000000-0000-4000-8000-000000000001');
  if p.edited_at is null then raise exception 'redigering ble ikke merket'; end if;
  if not exists(select 1 from public.get_post_history(p.id) h where h.body='Møte på torsdag' and h.edited_by_name='Anne Admin') then raise exception 'historikken mangler'; end if;
  if not exists(select 1 from audit_logs where target_id=p.id::text and action='post.edited') or not exists(select 1 from audit_logs where target_id=p.id::text and action='post.published') then
    raise exception 'publisering og redigering er ikke logget';
  end if;
end $$;

-- Anon ser innlegget, men ikke knappene. B ser ikke historikken.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if not exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='draft') and c.edited and not c.can_manage) then raise exception 'anon ser ikke innlegget riktig'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='draft') and c.can_manage) then raise exception 'elev kan redigere'; end if;
  begin perform public.get_post_history((select id from ids where name='draft')); raise exception 'elev så historikken';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;

-- Målgrupper. A publiserer til fylket, lokallaget og venneråd.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ begin
  insert into ids values('county',(public.create_post('00000000-0000-4000-8000-000000000020','Til fylket','county')).id);
  insert into ids values('local',(public.create_post('00000000-0000-4000-8000-000000000020','Til lokallaget','local')).id);
  insert into ids values('friends',(public.create_post('00000000-0000-4000-8000-000000000020','Til vennerådene','friends')).id);
  -- Den gamle inngangen renser også.
  if (public.publish_post('00000000-0000-4000-8000-000000000020','<i>Gammel</i> vei','public','published')).body<>'Gammel vei' then raise exception 'publish_post renser ikke'; end if;
end $$;
-- Lokallaget kan ikke publisere til venneråd, men til lokallaget.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000f',true);
do $$ begin
  begin perform public.create_post('00000000-0000-4000-8000-000000000013','Hei','friends'); raise exception 'lokallag publiserte til venneråd';
  exception when raise_exception then if sqlerrm<>'invalid audience' then raise; end if; end;
  insert into ids values('board_local',(public.create_post('00000000-0000-4000-8000-000000000013','Lederforum','local')).id);
end $$;

-- B (Elvebakken) ser alt fra egen skole, også til venneråd, og lokallagets innlegg.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if (select count(*) from public.list_post_cards() c where c.id in (select id from ids where name in ('county','local','friends','board_local')))<>4 then raise exception 'B ser ikke alle innleggene'; end if;
end $$;
-- Y (Oslo Øst) ser fylket, men ikke lokallaget eller venneråd.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000d',true);
do $$ begin
  if not exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='county')) then raise exception 'Y ser ikke fylket'; end if;
  if exists(select 1 from public.list_post_cards() c where c.id in (select id from ids where name in ('local','friends','board_local'))) then raise exception 'Y ser for mye'; end if;
end $$;
-- X (Vestland) ser ingen av dem.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000e',true);
do $$ begin
  if exists(select 1 from public.list_post_cards() c where c.id in (select id from ids where name in ('county','local','friends','board_local'))) then raise exception 'X ser for mye'; end if;
end $$;

-- Venneråd: K ber Elvebakken om å bli venneråd.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000c',true);
do $$ declare v uuid; begin
  v:=public.request_friend_school('f5000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000020');
  insert into ids values('connection',v);
  begin perform public.request_friend_school('f5000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000020'); raise exception 'dobbel forespørsel';
  exception when raise_exception then if sqlerrm<>'request already sent' then raise; end if; end;
  begin perform public.request_friend_school('f5000000-0000-4000-8000-0000000000a1','f5000000-0000-4000-8000-0000000000a1'); raise exception 'venneråd med seg selv';
  exception when raise_exception then if sqlerrm<>'school not found' then raise; end if; end;
  begin perform public.request_friend_school('00000000-0000-4000-8000-000000000020','f5000000-0000-4000-8000-0000000000a1'); raise exception 'K spurte på vegne av Elvebakken';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  -- Avsenderen kan ikke godkjenne selv, verken via funksjonen eller direkte i tabellen.
  begin perform public.decide_friend_request(v,true); raise exception 'avsender godkjente selv';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin update organization_connections set status='accepted' where id=v; raise exception 'direkte oppdatering ble godtatt';
  exception when insufficient_privilege then null; end;
  if (select direction from public.list_friend_connections('f5000000-0000-4000-8000-0000000000a1'))<>'outgoing' then raise exception 'feil retning'; end if;
end $$;
-- B uten rettigheter kan ikke svare.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000b',true);
do $$ begin
  begin perform public.decide_friend_request((select id from ids where name='connection'),true); raise exception 'elev godkjente venneråd';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
-- A godkjenner. Da ser Y vennerådsinnlegget.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ declare c record; begin
  select * into c from public.list_friend_connections('00000000-0000-4000-8000-000000000020');
  if c.direction<>'incoming' or not c.can_decide or c.school_name<>'Testskole Øst' then raise exception 'feil forespørsel: %',c; end if;
  perform public.decide_friend_request(c.id,true);
  if not exists(select 1 from audit_logs where action='friend.accepted' and organization_id='00000000-0000-4000-8000-000000000020' and details->>'school_name'='Testskole Øst') then raise exception 'godkjenning er ikke logget'; end if;
end $$;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000d',true);
do $$ begin
  if not exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='friends')) then raise exception 'Y ser ikke vennerådsinnlegget'; end if;
end $$;
-- A avslutter. Y ser det ikke lenger. En ny forespørsel gjenbruker raden med ny retning, og K avslår.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  perform public.end_friend_connection((select id from ids where name='connection'));
  v:=public.request_friend_school('00000000-0000-4000-8000-000000000020','f5000000-0000-4000-8000-0000000000a1');
  if v<>(select id from ids where name='connection') then raise exception 'ny rad i stedet for gjenbruk'; end if;
end $$;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000d',true);
do $$ begin
  if exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='friends')) then raise exception 'Y ser innlegget etter avsluttet venneråd'; end if;
end $$;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000c',true);
do $$ begin
  perform public.decide_friend_request((select id from ids where name='connection'),false);
  if exists(select 1 from public.list_friend_connections('f5000000-0000-4000-8000-0000000000a1')) then raise exception 'avslått forespørsel vises'; end if;
end $$;

-- Sletting: B kan ikke, A kan. Slettede innlegg vises ikke og kan ikke endres.
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000b',true);
do $$ begin
  begin perform public.delete_post((select id from ids where name='county')); raise exception 'elev slettet innlegg';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-00000000000a',true);
do $$ begin
  if (public.add_comment((select id from ids where name='county'),'00000000-0000-4000-8000-000000000020','<a href="javascript:x">Bra</a>!')).body<>'Bra!' then raise exception 'kommentaren ble ikke renset'; end if;
  perform public.delete_post((select id from ids where name='county'));
  if exists(select 1 from public.list_post_cards() c where c.id=(select id from ids where name='county')) then raise exception 'slettet innlegg vises'; end if;
  begin perform public.update_post((select id from ids where name='county'),'Tilbake','county'); raise exception 'slettet innlegg ble endret';
  exception when raise_exception then if sqlerrm<>'post not found' then raise; end if; end;
  if not exists(select 1 from audit_logs where action='post.deleted' and target_id=(select id from ids where name='county')::text) then raise exception 'sletting er ikke logget'; end if;
end $$;

rollback;

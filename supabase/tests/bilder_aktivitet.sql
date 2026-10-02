-- Atferdstester for prompt 6 og 7: bilder, støtte, følging, avstemninger, kommentarer og rapportering.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
begin;

-- Testbrukere: A skoleadministrator og elevrådsleder på Elvebakken, B elev på Elvebakken uten verv.
insert into auth.users(id,email) values
('f8000000-0000-4000-8000-00000000000a','a67@example.invalid'),('f8000000-0000-4000-8000-00000000000b','b67@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('f8000000-0000-4000-8000-00000000000a','Anne Bilde','a67@example.invalid','00000000-0000-4000-8000-000000000020','active'),
('f8000000-0000-4000-8000-00000000000b','Bjørn Stemme','b67@example.invalid','00000000-0000-4000-8000-000000000020','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('f8000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','school_admin',current_date-10,'active','f8000000-0000-4000-8000-00000000000a');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status) values
('f8100000-0000-4000-8000-00000000000a','f8000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000020','Elevrådsleder',current_date-10,'active');
update public.profiles set active_membership_id='f8100000-0000-4000-8000-00000000000a' where id='f8000000-0000-4000-8000-00000000000a';

-- Tilgang: interne funksjoner kan bare kalles av service role, og tabellene kan ikke skrives direkte.
do $$ begin
  if has_function_privilege('authenticated','public.record_media_check(text,text,text,text,bigint,int,int,text,uuid)','execute') then raise exception 'innloggede kan godkjenne filer'; end if;
  if has_function_privilege('authenticated','public.media_object_info(text,text)','execute') then raise exception 'innloggede kan lese filinfo'; end if;
  if has_function_privilege('authenticated','public.pending_storage_deletions(int)','execute') then raise exception 'innloggede kan lese slettekøen'; end if;
  if has_function_privilege('authenticated','public.mark_storage_deleted(bigint[])','execute') then raise exception 'innloggede kan endre slettekøen'; end if;
  if not has_function_privilege('service_role','public.record_media_check(text,text,text,text,bigint,int,int,text,uuid)','execute') then raise exception 'process-media kan ikke lagre kontroller'; end if;
  if has_function_privilege('anon','public.add_post_media(uuid,text,text)','execute') then raise exception 'anon kan legge til bilder'; end if;
  if has_function_privilege('anon','public.set_post_support(uuid,boolean)','execute') then raise exception 'anon kan støtte'; end if;
  if has_function_privilege('anon','public.set_follow(uuid,boolean)','execute') then raise exception 'anon kan følge'; end if;
  if not has_function_privilege('anon','public.list_posts(uuid,text,uuid,uuid,int)','execute') then raise exception 'anon kan ikke lese innlegg'; end if;
  if not has_function_privilege('anon','public.get_organization_images(uuid)','execute') then raise exception 'anon kan ikke lese bilder'; end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['comments','reactions','follows','poll_votes','post_media'] loop
    if has_table_privilege('authenticated','public.'||t,'insert') then raise exception '% kan skrives direkte',t; end if;
  end loop;
  if exists(select 1 from pg_class where relname in ('media_checks','storage_deletions') and not (relrowsecurity and relforcerowsecurity)) then raise exception 'RLS mangler'; end if;
end $$;

create temporary table ids(name text primary key,id uuid) on commit drop;
grant all on ids to authenticated,anon;

-- A lager et innlegg med avstemning, og publiserer det.
set local role authenticated;
select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-00000000000a',true);
do $$ declare p posts; v_poll uuid; begin
  p:=public.create_post('00000000-0000-4000-8000-000000000020','Hva synes dere?','public','both',null,false);
  insert into ids values('post',p.id);
  v_poll:=public.add_post_poll(p.id,'<b>Hvilken sak?</b>',array['Fravær',' ','Skolemat'],now()+interval '7 days');
  insert into ids values('poll',v_poll);
  if (select count(*) from poll_options where poll_id=v_poll)<>2 or (select question from polls where id=v_poll)<>'Hvilken sak?' then raise exception 'feil avstemning'; end if;
  begin perform public.add_post_poll(p.id,'Igjen',array['a','b']); raise exception 'to avstemninger';
  exception when raise_exception then if sqlerrm<>'poll exists' then raise; end if; end;
  -- Bilde som ikke finnes i Storage avvises.
  begin perform public.add_post_media(p.id,'00000000-0000-4000-8000-000000000020/posts/'||p.id||'/finnes-ikke.webp','Bilde'); raise exception 'bilde uten fil';
  exception when raise_exception then if sqlerrm<>'invalid image' then raise; end if; end;
  perform public.update_post(p.id,'Hva synes dere?','public','both',null,true);
  begin perform public.add_post_poll(p.id,'Etterpå',array['a','b']); raise exception 'avstemning på publisert innlegg';
  exception when raise_exception then if sqlerrm<>'post not found' then raise; end if; end;
end $$;

-- B uten verv kan støtte og følge, men ikke stemme eller kommentere. Ingen ser hvem som har støttet.
select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-00000000000b',true);
do $$ declare v_post uuid := (select id from ids where name='post'); v_option uuid; c record; begin
  if public.set_post_support(v_post,true)<>1 or public.set_post_support(v_post,true)<>1 then raise exception 'feil antall støtter'; end if;
  if public.set_follow('00000000-0000-4000-8000-000000000020',true)<1 then raise exception 'følging telles ikke'; end if;
  select id into v_option from poll_options where poll_id=(select id from ids where name='poll') order by position limit 1;
  begin perform public.cast_organization_vote((select id from ids where name='poll'),v_option,'00000000-0000-4000-8000-000000000020'); raise exception 'stemme uten verv';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  begin perform public.add_comment(v_post,'00000000-0000-4000-8000-000000000020','Hei'); raise exception 'kommentar uten verv';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  select * into c from public.list_posts(null,'chronological',null,v_post) x;
  if not c.supported or c.support_count<>1 then raise exception 'feil støtte i kortet'; end if;
  if (c.poll->>'show_results')::boolean or (c.poll->'options'->0->>'votes')::int<>0 then raise exception 'resultatet vises før stemme'; end if;
  perform public.report_post(v_post,'spam',null);
  begin perform public.report_post(v_post,'spam',null); raise exception 'dobbel rapport';
  exception when raise_exception then if sqlerrm<>'post already reported' then raise; end if; end;
end $$;

-- A ser ikke hvem som har støttet, stemmer for elevrådet, ser resultatet og kan endre stemmen.
select set_config('request.jwt.claim.sub','f8000000-0000-4000-8000-00000000000a',true);
do $$ declare v_post uuid := (select id from ids where name='post'); v_poll uuid := (select id from ids where name='poll'); v_first uuid; v_second uuid; c record; begin
  if exists(select 1 from reactions where post_id=v_post) then raise exception 'andres støtte er synlig'; end if;
  select id into v_first from poll_options where poll_id=v_poll order by position limit 1;
  select id into v_second from poll_options where poll_id=v_poll order by position desc limit 1;
  perform public.cast_organization_vote(v_poll,v_first,'00000000-0000-4000-8000-000000000020');
  perform public.cast_organization_vote(v_poll,v_second,'00000000-0000-4000-8000-000000000020');
  select * into c from public.list_posts(null,'chronological',null,v_post) x;
  if not (c.poll->>'show_results')::boolean or (c.poll->>'my_vote')::uuid<>v_second or (c.poll->>'total')::int<>1 then raise exception 'feil resultat etter stemme: %',c.poll; end if;
  perform public.add_comment(v_post,'00000000-0000-4000-8000-000000000020','<i>Bra</i> innspill');
  if (select body from comments where post_id=v_post)<>'Bra innspill' then raise exception 'kommentaren er ikke renset'; end if;
  -- Bildefeltene kan ikke endres direkte.
  begin update organizations set cover_image_path='x' where id='00000000-0000-4000-8000-000000000020'; raise exception 'bilde endret direkte';
  exception when raise_exception then if sqlerrm<>'use set_organization_image' then raise; end if; end;
  if not (select can_change from public.get_organization_images('00000000-0000-4000-8000-000000000020')) then raise exception 'administrator kan ikke endre bilder'; end if;
end $$;

-- Sletting av innlegg legger bildene i slettekøen.
reset role;
do $$ declare v_post uuid := (select id from ids where name='post'); begin
  insert into post_media(post_id,storage_path,media_type,mime_type,byte_size,processing_status) values(v_post,'00000000-0000-4000-8000-000000000020/posts/'||v_post||'/a.webp','image','image/webp',10,'ready');
  update posts set status='deleted',deleted_at=now() where id=v_post;
  if not exists(select 1 from storage_deletions where path like '%/posts/'||v_post||'/a.webp' and done_at is null) then raise exception 'bildet er ikke i slettekøen'; end if;
end $$;

-- Anon ser ikke bilde- og rettighetsknapper.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if (select can_change from public.get_organization_images('00000000-0000-4000-8000-000000000020')) then raise exception 'anon kan endre bilder'; end if;
end $$;

rollback;

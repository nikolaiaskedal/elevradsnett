-- Atferdstester for prompt 10: meldinger.
-- Alt skjer i én transaksjon som rulles tilbake, så databasen er uendret etterpå.
-- now() er lik gjennom hele transaksjonen, så eldre meldinger legges inn med created_at i fortiden.
begin;

-- Testskole med systemstyrt gruppe. Testbrukere:
--   A  elevrådsleder         B  elevrådsmedlem          C  elev uten verv
--   D  nytt medlem senere    O  skoleadministrator uten verv (skal ikke kunne lese gruppen)
insert into public.organizations(id,type,name,slug,county,school_level,status) values
('f0000000-0000-4000-8000-0000000000b1','school','Meldingsskolen','meldingsskolen','Oslo','upper_secondary','active');
insert into auth.users(id,email) values
('f3000000-0000-4000-8000-00000000000a','ma@example.invalid'),('f3000000-0000-4000-8000-00000000000b','mb@example.invalid'),
('f3000000-0000-4000-8000-00000000000c','mc@example.invalid'),('f3000000-0000-4000-8000-00000000000d','md@example.invalid'),
('f3000000-0000-4000-8000-000000000001','mo@example.invalid');
insert into public.profiles(id,display_name,email,current_school_id,status) values
('f3000000-0000-4000-8000-00000000000a','Astrid Avsender','ma@example.invalid','f0000000-0000-4000-8000-0000000000b1','active'),
('f3000000-0000-4000-8000-00000000000b','Bjørn Mottaker','mb@example.invalid','f0000000-0000-4000-8000-0000000000b1','active'),
('f3000000-0000-4000-8000-00000000000c','Cecilie Utenfor','mc@example.invalid','f0000000-0000-4000-8000-0000000000b1','active'),
('f3000000-0000-4000-8000-00000000000d','Didrik Ny','md@example.invalid','f0000000-0000-4000-8000-0000000000b1','active'),
('f3000000-0000-4000-8000-000000000001','Ola Admin','mo@example.invalid','f0000000-0000-4000-8000-0000000000b1','active');
insert into public.role_grants(user_id,organization_id,role,start_date,status,granted_by) values
('f3000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-0000000000b1','school_admin',current_date-10,'active','f3000000-0000-4000-8000-000000000001');
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status) values
('f4000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-00000000000a','f0000000-0000-4000-8000-0000000000b1','Elevrådsleder',current_date-10,'active'),
('f4000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-00000000000b','f0000000-0000-4000-8000-0000000000b1','Elevrådsmedlem',current_date-10,'active');

-- Anon kan ikke kalle noe, og meldinger kan ikke skrives direkte i tabellen.
do $$ begin
  if has_function_privilege('anon','public.send_message(uuid,text,jsonb)','execute') then raise exception 'anon kan sende meldinger'; end if;
  if has_function_privilege('anon','public.list_my_conversations()','execute') then raise exception 'anon kan liste samtaler'; end if;
  if has_function_privilege('authenticated','public.sync_managed_conversation(uuid)','execute') then raise exception 'brukere kan synkronisere grupper selv'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and cmd in ('INSERT','UPDATE','DELETE','ALL')) then raise exception 'meldinger kan skrives direkte'; end if;
  if (select count(*) from pg_tables where schemaname='public' and tablename in ('message_hidden','message_settings') and rowsecurity)<>2 then raise exception 'RLS mangler på nye tabeller'; end if;
end $$;

-- Den systemstyrte gruppen er opprettet fra vervene, med A og B. En gammel melding fra A ligger der fra før.
do $$ declare v uuid; begin
  select id into v from public.conversations where kind='managed' and managed_organization_id='f0000000-0000-4000-8000-0000000000b1';
  if v is null then raise exception 'systemstyrt gruppe ble ikke opprettet'; end if;
  if (select count(*) from public.conversation_members where conversation_id=v and left_at is null)<>2 then raise exception 'feil medlemmer i systemstyrt gruppe'; end if;
  update public.conversation_members set history_starts_at=now()-interval '2 days' where conversation_id=v;
  insert into public.messages(conversation_id,sender_user_id,body,created_at) values(v,'f3000000-0000-4000-8000-00000000000a','Gammel melding i elevrådet',now()-interval '1 day');
end $$;

-- A: direktemelding til B. Samme par gir samme samtale.
set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; v2 uuid; begin
  begin insert into public.messages(conversation_id,sender_user_id,body) select id,auth.uid(),'Direkte' from public.conversations limit 1; raise exception 'direkte innsetting i messages';
  exception when insufficient_privilege then null; end;
  v:=public.start_direct_conversation('f3000000-0000-4000-8000-00000000000b');
  v2:=public.start_direct_conversation('f3000000-0000-4000-8000-00000000000b');
  if v<>v2 then raise exception 'to direktesamtaler for samme par'; end if;
  begin perform public.start_direct_conversation(auth.uid()); raise exception 'samtale med seg selv';
  exception when raise_exception then if sqlerrm<>'person not found' then raise; end if; end;
  perform public.send_message(v,'  Hei Bjørn!  ');
  begin perform public.send_message(v,'   '); raise exception 'tom melding godtatt';
  exception when raise_exception then if sqlerrm<>'empty message' then raise; end if; end;
  begin perform public.send_message(v,'Se vedlegg','[{"path":"annen/mappe/fil.pdf","mime_type":"application/pdf","byte_size":10,"file_name":"fil.pdf"}]');
    raise exception 'vedlegg utenfor egen mappe godtatt';
  exception when raise_exception then if sqlerrm<>'invalid attachment' then raise; end if; end;
  if (select count(*) from public.list_my_conversations())<>2 then raise exception 'A skal ha to samtaler'; end if;
  if (select name from public.list_my_conversations() where kind='direct')<>'Bjørn Mottaker' then raise exception 'direktesamtalen har feil navn'; end if;
  if (select name from public.list_my_conversations() where kind='managed')<>'Meldingsskolen' then raise exception 'gruppen har feil navn'; end if;
  if (select body from public.get_conversation_messages(v) limit 1)<>'Hei Bjørn!' then raise exception 'meldingen ble ikke lagret trimmet'; end if;
  if (select unread_count from public.list_my_conversations() where kind='direct')<>0 then raise exception 'egne meldinger telles som uleste'; end if;
  -- Lest-status er av som standard.
  if (select read_by from public.get_conversation_messages(v) limit 1) is not null then raise exception 'lest-status vises uten at den er slått på'; end if;
  perform public.set_read_receipts(true);
end $$;

-- B ser meldingen som ulest, leser den og slår på lest-status.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000b',true);
do $$ declare v uuid; begin
  select id into v from public.list_my_conversations() where kind='direct';
  if (select unread_count from public.list_my_conversations() where id=v)<>1 then raise exception 'B ser ikke ulest melding'; end if;
  if (select last_message_body from public.list_my_conversations() where id=v)<>'Hei Bjørn!' then raise exception 'siste melding mangler'; end if;
  perform public.mark_conversation_read(v);
  if (select unread_count from public.list_my_conversations() where id=v)<>0 then raise exception 'lest samtale har uleste'; end if;
  perform public.set_conversation_muted(v,true);
  if not (select muted from public.list_my_conversations() where id=v) then raise exception 'demping ble ikke lagret'; end if;
  perform public.set_read_receipts(true);
  if not (select read_receipts from public.get_message_settings()) then raise exception 'innstillingen ble ikke lagret'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ begin
  if (select read_by from public.get_conversation_messages((select id from public.list_my_conversations() where kind='direct')) limit 1)<>1 then raise exception 'lest-status viser ikke at B har lest'; end if;
end $$;

-- C er ikke med i samtalene og ser ingenting, verken via tabellene eller RPC-ene.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000c',true);
do $$ begin
  if (select count(*) from public.messages)<>0 then raise exception 'uvedkommende ser meldinger'; end if;
  if (select count(*) from public.conversations)<>0 then raise exception 'uvedkommende ser samtaler'; end if;
  if (select count(*) from public.list_my_conversations())<>0 then raise exception 'uvedkommende har samtaler'; end if;
  begin perform public.get_conversation_messages((select id from public.conversations where kind='managed' and managed_organization_id='f0000000-0000-4000-8000-0000000000b1'));
    raise exception 'uvedkommende leste gruppen';
  exception when raise_exception then if sqlerrm<>'conversation not found' then raise; end if; end;
end $$;

-- Skoleadministrator uten verv kan ikke lese gruppen, og kan ikke legge til seg selv.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000001',true);
do $$ declare v uuid; begin
  select c.id into v from public.conversations c where c.kind='managed';
  if v is not null then raise exception 'administrator ser den systemstyrte gruppen'; end if;
  if (select count(*) from public.list_my_conversations())<>0 then raise exception 'administrator er med i gruppen uten verv'; end if;
end $$;

-- D får verv: legges til i gruppen, ser bare meldinger fra nå. B går av: mister tilgangen.
reset role;
insert into public.memberships(id,user_id,organization_id,public_title,start_date,status) values
('f4000000-0000-4000-8000-00000000000d','f3000000-0000-4000-8000-00000000000d','f0000000-0000-4000-8000-0000000000b1','Elevrådsmedlem',current_date,'active');
update public.memberships set status='ended',end_date=current_date-1 where id='f4000000-0000-4000-8000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000d',true);
do $$ declare v uuid; begin
  select id into v from public.list_my_conversations() where kind='managed';
  if v is null then raise exception 'nytt medlem ble ikke lagt til'; end if;
  if (select count(*) from public.get_conversation_messages(v))<>0 then raise exception 'nytt medlem ser gamle meldinger'; end if;
  if (select count(*) from public.messages)<>0 then raise exception 'nytt medlem ser gamle meldinger i tabellen'; end if;
  perform public.send_message(v,'Hei, jeg er ny!');
  begin perform public.leave_conversation(v); raise exception 'forlot systemstyrt gruppe';
  exception when raise_exception then if sqlerrm<>'cannot leave' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  select id into v from public.list_my_conversations() where kind='managed';
  if (select count(*) from public.get_conversation_messages(v))<>2 then raise exception 'eksisterende medlem mistet historikken'; end if;
  if (select member_count from public.list_my_conversations() where id=v)<>2 then raise exception 'medlemstallet er ikke oppdatert'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000b',true);
do $$ begin
  if exists(select 1 from public.list_my_conversations() where kind='managed') then raise exception 'tidligere medlem har fortsatt gruppen'; end if;
  if exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where c.kind='managed') then raise exception 'tidligere medlem ser gruppemeldinger'; end if;
end $$;

-- Vanlig gruppe: A oppretter med B og C. C forlater og mister tilgangen. Bare administrator legger til.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  begin perform public.create_group_conversation('  ','{f3000000-0000-4000-8000-00000000000b}'); raise exception 'gruppe uten navn';
  exception when raise_exception then if sqlerrm<>'invalid group name' then raise; end if; end;
  begin perform public.create_group_conversation('Tom gruppe','{}'); raise exception 'gruppe uten medlemmer';
  exception when raise_exception then if sqlerrm<>'no members' then raise; end if; end;
  v:=public.create_group_conversation('Planlegging','{f3000000-0000-4000-8000-00000000000b,f3000000-0000-4000-8000-00000000000c}');
  perform public.send_message(v,'Velkommen til gruppa');
  if (select count(*) from public.list_conversation_members(v))<>3 then raise exception 'gruppen har feil antall medlemmer'; end if;
  if not (select is_admin from public.list_conversation_members(v) where me) then raise exception 'oppretteren er ikke administrator'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000c',true);
do $$ declare v uuid; begin
  select id into v from public.list_my_conversations() where kind='group';
  begin perform public.add_conversation_members(v,'{f3000000-0000-4000-8000-00000000000d}'); raise exception 'vanlig medlem la til personer';
  exception when raise_exception then if sqlerrm<>'not authorized' then raise; end if; end;
  perform public.leave_conversation(v);
  if exists(select 1 from public.list_my_conversations() where id=v) then raise exception 'gruppen vises etter at C forlot den'; end if;
  if (select count(*) from public.messages)<>0 then raise exception 'C ser meldinger etter å ha forlatt gruppen'; end if;
  begin perform public.send_message(v,'Er jeg fortsatt her?'); raise exception 'sendte etter å ha forlatt';
  exception when raise_exception then if sqlerrm<>'conversation not found' then raise; end if; end;
end $$;

-- Søk og kontaktpersoner: organisasjonen viser personer med verv, og en gruppe kan opprettes med dem.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000c',true);
do $$ declare v uuid; begin
  if not exists(select 1 from public.search_message_recipients('astrid') where kind='person' and id='f3000000-0000-4000-8000-00000000000a') then raise exception 'personsøk fant ikke A'; end if;
  if not exists(select 1 from public.search_message_recipients('meldingsskol') where kind='organization' and id='f0000000-0000-4000-8000-0000000000b1') then raise exception 'organisasjonssøk fant ikke skolen'; end if;
  if (select count(*) from public.search_message_recipients('a'))<>0 then raise exception 'søk med ett tegn ga treff'; end if;
  if (select count(*) from public.list_organization_contacts('f0000000-0000-4000-8000-0000000000b1'))<>2 then raise exception 'feil antall kontaktpersoner'; end if;
  v:=public.create_organization_group('f0000000-0000-4000-8000-0000000000b1');
  if (select kind from public.conversations where id=v)<>'group' then raise exception 'organisasjonsgruppen er ikke en vanlig gruppe'; end if;
  if (select count(*) from public.list_conversation_members(v))<>3 then raise exception 'organisasjonsgruppen har feil medlemmer'; end if;
end $$;

-- Skjule for egen visning og rapportere en konkret melding.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000b',true);
do $$ declare v uuid; m uuid; r uuid; begin
  select id into v from public.list_my_conversations() where kind='direct';
  select id into m from public.get_conversation_messages(v) limit 1;
  r:=public.report_message(m,'harassment','Ubehagelig');
  if (select shared_message_excerpt from public.moderation_reports where id=r)<>'Hei Bjørn!' then raise exception 'rapporten inneholder ikke meldingen'; end if;
  begin perform public.report_message(m,'spam'); raise exception 'samme melding rapportert to ganger';
  exception when raise_exception then if sqlerrm<>'already reported' then raise; end if; end;
  perform public.hide_message(m);
  if (select count(*) from public.get_conversation_messages(v))<>0 then raise exception 'skjult melding vises'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; m uuid; begin
  select id into v from public.list_my_conversations() where kind='direct';
  select id into m from public.get_conversation_messages(v) limit 1;
  if m is null then raise exception 'skjuling påvirket avsenderen'; end if;
  begin perform public.report_message(m,'spam'); raise exception 'rapporterte egen melding';
  exception when raise_exception then if sqlerrm<>'cannot report own message' then raise; end if; end;
  if (select count(*) from public.moderation_reports)<>0 then raise exception 'avsenderen ser rapporten'; end if;
end $$;

-- Blokkering: B blokkerer A. Ingen av dem kan sende direktemeldinger, og A finner ikke B i søket.
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000b',true);
do $$ begin
  perform public.block_user('f3000000-0000-4000-8000-00000000000a');
  if (select count(*) from public.list_my_blocks())<>1 then raise exception 'blokkeringen vises ikke'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000a',true);
do $$ declare v uuid; begin
  select id into v from public.list_my_conversations() where kind='direct';
  begin perform public.send_message(v,'Hallo?'); raise exception 'blokkert bruker sendte melding';
  exception when raise_exception then if sqlerrm<>'blocked' then raise; end if; end;
  begin perform public.start_direct_conversation('f3000000-0000-4000-8000-00000000000b'); raise exception 'blokkert bruker startet samtale';
  exception when raise_exception then if sqlerrm<>'blocked' then raise; end if; end;
  if exists(select 1 from public.search_message_recipients('bjørn mott') where kind='person') then raise exception 'blokkerende bruker vises i søket'; end if;
  if (select count(*) from public.list_my_blocks())<>0 then raise exception 'den blokkerte ser blokkeringen'; end if;
end $$;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-00000000000b',true);
do $$ begin
  perform public.unblock_user('f3000000-0000-4000-8000-00000000000a');
  perform public.send_message((select id from public.list_my_conversations() where kind='direct'),'Beklager, det var en feil.');
end $$;
reset role;

rollback;

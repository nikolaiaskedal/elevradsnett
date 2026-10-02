-- Placeholderinnhold som superadministrator kan skru av og på i administrasjonen (KRAVSPEC §11).
-- Når det skrus på, opprettes eksempelbrukere ved noen pilotskoler, innlegg fra dem, arrangementer og
-- direktemeldinger/en gruppe med hver aktive bruker. Når det skrus av, slettes alt som ble opprettet, også
-- kommentarer, støtter og samtaler andre har startet med eksempelbrukerne.
-- Eksempelbrukerne har «(eksempel)» i navnet, en e-postadresse som ikke finnes, og er sperret for innlogging.

create table public.placeholder_content (
  target_type text not null check(target_type in ('profile','post','event','conversation')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(target_type,target_id)
);
alter table public.placeholder_content enable row level security;
alter table public.placeholder_content force row level security;
-- Ingen policyer: tabellen leses og skrives bare av funksjonene under.

create or replace function public.placeholder_content_counts() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'enabled',exists(select 1 from placeholder_content where target_type='profile'),
    'profiles',(select count(*) from placeholder_content where target_type='profile'),
    'posts',(select count(*) from placeholder_content where target_type='post'),
    'events',(select count(*) from placeholder_content where target_type='event'),
    'conversations',(select count(*) from placeholder_content where target_type='conversation'));
$$;

create or replace function public.get_placeholder_content_status() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  return public.placeholder_content_counts();
end $$;

-- Eksempelsamtaler for aktive brukere som ikke har dem ennå. Kalles når innholdet skrus på.
create or replace function public.seed_placeholder_conversations() returns void
language plpgsql security definer set search_path=public as $$
declare
  p uuid[]:=array(select target_id from placeholder_content where target_type='profile' order by target_id);
  ph uuid[]; u uuid; c uuid; k text; base timestamptz:=now()-interval '2 days';
begin
  if coalesce(array_length(p,1),0)<5 then return; end if;
  -- Faste roller: rekkefølgen følger navnene som ble lagt inn.
  ph:=array(select pr.id from profiles pr where pr.id=any(p) order by pr.created_at,pr.display_name);
  for u in select pr.id from profiles pr where pr.status='active' and not (pr.id=any(p)) loop
    -- Direktemelding fra første eksempelbruker
    k:=least(u,ph[1])::text||':'||greatest(u,ph[1])::text;
    if not exists(select 1 from conversations where direct_key=k) then
      insert into conversations(kind,created_by,direct_key,created_at) values('direct',ph[1],k,base) returning id into c;
      insert into placeholder_content(target_type,target_id) values('conversation',c);
      insert into conversation_members(conversation_id,user_id,joined_at,history_starts_at) values(c,u,base,base),(c,ph[1],base,base);
      insert into messages(conversation_id,sender_user_id,body,created_at) values
        (c,ph[1],'Hei! Så at dere også jobber med mobilreglene på skolen. Hvordan har dere gjort det med høringen blant elevene?',base+interval '1 hour'),
        (c,ph[1],'Vi laget en kort spørreundersøkelse i Forms og fikk svar fra nesten 400 elever. Kan dele den hvis det er interessant.',base+interval '1 hour 2 minutes'),
        (c,ph[1],'Forresten, kommer du på fylkessamlingen?',now()-interval '3 hours');
      delete from notifications where group_key='conversation:'||c;
    end if;
    -- Direktemelding fra andre eksempelbruker
    k:=least(u,ph[2])::text||':'||greatest(u,ph[2])::text;
    if not exists(select 1 from conversations where direct_key=k) then
      insert into conversations(kind,created_by,direct_key,created_at) values('direct',ph[2],k,base) returning id into c;
      insert into placeholder_content(target_type,target_id) values('conversation',c);
      insert into conversation_members(conversation_id,user_id,joined_at,history_starts_at,last_read_at) values(c,u,base,base,now()),(c,ph[2],base,base,now());
      insert into messages(conversation_id,sender_user_id,body,created_at) values
        (c,ph[2],'Takk for innspillene på styremøtet i går! Jeg sender over referatet i morgen.',base+interval '5 hours'),
        (c,ph[2],'Si fra om du vil ha med noe mer om budsjettet til elevrådet.',base+interval '5 hours 1 minute');
      delete from notifications where group_key='conversation:'||c;
    end if;
    -- Gruppe med tre eksempelbrukere
    if not exists(select 1 from conversation_members cm join placeholder_content pc on pc.target_type='conversation' and pc.target_id=cm.conversation_id
      join conversations cv on cv.id=cm.conversation_id and cv.kind='group' where cm.user_id=u) then
      insert into conversations(kind,name,created_by,created_at) values('group','Elevrådsledere (eksempel)',ph[3],base) returning id into c;
      insert into placeholder_content(target_type,target_id) values('conversation',c);
      insert into conversation_members(conversation_id,user_id,joined_at,history_starts_at,is_admin) values
        (c,ph[3],base,base,true),(c,ph[4],base,base,false),(c,ph[5],base,base,false),(c,u,base,base,false);
      insert into messages(conversation_id,sender_user_id,body,created_at) values
        (c,ph[3],'Velkommen i gruppa! Her kan vi dele erfaringer mellom elevrådene.',base+interval '30 minutes'),
        (c,ph[4],'Har noen tips til hvordan man får flere med på allmøtene?',now()-interval '1 day'),
        (c,ph[5],'Vi har hatt mye igjen for å holde dem i storefri og servere boller 🙌',now()-interval '23 hours'),
        (c,ph[3],'Godt tips! Vi prøver å ha en fast sak der elevene stemmer over noe konkret.',now()-interval '5 hours');
      delete from notifications where group_key='conversation:'||c;
    end if;
  end loop;
end $$;

create or replace function public.remove_placeholder_content() returns void
language plpgsql security definer set search_path=public as $$
declare
  p uuid[]:=array(select target_id from placeholder_content where target_type='profile');
  ev uuid[]:=array(select target_id from placeholder_content where target_type='event');
  po uuid[]:=array(select target_id from placeholder_content where target_type='post');
  sc uuid[]:=array(select distinct organization_id from memberships where user_id=any(array(select target_id from placeholder_content where target_type='profile')));
  cv uuid[];
begin
  cv:=array(select target_id from placeholder_content where target_type='conversation'
    union select cm.conversation_id from conversation_members cm join conversations c on c.id=cm.conversation_id and c.kind='direct' where cm.user_id=any(p));
  delete from notifications where user_id=any(p) or group_key=any(array(select 'conversation:'||x from unnest(cv) x));
  delete from conversations where id=any(cv);
  delete from messages where sender_user_id=any(p);
  delete from event_organization_registrations where event_id=any(ev);
  delete from posts where id=any(po) or actor_user_id=any(p);
  delete from events where id=any(ev) or created_by=any(p);
  delete from comments where actor_user_id=any(p);
  delete from reactions where user_id=any(p);
  delete from poll_votes where actor_user_id=any(p);
  delete from follows where user_id=any(p);
  delete from event_delegates where user_id=any(p);
  delete from notification_preferences where user_id=any(p);
  delete from school_admin_requests where user_id=any(p);
  delete from handover_invites where user_id=any(p);
  delete from consent_records where user_id=any(p);
  delete from profile_restrictions where user_id=any(p);
  update profiles set active_membership_id=null where id=any(p);
  delete from memberships where user_id=any(p);
  delete from conversation_members where user_id=any(p);
  -- Fellessamtaler som bare fantes fordi eksempelbrukerne hadde verv ved skolen.
  delete from conversations c where c.kind='managed' and c.managed_organization_id=any(sc)
    and not exists(select 1 from conversation_members cm where cm.conversation_id=c.id);
  delete from auth.users where id=any(p);
  delete from placeholder_content;
end $$;

create or replace function public.set_placeholder_content(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  people constant text[][]:=array[
    ['Ingrid Solberg','Oslo','upper_secondary','Elevrådsleder'],
    ['Jonas Hauge','Vestland','upper_secondary','Elevrådsleder'],
    ['Sara Lunde','Trøndelag','upper_secondary','Nestleder'],
    ['Elias Moen','Rogaland','upper_secondary','Elevrådsleder'],
    ['Maja Nilsen','Troms','upper_secondary','Elevrådsleder'],
    ['Noah Berg','Akershus','lower_secondary','Elevrådsleder']];
  bodies constant text[]:=array[
    'Elevrådet har i dag levert høringssvar om nye mobilregler. Vi mener elevene må få være med når reglene lages, ikke bare høres etterpå. Takk til alle som svarte på undersøkelsen vår!',
    'Allmøte på fredag i storefri! Vi skal stemme over hvordan pengene fra kakesalget brukes. Forslagene henger på tavla utenfor kantina.',
    'Etter flere måneder med påvirkning har vi endelig fått gratis mensbind på alle toalettene på skolen. Elevrådsarbeid nytter 💪',
    'Vi søker nye medlemmer til arbeidsgruppa for psykisk helse. Ingen erfaring nødvendig, bare lyst til å gjøre skolen til et bedre sted. Ta kontakt med elevrådet!',
    'Takk for en supersamling i helga! Vi tok med oss mange gode ideer om hvordan elevrådet kan bli mer synlig i klassene.',
    'Kantina har nå et billig frokosttilbud hver morgen fra kl. 08.00. Dette var en av sakene elevene stemte frem i høst.',
    'Påminnelse: Klassetillitsvalgte møtes på tirsdag i 6. time. Ta med innspill fra klassen om vurderingsordningen.',
    'Vi har startet et samarbeid med elevrådene i nabokommunen om bedre busstilbud for elever. Første møte er neste uke.'];
  rec text[]; i int; u uuid; school uuid; pid uuid; users uuid[]:='{}'; schools uuid[]:='{}';
  day timestamptz:=date_trunc('day',now());
begin
  if not public.has_role(null,array['super_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if not p_enabled then
    if exists(select 1 from placeholder_content) then
      perform public.remove_placeholder_content();
      insert into audit_logs(actor_user_id,action,target_type,target_id) values(auth.uid(),'placeholder.disabled','placeholder_content','all');
    end if;
    return public.placeholder_content_counts();
  end if;

  if not exists(select 1 from placeholder_content where target_type='profile') then
    foreach rec slice 1 in array people loop
      select o.id into school from organizations o where o.type='school' and o.status='active' and o.county=rec[2] and o.school_level=rec[3]
        and not (o.id=any(schools)) order by coalesce(o.school_name,o.name) limit 1;
      if school is null then continue; end if;
      u:=gen_random_uuid();
      insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,banned_until,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
        confirmation_token,recovery_token,email_change_token_new,email_change)
        values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','eksempel-'||u::text||'@elevradsnett.invalid',now(),'infinity',
          '{"provider":"email","providers":["email"],"placeholder":true}'::jsonb,'{}'::jsonb,now()-interval '60 days',now(),'','','','');
      insert into profiles(id,display_name,email,current_school_id,status,created_at)
        values(u,rec[1]||' (eksempel)','eksempel-'||u::text||'@elevradsnett.invalid',school,'active',now()-interval '60 days'+coalesce(array_length(users,1),0)*interval '1 minute');
      insert into profile_school_history(user_id,school_id,started_at) values(u,school,now()-interval '60 days');
      insert into memberships(user_id,organization_id,public_title,start_date,status,accepted_at)
        values(u,school,rec[4],current_date-60,'active',now()-interval '60 days');
      insert into placeholder_content(target_type,target_id) values('profile',u);
      users:=users||u; schools:=schools||school;
    end loop;
    if coalesce(array_length(users,1),0)<5 then raise exception 'not enough schools for placeholder content'; end if;

    for i in 1..array_length(bodies,1) loop
      insert into posts(organization_id,actor_user_id,body,status,audience,moderation_status,published_at,created_at,priority)
        values(schools[1+(i-1)%array_length(schools,1)],users[1+(i-1)%array_length(users,1)],bodies[i],'published','public','visible',
          now()-(i*7)*interval '1 hour',now()-(i*7)*interval '1 hour',i=1)
        returning id into pid;
      insert into placeholder_content(target_type,target_id) values('post',pid);
    end loop;

    insert into events(organizer_id,created_by,title,summary,description,category,starts_at,ends_at,place,digital_url,registration_deadline,capacity,seats_per_organization,price_label,audience,status,is_placeholder)
      select x.org,x.creator,x.title,x.summary,x.description,x.category,x.starts,x.ends,x.place,x.url,x.deadline,x.capacity,x.seats,x.price,'public','published',true
      from (values
        ((select id from organizations where type='county_board' and county='Oslo'),users[1],'Fylkessamling for elevråd (eksempel)',
          'En helg med kurs, workshops og erfaringsdeling for elevråd i fylket.',
          'Lær mer om elevrådsarbeid, møteledelse og påvirkning. Det blir workshops, sosialt program og god mat. Dette er et eksempelarrangement.',
          'samling',day+interval '17 days 10 hours',day+interval '18 days 15 hours','Oslo',null::text,day+interval '10 days',120,4,'Gratis'),
        ((select id from organizations where type='county_board' and county='Vestland'),users[2],'Kurs i møteledelse (eksempel)',
          'Bli tryggere som møteleder i elevrådet.',
          'Et praktisk kurs om saksliste, referat og hvordan man får alle med i diskusjonen. Dette er et eksempelarrangement.',
          'kurs',day+interval '9 days 17 hours',day+interval '9 days 20 hours','Bergen',null,day+interval '7 days',40,2,'Gratis'),
        ((select id from organizations where type='county_board' and county='Trøndelag'),users[3],'Digitalt nettverksmøte for elevrådsledere (eksempel)',
          'Del erfaringer med elevrådsledere fra hele landet.',
          'Et uformelt digitalt møte der elevrådsledere deler hva som fungerer og hva som er vanskelig. Dette er et eksempelarrangement.',
          'digitalt',day+interval '4 days 18 hours',day+interval '4 days 19 hours 30 minutes',null,'https://example.invalid/nettverksmote',null,null,null,'Gratis'),
        (schools[4],users[4],'Allmøte om skolemiljø (eksempel)',
          'Elevrådet inviterer alle elever til allmøte.',
          'Vi tar opp resultatene fra elevundersøkelsen og stemmer over hvilke saker elevrådet skal prioritere. Dette er et eksempelarrangement.',
          'mote',day+interval '2 days 11 hours',day+interval '2 days 12 hours',
          (select coalesce(school_name,name) from organizations where id=schools[4]),null,null,null,null,null)
      ) as x(org,creator,title,summary,description,category,starts,ends,place,url,deadline,capacity,seats,price)
      where x.org is not null;
    insert into placeholder_content(target_type,target_id)
      select 'event',id from events where is_placeholder and created_by=any(users);
    insert into audit_logs(actor_user_id,action,target_type,target_id) values(auth.uid(),'placeholder.enabled','placeholder_content','all');
  end if;

  -- Også ved ny påskrudd: brukere som har kommet til siden sist, får eksempelsamtalene.
  perform public.seed_placeholder_conversations();
  return public.placeholder_content_counts();
end $$;

revoke all on function public.placeholder_content_counts(),public.get_placeholder_content_status(),public.seed_placeholder_conversations(),
  public.remove_placeholder_content(),public.set_placeholder_content(boolean) from public,anon,authenticated;
grant execute on function public.get_placeholder_content_status(),public.set_placeholder_content(boolean) to authenticated;

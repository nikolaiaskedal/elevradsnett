-- DEMO / PLACEHOLDER DATA ONLY. Never use as production identities or content.
-- Alt her er merket is_placeholder, så superadministrator kan finne og slette det samlet (§11).
-- Organisasjonsstrukturen følger §2: EO nasjonalt og de fem standard lokallagene. Fylkesstyrene og de
-- ekte medlemsskolene kommer fra supabase/pilot/seed.sql, som lastes før denne filen.

-- EO-logoen er global standard for profilbilde (§2, §14). Fylkesstyrer og lokallag har ikke eget
-- bilde, så de arver den via resolve_organization_images. Filen lastes opp til public-avatars/defaults/.
insert into public.organizations(id,type,external_id,name,slug,county,local_board_id,school_level,contact_email,bio,status,is_placeholder,default_profile_image_path) values
('00000000-0000-4000-8000-000000000001','national','demo-eo','EO Nasjonalt','eo-nasjonalt','Nasjonalt',null,null,'teknisk@elev.no','Elevorganisasjonen er av, med og for elever.','active',true,'public-avatars/defaults/eo-logo.png')
on conflict(id) do nothing;

-- De fem standard lokallagene.
insert into public.organizations(id,type,external_id,name,slug,county,local_board_id,school_level,contact_email,bio,status,is_placeholder) values
('00000000-0000-4000-8000-000000000010','local_board','demo-local-trondheim','Trondheim lokallag','trondheim','Trøndelag',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000011','local_board','demo-local-bergen','Bergen lokallag','bergen','Vestland',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000012','local_board','demo-local-oslo-vest','Oslo Vest lokallag','oslo-vest','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000013','local_board','demo-local-oslo-sentrum','Oslo Sentrum lokallag','oslo-sentrum','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000014','local_board','demo-local-oslo-ost','Oslo Øst lokallag','oslo-ost','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000020','school','demo-school-elvebakken','Elvebakken vgs','elvebakken-vgs','Oslo','00000000-0000-4000-8000-000000000013','upper_secondary','elevrad@example.invalid','Demo-skole.','active',true)
on conflict(id) do nothing;

-- Designdata: skolenavn, elevtall og prioriterte saker.
update public.organizations set school_name='Elvebakken videregående skole',student_count=1240 where id='00000000-0000-4000-8000-000000000020';
update public.organizations set priorities_heading='Prioriterte saker 2026/2027' where id='00000000-0000-4000-8000-000000000001';

-- Hierarkiet: fylkesstyret inneholder lokallagene i fylket, lokallaget inneholder skolene.
insert into public.organization_relations(parent_id,child_id,relation_type)
select cb.id,lb.id,'county_contains' from public.organizations lb join public.organizations cb on cb.type='county_board' and cb.county=lb.county where lb.type='local_board' and lb.is_placeholder
union all
select s.local_board_id,s.id,'local_contains' from public.organizations s where s.type='school' and s.local_board_id is not null and s.is_placeholder
on conflict do nothing;

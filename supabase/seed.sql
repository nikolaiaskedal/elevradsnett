-- DEMO / PLACEHOLDER DATA ONLY. Never use as production identities or content.
insert into public.organizations(id,type,external_id,name,slug,county,local_board_id,school_level,contact_email,bio,status,is_placeholder) values
('00000000-0000-4000-8000-000000000001','national','demo-eo','EO Nasjonalt','eo-nasjonalt','Nasjonalt',null,null,'teknisk@elev.no','Elevorganisasjonen er av, med og for elever.','active',true),
('00000000-0000-4000-8000-000000000010','local_board','demo-local-trondheim','Trondheim lokallag','trondheim','Trøndelag',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000011','local_board','demo-local-bergen','Bergen lokallag','bergen','Vestland',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000012','local_board','demo-local-oslo-vest','Oslo Vest lokallag','oslo-vest','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000013','local_board','demo-local-oslo-sentrum','Oslo Sentrum lokallag','oslo-sentrum','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000014','local_board','demo-local-oslo-ost','Oslo Øst lokallag','oslo-ost','Oslo',null,null,null,'Demo-lokallag.','active',true),
('00000000-0000-4000-8000-000000000020','school','demo-school-elvebakken','Elvebakken vgs','elvebakken-vgs','Oslo','00000000-0000-4000-8000-000000000013','upper_secondary','elevrad@example.invalid','Demo-skole.','active',true)
on conflict(id) do nothing;

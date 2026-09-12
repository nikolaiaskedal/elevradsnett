insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('public-avatars','public-avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
('public-covers','public-covers',true,10485760,array['image/jpeg','image/png','image/webp']),
('public-content','public-content',true,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
('private-message-attachments','private-message-attachments',false,26214400,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

create policy public_media_read on storage.objects for select to anon,authenticated using(bucket_id in ('public-avatars','public-covers','public-content'));
create policy own_avatar_upload on storage.objects for insert to authenticated with check(bucket_id='public-avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active_user());
create policy organization_media_upload on storage.objects for insert to authenticated with check(bucket_id in ('public-covers','public-content') and public.has_role(((storage.foldername(name))[1])::uuid,array['content_manager','school_admin','board_admin']::admin_role[]));
create policy organization_media_delete on storage.objects for delete to authenticated using(bucket_id in ('public-covers','public-content') and public.has_role(((storage.foldername(name))[1])::uuid,array['content_manager','school_admin','board_admin']::admin_role[]));
create policy private_attachment_read on storage.objects for select to authenticated using(bucket_id='private-message-attachments' and public.is_conversation_member(((storage.foldername(name))[1])::uuid));
create policy private_attachment_upload on storage.objects for insert to authenticated with check(bucket_id='private-message-attachments' and public.is_conversation_member(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]=auth.uid()::text);
create policy private_attachment_delete on storage.objects for delete to authenticated using(bucket_id='private-message-attachments' and owner_id=auth.uid()::text);

-- MIME sniffing, EXIF/GPS stripping, image optimization, video thumbnails and signed URLs
-- are performed by the included Edge Function before metadata is marked ready.

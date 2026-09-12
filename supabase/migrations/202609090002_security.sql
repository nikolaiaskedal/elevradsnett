-- Authorization helpers always read live database grants; JWT role claims are not trusted.
create or replace function public.is_active_user(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=p_user and status='active') $$;
create or replace function public.has_role(p_org uuid,p_roles admin_role[],p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from role_grants r where r.user_id=p_user and r.organization_id=p_org and r.role=any(p_roles) and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date))
  or exists(select 1 from role_grants r where r.user_id=p_user and r.role='super_admin' and r.status='active' and r.start_date<=current_date and (r.end_date is null or r.end_date>=current_date));
$$;
create or replace function public.has_active_membership(p_org uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from memberships m where m.user_id=p_user and m.organization_id=p_org and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) $$;
create or replace function public.is_conversation_member(p_conversation uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from conversation_members cm where cm.conversation_id=p_conversation and cm.user_id=p_user and cm.left_at is null) $$;
revoke all on function public.has_role(uuid,admin_role[],uuid),public.has_active_membership(uuid,uuid),public.is_conversation_member(uuid,uuid) from public;
grant execute on function public.has_role(uuid,admin_role[],uuid),public.has_active_membership(uuid,uuid),public.is_conversation_member(uuid,uuid) to authenticated;

do $$ declare t text; begin foreach t in array array['profiles','organizations','organization_relations','memberships','role_grants','board_terms','election_schedules','handover_processes','handover_invites','posts','post_media','tags','post_tags','comments','reactions','follows','organization_connections','polls','poll_options','poll_votes','events','event_organization_registrations','event_delegates','conversations','conversation_members','messages','message_attachments','notifications','notification_preferences','moderation_reports','moderation_actions','audit_logs','import_batches','legal_document_versions','consent_records'] loop execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t); end loop; end $$;

-- Safe public projections keep private profile columns out of public APIs.
create or replace view public.public_profiles with (security_invoker=true) as
select p.id,p.display_name,p.avatar_path,p.current_school_id,p.status from public.profiles p where p.status='active';
grant select on public.public_profiles to anon,authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid() or public.has_role(current_school_id,array['school_admin']::admin_role[]));
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy profiles_admin_update on public.profiles for update to authenticated using(public.has_role(current_school_id,array['school_admin','board_admin']::admin_role[]));

create policy organizations_public_read on public.organizations for select to anon,authenticated using(status='active');
create policy organizations_admin_read_inactive on public.organizations for select to authenticated using(status<>'active' and public.has_role(id,array['school_admin','board_admin']::admin_role[]));
create policy organizations_admin_update on public.organizations for update to authenticated using(public.has_role(id,array['school_admin','board_admin']::admin_role[])) with check(public.has_role(id,array['school_admin','board_admin']::admin_role[]));
create policy relations_public_read on public.organization_relations for select to anon,authenticated using(true);
create policy legal_public_read on public.legal_document_versions for select to anon,authenticated using(published_at<=now());

create policy memberships_self_read on public.memberships for select to authenticated using(user_id=auth.uid() or public.has_role(organization_id,array['school_admin','board_admin']::admin_role[]));
create policy roles_self_admin_read on public.role_grants for select to authenticated using(user_id=auth.uid() or public.has_role(organization_id,array['school_admin','board_admin']::admin_role[]));
create policy board_terms_public_read on public.board_terms for select to anon,authenticated using(status in ('active','completed'));
create policy schedules_admin_all on public.election_schedules for all to authenticated using(public.has_role(organization_id,array['school_admin','board_admin']::admin_role[])) with check(public.has_role(organization_id,array['school_admin','board_admin']::admin_role[]));
create policy handover_admin_read on public.handover_processes for select to authenticated using(public.has_role(organization_id,array['school_admin','board_admin']::admin_role[]) or started_by=auth.uid());
create policy handover_invitee_read on public.handover_invites for select to authenticated using(user_id=auth.uid() or exists(select 1 from handover_processes h where h.id=handover_id and public.has_role(h.organization_id,array['school_admin','board_admin']::admin_role[])));

create or replace function public.can_view_post(p public.posts,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
select p.status='published' and p.moderation_status='visible' and (
 p.audience='public' or
 (p_user is not null and p.audience='county' and exists(select 1 from profiles pr join organizations s on s.id=pr.current_school_id join organizations o on o.id=p.organization_id where pr.id=p_user and s.county=o.county)) or
 (p_user is not null and p.audience='local' and exists(select 1 from profiles pr join organizations s on s.id=pr.current_school_id join organizations o on o.id=p.organization_id where pr.id=p_user and s.local_board_id=o.local_board_id and s.local_board_id is not null)) or
 (p_user is not null and p.audience='friends' and exists(select 1 from profiles pr join organization_connections c on c.status='accepted' and ((c.requester_id=pr.current_school_id and c.recipient_id=p.organization_id) or (c.recipient_id=pr.current_school_id and c.requester_id=p.organization_id)) where pr.id=p_user))
) $$;
create policy posts_public_and_scoped_read on public.posts for select to anon,authenticated using(public.can_view_post(posts,auth.uid()) or (actor_user_id=auth.uid() and status='draft') or public.has_role(organization_id,array['content_manager','school_admin','board_admin']::admin_role[]));
create policy post_media_visible_read on public.post_media for select to anon,authenticated using(exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid())));
create policy tags_read on public.tags for select to anon,authenticated using(true);
create policy post_tags_read on public.post_tags for select to anon,authenticated using(exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid())));
create policy comments_public_read on public.comments for select to anon,authenticated using(moderation_status='visible' and exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid())));
create policy comments_org_insert on public.comments for insert to authenticated with check(actor_user_id=auth.uid() and public.is_active_user() and public.has_active_membership(organization_id));
create policy reactions_own_all on public.reactions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_active_user());
create policy reactions_public_count on public.reactions for select to anon,authenticated using(exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid())));
create policy follows_own_all on public.follows for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_active_user());
create policy connections_school_admin on public.organization_connections for all to authenticated using(public.has_role(requester_id,array['school_admin']::admin_role[]) or public.has_role(recipient_id,array['school_admin']::admin_role[])) with check(public.has_role(requester_id,array['school_admin']::admin_role[]) or public.has_role(recipient_id,array['school_admin']::admin_role[]));
create policy polls_visible_read on public.polls for select to anon,authenticated using(exists(select 1 from posts p where p.id=post_id and public.can_view_post(p,auth.uid())));
create policy poll_options_visible_read on public.poll_options for select to anon,authenticated using(exists(select 1 from polls pl join posts p on p.id=pl.post_id where pl.id=poll_id and public.can_view_post(p,auth.uid())));
create policy poll_votes_scoped_read on public.poll_votes for select to authenticated using(actor_user_id=auth.uid() or public.has_active_membership(organization_id));

create policy events_public_read on public.events for select to anon,authenticated using(status in ('published','completed'));
create policy event_registrations_org_read on public.event_organization_registrations for select to authenticated using(public.has_active_membership(organization_id) or public.has_role(organization_id,array['content_manager','school_admin','board_admin']::admin_role[]));
create policy event_delegates_self_read on public.event_delegates for select to authenticated using(user_id=auth.uid() or exists(select 1 from event_organization_registrations r where r.id=registration_id and public.has_role(r.organization_id,array['content_manager','school_admin','board_admin']::admin_role[])));

create policy conversations_member_read on public.conversations for select to authenticated using(public.is_conversation_member(id));
create policy conversation_members_member_read on public.conversation_members for select to authenticated using(public.is_conversation_member(conversation_id));
create policy messages_member_read on public.messages for select to authenticated using(exists(select 1 from conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid() and cm.left_at is null and messages.created_at>=cm.history_starts_at));
create policy messages_member_insert on public.messages for insert to authenticated with check(sender_user_id=auth.uid() and public.is_active_user() and public.is_conversation_member(conversation_id));
create policy attachments_member_read on public.message_attachments for select to authenticated using(exists(select 1 from messages m where m.id=message_id and public.is_conversation_member(m.conversation_id)));
create policy notifications_own_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notification_preferences_own_all on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy reports_own_or_moderator on public.moderation_reports for select to authenticated using(reporter_id=auth.uid() or assigned_to=auth.uid());
create policy reports_create on public.moderation_reports for insert to authenticated with check(reporter_id=auth.uid() and public.is_active_user());
create policy actions_moderator_read on public.moderation_actions for select to authenticated using(moderator_id=auth.uid() or exists(select 1 from moderation_reports r where r.id=report_id and r.reporter_id=auth.uid()));
create policy audit_admin_read on public.audit_logs for select to authenticated using(public.has_role(organization_id,array['school_admin','board_admin']::admin_role[]));
create policy import_admin_read on public.import_batches for select to authenticated using(uploaded_by=auth.uid());
create policy consent_own_all on public.consent_records for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Transaction-safe RPCs. UI affordances are never the authorization boundary.
create or replace function public.set_active_representation(p_membership_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  if not exists(select 1 from memberships where id=p_membership_id and user_id=auth.uid() and status='active' and (end_date is null or end_date>=current_date)) then raise exception 'invalid representation'; end if;
  update profiles set active_membership_id=p_membership_id where id=auth.uid();
end $$;
create or replace function public.publish_post(p_organization_id uuid,p_body text,p_audience audience_type,p_status content_status) returns public.posts language plpgsql security definer set search_path=public as $$ declare result posts; begin
  if not public.is_active_user() or not public.has_active_membership(p_organization_id) or not public.has_role(p_organization_id,array['content_manager','school_admin','board_admin']::admin_role[]) then raise exception 'not authorized'; end if;
  if p_status not in ('draft','published') or char_length(trim(p_body)) not between 1 and 6000 then raise exception 'invalid post'; end if;
  insert into posts(organization_id,actor_user_id,body,audience,status,published_at) values(p_organization_id,auth.uid(),trim(p_body),p_audience,p_status,case when p_status='published' then now() end) returning * into result;
  insert into audit_logs(actor_user_id,organization_id,action,target_type,target_id) values(auth.uid(),p_organization_id,'post.created','post',result.id::text);
  return result;
end $$;
create or replace function public.cast_organization_vote(p_poll_id uuid,p_option_id uuid,p_organization_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_user() or not public.has_active_membership(p_organization_id) then raise exception 'not authorized'; end if;
  if not exists(select 1 from poll_options o join polls p on p.id=o.poll_id where o.id=p_option_id and p.id=p_poll_id and (p.closes_at is null or p.closes_at>now())) then raise exception 'poll closed or invalid option'; end if;
  insert into poll_votes(poll_id,option_id,organization_id,actor_user_id) values(p_poll_id,p_option_id,p_organization_id,auth.uid()) on conflict(poll_id,organization_id) do update set option_id=excluded.option_id,actor_user_id=auth.uid(),updated_at=now();
end $$;
revoke all on function public.set_active_representation(uuid),public.publish_post(uuid,text,audience_type,content_status),public.cast_organization_vote(uuid,uuid,uuid) from public;
grant execute on function public.set_active_representation(uuid),public.publish_post(uuid,text,audience_type,content_status),public.cast_organization_vote(uuid,uuid,uuid) to authenticated;

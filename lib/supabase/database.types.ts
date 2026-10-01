
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"ip_hash": string | null,"organization_id": string | null,"target_id": string | null,"target_type": string
                  }
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"ip_hash"?: string | null,"organization_id"?: string | null,"target_id"?: string | null,"target_type": string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"ip_hash"?: string | null,"organization_id"?: string | null,"target_id"?: string | null,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"board_terms": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"organization_id": string,"starts_on": string,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"organization_id": string,"starts_on": string,"status": string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"organization_id"?: string,"starts_on"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_terms_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "actor_user_id": string,"body": string,"created_at": string,"deleted_at": string | null,"id": string,"moderation_status": Database["public"]['Enums']["moderation_status"],"organization_id": string,"post_id": string,"updated_at": string
                  }
                  Insert: {
                    "actor_user_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id": string,"post_id": string,"updated_at"?: string
                  }
                  Update: {
                    "actor_user_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id"?: string,"post_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_records": {
                  Row: {
                    "anonymous_id": string | null,"granted_at": string,"id": string,"legal_version": string,"purposes": NonNullable<Json>,"user_id": string | null,"withdrawn_at": string | null
                  }
                  Insert: {
                    "anonymous_id"?: string | null,"granted_at"?: string,"id"?: string,"legal_version": string,"purposes": NonNullable<Json>,"user_id"?: string | null,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "anonymous_id"?: string | null,"granted_at"?: string,"id"?: string,"legal_version"?: string,"purposes"?: NonNullable<Json>,"user_id"?: string | null,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": string,"history_starts_at": string,"is_admin": boolean,"joined_at": string,"last_read_at": string | null,"left_at": string | null,"muted_until": string | null,"user_id": string
                  }
                  Insert: {
                    "conversation_id": string,"history_starts_at"?: string,"is_admin"?: boolean,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted_until"?: string | null,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"history_starts_at"?: string,"is_admin"?: boolean,"joined_at"?: string,"last_read_at"?: string | null,"left_at"?: string | null,"muted_until"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"direct_key": string | null,"id": string,"kind": string,"managed_organization_id": string | null,"name": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"direct_key"?: string | null,"id"?: string,"kind": string,"managed_organization_id"?: string | null,"name"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"direct_key"?: string | null,"id"?: string,"kind"?: string,"managed_organization_id"?: string | null,"name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_managed_organization_id_fkey"
      columns: ["managed_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"data_subject_requests": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"handled_by": string | null,"id": string,"kind": string,"notes": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"handled_by"?: string | null,"id"?: string,"kind": string,"notes"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"handled_by"?: string | null,"id"?: string,"kind"?: string,"notes"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_subject_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_subject_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_subject_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_subject_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"election_schedules": {
                  Row: {
                    "expected_handover_on": string | null,"expected_month": number | null,"id": string,"organization_id": string,"updated_at": string,"updated_by": string
                  }
                  Insert: {
                    "expected_handover_on"?: string | null,"expected_month"?: number | null,"id"?: string,"organization_id": string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "expected_handover_on"?: string | null,"expected_month"?: number | null,"id"?: string,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "election_schedules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "election_schedules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "election_schedules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"event_delegates": {
                  Row: {
                    "attendance_confirmed_at": string | null,"attendance_confirmed_by": string | null,"confirmed_at": string | null,"id": string,"notified_at": string | null,"registration_id": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "attendance_confirmed_at"?: string | null,"attendance_confirmed_by"?: string | null,"confirmed_at"?: string | null,"id"?: string,"notified_at"?: string | null,"registration_id": string,"status": string,"user_id": string
                  }
                  Update: {
                    "attendance_confirmed_at"?: string | null,"attendance_confirmed_by"?: string | null,"confirmed_at"?: string | null,"id"?: string,"notified_at"?: string | null,"registration_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_delegates_attendance_confirmed_by_fkey"
      columns: ["attendance_confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_delegates_attendance_confirmed_by_fkey"
      columns: ["attendance_confirmed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_delegates_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "event_organization_registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_delegates_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_delegates_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"event_organization_interests": {
                  Row: {
                    "created_at": string,"event_id": string,"marked_by": string,"organization_id": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"marked_by"?: string,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"marked_by"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_organization_interests_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_interests_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_interests_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_interests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"event_organization_registrations": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"organization_id": string,"registered_by": string,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"organization_id": string,"registered_by": string,"status": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"registered_by"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_organization_registrations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_registrations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_registrations_registered_by_fkey"
      columns: ["registered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_organization_registrations_registered_by_fkey"
      columns: ["registered_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "audience": Database["public"]['Enums']["audience_type"],"capacity": number | null,"category": string,"created_at": string,"created_by": string,"description": string,"digital_url": string | null,"ends_at": string,"id": string,"image_path": string | null,"is_placeholder": boolean,"organizer_id": string,"place": string | null,"price_label": string | null,"registration_deadline": string | null,"search_vector": unknown,"seats_per_organization": number | null,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"summary": string | null,"title": string,"updated_at": string
                  }
                  Insert: {
                    "audience"?: Database["public"]['Enums']["audience_type"],"capacity"?: number | null,"category"?: string,"created_at"?: string,"created_by": string,"description": string,"digital_url"?: string | null,"ends_at": string,"id"?: string,"image_path"?: string | null,"is_placeholder"?: boolean,"organizer_id": string,"place"?: string | null,"price_label"?: string | null,"registration_deadline"?: string | null,"search_vector"?: never,"seats_per_organization"?: number | null,"starts_at": string,"status"?: Database["public"]['Enums']["event_status"],"summary"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["audience_type"],"capacity"?: number | null,"category"?: string,"created_at"?: string,"created_by"?: string,"description"?: string,"digital_url"?: string | null,"ends_at"?: string,"id"?: string,"image_path"?: string | null,"is_placeholder"?: boolean,"organizer_id"?: string,"place"?: string | null,"price_label"?: string | null,"registration_deadline"?: string | null,"search_vector"?: never,"seats_per_organization"?: number | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["event_status"],"summary"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"organization_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"handover_invites": {
                  Row: {
                    "accepted_at": string | null,"admin_role": Database["public"]['Enums']["admin_role"] | null,"created_at": string,"email": string | null,"expires_at": string | null,"handover_id": string,"id": string,"public_title": string | null,"status": string,"token_hash": string | null,"user_id": string | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"admin_role"?: Database["public"]['Enums']["admin_role"] | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string | null,"handover_id": string,"id"?: string,"public_title"?: string | null,"status": string,"token_hash"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"admin_role"?: Database["public"]['Enums']["admin_role"] | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string | null,"handover_id"?: string,"id"?: string,"public_title"?: string | null,"status"?: string,"token_hash"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "handover_invites_handover_id_fkey"
      columns: ["handover_id"]
isOneToOne: false
      referencedRelation: "handover_processes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_invites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_invites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"handover_processes": {
                  Row: {
                    "activation_date": string,"completed_at": string | null,"confirmed_by": string | null,"created_at": string,"current_term_id": string | null,"id": string,"old_board_ends_on": string,"organization_id": string,"started_by": string,"status": string,"target_term_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "activation_date": string,"completed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"current_term_id"?: string | null,"id"?: string,"old_board_ends_on": string,"organization_id": string,"started_by": string,"status": string,"target_term_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "activation_date"?: string,"completed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"current_term_id"?: string | null,"id"?: string,"old_board_ends_on"?: string,"organization_id"?: string,"started_by"?: string,"status"?: string,"target_term_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "handover_processes_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_current_term_id_fkey"
      columns: ["current_term_id"]
isOneToOne: false
      referencedRelation: "board_terms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "handover_processes_target_term_id_fkey"
      columns: ["target_term_id"]
isOneToOne: false
      referencedRelation: "board_terms"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "applied_at": string | null,"county": string | null,"created_at": string,"filename": string,"id": string,"row_results": NonNullable<Json>,"status": string,"summary": NonNullable<Json>,"uploaded_by": string
                  }
                  Insert: {
                    "applied_at"?: string | null,"county"?: string | null,"created_at"?: string,"filename": string,"id"?: string,"row_results"?: NonNullable<Json>,"status": string,"summary"?: NonNullable<Json>,"uploaded_by": string
                  }
                  Update: {
                    "applied_at"?: string | null,"county"?: string | null,"created_at"?: string,"filename"?: string,"id"?: string,"row_results"?: NonNullable<Json>,"status"?: string,"summary"?: NonNullable<Json>,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"legal_document_versions": {
                  Row: {
                    "body": string,"id": string,"kind": string,"published_at": string,"version": string
                  }
                  Insert: {
                    "body": string,"id"?: string,"kind": string,"published_at": string,"version": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"kind"?: string,"published_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"memberships": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"end_date": string | null,"granted_at": string,"granted_by": string | null,"id": string,"organization_id": string,"public_title": string | null,"revoked_at": string | null,"revoked_by": string | null,"start_date": string,"status": Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"end_date"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"organization_id": string,"public_title"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"end_date"?: string | null,"granted_at"?: string,"granted_by"?: string | null,"id"?: string,"organization_id"?: string,"public_title"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["membership_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_attachments": {
                  Row: {
                    "byte_size": number,"created_at": string,"file_name": string,"id": string,"message_id": string,"mime_type": string,"storage_path": string
                  }
                  Insert: {
                    "byte_size": number,"created_at"?: string,"file_name"?: string,"id"?: string,"message_id": string,"mime_type": string,"storage_path": string
                  }
                  Update: {
                    "byte_size"?: number,"created_at"?: string,"file_name"?: string,"id"?: string,"message_id"?: string,"mime_type"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_attachments_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"message_hidden": {
                  Row: {
                    "created_at": string,"message_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_hidden_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_hidden_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_hidden_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_settings": {
                  Row: {
                    "read_receipts": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "read_receipts"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "read_receipts"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string | null,"conversation_id": string,"created_at": string,"deleted_at": string | null,"id": string,"reported_at": string | null,"sender_user_id": string
                  }
                  Insert: {
                    "body"?: string | null,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"reported_at"?: string | null,"sender_user_id"?: string
                  }
                  Update: {
                    "body"?: string | null,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"reported_at"?: string | null,"sender_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_user_id_fkey"
      columns: ["sender_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_user_id_fkey"
      columns: ["sender_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_actions": {
                  Row: {
                    "action": string,"created_at": string,"id": string,"moderator_id": string,"reason": string,"report_id": string
                  }
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: string,"moderator_id": string,"reason": string,"report_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: string,"moderator_id"?: string,"reason"?: string,"report_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_actions_moderator_id_fkey"
      columns: ["moderator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_moderator_id_fkey"
      columns: ["moderator_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "moderation_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_reports": {
                  Row: {
                    "assigned_to": string | null,"category": string,"created_at": string,"description": string | null,"id": string,"reporter_id": string,"shared_message_excerpt": string | null,"status": string,"target_id": string,"target_type": string,"updated_at": string
                  }
                  Insert: {
                    "assigned_to"?: string | null,"category": string,"created_at"?: string,"description"?: string | null,"id"?: string,"reporter_id": string,"shared_message_excerpt"?: string | null,"status": string,"target_id": string,"target_type": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"category"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"reporter_id"?: string,"shared_message_excerpt"?: string | null,"status"?: string,"target_id"?: string,"target_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_reports_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_reports_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "email": boolean,"in_app": boolean,"push": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "email"?: boolean,"in_app"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email"?: boolean,"in_app"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"email_sent_at": string | null,"id": string,"link": string | null,"push_sent_at": string | null,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"email_sent_at"?: string | null,"id"?: string,"link"?: string | null,"push_sent_at"?: string | null,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"email_sent_at"?: string | null,"id"?: string,"link"?: string | null,"push_sent_at"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_connections": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"id": string,"recipient_id": string,"requester_id": string,"status": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"recipient_id": string,"requester_id": string,"status": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"recipient_id"?: string,"requester_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_connections_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_connections_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_connections_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_connections_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_priorities": {
                  Row: {
                    "created_at": string,"created_by": string,"description": string,"id": string,"organization_id": string,"position": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"organization_id": string,"position": number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"organization_id"?: string,"position"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_priorities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_priorities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_priorities_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_relations": {
                  Row: {
                    "child_id": string,"created_at": string,"id": string,"parent_id": string,"relation_type": string
                  }
                  Insert: {
                    "child_id": string,"created_at"?: string,"id"?: string,"parent_id": string,"relation_type": string
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"id"?: string,"parent_id"?: string,"relation_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_relations_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_relations_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "bio": string | null,"contact_email": string | null,"contact_phone": string | null,"county": string,"cover_image_path": string | null,"created_at": string,"deactivation_reason": string | null,"default_cover_image_path": string | null,"default_profile_image_path": string | null,"external_id": string | null,"id": string,"image_locked": boolean,"is_placeholder": boolean,"local_board_id": string | null,"name": string,"organization_number": string | null,"priorities_heading": string | null,"profile_image_path": string | null,"school_level": string | null,"school_name": string | null,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["organization_status"],"student_count": number | null,"type": Database["public"]['Enums']["organization_type"],"updated_at": string
                  }
                  Insert: {
                    "bio"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"county": string,"cover_image_path"?: string | null,"created_at"?: string,"deactivation_reason"?: string | null,"default_cover_image_path"?: string | null,"default_profile_image_path"?: string | null,"external_id"?: string | null,"id"?: string,"image_locked"?: boolean,"is_placeholder"?: boolean,"local_board_id"?: string | null,"name": string,"organization_number"?: string | null,"priorities_heading"?: string | null,"profile_image_path"?: string | null,"school_level"?: string | null,"school_name"?: string | null,"search_vector"?: never,"slug": string,"status"?: Database["public"]['Enums']["organization_status"],"student_count"?: number | null,"type": Database["public"]['Enums']["organization_type"],"updated_at"?: string
                  }
                  Update: {
                    "bio"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"county"?: string,"cover_image_path"?: string | null,"created_at"?: string,"deactivation_reason"?: string | null,"default_cover_image_path"?: string | null,"default_profile_image_path"?: string | null,"external_id"?: string | null,"id"?: string,"image_locked"?: boolean,"is_placeholder"?: boolean,"local_board_id"?: string | null,"name"?: string,"organization_number"?: string | null,"priorities_heading"?: string | null,"profile_image_path"?: string | null,"school_level"?: string | null,"school_name"?: string | null,"search_vector"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["organization_status"],"student_count"?: number | null,"type"?: Database["public"]['Enums']["organization_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_local_board_fk"
      columns: ["local_board_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_options": {
                  Row: {
                    "id": string,"label": string,"poll_id": string,"position": number
                  }
                  Insert: {
                    "id"?: string,"label": string,"poll_id": string,"position": number
                  }
                  Update: {
                    "id"?: string,"label"?: string,"poll_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_options_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    }
                  ]
                },"poll_votes": {
                  Row: {
                    "actor_user_id": string,"option_id": string,"organization_id": string,"poll_id": string,"updated_at": string
                  }
                  Insert: {
                    "actor_user_id": string,"option_id": string,"organization_id": string,"poll_id": string,"updated_at"?: string
                  }
                  Update: {
                    "actor_user_id"?: string,"option_id"?: string,"organization_id"?: string,"poll_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "poll_votes_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_votes_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_votes_option_id_fkey"
      columns: ["option_id"]
isOneToOne: false
      referencedRelation: "poll_options"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_votes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "poll_votes_poll_id_fkey"
      columns: ["poll_id"]
isOneToOne: false
      referencedRelation: "polls"
      referencedColumns: ["id"]
    }
                  ]
                },"polls": {
                  Row: {
                    "closes_at": string | null,"id": string,"post_id": string,"question": string,"results_visibility": string
                  }
                  Insert: {
                    "closes_at"?: string | null,"id"?: string,"post_id": string,"question": string,"results_visibility"?: string
                  }
                  Update: {
                    "closes_at"?: string | null,"id"?: string,"post_id"?: string,"question"?: string,"results_visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "polls_post_id_fkey"
      columns: ["post_id"]
isOneToOne: true
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "alt_text": string | null,"byte_size": number,"created_at": string,"duration_seconds": number | null,"height": number | null,"id": string,"is_placeholder": boolean,"media_type": string,"mime_type": string,"post_id": string,"processing_status": string,"storage_path": string,"thumbnail_path": string | null,"width": number | null
                  }
                  Insert: {
                    "alt_text"?: string | null,"byte_size": number,"created_at"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"is_placeholder"?: boolean,"media_type": string,"mime_type": string,"post_id": string,"processing_status": string,"storage_path": string,"thumbnail_path"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"byte_size"?: number,"created_at"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"is_placeholder"?: boolean,"media_type"?: string,"mime_type"?: string,"post_id"?: string,"processing_status"?: string,"storage_path"?: string,"thumbnail_path"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_revisions": {
                  Row: {
                    "audience": Database["public"]['Enums']["audience_type"],"body": string,"created_at": string,"edited_by": string | null,"id": string,"post_id": string,"school_level_target": string
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["audience_type"],"body": string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"post_id": string,"school_level_target": string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["audience_type"],"body"?: string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"post_id"?: string,"school_level_target"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_revisions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_revisions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_revisions_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"post_tags": {
                  Row: {
                    "post_id": string,"tag_id": string
                  }
                  Insert: {
                    "post_id": string,"tag_id": string
                  }
                  Update: {
                    "post_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_tags_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "actor_user_id": string,"audience": Database["public"]['Enums']["audience_type"],"body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"moderation_status": Database["public"]['Enums']["moderation_status"],"organization_id": string,"priority": boolean,"published_at": string | null,"school_level_target": string,"search_vector": unknown,"status": Database["public"]['Enums']["content_status"],"updated_at": string
                  }
                  Insert: {
                    "actor_user_id": string,"audience"?: Database["public"]['Enums']["audience_type"],"body": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id": string,"priority"?: boolean,"published_at"?: string | null,"school_level_target"?: string,"search_vector"?: never,"status"?: Database["public"]['Enums']["content_status"],"updated_at"?: string
                  }
                  Update: {
                    "actor_user_id"?: string,"audience"?: Database["public"]['Enums']["audience_type"],"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"organization_id"?: string,"priority"?: boolean,"published_at"?: string | null,"school_level_target"?: string,"search_vector"?: never,"status"?: Database["public"]['Enums']["content_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_school_history": {
                  Row: {
                    "ended_at": string | null,"id": string,"school_id": string,"started_at": string,"user_id": string
                  }
                  Insert: {
                    "ended_at"?: string | null,"id"?: string,"school_id": string,"started_at"?: string,"user_id": string
                  }
                  Update: {
                    "ended_at"?: string | null,"id"?: string,"school_id"?: string,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_school_history_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_school_history_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_school_history_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active_membership_id": string | null,"avatar_path": string | null,"created_at": string,"current_school_id": string | null,"deactivated_by_user": boolean,"display_name": string,"email": string,"id": string,"status": Database["public"]['Enums']["organization_status"],"updated_at": string
                  }
                  Insert: {
                    "active_membership_id"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"current_school_id"?: string | null,"deactivated_by_user"?: boolean,"display_name": string,"email": string,"id": string,"status"?: Database["public"]['Enums']["organization_status"],"updated_at"?: string
                  }
                  Update: {
                    "active_membership_id"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"current_school_id"?: string | null,"deactivated_by_user"?: boolean,"display_name"?: string,"email"?: string,"id"?: string,"status"?: Database["public"]['Enums']["organization_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_active_membership_fk"
      columns: ["active_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_school_fk"
      columns: ["current_school_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"reactions": {
                  Row: {
                    "created_at": string,"post_id": string,"reaction": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": string,"reaction"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"reaction"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reactions_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_grants": {
                  Row: {
                    "accepted_at": string | null,"end_date": string | null,"granted_at": string,"granted_by": string,"id": string,"membership_id": string | null,"organization_id": string,"revoked_at": string | null,"revoked_by": string | null,"role": Database["public"]['Enums']["admin_role"],"start_date": string,"status": Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"end_date"?: string | null,"granted_at"?: string,"granted_by": string,"id"?: string,"membership_id"?: string | null,"organization_id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role": Database["public"]['Enums']["admin_role"],"start_date": string,"status"?: Database["public"]['Enums']["membership_status"],"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"end_date"?: string | null,"granted_at"?: string,"granted_by"?: string,"id"?: string,"membership_id"?: string | null,"organization_id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: Database["public"]['Enums']["admin_role"],"start_date"?: string,"status"?: Database["public"]['Enums']["membership_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "role_grants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"school_admin_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"id": string,"message": string | null,"school_id": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"message"?: string | null,"school_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"message"?: string | null,"school_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_admin_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "school_admin_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "school_admin_requests_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "school_admin_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "school_admin_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "id": string,"label": string,"slug": string
                  }
                  Insert: {
                    "id"?: string,"label": string,"slug": string
                  }
                  Update: {
                    "id"?: string,"label"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_profiles": {
                  Row: {
                    "avatar_path": string | null,"current_school_id": string | null,"display_name": string | null,"id": string | null,"status": Database["public"]['Enums']["organization_status"] | null
                  }
                  Insert: {
                           "avatar_path"?: string | null,"current_school_id"?: string | null,"display_name"?: string | null,"id"?: string | null,"status"?: Database["public"]['Enums']["organization_status"] | null
                         }
                        Update: {
                           "avatar_path"?: string | null,"current_school_id"?: string | null,"display_name"?: string | null,"id"?: string | null,"status"?: Database["public"]['Enums']["organization_status"] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "profiles_school_fk"
      columns: ["current_school_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_comment":
{ Args: { "p_body": string,"p_organization": string,"p_post": string }; Returns: {
              "actor_user_id": string,
"body": string,
"created_at": string,
"deleted_at": string | null,
"id": string,
"moderation_status": Database["public"]['Enums']["moderation_status"],
"organization_id": string,
"post_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "comments"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_conversation_members":
{ Args: { "p_conversation": string,"p_members": (string)[] }; Returns: undefined
                           },
"apply_moderation_action":
{ Args: { "p_action": string,"p_reason": string,"p_report": string }; Returns: undefined
                           },
"apply_school_import":
{ Args: { "p_batch": string }; Returns: Json
                           },
"assign_public_office":
{ Args: { "p_org": string,"p_starts"?: string,"p_title": string,"p_user": string }; Returns: string
                           },
"assign_role":
{ Args: { "p_ends"?: string,"p_org": string,"p_role": Database["public"]['Enums']["admin_role"],"p_starts": string,"p_user": string }; Returns: string
                           },
"block_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"can_grant_role":
{ Args: { "p_org": string,"p_role": Database["public"]['Enums']["admin_role"] }; Returns: boolean
                           },
"can_view_message":
{ Args: { "p_message": string,"p_user"?: string }; Returns: boolean
                           },
"can_view_post":
{ Args: { "p": Database["public"]['Tables']["posts"]['Row'],"p_user"?: string }; Returns: boolean
                           },
"cancel_school_admin_request":
{ Args: { "p_request": string }; Returns: undefined
                           },
"cast_organization_vote":
{ Args: { "p_option_id": string,"p_organization_id": string,"p_poll_id": string }; Returns: undefined
                           },
"change_school":
{ Args: { "p_school": string }; Returns: undefined
                           },
"check_conversation_rate_limit":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"complete_handover":
{ Args: { "p_handover": string }; Returns: undefined
                           },
"complete_onboarding":
{ Args: { "p_display_name": string,"p_next_election"?: string,"p_school": string }; Returns: undefined
                           },
"confirm_event_attendance":
{ Args: { "p_attended": boolean,"p_delegate": string }; Returns: undefined
                           },
"create_group_conversation":
{ Args: { "p_members": (string)[],"p_name": string }; Returns: string
                           },
"create_organization_group":
{ Args: { "p_org": string }; Returns: string
                           },
"deactivate_school":
{ Args: { "p_reason": string,"p_school": string }; Returns: undefined
                           },
"decide_school_admin_request":
{ Args: { "p_approve": boolean,"p_reason"?: string,"p_request": string }; Returns: undefined
                           },
"edit_post":
{ Args: { "p_audience": Database["public"]['Enums']["audience_type"],"p_body": string,"p_post": string,"p_school_level_target"?: string }; Returns: {
              "actor_user_id": string,
"audience": Database["public"]['Enums']["audience_type"],
"body": string,
"created_at": string,
"deleted_at": string | null,
"edited_at": string | null,
"id": string,
"moderation_status": Database["public"]['Enums']["moderation_status"],
"organization_id": string,
"priority": boolean,
"published_at": string | null,
"school_level_target": string,
"search_vector": unknown,
"status": Database["public"]['Enums']["content_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "posts"
        isOneToOne: true
        isSetofReturn: false
      } },
"end_public_office":
{ Args: { "p_membership": string }; Returns: undefined
                           },
"get_conversation_messages":
{ Args: { "p_before"?: string,"p_conversation": string,"p_limit"?: number }; Returns: {
              "attachments": Json,"body": string,"created_at": string,"id": string,"mine": boolean,"read_by": number,"sender_name": string,"sender_user_id": string
            }[]
                           },
"get_event_engagement":
{ Args: { "p_event": string }; Returns: {
              "interested": number,"registered": number
            }[]
                           },
"get_message_settings":
{ Args: Record<PropertyKey, never>; Returns: {
              "read_receipts": boolean
            }[]
                           },
"get_my_roles":
{ Args: Record<PropertyKey, never>; Returns: {
              "end_date": string,"id": string,"kind": string,"organization_id": string,"organization_name": string,"organization_status": Database["public"]['Enums']["organization_status"],"role": Database["public"]['Enums']["admin_role"],"start_date": string,"status": Database["public"]['Enums']["membership_status"],"title": string
            }[]
                           },
"get_my_school_history":
{ Args: Record<PropertyKey, never>; Returns: {
              "county": string,"ended_at": string,"school_id": string,"school_name": string,"started_at": string
            }[]
                           },
"get_my_session":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_post_cards":
{ Args: { "p_limit"?: number,"p_mode"?: string,"p_organization"?: string,"p_representation_id"?: string }; Returns: {
              "actor_name": string,"actor_title": string,"audience": Database["public"]['Enums']["audience_type"],"body": string,"comment_count": number,"comments": Json,"edited": boolean,"id": string,"organization_id": string,"organization_name": string,"poll": Json,"priority": boolean,"published_at": string,"support_count": number,"supported": boolean
            }[]
                           },
"get_public_officers":
{ Args: { "p_organization": string }; Returns: {
              "display_name": string,"membership_id": string,"public_title": string
            }[]
                           },
"get_public_organization":
{ Args: { "p_org": string }; Returns: {
              "bio": string,"contact_email": string,"county": string,"follower_count": number,"following": boolean,"id": string,"local_board_id": string,"local_board_name": string,"member_count": number,"name": string,"officer_count": number,"priorities": Json,"priorities_heading": string,"school_level": string,"school_name": string,"slug": string,"status": Database["public"]['Enums']["organization_status"],"student_count": number,"type": Database["public"]['Enums']["organization_type"]
            }[]
                           },
"get_ranked_feed":
{ Args: { "p_mode"?: string,"p_representation_id": string }; Returns: {
              "post_id": string,"score": number
            }[]
                           },
"has_active_membership":
{ Args: { "p_org": string,"p_user"?: string }; Returns: boolean
                           },
"has_area_role":
{ Args: { "p_org": string,"p_user"?: string }; Returns: boolean
                           },
"has_role":
{ Args: { "p_org": string,"p_roles": (Database["public"]['Enums']["admin_role"])[],"p_user"?: string }; Returns: boolean
                           },
"hide_message":
{ Args: { "p_message": string }; Returns: undefined
                           },
"is_active_user":
{ Args: { "p_user"?: string }; Returns: boolean
                           },
"is_area_board_admin":
{ Args: { "p_school": string }; Returns: boolean
                           },
"is_blocked_between":
{ Args: { "p_a": string,"p_b": string }; Returns: boolean
                           },
"is_conversation_member":
{ Args: { "p_conversation": string,"p_user"?: string }; Returns: boolean
                           },
"leave_conversation":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"list_assignable_people":
{ Args: { "p_org": string,"p_query"?: string }; Returns: {
              "display_name": string,"id": string,"school_name": string
            }[]
                           },
"list_audit_log":
{ Args: { "p_limit"?: number,"p_org": string }; Returns: {
              "action": string,"actor_name": string,"created_at": string,"details": Json,"id": number,"subject_name": string
            }[]
                           },
"list_conversation_members":
{ Args: { "p_conversation": string }; Returns: {
              "display_name": string,"is_admin": boolean,"me": boolean,"school_name": string,"user_id": string
            }[]
                           },
"list_my_admin_organizations":
{ Args: Record<PropertyKey, never>; Returns: {
              "county": string,"grantable_roles": (Database["public"]['Enums']["admin_role"])[],"id": string,"my_role": Database["public"]['Enums']["admin_role"],"name": string,"school_name": string,"status": Database["public"]['Enums']["organization_status"],"type": Database["public"]['Enums']["organization_type"]
            }[]
                           },
"list_my_blocks":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"display_name": string,"user_id": string
            }[]
                           },
"list_my_conversations":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"is_admin": boolean,"kind": string,"last_message_at": string,"last_message_body": string,"last_message_has_attachment": boolean,"last_message_mine": boolean,"member_count": number,"muted": boolean,"name": string,"organization_id": string,"other_user_id": string,"unread_count": number
            }[]
                           },
"list_organization_contacts":
{ Args: { "p_org": string }; Returns: {
              "display_name": string,"me": boolean,"public_title": string,"user_id": string
            }[]
                           },
"list_organization_roles":
{ Args: { "p_org": string }; Returns: {
              "can_change": boolean,"display_name": string,"end_date": string,"granted_at": string,"granted_by_name": string,"id": string,"kind": string,"role": Database["public"]['Enums']["admin_role"],"start_date": string,"status": Database["public"]['Enums']["membership_status"],"title": string,"user_active": boolean,"user_id": string
            }[]
                           },
"list_public_events":
{ Args: Record<PropertyKey, never>; Returns: {
              "audience": Database["public"]['Enums']["audience_type"],"capacity": number,"category": string,"description": string,"digital": boolean,"ends_at": string,"id": string,"interested": number,"organizer_id": string,"organizer_name": string,"place": string,"price_label": string,"registered": number,"registration_deadline": string,"seats_per_organization": number,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"summary": string,"title": string
            }[]
                           },
"list_public_organizations":
{ Args: Record<PropertyKey, never>; Returns: {
              "bio": string,"contact_email": string,"county": string,"follower_count": number,"following": boolean,"id": string,"local_board_id": string,"local_board_name": string,"member_count": number,"name": string,"officer_count": number,"priorities": Json,"priorities_heading": string,"school_level": string,"school_name": string,"slug": string,"status": Database["public"]['Enums']["organization_status"],"student_count": number,"type": Database["public"]['Enums']["organization_type"]
            }[]
                           },
"list_school_admin_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "can_decide": boolean,"created_at": string,"decided_at": string,"decision_reason": string,"display_name": string,"id": string,"message": string,"mine": boolean,"school_id": string,"school_name": string,"status": string,"user_id": string
            }[]
                           },
"mark_conversation_read":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"publish_post":
{ Args: { "p_audience": Database["public"]['Enums']["audience_type"],"p_body": string,"p_organization_id": string,"p_school_level_target"?: string,"p_status": Database["public"]['Enums']["content_status"] }; Returns: {
              "actor_user_id": string,
"audience": Database["public"]['Enums']["audience_type"],
"body": string,
"created_at": string,
"deleted_at": string | null,
"edited_at": string | null,
"id": string,
"moderation_status": Database["public"]['Enums']["moderation_status"],
"organization_id": string,
"priority": boolean,
"published_at": string | null,
"school_level_target": string,
"search_vector": unknown,
"status": Database["public"]['Enums']["content_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "posts"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_message":
{ Args: { "p_category": string,"p_description"?: string,"p_message": string }; Returns: string
                           },
"request_personal_data":
{ Args: { "p_kind": string }; Returns: string
                           },
"request_school_admin":
{ Args: { "p_message"?: string,"p_school": string }; Returns: string
                           },
"resolve_organization_images":
{ Args: { "p_org": string }; Returns: {
              "cover_image_path": string,"cover_image_source": string,"profile_image_path": string,"profile_image_source": string
            }[]
                           },
"revoke_role":
{ Args: { "p_grant": string }; Returns: undefined
                           },
"role_fits_organization":
{ Args: { "p_org": string,"p_role": Database["public"]['Enums']["admin_role"] }; Returns: boolean
                           },
"search":
{ Args: { "p_include_former"?: boolean,"p_kinds"?: (string)[],"p_limit"?: number,"p_query": string }; Returns: {
              "id": string,"kind": string,"organization_id": string,"rank": number,"subtitle": string,"title": string
            }[]
                           },
"search_message_recipients":
{ Args: { "p_query": string }; Returns: {
              "detail": string,"id": string,"kind": string,"name": string,"organization_type": Database["public"]['Enums']["organization_type"]
            }[]
                           },
"search_tsquery":
{ Args: { "p_config": unknown,"p_query": string }; Returns: unknown
                           },
"send_message":
{ Args: { "p_attachments"?: Json,"p_body": string,"p_conversation": string }; Returns: {
              "created_at": string,"id": string
            }[]
                           },
"set_active_representation":
{ Args: { "p_membership_id": string }; Returns: undefined
                           },
"set_avatar":
{ Args: { "p_path"?: string }; Returns: string
                           },
"set_conversation_muted":
{ Args: { "p_conversation": string,"p_muted": boolean }; Returns: undefined
                           },
"set_event_response":
{ Args: { "p_event": string,"p_organization": string,"p_response": string }; Returns: undefined
                           },
"set_read_receipts":
{ Args: { "p_enabled": boolean }; Returns: undefined
                           },
"start_direct_conversation":
{ Args: { "p_user": string }; Returns: string
                           },
"sync_managed_conversation":
{ Args: { "p_org": string }; Returns: undefined
                           },
"sync_my_managed_conversations":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"unblock_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"update_profile":
{ Args: { "p_display_name": string }; Returns: undefined
                           }
          }
          Enums: {
            "admin_role": "super_admin"|"board_admin"|"school_admin"|"content_manager","audience_type": "public"|"county"|"local"|"friends","content_status": "draft"|"published"|"deleted","event_status": "draft"|"published"|"cancelled"|"completed","membership_status": "invited"|"active"|"ended"|"revoked","moderation_status": "pending"|"visible"|"hidden"|"removed","organization_status": "active"|"deactivated"|"archived","organization_type": "national"|"county_board"|"local_board"|"school"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "admin_role": ["super_admin", "board_admin", "school_admin", "content_manager"],"audience_type": ["public", "county", "local", "friends"],"content_status": ["draft", "published", "deleted"],"event_status": ["draft", "published", "cancelled", "completed"],"membership_status": ["invited", "active", "ended", "revoked"],"moderation_status": ["pending", "visible", "hidden", "removed"],"organization_status": ["active", "deactivated", "archived"],"organization_type": ["national", "county_board", "local_board", "school"]
          }
        }
} as const

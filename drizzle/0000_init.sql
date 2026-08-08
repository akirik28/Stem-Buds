CREATE TYPE "public"."alert_severity" AS ENUM('info', 'yellow', 'red');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('new', 'investigating', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."alert_tab" AS ENUM('weekly', 'project', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('presidency', 'chapter_management', 'chapter_mentors');--> statement-breakpoint
CREATE TYPE "public"."complaint_category" AS ENUM('about_mentor', 'group_problem', 'student_behaviour', 'inappropriate_behaviour', 'communication_problem', 'about_chapter_head', 'program_organisation', 'other');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('new', 'investigating', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."contact_reason" AS ENUM('school_representative', 'mentor_candidate', 'student', 'information', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."feedback_category" AS ENUM('mentor', 'group', 'program', 'weekly_sessions', 'platform', 'other');--> statement-breakpoint
CREATE TYPE "public"."group_role" AS ENUM('mentor', 'student');--> statement-breakpoint
CREATE TYPE "public"."homework_status" AS ENUM('pending', 'done', 'not_done', 'excused');--> statement-breakpoint
CREATE TYPE "public"."meeting_attendance" AS ENUM('present', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."project_health" AS ENUM('on_track', 'attention', 'delayed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('regional_director', 'co_director', 'vice_president', 'chapter_head', 'mentor', 'student');--> statement-breakpoint
CREATE TYPE "public"."weekly_session_state" AS ENUM('scheduled', 'cancelled', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."confidential_scope" AS ENUM('chapter', 'executive');--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(32),
	"school" varchar(160),
	"grade_level" varchar(32),
	"notes" text,
	"publication_consent" boolean DEFAULT false NOT NULL,
	"publication_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(300),
	"ip_hash" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"notification_email" varchar(254),
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"password_changed_at" timestamp with time zone,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(32) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" varchar(160) NOT NULL,
	"city" varchar(80),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"public_description" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" NOT NULL,
	"is_team_leader" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"discipline_key" varchar(32) NOT NULL,
	"sequence" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"due_date" date,
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"completed_at" timestamp with time zone,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"short_description" text,
	"research_question" text,
	"purpose" text,
	"start_date" date,
	"health" "project_health" DEFAULT 'on_track' NOT NULL,
	"outcome_summary" text,
	"final_delivered" boolean DEFAULT false NOT NULL,
	"final_delivered_at" timestamp with time zone,
	"external_reference_url" varchar(500),
	"is_public" boolean DEFAULT false NOT NULL,
	"public_summary" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_session_id" uuid NOT NULL,
	"group_membership_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"recorded_by_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_session_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"no_homework" boolean DEFAULT false NOT NULL,
	"description" text,
	"due_date" date,
	"due_session_id" uuid,
	"created_by_id" uuid,
	"results_finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_assignments_description_or_none" CHECK (("homework_assignments"."no_homework" = true AND "homework_assignments"."description" IS NULL)
          OR ("homework_assignments"."no_homework" = false AND "homework_assignments"."description" IS NOT NULL
              AND length(btrim("homework_assignments"."description")) > 0))
);
--> statement-breakpoint
CREATE TABLE "homework_student_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"group_membership_id" uuid NOT NULL,
	"status" "homework_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"marked_by_id" uuid,
	"marked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"state" "weekly_session_state" DEFAULT 'scheduled' NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_work_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_session_id" uuid NOT NULL,
	"what_we_did" text,
	"outputs" text,
	"problems" text,
	"next_week_goal" text,
	"project_health" "project_health",
	"draft_author_id" uuid,
	"draft_submitted_at" timestamp with time zone,
	"attendance_finalized_at" timestamp with time zone,
	"attendance_finalized_by_id" uuid,
	"previous_homework_finalized_at" timestamp with time zone,
	"mentor_approved_at" timestamp with time zone,
	"mentor_approved_by_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"category" "complaint_category" NOT NULL,
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"reporter_user_id" uuid,
	"target_user_id" uuid,
	"scope" "confidential_scope" DEFAULT 'chapter' NOT NULL,
	"status" "complaint_status" DEFAULT 'new' NOT NULL,
	"assigned_to_id" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "continuous_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"group_id" uuid,
	"category" "feedback_category" NOT NULL,
	"message" text NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"reporter_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_membership_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"completed_session_threshold" integer NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"rating_mentor_guidance" integer NOT NULL,
	"rating_session_productivity" integer NOT NULL,
	"rating_support" integer NOT NULL,
	"rating_group_progress" integer NOT NULL,
	"most_useful" text,
	"want_changed" text,
	"chapter_head_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"description" text NOT NULL,
	"owner_id" uuid,
	"due_date" date,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_meeting_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "meeting_attendance" DEFAULT 'present' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"sequence" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"agenda" text,
	"discussion_topics" text,
	"group_evaluations" text,
	"decisions" text,
	"notes" text,
	"next_meeting_date" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_oversight" boolean DEFAULT false NOT NULL,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "channel_type" NOT NULL,
	"chapter_id" uuid,
	"name" varchar(160) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" varchar(400) NOT NULL,
	"is_image" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"parent_message_id" uuid,
	"is_announcement" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" varchar(160) NOT NULL,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" uuid,
	"target_label" varchar(200),
	"chapter_id" uuid,
	"academic_year_id" uuid,
	"before_data" jsonb,
	"after_data" jsonb,
	"correlation_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"template" varchar(64) NOT NULL,
	"recipient_email" varchar(254) NOT NULL,
	"recipient_user_id" uuid,
	"subject" varchar(300) NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"related_entity_type" varchar(64),
	"related_entity_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(200) NOT NULL,
	"tab" "alert_tab" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'new' NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"chapter_id" uuid,
	"group_id" uuid,
	"title" varchar(200) NOT NULL,
	"detail" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_resolvable" boolean DEFAULT true NOT NULL,
	"assigned_role_label" varchar(80),
	"assigned_to_id" uuid,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link_url" varchar(300),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"holiday_date" date NOT NULL,
	"reason" varchar(200) NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"weekly_day_of_week" integer,
	"weekly_start_minute" integer,
	"weekly_duration_minutes" integer DEFAULT 60 NOT NULL,
	"timezone" varchar(64) DEFAULT 'Europe/Istanbul' NOT NULL,
	"homework_email_reminders_enabled" boolean DEFAULT false NOT NULL,
	"attendance_yellow_threshold" integer DEFAULT 80 NOT NULL,
	"attendance_red_threshold" integer DEFAULT 65 NOT NULL,
	"consecutive_unexcused_absences" integer DEFAULT 2 NOT NULL,
	"homework_yellow_threshold" integer DEFAULT 70 NOT NULL,
	"homework_missed_of_last_three" integer DEFAULT 2 NOT NULL,
	"incomplete_record_hours" integer DEFAULT 24 NOT NULL,
	"feedback_minimum_responses" integer DEFAULT 3 NOT NULL,
	"feedback_average_attention_x10" integer DEFAULT 30 NOT NULL,
	"configured_at" timestamp with time zone,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_settings_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(32),
	"reason" "contact_reason" NOT NULL,
	"message" text NOT NULL,
	"ip_hash" varchar(128),
	"handled_at" timestamp with time zone,
	"handled_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_leadership_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" varchar(160) NOT NULL,
	"title" varchar(120) NOT NULL,
	"bio" text NOT NULL,
	"photo_media_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" varchar(400) NOT NULL,
	"alt_text" varchar(300) NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_news_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(250) NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"cover_media_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_key" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_memberships" ADD CONSTRAINT "chapter_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_memberships" ADD CONSTRAINT "chapter_memberships_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_memberships" ADD CONSTRAINT "chapter_memberships_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_weekly_session_id_weekly_sessions_id_fk" FOREIGN KEY ("weekly_session_id") REFERENCES "public"."weekly_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_group_membership_id_group_memberships_id_fk" FOREIGN KEY ("group_membership_id") REFERENCES "public"."group_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_weekly_session_id_weekly_sessions_id_fk" FOREIGN KEY ("weekly_session_id") REFERENCES "public"."weekly_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_due_session_id_weekly_sessions_id_fk" FOREIGN KEY ("due_session_id") REFERENCES "public"."weekly_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student_statuses" ADD CONSTRAINT "homework_student_statuses_assignment_id_homework_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."homework_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student_statuses" ADD CONSTRAINT "homework_student_statuses_group_membership_id_group_memberships_id_fk" FOREIGN KEY ("group_membership_id") REFERENCES "public"."group_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student_statuses" ADD CONSTRAINT "homework_student_statuses_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sessions" ADD CONSTRAINT "weekly_sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sessions" ADD CONSTRAINT "weekly_sessions_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD CONSTRAINT "weekly_work_logs_weekly_session_id_weekly_sessions_id_fk" FOREIGN KEY ("weekly_session_id") REFERENCES "public"."weekly_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD CONSTRAINT "weekly_work_logs_draft_author_id_users_id_fk" FOREIGN KEY ("draft_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD CONSTRAINT "weekly_work_logs_attendance_finalized_by_id_users_id_fk" FOREIGN KEY ("attendance_finalized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD CONSTRAINT "weekly_work_logs_mentor_approved_by_id_users_id_fk" FOREIGN KEY ("mentor_approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cycles" ADD CONSTRAINT "feedback_cycles_group_membership_id_group_memberships_id_fk" FOREIGN KEY ("group_membership_id") REFERENCES "public"."group_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cycles" ADD CONSTRAINT "feedback_cycles_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_cycle_id_feedback_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."feedback_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_meeting_id_mentor_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mentor_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_action_items" ADD CONSTRAINT "meeting_action_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meeting_attendance" ADD CONSTRAINT "mentor_meeting_attendance_meeting_id_mentor_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."mentor_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meeting_attendance" ADD CONSTRAINT "mentor_meeting_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_holidays" ADD CONSTRAINT "program_holidays_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_holidays" ADD CONSTRAINT "program_holidays_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_settings" ADD CONSTRAINT "program_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_highlights" ADD CONSTRAINT "public_highlights_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_leadership_profiles" ADD CONSTRAINT "public_leadership_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_media" ADD CONSTRAINT "public_media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_news_posts" ADD CONSTRAINT "public_news_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_label_unique" ON "academic_years" USING btree ("label");--> statement-breakpoint
CREATE INDEX "academic_years_is_active_idx" ON "academic_years" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_memberships_unique" ON "chapter_memberships" USING btree ("user_id","chapter_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "chapter_memberships_chapter_idx" ON "chapter_memberships" USING btree ("chapter_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "chapter_memberships_user_idx" ON "chapter_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_code_unique" ON "chapters" USING btree ("code");--> statement-breakpoint
CREATE INDEX "chapters_is_public_idx" ON "chapters" USING btree ("is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "group_memberships_group_user_unique" ON "group_memberships" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_memberships_user_idx" ON "group_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_memberships_group_role_idx" ON "group_memberships" USING btree ("group_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_chapter_year_name_unique" ON "groups" USING btree ("chapter_id","academic_year_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_chapter_year_discipline_sequence_unique" ON "groups" USING btree ("chapter_id","academic_year_id","discipline_key","sequence");--> statement-breakpoint
CREATE INDEX "groups_chapter_idx" ON "groups" USING btree ("chapter_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("project_id","order_index");--> statement-breakpoint
CREATE INDEX "milestones_due_date_idx" ON "milestones" USING btree ("due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_group_year_unique" ON "projects" USING btree ("group_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "projects_health_idx" ON "projects" USING btree ("health");--> statement-breakpoint
CREATE INDEX "projects_is_public_idx" ON "projects" USING btree ("is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_membership_unique" ON "attendance_records" USING btree ("weekly_session_id","group_membership_id");--> statement-breakpoint
CREATE INDEX "attendance_records_membership_idx" ON "attendance_records" USING btree ("group_membership_id");--> statement-breakpoint
CREATE INDEX "attendance_records_status_idx" ON "attendance_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_assignments_session_unique" ON "homework_assignments" USING btree ("weekly_session_id");--> statement-breakpoint
CREATE INDEX "homework_assignments_group_idx" ON "homework_assignments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "homework_assignments_due_session_idx" ON "homework_assignments" USING btree ("due_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_student_statuses_assignment_membership_unique" ON "homework_student_statuses" USING btree ("assignment_id","group_membership_id");--> statement-breakpoint
CREATE INDEX "homework_student_statuses_membership_idx" ON "homework_student_statuses" USING btree ("group_membership_id");--> statement-breakpoint
CREATE INDEX "homework_student_statuses_status_idx" ON "homework_student_statuses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_sessions_group_start_unique" ON "weekly_sessions" USING btree ("group_id","scheduled_start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_sessions_group_year_week_unique" ON "weekly_sessions" USING btree ("group_id","academic_year_id","week_number");--> statement-breakpoint
CREATE INDEX "weekly_sessions_start_idx" ON "weekly_sessions" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "weekly_sessions_year_idx" ON "weekly_sessions" USING btree ("academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_work_logs_session_unique" ON "weekly_work_logs" USING btree ("weekly_session_id");--> statement-breakpoint
CREATE INDEX "weekly_work_logs_completed_idx" ON "weekly_work_logs" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "complaints_chapter_status_idx" ON "complaints" USING btree ("chapter_id","status");--> statement-breakpoint
CREATE INDEX "complaints_scope_idx" ON "complaints" USING btree ("scope","status");--> statement-breakpoint
CREATE INDEX "complaints_target_idx" ON "complaints" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "continuous_feedback_chapter_idx" ON "continuous_feedback" USING btree ("chapter_id","created_at");--> statement-breakpoint
CREATE INDEX "continuous_feedback_reviewed_idx" ON "continuous_feedback" USING btree ("reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_cycles_membership_threshold_unique" ON "feedback_cycles" USING btree ("group_membership_id","completed_session_threshold");--> statement-breakpoint
CREATE INDEX "feedback_cycles_pending_idx" ON "feedback_cycles" USING btree ("responded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_responses_cycle_unique" ON "feedback_responses" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "meeting_action_items_meeting_idx" ON "meeting_action_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_action_items_due_idx" ON "meeting_action_items" USING btree ("due_date","is_completed");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_meeting_attendance_unique" ON "mentor_meeting_attendance" USING btree ("meeting_id","user_id");--> statement-breakpoint
CREATE INDEX "mentor_meetings_chapter_idx" ON "mentor_meetings" USING btree ("chapter_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_meetings_chapter_year_sequence_unique" ON "mentor_meetings" USING btree ("chapter_id","academic_year_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_memberships_channel_user_unique" ON "channel_memberships" USING btree ("channel_id","user_id");--> statement-breakpoint
CREATE INDEX "channel_memberships_user_idx" ON "channel_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_type_chapter_unique" ON "channels" USING btree ("type","chapter_id");--> statement-breakpoint
CREATE INDEX "channels_chapter_idx" ON "channels" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_mentions_unique" ON "message_mentions" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "message_mentions_user_idx" ON "message_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_channel_created_idx" ON "messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_parent_idx" ON "messages" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX "messages_pinned_idx" ON "messages" USING btree ("channel_id","is_pinned");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_chapter_idx" ON "audit_logs" USING btree ("chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_logs_idempotency_unique" ON "email_logs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "management_alerts_open_fingerprint_unique" ON "management_alerts" USING btree ("fingerprint") WHERE status in ('new', 'investigating');--> statement-breakpoint
CREATE INDEX "management_alerts_tab_status_idx" ON "management_alerts" USING btree ("tab","status");--> statement-breakpoint
CREATE INDEX "management_alerts_chapter_idx" ON "management_alerts" USING btree ("chapter_id","status");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "program_holidays_year_date_unique" ON "program_holidays" USING btree ("academic_year_id","holiday_date");--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_messages_handled_idx" ON "contact_messages" USING btree ("handled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_highlights_key_unique" ON "public_highlights" USING btree ("key");--> statement-breakpoint
CREATE INDEX "public_leadership_order_idx" ON "public_leadership_profiles" USING btree ("is_public","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "public_news_slug_unique" ON "public_news_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "public_news_published_idx" ON "public_news_posts" USING btree ("is_published","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_bucket_window_unique" ON "rate_limits" USING btree ("bucket_key","window_start");
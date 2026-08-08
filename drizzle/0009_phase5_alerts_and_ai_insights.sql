CREATE TYPE "public"."ai_insight_type" AS ENUM('weekly_summary', 'chapter_group_status', 'data_question', 'mentor_alert_explainer', 'advisor_group_summary');--> statement-breakpoint
CREATE TYPE "public"."ai_scope_type" AS ENUM('organization', 'program', 'chapter', 'mentor', 'group');--> statement-breakpoint
CREATE TYPE "public"."alert_category" AS ENUM('missing_weekly_record', 'attendance_risk', 'homework_risk', 'project_stale', 'project_blocked', 'milestone_overdue');--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_type" "ai_insight_type" NOT NULL,
	"scope_type" "ai_scope_type" NOT NULL,
	"scope_id" uuid,
	"program_id" uuid,
	"period_key" varchar(16),
	"context_hash" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"generated_by_user_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "management_alerts" ADD COLUMN "category" "alert_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_insights_identity_unique" ON "ai_insights" USING btree ("insight_type","scope_type","scope_id","program_id","period_key","context_hash");--> statement-breakpoint
CREATE INDEX "ai_insights_lookup_idx" ON "ai_insights" USING btree ("insight_type","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "management_alerts_category_status_idx" ON "management_alerts" USING btree ("category","status");
CREATE TYPE "public"."participation_level" AS ENUM('most_active', 'some_active', 'low');--> statement-breakpoint
CREATE TABLE "chapter_session_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"rooms_split_at" timestamp with time zone,
	"rooms_split_by_id" uuid,
	"head_absent_at" timestamp with time zone,
	"head_absent_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "meeting_url" varchar(500);--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD COLUMN "participation" "participation_level";--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD COLUMN "mentor_absent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekly_work_logs" ADD COLUMN "mentor_absent_note" text;--> statement-breakpoint
ALTER TABLE "chapter_session_runs" ADD CONSTRAINT "chapter_session_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_session_runs" ADD CONSTRAINT "chapter_session_runs_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_session_runs" ADD CONSTRAINT "chapter_session_runs_rooms_split_by_id_users_id_fk" FOREIGN KEY ("rooms_split_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_session_runs_unique" ON "chapter_session_runs" USING btree ("chapter_id","academic_year_id","week_number");
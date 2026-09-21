CREATE TYPE "public"."issue_level" AS ENUM('mentor', 'chapter_head', 'vice_president', 'executive');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "group_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"reported_by_id" uuid,
	"body" text NOT NULL,
	"level" "issue_level" DEFAULT 'mentor' NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"level_since" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
ALTER TABLE "group_issues" ADD CONSTRAINT "group_issues_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_issues" ADD CONSTRAINT "group_issues_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_issues" ADD CONSTRAINT "group_issues_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_issues_open_level_idx" ON "group_issues" USING btree ("status","level");--> statement-breakpoint
CREATE INDEX "group_issues_group_idx" ON "group_issues" USING btree ("group_id");
CREATE TYPE "public"."meeting_request_status" AS ENUM('approved', 'pending', 'declined');--> statement-breakpoint
ALTER TYPE "public"."alert_category" ADD VALUE 'chapter_meeting_overdue';--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "meeting_url" varchar(500);--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "request_status" "meeting_request_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "requested_by_id" uuid;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "request_note" text;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "decided_by_id" uuid;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_meetings_request_status_idx" ON "mentor_meetings" USING btree ("request_status","chapter_id");
CREATE TYPE "public"."program_delivery_mode" AS ENUM('online', 'in_person', 'hybrid');--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"short_name" varchar(60) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "program_holidays" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "program_settings" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "program_settings" ADD COLUMN "delivery_mode" "program_delivery_mode";--> statement-breakpoint
ALTER TABLE "program_settings" ADD COLUMN "cycle_length_weeks" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_key_unique" ON "programs" USING btree ("key");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_holidays" ADD CONSTRAINT "program_holidays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_settings" ADD CONSTRAINT "program_settings_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_program_idx" ON "chapters" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_id_program_unique" ON "chapters" USING btree ("id","program_id");--> statement-breakpoint
CREATE INDEX "groups_program_idx" ON "groups" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_id_program_unique" ON "groups" USING btree ("id","program_id");--> statement-breakpoint
CREATE INDEX "management_alerts_program_idx" ON "management_alerts" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "program_holidays_program_idx" ON "program_holidays" USING btree ("program_id");
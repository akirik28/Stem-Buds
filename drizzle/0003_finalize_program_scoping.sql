ALTER TABLE "program_settings" DROP CONSTRAINT "program_settings_singleton_unique";--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "management_alerts" DROP CONSTRAINT "management_alerts_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "management_alerts" DROP CONSTRAINT "management_alerts_group_id_groups_id_fk";
--> statement-breakpoint
DROP INDEX "program_holidays_year_date_unique";--> statement-breakpoint
ALTER TABLE "program_settings" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "program_settings" ALTER COLUMN "weekly_duration_minutes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "program_settings" ALTER COLUMN "weekly_duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "management_alerts" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "program_holidays" ALTER COLUMN "program_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_chapter_id_program_id_chapters_fk" FOREIGN KEY ("chapter_id","program_id") REFERENCES "public"."chapters"("id","program_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_chapter_id_program_id_chapters_fk" FOREIGN KEY ("chapter_id","program_id") REFERENCES "public"."chapters"("id","program_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_alerts" ADD CONSTRAINT "management_alerts_group_id_program_id_groups_fk" FOREIGN KEY ("group_id","program_id") REFERENCES "public"."groups"("id","program_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_holidays_program_year_date_unique" ON "program_holidays" USING btree ("program_id","academic_year_id","holiday_date");--> statement-breakpoint
ALTER TABLE "program_settings" DROP COLUMN "singleton";--> statement-breakpoint
ALTER TABLE "program_settings" ADD CONSTRAINT "program_settings_program_id_unique" UNIQUE("program_id");
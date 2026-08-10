ALTER TABLE "chapter_memberships" DROP CONSTRAINT "chapter_memberships_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_memberships" DROP CONSTRAINT "chapter_memberships_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_program_id_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_program_id_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "groups" DROP CONSTRAINT "groups_chapter_id_program_id_chapters_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "weekly_sessions" DROP CONSTRAINT "weekly_sessions_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "complaints" DROP CONSTRAINT "complaints_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "complaints" DROP CONSTRAINT "complaints_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "continuous_feedback" DROP CONSTRAINT "continuous_feedback_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "continuous_feedback" DROP CONSTRAINT "continuous_feedback_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "feedback_cycles" DROP CONSTRAINT "feedback_cycles_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "mentor_meetings" DROP CONSTRAINT "mentor_meetings_academic_year_id_academic_years_id_fk";
--> statement-breakpoint
ALTER TABLE "chapter_memberships" ADD CONSTRAINT "chapter_memberships_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_memberships" ADD CONSTRAINT "chapter_memberships_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_chapter_id_program_id_chapters_fk" FOREIGN KEY ("chapter_id","program_id") REFERENCES "public"."chapters"("id","program_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sessions" ADD CONSTRAINT "weekly_sessions_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuous_feedback" ADD CONSTRAINT "continuous_feedback_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_cycles" ADD CONSTRAINT "feedback_cycles_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
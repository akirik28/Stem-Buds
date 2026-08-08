ALTER TABLE "mentor_meetings" ALTER COLUMN "chapter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "mentor_meetings" ADD CONSTRAINT "mentor_meetings_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_meetings_program_idx" ON "mentor_meetings" USING btree ("program_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_meetings_program_year_sequence_unique" ON "mentor_meetings" USING btree ("program_id","academic_year_id","sequence") WHERE "mentor_meetings"."program_id" is not null;
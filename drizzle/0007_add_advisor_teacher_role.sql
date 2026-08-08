ALTER TYPE "public"."user_role" ADD VALUE 'advisor_teacher';--> statement-breakpoint
CREATE TABLE "advisor_program_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advisor_program_scopes" ADD CONSTRAINT "advisor_program_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_program_scopes" ADD CONSTRAINT "advisor_program_scopes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_program_scopes_user_program_unique" ON "advisor_program_scopes" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "advisor_program_scopes_program_idx" ON "advisor_program_scopes" USING btree ("program_id");
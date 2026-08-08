ALTER TYPE "public"."channel_type" ADD VALUE 'group';--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "mentor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_mentor_idx" ON "groups" USING btree ("mentor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_type_group_unique" ON "channels" USING btree ("type","group_id");--> statement-breakpoint
CREATE INDEX "channels_group_idx" ON "channels" USING btree ("group_id");
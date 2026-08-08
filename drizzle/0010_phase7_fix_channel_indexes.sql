DROP INDEX "channels_type_chapter_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "channels_org_singleton_unique" ON "channels" USING btree ("type") WHERE "channels"."type" in ('presidency', 'chapter_management');--> statement-breakpoint
CREATE UNIQUE INDEX "channels_chapter_mentors_unique" ON "channels" USING btree ("chapter_id") WHERE "channels"."type" = 'chapter_mentors';
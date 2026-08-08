-- Removes the "co_director" role: Ada Sarp Kırık and Hande Özcan are BOTH
-- Regional Directors with fully equal authority, not a director + a
-- subordinate co-director. Any existing row still carrying "co_director" is
-- remapped to "regional_director" before the enum value is dropped, so no
-- account or membership is lost or left in an invalid state.
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "chapter_memberships" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "users" SET "role" = 'regional_director' WHERE "role" = 'co_director';--> statement-breakpoint
UPDATE "chapter_memberships" SET "role" = 'regional_director' WHERE "role" = 'co_director';--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('regional_director', 'vice_president', 'chapter_head', 'mentor', 'student');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "chapter_memberships" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";

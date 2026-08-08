-- Data-preserving backfill for the Program A / Program B (Online Ortaokul
-- Programı / BİLSEM Programı) domain layer.
--
-- Every table that gained a nullable `program_id` column in
-- 0001_add_programs_additive.sql is backfilled here to the Online Ortaokul
-- Programı. That mapping is not a guess: until this migration, the platform
-- served exactly one program, so every chapter/group/alert/holiday/settings
-- row that already existed was, by definition, Online Ortaokul Programı data.
-- BİLSEM Programı starts with zero chapters, exactly as it should — nothing
-- is assigned to it here.
--
-- Idempotent: every statement only touches rows where `program_id IS NULL`,
-- so re-running this migration (e.g. after a partial failure) is a safe no-op
-- on rows already backfilled.

INSERT INTO "programs" ("key", "name", "short_name", "description")
VALUES
  (
    'online_middle_school',
    'Online Ortaokul Programı',
    'Online Ortaokul',
    'Ortaokul öğrencilerini lise öğrencisi mentorlarla buluşturan, tamamen çevrimiçi, haftalık tek oturumluk mentorluk ve proje programı.'
  ),
  (
    'bilsem',
    'BİLSEM Programı',
    'BİLSEM',
    'BİLSEM iş birliği kapsamında yürütülen, final konferansıyla sonuçlanan program.'
  )
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- Chapters: every pre-existing chapter was Online Ortaokul Programı data.
UPDATE "chapters"
SET "program_id" = (SELECT "id" FROM "programs" WHERE "key" = 'online_middle_school')
WHERE "program_id" IS NULL;
--> statement-breakpoint

-- Groups: inherit their parent chapter's program (which is Online Ortaokul
-- Programı for every pre-existing chapter, per the statement above).
UPDATE "groups" AS g
SET "program_id" = c."program_id"
FROM "chapters" AS c
WHERE g."chapter_id" = c."id"
  AND g."program_id" IS NULL;
--> statement-breakpoint

-- Management alerts: prefer the program of the alert's group, then its
-- chapter, then fall back to Online Ortaokul Programı for any alert that
-- somehow carries neither (defensive — none should exist pre-migration).
UPDATE "management_alerts" AS a
SET "program_id" = COALESCE(
  (SELECT g."program_id" FROM "groups" AS g WHERE g."id" = a."group_id"),
  (SELECT c."program_id" FROM "chapters" AS c WHERE c."id" = a."chapter_id"),
  (SELECT "id" FROM "programs" WHERE "key" = 'online_middle_school')
)
WHERE a."program_id" IS NULL;
--> statement-breakpoint

-- Program-wide holidays previously applied organization-wide, i.e. to the
-- only program that existed.
UPDATE "program_holidays"
SET "program_id" = (SELECT "id" FROM "programs" WHERE "key" = 'online_middle_school')
WHERE "program_id" IS NULL;
--> statement-breakpoint

-- The legacy global settings singleton (at most one row, enforced by its own
-- unique constraint) becomes the Online Ortaokul Programı's settings row —
-- its configured schedule and thresholds, if any were ever set, are kept
-- exactly as they were.
UPDATE "program_settings"
SET "program_id" = (SELECT "id" FROM "programs" WHERE "key" = 'online_middle_school')
WHERE "program_id" IS NULL;

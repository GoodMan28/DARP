ALTER TABLE "users" ADD COLUMN "name_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "middle_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "orcid" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "orcid_check" jsonb;--> statement-breakpoint
-- Accounts made before names had parts keep their whole name as the first name until IQAC edits them.
UPDATE "users" SET "first_name" = "name" WHERE "first_name" = '';

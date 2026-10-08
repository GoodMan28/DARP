ALTER TABLE "journal_index_listings" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_metrics" ADD COLUMN "source" text DEFAULT 'scimago' NOT NULL;
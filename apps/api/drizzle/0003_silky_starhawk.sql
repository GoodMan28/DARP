CREATE TABLE "journal_coverage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"issn" text NOT NULL,
	"source" text NOT NULL,
	"from_year" integer NOT NULL,
	"to_year" integer,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "journal_coverage_issn_source_from_uq" ON "journal_coverage" USING btree ("issn","source","from_year");--> statement-breakpoint
CREATE INDEX "journal_coverage_issn_idx" ON "journal_coverage" USING btree ("issn");
CREATE TABLE "journal_index_listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"issn" text NOT NULL,
	"list_name" text NOT NULL,
	"year" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"issn" text NOT NULL,
	"year" integer NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"quartile" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookup_cache" (
	"kind" text NOT NULL,
	"lookup_key" text NOT NULL,
	"found" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lookup_cache_kind_lookup_key_pk" PRIMARY KEY("kind","lookup_key")
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "verification" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_index_issn_list_year_uq" ON "journal_index_listings" USING btree ("issn","list_name","year");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_metrics_issn_year_uq" ON "journal_metrics" USING btree ("issn","year");
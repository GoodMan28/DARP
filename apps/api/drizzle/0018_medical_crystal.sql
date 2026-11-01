CREATE TABLE "paper_citations" (
	"doi" text PRIMARY KEY NOT NULL,
	"scopus_id" text,
	"cited_by" integer DEFAULT 0 NOT NULL,
	"found" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "paper_citations_checked_idx" ON "paper_citations" USING btree ("checked_at");
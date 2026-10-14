CREATE TABLE "patent_applications" (
	"application_no" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"filed_date" date,
	"published_date" date,
	"applicants" jsonb NOT NULL,
	"inventors" jsonb NOT NULL,
	"issue" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patent_grants" (
	"patent_no" text PRIMARY KEY NOT NULL,
	"application_no" text NOT NULL,
	"title" text NOT NULL,
	"patentee" text NOT NULL,
	"filed_date" date,
	"published_date" date,
	"office" text NOT NULL,
	"grant_published_date" date NOT NULL,
	"issue" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patent_journal_parts" (
	"file_name" text PRIMARY KEY NOT NULL,
	"issue" text NOT NULL,
	"issue_date" date NOT NULL,
	"status" text NOT NULL,
	"applications" integer DEFAULT 0 NOT NULL,
	"grants" integer DEFAULT 0 NOT NULL,
	"error" text,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "patent_grants_application_idx" ON "patent_grants" USING btree ("application_no");
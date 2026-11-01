CREATE TABLE "journal_jcr_titles" (
	"title_key" text NOT NULL,
	"jif_year" integer NOT NULL,
	"title" text NOT NULL,
	"jif" text,
	"jif_quartile" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_jcr_titles_title_key_jif_year_pk" PRIMARY KEY("title_key","jif_year")
);

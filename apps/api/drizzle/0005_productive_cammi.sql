CREATE TABLE "journal_jcr" (
	"issn" text NOT NULL,
	"jif_year" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"jif" text,
	"jif_quartile" text,
	"categories" text DEFAULT '' NOT NULL,
	"editions" text DEFAULT '' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_jcr_issn_jif_year_pk" PRIMARY KEY("issn","jif_year")
);

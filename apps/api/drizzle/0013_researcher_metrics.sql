CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "researcher_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"documents" integer,
	"citations" integer,
	"citations_excl_self" integer,
	"h_index" integer,
	"h_index_excl_self" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scopus_author_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scopus_check" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "researcher_id" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "researcher_metrics" ADD CONSTRAINT "researcher_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "researcher_metrics_once" ON "researcher_metrics" USING btree ("user_id","source","as_of");
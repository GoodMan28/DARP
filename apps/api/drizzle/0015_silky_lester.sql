CREATE TABLE "institutions" (
	"code" text PRIMARY KEY NOT NULL,
	"scheme" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"city" text,
	"state" text,
	"country" text NOT NULL,
	"country_code" text,
	"kind" text,
	"ror_id" text,
	"website" text,
	"search_text" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into" text,
	"added_by" uuid,
	"source_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutions_status_idx" ON "institutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "institutions_country_idx" ON "institutions" USING btree ("country");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "institutions_search_trgm" ON "institutions" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS institutions_local_seq;

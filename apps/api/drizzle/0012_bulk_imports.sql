CREATE TABLE "bulk_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"raw" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"record_id" uuid,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "bulk_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"file_name" text NOT NULL,
	"status" text NOT NULL,
	"total" integer NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulk_import_items" ADD CONSTRAINT "bulk_import_items_import_id_bulk_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bulk_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_items" ADD CONSTRAINT "bulk_import_items_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_imports" ADD CONSTRAINT "bulk_imports_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_items_import_idx" ON "bulk_import_items" USING btree ("import_id","position");--> statement-breakpoint
CREATE INDEX "bulk_imports_owner_idx" ON "bulk_imports" USING btree ("owner_user_id","created_at");
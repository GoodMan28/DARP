CREATE TABLE "record_edits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"record_id" uuid NOT NULL,
	"user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "correction_for_user_id" uuid;--> statement-breakpoint
ALTER TABLE "record_edits" ADD CONSTRAINT "record_edits_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_edits" ADD CONSTRAINT "record_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_edits_record_idx" ON "record_edits" USING btree ("record_id","at");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_correction_for_user_id_users_id_fk" FOREIGN KEY ("correction_for_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
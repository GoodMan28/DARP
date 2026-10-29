ALTER TABLE "records" DROP CONSTRAINT "records_cycle_id_cycles_id_fk";
--> statement-breakpoint
DROP INDEX "records_module_cycle_idx";--> statement-breakpoint
DROP INDEX "module_declarations_uq";--> statement-breakpoint
DROP INDEX "records_live_idx";--> statement-breakpoint
DROP INDEX "records_natural_key_uq";--> statement-breakpoint
DROP INDEX "records_one_profile_uq";--> statement-breakpoint
DROP INDEX "records_one_feedback_uq";--> statement-breakpoint
ALTER TABLE "module_declarations" ALTER COLUMN "cycle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ALTER COLUMN "cycle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "module_declarations" ADD COLUMN "period_year" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "cy_year" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "fy_year" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "ay_year" integer;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_module_status_idx" ON "records" USING btree ("module_key","status");--> statement-breakpoint
CREATE INDEX "records_cy_year_idx" ON "records" USING btree ("module_key","cy_year");--> statement-breakpoint
CREATE INDEX "records_fy_year_idx" ON "records" USING btree ("module_key","fy_year");--> statement-breakpoint
CREATE INDEX "records_ay_year_idx" ON "records" USING btree ("module_key","ay_year");--> statement-breakpoint
CREATE UNIQUE INDEX "module_declarations_uq" ON "module_declarations" USING btree ("module_key","user_id");--> statement-breakpoint
CREATE INDEX "records_live_idx" ON "records" USING btree ("module_key") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "records_natural_key_uq" ON "records" USING btree ("module_key","natural_key") WHERE "records"."natural_key" is not null and "records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "records_one_profile_uq" ON "records" USING btree ("owner_user_id") WHERE "records"."module_key" = 'profile' and "records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "records_one_feedback_uq" ON "records" USING btree ("department_id","ay_year") WHERE "records"."module_key" = 'feedback' and "records"."deleted_at" is null;
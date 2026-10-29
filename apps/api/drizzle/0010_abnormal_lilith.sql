-- Existing nil declarations belong to the last calendar year of the cycle they were made in.
UPDATE "module_declarations" SET "period_year" = (SELECT EXTRACT(YEAR FROM "cycles"."cy_end")::int FROM "cycles" WHERE "cycles"."id" = "module_declarations"."cycle_id");
--> statement-breakpoint
-- A year alone fills only the module's own year type; scripts/backfill-years.ts adds the other two from dates.
UPDATE "records" SET "cy_year" = "period_year" WHERE "module_key" IN ('awards','books','econtent','extawards','fdpattended','fdporganised','patents','publications','quality','riawards');
--> statement-breakpoint
UPDATE "records" SET "fy_year" = "period_year" WHERE "module_key" IN ('consultancy','edpmdp','fellowships','finsupport','grants','seedmoney');
--> statement-breakpoint
UPDATE "records" SET "ay_year" = "period_year" WHERE "module_key" IN ('exams','feedback','mentorship','mous','profile','qscontacts','studentsguided','workshops');
--> statement-breakpoint
ALTER TABLE "module_declarations" DROP CONSTRAINT "module_declarations_cycle_id_cycles_id_fk";
--> statement-breakpoint
DROP INDEX "module_declarations_uq";--> statement-breakpoint
ALTER TABLE "module_declarations" ALTER COLUMN "period_year" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "module_declarations_uq" ON "module_declarations" USING btree ("user_id","module_key","period_year");--> statement-breakpoint
ALTER TABLE "module_declarations" DROP COLUMN "cycle_id";
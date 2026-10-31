DROP INDEX "master_list_value_uq";--> statement-breakpoint
ALTER TABLE "master_list_items" ADD COLUMN "parent" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "master_list_value_uq" ON "master_list_items" USING btree ("list_key","parent","value");
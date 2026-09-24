CREATE TYPE "public"."record_status" AS ENUM('draft', 'submitted', 'verified', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc', 'admin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"ip" text,
	"user_agent" text,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"cy_start" date NOT NULL,
	"cy_end" date NOT NULL,
	"fy_start" date NOT NULL,
	"fy_end" date NOT NULL,
	"ay_start" date NOT NULL,
	"ay_end" date NOT NULL,
	"entry_opens_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid,
	"field_key" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "evidence_size_rule" CHECK ("evidence_files"."size_bytes" > 0 and "evidence_files"."size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email_lower" text NOT NULL,
	"ip" text NOT NULL,
	"success" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_key" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_key" text NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"declared_nil" boolean DEFAULT true NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"counter_key" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_baselines_non_negative" CHECK ("profile_baselines"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "record_transitions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"record_id" uuid NOT NULL,
	"from_status" "record_status" NOT NULL,
	"to_status" "record_status" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" "role" NOT NULL,
	"remark" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_key" text NOT NULL,
	"cycle_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"department_id" uuid,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"period_label" text NOT NULL,
	"period_year" integer NOT NULL,
	"natural_key" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"returned_remark" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "records_period_year_rule" CHECK ("records"."period_year" between 1950 and 2100)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"department_id" uuid,
	"employee_id" text,
	"date_of_joining" date,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_department_rule" CHECK (("users"."role" in ('faculty','hod') and "users"."department_id" is not null)
        or ("users"."role" in ('dofa','drie','dugs','cdc','admin')))
);
--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_declarations" ADD CONSTRAINT "module_declarations_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_declarations" ADD CONSTRAINT "module_declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_baselines" ADD CONSTRAINT "profile_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_baselines" ADD CONSTRAINT "profile_baselines_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_transitions" ADD CONSTRAINT "record_transitions_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_transitions" ADD CONSTRAINT "record_transitions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_one_active_uq" ON "cycles" USING btree ("is_active") WHERE "cycles"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_uq" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "evidence_record_idx" ON "evidence_files" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_storage_key_uq" ON "evidence_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "login_attempts_email_at_idx" ON "login_attempts" USING btree ("email_lower","at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_at_idx" ON "login_attempts" USING btree ("ip","at");--> statement-breakpoint
CREATE UNIQUE INDEX "master_list_value_uq" ON "master_list_items" USING btree ("list_key","value");--> statement-breakpoint
CREATE INDEX "master_list_key_idx" ON "master_list_items" USING btree ("list_key","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "module_declarations_uq" ON "module_declarations" USING btree ("module_key","cycle_id","user_id");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_baselines_uq" ON "profile_baselines" USING btree ("user_id","counter_key");--> statement-breakpoint
CREATE INDEX "record_transitions_record_idx" ON "record_transitions" USING btree ("record_id","at");--> statement-breakpoint
CREATE INDEX "records_module_cycle_idx" ON "records" USING btree ("module_key","cycle_id","status");--> statement-breakpoint
CREATE INDEX "records_owner_idx" ON "records" USING btree ("owner_user_id","module_key");--> statement-breakpoint
CREATE INDEX "records_dept_idx" ON "records" USING btree ("department_id","module_key");--> statement-breakpoint
CREATE INDEX "records_status_idx" ON "records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "records_live_idx" ON "records" USING btree ("module_key","cycle_id") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "records_data_gin" ON "records" USING gin ("data");--> statement-breakpoint
CREATE INDEX "records_search_trgm" ON "records" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "records_natural_key_uq" ON "records" USING btree ("module_key","cycle_id","natural_key") WHERE "records"."natural_key" is not null and "records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "records_one_profile_uq" ON "records" USING btree ("owner_user_id","cycle_id") WHERE "records"."module_key" = 'profile' and "records"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "records_one_feedback_uq" ON "records" USING btree ("department_id","cycle_id") WHERE "records"."module_key" = 'feedback' and "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");
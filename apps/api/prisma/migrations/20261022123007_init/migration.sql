-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('CASUAL', 'PART_TIME', 'FULL_TIME');

-- CreateEnum
CREATE TYPE "AwardCoverage" AS ENUM ('CONFIRMED', 'UNSURE');

-- CreateEnum
CREATE TYPE "EnterpriseAgreement" AS ENUM ('NONE', 'APPLIES', 'UNSURE');

-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('ADULT_21_PLUS', 'UNDER_21', 'UNSURE');

-- CreateEnum
CREATE TYPE "ShiftworkerStatus" AS ENUM ('NO', 'YES', 'UNSURE');

-- CreateEnum
CREATE TYPE "BreakKind" AS ENUM ('UNPAID_MEAL', 'PAID_REST');

-- CreateEnum
CREATE TYPE "PayslipLineCategory" AS ENUM ('HOURS_WORKED', 'OVERTIME', 'ALLOWANCE', 'LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('COMPLETED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('MATCHED', 'POTENTIAL_UNDERPAYMENT', 'POTENTIAL_OVERPAYMENT', 'INCOMPLETE_DATA', 'UNSUPPORTED_SCENARIO', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "CalculationStatus" AS ENUM ('CALCULATED', 'REVIEW_REQUIRED', 'UNSUPPORTED_SCENARIO', 'INCOMPLETE_DATA');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGGED_OUT', 'SHIFTS_IMPORTED', 'AUDIT_CREATED', 'REPORT_EXPORTED', 'ACCOUNT_DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "award_code" VARCHAR(20) NOT NULL,
    "classification_code" VARCHAR(100) NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "award_coverage" "AwardCoverage" NOT NULL,
    "enterprise_agreement" "EnterpriseAgreement" NOT NULL,
    "age_band" "AgeBand" NOT NULL,
    "shiftworker" "ShiftworkerStatus" NOT NULL,
    "part_time_guaranteed_minutes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "start_local" CHAR(16) NOT NULL,
    "end_local" CHAR(16) NOT NULL,
    "start_utc_offset_minutes" SMALLINT,
    "end_utc_offset_minutes" SMALLINT,
    "start_date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "kind" "BreakKind" NOT NULL,
    "start_local" CHAR(16) NOT NULL,
    "end_local" CHAR(16) NOT NULL,
    "start_utc_offset_minutes" SMALLINT,
    "end_utc_offset_minutes" SMALLINT,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "gross_pay" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_lines" (
    "id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "category" "PayslipLineCategory" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "AuditStatus" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "finding_status" "FindingStatus" NOT NULL,
    "calculation_status" "CalculationStatus" NOT NULL,
    "expected_amount" DECIMAL(14,2),
    "reported_amount" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2),
    "shift_count" INTEGER NOT NULL,
    "rule_set_version" VARCHAR(64),
    "rule_set_fingerprint" CHAR(64),
    "engine_version" VARCHAR(20) NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "payslip_snapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "reconciliation" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_findings" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "explanation" TEXT NOT NULL,
    "expected_amount" DECIMAL(14,2),
    "reported_amount" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "shift_ids" TEXT[],
    "clause_refs" TEXT[],
    "evidence_refs" TEXT[],
    "next_step" TEXT NOT NULL,

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "type" "AuditEventType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "employments_user_id_created_at_idx" ON "employments"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "employments_id_user_id_key" ON "employments"("id", "user_id");

-- CreateIndex
CREATE INDEX "shifts_employment_id_start_date_idx" ON "shifts"("employment_id", "start_date");

-- CreateIndex
CREATE INDEX "shifts_user_id_start_at_idx" ON "shifts"("user_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "shift_breaks_shift_id_position_key" ON "shift_breaks"("shift_id", "position");

-- CreateIndex
CREATE INDEX "payslips_employment_id_period_start_idx" ON "payslips"("employment_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_id_user_id_key" ON "payslips"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_lines_payslip_id_position_key" ON "payslip_lines"("payslip_id", "position");

-- CreateIndex
CREATE INDEX "audits_user_id_created_at_id_idx" ON "audits"("user_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "audits_user_id_finding_status_created_at_idx" ON "audits"("user_id", "finding_status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audits_user_id_idempotency_key_key" ON "audits"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_findings_audit_id_position_key" ON "audit_findings"("audit_id", "position");

-- CreateIndex
CREATE INDEX "audit_events_user_id_occurred_at_idx" ON "audit_events"("user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employment_id_user_id_fkey" FOREIGN KEY ("employment_id", "user_id") REFERENCES "employments"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employment_id_user_id_fkey" FOREIGN KEY ("employment_id", "user_id") REFERENCES "employments"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_employment_id_user_id_fkey" FOREIGN KEY ("employment_id", "user_id") REFERENCES "employments"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_payslip_id_user_id_fkey" FOREIGN KEY ("payslip_id", "user_id") REFERENCES "payslips"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Integrity rules that Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------------------------

-- Value checks.
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_end_after_start" CHECK ("end_at" > "start_at");
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_version_positive" CHECK ("version" >= 1);
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_period_order" CHECK ("period_end" >= "period_start");
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_gross_non_negative" CHECK ("gross_pay" >= 0);
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "audits" ADD CONSTRAINT "audits_period_order" CHECK ("period_end" >= "period_start");

-- No two shifts for the same employment may overlap. Ranges are half-open [start, end), matching
-- the domain model, so back-to-back shifts are allowed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_no_overlap"
  EXCLUDE USING gist ("employment_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&);

-- Ownership is immutable: a row can never be moved to another user, and a shift, payslip or audit
-- can never be moved to another employment. (Composite foreign keys use ON UPDATE CASCADE, so
-- without this a change to employments.user_id would silently carry children with it.)
CREATE FUNCTION "wageguard_forbid_owner_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
    RAISE EXCEPTION 'wageguard: ownership of % rows is immutable', TG_TABLE_NAME USING ERRCODE = 'WG001';
  END IF;
  IF TG_TABLE_NAME <> 'employments' AND NEW."employment_id" IS DISTINCT FROM OLD."employment_id" THEN
    RAISE EXCEPTION 'wageguard: % rows cannot move between employments', TG_TABLE_NAME USING ERRCODE = 'WG001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employments_owner_immutable" BEFORE UPDATE ON "employments"
  FOR EACH ROW EXECUTE FUNCTION "wageguard_forbid_owner_change"();
CREATE TRIGGER "shifts_owner_immutable" BEFORE UPDATE ON "shifts"
  FOR EACH ROW EXECUTE FUNCTION "wageguard_forbid_owner_change"();
CREATE TRIGGER "payslips_owner_immutable" BEFORE UPDATE ON "payslips"
  FOR EACH ROW EXECUTE FUNCTION "wageguard_forbid_owner_change"();

-- Completed audits are immutable snapshots. UPDATE is always rejected. DELETE is rejected unless
-- the transaction has set wageguard.allow_audit_delete = 'on', which only the account-deletion
-- workflow does (SET LOCAL, so it cannot leak beyond that transaction).
CREATE FUNCTION "wageguard_protect_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('wageguard.allow_audit_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'wageguard: completed audit records are immutable (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'WG002';
END;
$$;

CREATE TRIGGER "audits_immutable" BEFORE UPDATE OR DELETE ON "audits"
  FOR EACH ROW EXECUTE FUNCTION "wageguard_protect_audit"();
CREATE TRIGGER "audit_findings_immutable" BEFORE UPDATE OR DELETE ON "audit_findings"
  FOR EACH ROW EXECUTE FUNCTION "wageguard_protect_audit"();
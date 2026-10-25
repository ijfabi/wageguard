-- CreateEnum
CREATE TYPE "AustralianState" AS ENUM ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA');

-- CreateEnum
CREATE TYPE "SpanException" AS ENUM ('NONE', 'NEWSAGENCY', 'VIDEO_SHOP', 'EXTENDED_TRADING');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'EMAIL_VERIFIED';
ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditEventType" ADD VALUE 'TWO_FACTOR_DISABLED';
ALTER TYPE "AuditEventType" ADD VALUE 'TWO_FACTOR_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'SESSIONS_REVOKED';

-- DropIndex
DROP INDEX "audits_user_id_idempotency_key_key";

-- AlterTable
ALTER TABLE "employments" ADD COLUMN     "appointed_first_aider" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "apprentice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "averaging_roster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "baking_production" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "broken_hill" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "employment_start_date" DATE,
ADD COLUMN     "holds_liquor_licence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "launders_special_clothing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduced_break_agreed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "school_student" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "span_exception" "SpanException" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "state" "AustralianState",
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "device" VARCHAR(80),
ADD COLUMN     "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "two_factor_attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "totp_secret" TEXT,
ADD COLUMN     "totp_last_step" INTEGER;

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(200) NOT NULL,
    "window_end" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "audit_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_user_id_code_hash_key" ON "recovery_codes"("user_id", "code_hash");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_end_idx" ON "rate_limit_buckets"("window_end");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "audits_user_id_idempotency_key_idx" ON "audits"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: data and constraints Prisma can't express.

-- Accounts created before email verification existed keep working: treat their address as verified.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- Carry existing Idempotency-Keys over. They expire 24 hours after the audit they produced.
INSERT INTO "idempotency_keys" ("user_id", "key", "request_hash", "audit_id", "created_at", "expires_at")
SELECT "user_id", "idempotency_key", "request_hash", "id", "created_at", "created_at" + INTERVAL '24 hours'
FROM "audits";

-- The domain checks this too; the database makes sure no other path can store it.
ALTER TABLE "employments" ADD CONSTRAINT "employments_birth_before_start"
  CHECK ("date_of_birth" IS NULL OR "employment_start_date" IS NULL OR "date_of_birth" < "employment_start_date");

-- Employments can now be edited. PL/pgSQL doesn't short-circuit AND, so the original function read
-- NEW."employment_id" on employments too, which has no such column, and every update failed.
CREATE OR REPLACE FUNCTION "wageguard_forbid_owner_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
    RAISE EXCEPTION 'wageguard: ownership of % rows is immutable', TG_TABLE_NAME USING ERRCODE = 'WG001';
  END IF;
  IF TG_TABLE_NAME <> 'employments' THEN
    IF NEW."employment_id" IS DISTINCT FROM OLD."employment_id" THEN
      RAISE EXCEPTION 'wageguard: % rows cannot move between employments', TG_TABLE_NAME USING ERRCODE = 'WG001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

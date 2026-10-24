-- DropIndex
DROP INDEX "audits_user_id_finding_status_created_at_idx";

-- CreateIndex
CREATE INDEX "audits_user_id_finding_status_created_at_shift_count_differ_idx" ON "audits"("user_id", "finding_status", "created_at" DESC, "shift_count", "difference");

-- CreateIndex
CREATE INDEX "payslips_user_id_created_at_id_idx" ON "payslips"("user_id", "created_at" DESC, "id");

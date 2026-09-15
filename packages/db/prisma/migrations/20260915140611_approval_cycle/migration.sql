-- DropIndex
DROP INDEX "approval_record_tenant_id_document_type_document_id_rule_id_key";

-- AlterTable
ALTER TABLE "approval_record" ADD COLUMN     "cycle" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "approval_cycle" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "approval_record_tenant_id_document_type_document_id_rule_id_key" ON "approval_record"("tenant_id", "document_type", "document_id", "rule_id", "cycle");


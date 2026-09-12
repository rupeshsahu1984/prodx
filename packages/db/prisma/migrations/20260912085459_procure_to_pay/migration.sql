-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'BOTH');

-- CreateEnum
CREATE TYPE "PurchaseOrderState" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RELEASED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GateDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "GoodsReceiptState" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "party" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "tax_registration_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "state" "PurchaseOrderState" NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "secondary_quantity" DECIMAL(18,6),
    "rate" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "received_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "min_amount" DECIMAL(18,2) NOT NULL,
    "max_amount" DECIMAL(18,2),
    "plant_id" UUID,
    "category" TEXT,
    "permission" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_record" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "direction" "GateDirection" NOT NULL,
    "vehicle_no" TEXT NOT NULL,
    "driver_name" TEXT,
    "purchase_order_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "device_source" TEXT NOT NULL,
    "device_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighbridge_ticket" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gate_event_id" UUID NOT NULL,
    "gross_weight" DECIMAL(18,3) NOT NULL,
    "tare_weight" DECIMAL(18,3) NOT NULL,
    "net_weight" DECIMAL(18,3) NOT NULL,
    "weighed_at" TIMESTAMPTZ(6) NOT NULL,
    "device_source" TEXT NOT NULL,
    "device_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weighbridge_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "state" "GoodsReceiptState" NOT NULL DEFAULT 'DRAFT',
    "posting_date" DATE NOT NULL,
    "gate_event_id" UUID,
    "reversed_by_id" UUID,
    "reverses_grn_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "stock_unit_id" UUID NOT NULL,
    "storage_location_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "secondary_quantity" DECIMAL(18,6),
    "unit_cost" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "party_tenant_id_idx" ON "party"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_tenant_id_code_key" ON "party"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "purchase_order_tenant_id_plant_id_state_idx" ON "purchase_order"("tenant_id", "plant_id", "state");

-- CreateIndex
CREATE INDEX "purchase_order_tenant_id_supplier_id_idx" ON "purchase_order"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_tenant_id_legal_entity_id_document_no_key" ON "purchase_order"("tenant_id", "legal_entity_id", "document_no");

-- CreateIndex
CREATE INDEX "purchase_order_line_tenant_id_item_id_idx" ON "purchase_order_line"("tenant_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_tenant_id_purchase_order_id_line_no_key" ON "purchase_order_line"("tenant_id", "purchase_order_id", "line_no");

-- CreateIndex
CREATE INDEX "approval_rule_tenant_id_document_type_idx" ON "approval_rule"("tenant_id", "document_type");

-- CreateIndex
CREATE INDEX "approval_record_tenant_id_document_type_document_id_idx" ON "approval_record"("tenant_id", "document_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_record_tenant_id_document_type_document_id_rule_id_key" ON "approval_record"("tenant_id", "document_type", "document_id", "rule_id");

-- CreateIndex
CREATE INDEX "gate_event_tenant_id_plant_id_occurred_at_idx" ON "gate_event"("tenant_id", "plant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "gate_event_tenant_id_vehicle_no_idx" ON "gate_event"("tenant_id", "vehicle_no");

-- CreateIndex
CREATE UNIQUE INDEX "gate_event_tenant_id_device_source_device_ref_key" ON "gate_event"("tenant_id", "device_source", "device_ref");

-- CreateIndex
CREATE INDEX "weighbridge_ticket_tenant_id_gate_event_id_idx" ON "weighbridge_ticket"("tenant_id", "gate_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "weighbridge_ticket_tenant_id_device_source_device_ref_key" ON "weighbridge_ticket"("tenant_id", "device_source", "device_ref");

-- CreateIndex
CREATE INDEX "goods_receipt_tenant_id_plant_id_state_posting_date_idx" ON "goods_receipt"("tenant_id", "plant_id", "state", "posting_date");

-- CreateIndex
CREATE INDEX "goods_receipt_tenant_id_purchase_order_id_idx" ON "goods_receipt"("tenant_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_tenant_id_legal_entity_id_document_no_key" ON "goods_receipt"("tenant_id", "legal_entity_id", "document_no");

-- CreateIndex
CREATE INDEX "goods_receipt_line_tenant_id_purchase_order_line_id_idx" ON "goods_receipt_line"("tenant_id", "purchase_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_line_tenant_id_goods_receipt_id_line_no_key" ON "goods_receipt_line"("tenant_id", "goods_receipt_id", "line_no");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "approval_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_event" ADD CONSTRAINT "gate_event_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_event" ADD CONSTRAINT "gate_event_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighbridge_ticket" ADD CONSTRAINT "weighbridge_ticket_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_stock_unit_id_fkey" FOREIGN KEY ("stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "StockGranularity" AS ENUM ('BULK', 'LOT', 'SERIAL');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entity" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_registration_no" TEXT,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_location" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_third_party" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_conversion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_uom_id" UUID NOT NULL,
    "to_uom_id" UUID NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "uom_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_uom_id" UUID NOT NULL,
    "is_dual_uom" BOOLEAN NOT NULL DEFAULT false,
    "secondary_uom_id" UUID,
    "granularity" "StockGranularity" NOT NULL DEFAULT 'LOT',
    "characteristics" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_uom_conversion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_uom_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_unit" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "granularity" "StockGranularity" NOT NULL,
    "shade_band" TEXT,
    "grade" TEXT,
    "secondary_quantity" DECIMAL(18,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_unit_link" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_stock_unit_id" UUID NOT NULL,
    "child_stock_unit_id" UUID NOT NULL,
    "transformation_type" TEXT NOT NULL,
    "transformation_id" UUID NOT NULL,
    "quantity_contributed" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_unit_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "stock_unit_id" UUID NOT NULL,
    "storage_location_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "secondary_quantity" DECIMAL(18,6),
    "unit_cost" DECIMAL(18,6) NOT NULL,
    "total_value" DECIMAL(18,2) NOT NULL,
    "posting_date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "stock_unit_id" UUID NOT NULL,
    "storage_location_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "secondary_quantity" DECIMAL(18,6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_plant_valuation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(18,6) NOT NULL,
    "total_value" DECIMAL(18,2) NOT NULL,
    "unit_cost" DECIMAL(18,6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_plant_valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_year" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_period" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_account" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gl_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "narration" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "reverses_journal_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "gl_account_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_series" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "series_code" TEXT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_code_key" ON "tenant"("code");

-- CreateIndex
CREATE INDEX "legal_entity_tenant_id_idx" ON "legal_entity"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_tenant_id_code_key" ON "legal_entity"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "plant_tenant_id_legal_entity_id_idx" ON "plant"("tenant_id", "legal_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "plant_tenant_id_code_key" ON "plant"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "warehouse_tenant_id_plant_id_idx" ON "warehouse"("tenant_id", "plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_tenant_id_plant_id_code_key" ON "warehouse"("tenant_id", "plant_id", "code");

-- CreateIndex
CREATE INDEX "storage_location_tenant_id_warehouse_id_idx" ON "storage_location"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_location_tenant_id_warehouse_id_code_key" ON "storage_location"("tenant_id", "warehouse_id", "code");

-- CreateIndex
CREATE INDEX "app_user_tenant_id_idx" ON "app_user"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_tenant_id_email_key" ON "app_user"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "uom_tenant_id_idx" ON "uom"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uom_tenant_id_code_key" ON "uom"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uom_conversion_tenant_id_from_uom_id_to_uom_id_key" ON "uom_conversion"("tenant_id", "from_uom_id", "to_uom_id");

-- CreateIndex
CREATE INDEX "item_tenant_id_idx" ON "item"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_tenant_id_code_key" ON "item"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "item_uom_conversion_tenant_id_item_id_idx" ON "item_uom_conversion"("tenant_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_uom_conversion_tenant_id_item_id_uom_id_key" ON "item_uom_conversion"("tenant_id", "item_id", "uom_id");

-- CreateIndex
CREATE INDEX "stock_unit_tenant_id_item_id_idx" ON "stock_unit"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "stock_unit_tenant_id_shade_band_idx" ON "stock_unit"("tenant_id", "shade_band");

-- CreateIndex
CREATE UNIQUE INDEX "stock_unit_tenant_id_item_id_reference_key" ON "stock_unit"("tenant_id", "item_id", "reference");

-- CreateIndex
CREATE INDEX "stock_unit_link_tenant_id_parent_stock_unit_id_idx" ON "stock_unit_link"("tenant_id", "parent_stock_unit_id");

-- CreateIndex
CREATE INDEX "stock_unit_link_tenant_id_child_stock_unit_id_idx" ON "stock_unit_link"("tenant_id", "child_stock_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_unit_link_tenant_id_parent_stock_unit_id_child_stock__key" ON "stock_unit_link"("tenant_id", "parent_stock_unit_id", "child_stock_unit_id", "transformation_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entry_tenant_id_plant_id_item_id_posting_date_idx" ON "stock_ledger_entry"("tenant_id", "plant_id", "item_id", "posting_date");

-- CreateIndex
CREATE INDEX "stock_ledger_entry_tenant_id_stock_unit_id_idx" ON "stock_ledger_entry"("tenant_id", "stock_unit_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entry_tenant_id_source_type_source_id_idx" ON "stock_ledger_entry"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "stock_balance_tenant_id_storage_location_id_idx" ON "stock_balance"("tenant_id", "storage_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balance_tenant_id_stock_unit_id_storage_location_id_key" ON "stock_balance"("tenant_id", "stock_unit_id", "storage_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_plant_valuation_tenant_id_item_id_plant_id_key" ON "item_plant_valuation"("tenant_id", "item_id", "plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_year_tenant_id_legal_entity_id_code_key" ON "fiscal_year"("tenant_id", "legal_entity_id", "code");

-- CreateIndex
CREATE INDEX "fiscal_period_tenant_id_start_date_end_date_idx" ON "fiscal_period"("tenant_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_period_tenant_id_fiscal_year_id_sequence_key" ON "fiscal_period"("tenant_id", "fiscal_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "gl_account_tenant_id_legal_entity_id_code_key" ON "gl_account"("tenant_id", "legal_entity_id", "code");

-- CreateIndex
CREATE INDEX "journal_entry_tenant_id_legal_entity_id_posting_date_idx" ON "journal_entry"("tenant_id", "legal_entity_id", "posting_date");

-- CreateIndex
CREATE INDEX "journal_entry_tenant_id_source_type_source_id_idx" ON "journal_entry"("tenant_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_tenant_id_legal_entity_id_document_no_key" ON "journal_entry"("tenant_id", "legal_entity_id", "document_no");

-- CreateIndex
CREATE INDEX "journal_line_tenant_id_gl_account_id_idx" ON "journal_line"("tenant_id", "gl_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_line_tenant_id_journal_entry_id_line_no_key" ON "journal_line"("tenant_id", "journal_entry_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "number_series_tenant_id_legal_entity_id_series_code_fiscal__key" ON "number_series"("tenant_id", "legal_entity_id", "series_code", "fiscal_year");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_entity_type_entity_id_created_at_idx" ON "audit_event"("tenant_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_actor_id_created_at_idx" ON "audit_event"("tenant_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_message_status_available_at_idx" ON "outbox_message"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_message_tenant_id_topic_created_at_idx" ON "outbox_message"("tenant_id", "topic", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_key_tenant_id_created_at_idx" ON "idempotency_key"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_tenant_id_source_external_ref_key" ON "idempotency_key"("tenant_id", "source", "external_ref");

-- AddForeignKey
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant" ADD CONSTRAINT "plant_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_location" ADD CONSTRAINT "storage_location_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_from_uom_id_fkey" FOREIGN KEY ("from_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_to_uom_id_fkey" FOREIGN KEY ("to_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_base_uom_id_fkey" FOREIGN KEY ("base_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_secondary_uom_id_fkey" FOREIGN KEY ("secondary_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_uom_conversion" ADD CONSTRAINT "item_uom_conversion_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_uom_conversion" ADD CONSTRAINT "item_uom_conversion_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unit" ADD CONSTRAINT "stock_unit_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unit_link" ADD CONSTRAINT "stock_unit_link_parent_stock_unit_id_fkey" FOREIGN KEY ("parent_stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_unit_link" ADD CONSTRAINT "stock_unit_link_child_stock_unit_id_fkey" FOREIGN KEY ("child_stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_stock_unit_id_fkey" FOREIGN KEY ("stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_stock_unit_id_fkey" FOREIGN KEY ("stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_plant_valuation" ADD CONSTRAINT "item_plant_valuation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_plant_valuation" ADD CONSTRAINT "item_plant_valuation_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

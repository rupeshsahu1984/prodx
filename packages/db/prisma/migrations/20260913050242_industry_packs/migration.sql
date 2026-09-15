-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('INSTALLED', 'DISABLED');

-- CreateTable
CREATE TABLE "pack_installation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pack_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "PackStatus" NOT NULL DEFAULT 'INSTALLED',
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_by_id" UUID,
    "disabled_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pack_installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carton_board_spec" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "gsm" INTEGER NOT NULL,
    "burst_factor" DECIMAL(6,2),
    "deckle_mm" INTEGER NOT NULL,
    "liner" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carton_board_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carton_box_style" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fefco_code" TEXT,
    "flute" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "inner_length_mm" INTEGER NOT NULL,
    "inner_width_mm" INTEGER NOT NULL,
    "inner_height_mm" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carton_box_style_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carton_tool" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tool_type" TEXT NOT NULL,
    "customer_owned" BOOLEAN NOT NULL DEFAULT false,
    "life_limit" INTEGER,
    "current_impressions" INTEGER NOT NULL DEFAULT 0,
    "storage_location" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carton_tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carton_trim_plan" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "plan_date" DATE NOT NULL,
    "deckle_mm" INTEGER NOT NULL,
    "trim_waste_mm" INTEGER NOT NULL,
    "trim_waste_pct" DECIMAL(6,3) NOT NULL,
    "combination" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carton_trim_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "textile_yarn_spec" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "count" TEXT NOT NULL,
    "fibre" TEXT NOT NULL,
    "twist" TEXT,
    "ply" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "textile_yarn_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "textile_fabric_spec" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "gsm" INTEGER NOT NULL,
    "width_inch" DECIMAL(6,2) NOT NULL,
    "construction" TEXT,
    "finish" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "textile_fabric_spec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "textile_dye_lot" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "lot_date" DATE NOT NULL,
    "colour_code" TEXT NOT NULL,
    "shade_band" TEXT NOT NULL,
    "recipe" JSONB NOT NULL DEFAULT '{}',
    "lab_dip_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "textile_dye_lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "textile_grading" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "document_no" TEXT NOT NULL,
    "inspected_at" TIMESTAMPTZ(6) NOT NULL,
    "stock_unit_id" UUID NOT NULL,
    "points_per_100m2" DECIMAL(8,2) NOT NULL,
    "grade" TEXT NOT NULL,
    "inspected_metre" DECIMAL(18,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "textile_grading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pack_installation_tenant_id_idx" ON "pack_installation"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pack_installation_tenant_id_pack_id_key" ON "pack_installation"("tenant_id", "pack_id");

-- CreateIndex
CREATE UNIQUE INDEX "carton_board_spec_item_id_key" ON "carton_board_spec"("item_id");

-- CreateIndex
CREATE INDEX "carton_board_spec_tenant_id_idx" ON "carton_board_spec"("tenant_id");

-- CreateIndex
CREATE INDEX "carton_box_style_tenant_id_idx" ON "carton_box_style"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "carton_box_style_tenant_id_code_key" ON "carton_box_style"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "carton_tool_tenant_id_plant_id_idx" ON "carton_tool"("tenant_id", "plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "carton_tool_tenant_id_code_key" ON "carton_tool"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "carton_trim_plan_tenant_id_plant_id_plan_date_idx" ON "carton_trim_plan"("tenant_id", "plant_id", "plan_date");

-- CreateIndex
CREATE UNIQUE INDEX "carton_trim_plan_tenant_id_document_no_key" ON "carton_trim_plan"("tenant_id", "document_no");

-- CreateIndex
CREATE UNIQUE INDEX "textile_yarn_spec_item_id_key" ON "textile_yarn_spec"("item_id");

-- CreateIndex
CREATE INDEX "textile_yarn_spec_tenant_id_idx" ON "textile_yarn_spec"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "textile_fabric_spec_item_id_key" ON "textile_fabric_spec"("item_id");

-- CreateIndex
CREATE INDEX "textile_fabric_spec_tenant_id_idx" ON "textile_fabric_spec"("tenant_id");

-- CreateIndex
CREATE INDEX "textile_dye_lot_tenant_id_plant_id_shade_band_idx" ON "textile_dye_lot"("tenant_id", "plant_id", "shade_band");

-- CreateIndex
CREATE UNIQUE INDEX "textile_dye_lot_tenant_id_document_no_key" ON "textile_dye_lot"("tenant_id", "document_no");

-- CreateIndex
CREATE INDEX "textile_grading_tenant_id_plant_id_idx" ON "textile_grading"("tenant_id", "plant_id");

-- CreateIndex
CREATE INDEX "textile_grading_tenant_id_stock_unit_id_idx" ON "textile_grading"("tenant_id", "stock_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "textile_grading_tenant_id_document_no_key" ON "textile_grading"("tenant_id", "document_no");

-- AddForeignKey
ALTER TABLE "carton_board_spec" ADD CONSTRAINT "carton_board_spec_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carton_tool" ADD CONSTRAINT "carton_tool_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carton_trim_plan" ADD CONSTRAINT "carton_trim_plan_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textile_yarn_spec" ADD CONSTRAINT "textile_yarn_spec_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textile_fabric_spec" ADD CONSTRAINT "textile_fabric_spec_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textile_dye_lot" ADD CONSTRAINT "textile_dye_lot_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textile_grading" ADD CONSTRAINT "textile_grading_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "textile_grading" ADD CONSTRAINT "textile_grading_stock_unit_id_fkey" FOREIGN KEY ("stock_unit_id") REFERENCES "stock_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "pack_table" (
    "id" UUID NOT NULL,
    "pack_id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_table_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_table_table_name_key" ON "pack_table"("table_name");

-- CreateIndex
CREATE INDEX "pack_table_pack_id_idx" ON "pack_table"("pack_id");

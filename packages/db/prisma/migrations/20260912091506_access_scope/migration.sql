-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_plant_access" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_plant_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_department_access" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_department_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_tenant_id_plant_id_idx" ON "department"("tenant_id", "plant_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_tenant_id_plant_id_code_key" ON "department"("tenant_id", "plant_id", "code");

-- CreateIndex
CREATE INDEX "user_plant_access_tenant_id_user_id_idx" ON "user_plant_access"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_plant_access_tenant_id_user_id_plant_id_key" ON "user_plant_access"("tenant_id", "user_id", "plant_id");

-- CreateIndex
CREATE INDEX "user_department_access_tenant_id_user_id_idx" ON "user_department_access"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_department_access_tenant_id_user_id_department_id_key" ON "user_department_access"("tenant_id", "user_id", "department_id");

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plant_access" ADD CONSTRAINT "user_plant_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_plant_access" ADD CONSTRAINT "user_plant_access_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

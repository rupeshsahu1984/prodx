-- AlterTable
ALTER TABLE "gate_event" ADD COLUMN     "department_id" UUID;

-- AlterTable
ALTER TABLE "goods_receipt" ADD COLUMN     "department_id" UUID;

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "department_id" UUID;


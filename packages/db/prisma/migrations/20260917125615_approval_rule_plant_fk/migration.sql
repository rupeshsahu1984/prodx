-- AddForeignKey
ALTER TABLE "approval_rule" ADD CONSTRAINT "approval_rule_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


import { Module } from '@nestjs/common'
import { PostingService } from '../posting/posting.service'
import { PrismaService } from '../prisma/prisma.service'
import { OperationsController } from './operations.controller'

@Module({
  controllers: [OperationsController],
  providers: [PrismaService, PostingService],
})
export class OperationsModule {}

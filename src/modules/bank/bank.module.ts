import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bank } from './entities/bank.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bank])],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}

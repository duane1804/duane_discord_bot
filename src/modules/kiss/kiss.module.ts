import { Module } from '@nestjs/common';
import { KissService } from './kiss.service';

@Module({
  providers: [KissService],
})
export class KissModule {}

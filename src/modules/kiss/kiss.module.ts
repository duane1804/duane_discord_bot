import { Module } from '@nestjs/common';
import { KissService } from './kiss.service';
import { UploadModule } from '../../services/upload/upload.module';

@Module({
  imports: [UploadModule],
  providers: [KissService],
})
export class KissModule {}

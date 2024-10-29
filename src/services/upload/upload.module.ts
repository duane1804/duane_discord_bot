import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';

@Module({
  providers: [UploadService],
  exports: [UploadService], // Export to make it available to other modules
})
export class UploadModule {}

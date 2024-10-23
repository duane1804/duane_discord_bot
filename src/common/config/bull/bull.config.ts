import { ConfigService } from '@nestjs/config';
import { BullModuleOptions } from '@nestjs/bull';

export const bullConfig = (
  configService: ConfigService,
): BullModuleOptions => ({
  redis: {
    host: configService.get('REDIS_HOST'),
    password: configService.get('REDIS_PASSWORD'),
    port: configService.get<number>('REDIS_PORT', 6379),
  },
  prefix: `${configService.get('REDIS_PREFIX')}_queue_`,
});

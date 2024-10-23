import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisClientOptions } from 'redis';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    CacheModule.registerAsync<RedisClientOptions>({
      imports: [ConfigModule],
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          ttl: 3600000 * 24, // 24 hours
          socket: {
            host: configService.get<string>('REDIS_HOST'),
            port: parseInt(configService.get<string>('REDIS_PORT')),
          },
          password: configService.get<string>('REDIS_PASSWORD'),
          keyPrefix: configService.get<string>('REDIS_PREFIX'),
        }),
      }),
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}

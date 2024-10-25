// src/config/database.config.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'DATABASE_CONFIG',
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
        migrations: [join(__dirname, '..', '..', 'migrations', '*{.ts,.js}')],
        synchronize: true,
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    },
  ],
  exports: ['DATABASE_CONFIG'],
})
export class DatabaseConfigModule {}

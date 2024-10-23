import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DatabaseConfigModule } from './database.config';

@Module({
  imports: [
    DatabaseConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [DatabaseConfigModule],
      inject: ['DATABASE_CONFIG'],
      useFactory: async (dbConfig: TypeOrmModuleOptions) => dbConfig,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DiscordBotModule } from './common/config/discord/discord-bot.module';
import { RedisCacheModule } from './common/config/cache/cache.module';
import { DatabaseModule } from './common/config/database/database.module';
import { StaticFileModule } from './common/config/static/static.module';
import { QueueModule } from './common/config/queue/queue.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AppMailerModule } from './common/config/mailer/mailer.module';
import { PingModule } from './modules/ping/ping.module';
import { KissModule } from './modules/kiss/kiss.module';
import { FoodModule } from './modules/food/food.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UploadModule } from './services/upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '.env.local'],
      isGlobal: true,
      cache: false,
      expandVariables: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    UploadModule,
    DiscordBotModule,
    DatabaseModule,
    RedisCacheModule,
    StaticFileModule,
    QueueModule,
    ScheduleModule.forRoot(),
    AppMailerModule,
    PingModule,
    KissModule,
    FoodModule,
  ],
  providers: [AppService],
})
export class AppModule {}

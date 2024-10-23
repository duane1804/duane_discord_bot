// discord-bot.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NecordModule } from 'necord';
import { IntentsBitField, ActivityType, Options } from 'discord.js';

@Module({
  imports: [
    // Configure Necord with environment variables
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.getOrThrow('DISCORD_TOKEN'),
        prefix: configService.getOrThrow('DISCORD_PREFIX'),
        development: configService.get('NODE_ENV') === 'development' 
          ? [configService.getOrThrow('DISCORD_DEVELOPMENT_GUILD_ID')]
          : false,
        skipRegistration: false,
        
        // Discord Intents
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMembers,
          IntentsBitField.Flags.GuildMessages,
          IntentsBitField.Flags.GuildMessageReactions,
          IntentsBitField.Flags.MessageContent,
          IntentsBitField.Flags.DirectMessages,
        ],

        // Client presence configuration
        presence: {
          status: 'online',
          activities: [
            {
              name: 'with Necord',
              type: ActivityType.Playing,
            },
          ],
        },

        // REST API configuration
        rest: {
          timeout: 60000,
          retries: 3,
        },

        // WebSocket configuration
        ws: {
          large_threshold: 250,
          compress: true,
        },

        // Cache configuration
        makeCache: Options.cacheWithLimits({
          ApplicationCommandManager: 0,
          BaseGuildEmojiManager: 0,
          GuildBanManager: 0,
          GuildInviteManager: 0,
          GuildMemberManager: 200,
          MessageManager: 100,
          UserManager: 200,
          VoiceStateManager: 0,
        }),

        // Cache sweeper configuration
        sweepers: {
          messages: {
            interval: 3600,
            lifetime: 7200,
          },
          users: {
            interval: 3600,
            filter: () => (user) => user.bot,
          },
        },
      }),
    }),
  ],
})
export class DiscordBotModule {}
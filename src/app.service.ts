import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, Once, On } from 'necord';
import { Client } from 'discord.js';


@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

    public constructor(private readonly client: Client) {}

    @Once('ready')
    public onReady(@Context() [client]: ContextOf<'ready'>) {
        this.logger.log(`Bot logged in as ${client.user.username}`);
    }

    @On('warn')
    public onWarn(@Context() [message]: ContextOf<'warn'>) {
        this.logger.warn(message);
    }
}

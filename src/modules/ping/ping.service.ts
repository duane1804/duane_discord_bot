import { Injectable } from '@nestjs/common';
import { Arguments, Context, Options, SlashCommand, SlashCommandContext, TextCommand, TextCommandContext } from 'necord';
import { LengthDto } from './dto/ping.dto';
@Injectable()
export class PingService {
  @SlashCommand({
    name: 'ping',
    description: 'Ping pong command!'
  })
  public async onPing(@Context() [interaction]: SlashCommandContext) {
      return interaction.reply({ content: 'Pong!' });
  }

  @SlashCommand({ name: 'length', description: 'Get length of text' })
	public async onLength(@Context() [interaction]: SlashCommandContext, @Options() { text }: LengthDto) {
		return interaction.reply({ content: `Length of your text ${text.length}` });
	}

  @TextCommand({
    name: 'test',
    description: 'Test command!'
  })
  public async onTest(@Context() [message]: TextCommandContext, @Arguments() args: string[]) {
    const text = args.join(' ');
    return message.reply({ content: `Length of your text ${text.length}` });
  }
}

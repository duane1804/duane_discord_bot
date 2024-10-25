import { Injectable, Logger } from '@nestjs/common';
import { Food, FoodCategory } from './entities/food.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { OptionDto } from './dto/food.dto';
import { PermissionsBitField } from 'discord.js';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);
  constructor(
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
  ) {}

  private isAdmin(interaction: SlashCommandContext[0]): boolean {
    // Check if the user is a guild member and has administrator permission
    if (!interaction.guild) return false;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member) return false;

    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }

  @SlashCommand({
    name: 'food',
    description: 'Food command!',
  })
  public async onFood(
    @Context() [interaction]: SlashCommandContext,
    @Options() { option }: OptionDto,
  ) {
    if (option) {
      if (!this.isAdmin(interaction)) {
        return interaction.reply({
          content: '❌ Only administrators can remove kiss images.',
          ephemeral: true,
        });
      }

      if (option === 'food') {
        return interaction.reply('Add food!');
      }

      if (option === 'category') {
        return interaction.reply('Add category!');
      }
    }
    return interaction.reply('Hey! Choose an option!');
  }
}

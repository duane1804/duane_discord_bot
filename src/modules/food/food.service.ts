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
    @Options() { option, categoryOption }: OptionDto,
  ) {
    if (option) {
      if (option === 'category') {
        switch (categoryOption) {
          case 'list':
            return interaction.reply('Listing all categories...');

          case 'add':
            if (!this.isAdmin(interaction)) {
              return interaction.reply({
                content: '❌ Only administrators can add categories.',
                ephemeral: true,
              });
            }
            return interaction.reply('Adding new category...');

          case 'edit':
            if (!this.isAdmin(interaction)) {
              return interaction.reply({
                content: '❌ Only administrators can edit categories.',
                ephemeral: true,
              });
            }
            return interaction.reply('Editing category...');

          case 'delete':
            if (!this.isAdmin(interaction)) {
              return interaction.reply({
                content: '❌ Only administrators can delete categories.',
                ephemeral: true,
              });
            }
            return interaction.reply({
              content: 'Deleting category...',
              ephemeral: true,
            });

          default:
            return interaction.reply({
              content: '❗️Hey! Choose an option for category!',
              ephemeral: true,
            });
        }
      }
    }

    if (option === 'food') {
      return interaction.reply({
        content: 'Add food!',
        ephemeral: true,
      });
    }

    if (option === 'random') {
      return interaction.reply({
        content: "Here's a random food!",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: 'Please select a valid option!',
      ephemeral: true,
    });
  }
}

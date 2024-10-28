import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  StringSelectMenuBuilder,
  TextInputStyle,
} from 'discord.js';
import { Food, FoodCategory } from '../entities/food.entity';

@Injectable()
export class FoodsService {
  private readonly logger = new Logger(FoodsService.name);
  private readonly ITEMS_PER_PAGE = 4;
  constructor(
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
  ) {}

  // Category Menu

  public createFoodMainMenu() {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('food_select')
        .setPlaceholder('Select a food option')
        .addOptions([
          {
            label: 'List foods',
            description: 'View all available foods',
            value: 'list',
          },
          {
            label: 'Add food',
            description: 'Add a new food',
            value: 'add',
          },
          {
            label: 'Edit food',
            description: 'Edit an existing food',
            value: 'edit',
          },
          {
            label: 'Delete food',
            description: 'Delete an existing food',
            value: 'delete',
          },
        ]),
    );
  }

  // List foods
  createPaginationButtons(currentPage: number, totalPages: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages),
    );
  }

  async updateExistingRecordsWithGuildId(guildId: string) {
    try {
      // Update only food categories without guildId
      await this.foodRepository
        .createQueryBuilder()
        .update(FoodCategory)
        .set({ guildId })
        .where('guild_id IS NULL')
        .execute();

      return true;
    } catch (error) {
      this.logger.error(
        'Error updating existing records with guild ID:',
        error,
      );
      return false;
    }
  }

  async createCategoryListEmbed(
    page: number = 1,
    forDeletion: boolean = false,
    guildId: string,
  ): Promise<[EmbedBuilder, number, number]> {
    await this.updateExistingRecordsWithGuildId(guildId);

    const foods = await this.foodRepository.find({
      where: { guildId },
    });

    const totalPages = Math.ceil(foods.length / this.ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * this.ITEMS_PER_PAGE;
    const endIndex = startIndex + this.ITEMS_PER_PAGE;
    const pageFoods = foods.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setTitle(forDeletion ? '🗑️ Delete Food' : '🍽️ Foods!')
      .setColor(Colors.Blue)
      .setTimestamp();

    if (foods.length === 0) {
      embed.setDescription('No foods found. Add some foods to get started!');
    } else {
      const categoryFields = pageFoods.map((food) => ({
        name: `📁 ${food.name}`,
        value: `Description: ${food.description || 'No description'}\n`,
        inline: false,
      }));

      embed.addFields(categoryFields);
      embed.setFooter({
        text: `Page ${currentPage}/${totalPages} • Total Foods: ${foods.length}`,
      });
    }

    return [embed, currentPage, totalPages];
  }
}

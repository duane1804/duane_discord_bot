import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder, StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Food, FoodCategory } from '../entities/food.entity';
import { UploadService } from '../../../services/upload/upload.service';
import { existsSync } from 'fs';
import * as fs from 'node:fs';

@Injectable()
export class RandomService {
  private readonly logger = new Logger(RandomService.name);

  constructor(
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
    private uploadService: UploadService,
  ) {}

  async createRandomFoodSelect(guildId: string) {
    const categories = await this.foodCategoryRepository.find({
      where: { guildId },
      relations: ['foods'],
      order: { name: 'ASC' },
    });

    if (categories.length === 0) return null;

    const activeCategories = categories.filter(cat => cat.foods?.length > 0);

    const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('random_food_category')
        .setPlaceholder('Select a category')
        .addOptions([
          new StringSelectMenuOptionBuilder()
            .setLabel('All Categories')
            .setDescription('Get a random food from all categories')
            .setValue('all')
            .setEmoji('🎲'),
          ...activeCategories.map(category =>
            new StringSelectMenuOptionBuilder()
              .setLabel(category.name)
              .setDescription(`${category.foods.length} foods available`)
              .setValue(category.id)
              .setEmoji('📋')
          )
        ])
    );

    // Enable multi-select only if enough categories are available
    if (activeCategories.length >= 5) {
      (selectMenu.components[0] as StringSelectMenuBuilder)
        .setMinValues(1)
        .setMaxValues(activeCategories.length)
        .setPlaceholder(`Select categories (max ${activeCategories.length})`);
    }

    return selectMenu;
  }

  async getRandomFood(categoryIds: string[], guildId: string): Promise<[Food | null, string | null]> {
    try {
      let foods: Food[] = [];

      if (categoryIds.includes('all')) {
        foods = await this.foodRepository.find({
          where: { guildId },
          relations: ['category'],
        });
      } else {
        foods = await this.foodRepository.find({
          where: {
            categoryId: In(categoryIds),
            guildId
          },
          relations: ['category'],
        });
      }

      if (foods.length === 0) {
        return [null, categoryIds.includes('all') ?
          'No foods found in any category!' :
          'No foods found in selected categories!'];
      }

      const randomFood = foods[Math.floor(Math.random() * foods.length)];
      return [randomFood, null];
    } catch (error) {
      this.logger.error('Error getting random food:', error);
      return [null, 'Failed to get random food. Please try again.'];
    }
  }

  async handleRandomFoodSelection(interaction: StringSelectMenuInteraction) {
    const categoryIds = interaction.values;
    const [randomFood, error] = await this.getRandomFood(categoryIds, interaction.guildId);

    if (error) {
      await interaction.update({
        content: `❌ ${error}`,
        components: [],
        embeds: [],
      });
      return;
    }

    // Create public embed without buttons
    const [publicEmbed, attachment] = await this.createRandomFoodEmbed(randomFood);

    // Send public message
    await interaction.channel.send({
      content: `${interaction.user} got a random food:`,
      embeds: [publicEmbed],
      files: attachment ? [attachment] : []
    });

    // Update original message with buttons (private)
    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('another_random')
          .setLabel('Get Another')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('change_categories')
          .setLabel('Change Categories')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('close_random')
          .setLabel('Close')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    await interaction.update({
      content: "Use these controls to get another random food or change categories:",
      components,
      embeds: [],
      files: []
    });
  }

  async createRandomFoodEmbed(food: Food): Promise<[EmbedBuilder, any | null]> {
    const embed = new EmbedBuilder()
      .setTitle(`🎲 Random Food: ${food.name}`)
      .setColor(Colors.Blue)
      .addFields([
        { name: 'Category', value: food.category?.name || 'None', inline: true },
      ]);

    if (food.description) {
      embed.addFields([{ name: 'Description', value: food.description }]);
    }

    let attachment = null;
    if (food.image) {
      const fullPath = this.uploadService.getFullPath(food.image);
      if (existsSync(fullPath)) {
        const imageBuffer = await fs.promises.readFile(fullPath);
        attachment = new AttachmentBuilder(imageBuffer, {
          name: 'food-image.png',
          description: `Image for ${food.name}`,
        });
        embed.setImage('attachment://food-image.png');
      }
    }

    embed.setTimestamp();
    return [embed, attachment];
  }
}

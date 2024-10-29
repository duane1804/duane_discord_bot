import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Food } from '../entities/food.entity';
import { UploadService } from '../../../services/upload/upload.service';
import { existsSync } from 'fs';
import * as fs from 'node:fs';

@Injectable()
export class FoodInfoService {
  private readonly logger = new Logger(FoodInfoService.name);
  private readonly ITEMS_PER_PAGE = 4;

  constructor(
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
    private uploadService: UploadService,
  ) {}

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

  async createFoodListEmbed(
    page: number = 1,
    guildId: string,
  ): Promise<[EmbedBuilder, number, number]> {
    const foods = await this.foodRepository.find({
      where: { guildId },
      relations: ['category'],
      order: {
        category: { name: 'ASC' },
        name: 'ASC',
      },
    });

    const totalPages = Math.ceil(foods.length / this.ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * this.ITEMS_PER_PAGE;
    const endIndex = startIndex + this.ITEMS_PER_PAGE;
    const pageFoods = foods.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setTitle('🔍 Food Information')
      .setColor(Colors.Blue)
      .setTimestamp();

    if (foods.length === 0) {
      embed.setDescription('No foods found. Add some foods to get started!');
    } else {
      // Group foods by category for this page
      const foodsByCategory = new Map<string, Food[]>();

      pageFoods.forEach((food) => {
        const categoryName = food.category?.name || 'Uncategorized';
        if (!foodsByCategory.has(categoryName)) {
          foodsByCategory.set(categoryName, []);
        }
        foodsByCategory.get(categoryName).push(food);
      });

      // Create fields for each category and its foods
      for (const [categoryName, categoryFoods] of foodsByCategory) {
        const foodList = categoryFoods
          .map((food) => {
            const description = food.description
              ? `\n   ↳ ${food.description.slice(0, 50)}${
                  food.description.length > 50 ? '...' : ''
                }`
              : '';
            return `• ${food.name}${description}`;
          })
          .join('\n');

        embed.addFields({
          name: `📁 ${categoryName}`,
          value: foodList || 'No foods in this category',
          inline: false,
        });
      }

      embed.setFooter({
        text: `Page ${currentPage}/${totalPages} • Total Foods: ${foods.length}`,
      });
    }

    return [embed, currentPage, totalPages];
  }

  async createInfoFoodSelect(
    page: number,
    totalPages: number,
    guildId: string,
  ) {
    const foods = await this.foodRepository.find({
      where: { guildId },
      relations: ['category'],
      skip: (page - 1) * this.ITEMS_PER_PAGE,
      take: this.ITEMS_PER_PAGE,
      order: {
        category: { name: 'ASC' },
        name: 'ASC',
      },
    });

    if (foods.length === 0) {
      return null;
    }

    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('info_food_select')
          .setPlaceholder('Select a food to view info')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel food info view')
              .setValue('cancel'),
          ]),
      );

    foods.forEach((food) => {
      (selectMenu.components[0] as StringSelectMenuBuilder).addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(food.name)
          .setDescription(
            `Category: ${food.category?.name || 'None'} | ${
              food.description?.slice(0, 50) || 'No description'
            }`,
          )
          .setValue(`info_${food.id}`),
      );
    });

    return selectMenu;
  }

  async createFoodInfoEmbed(
    food: Food,
  ): Promise<[EmbedBuilder, AttachmentBuilder | null]> {
    const embed = new EmbedBuilder()
      .setTitle(`🍽️ ${food.name}`)
      .setColor(Colors.Blue);

    // Add basic information fields
    const fields = [
      {
        name: '📁 Category',
        value: food.category?.name || 'None',
        inline: true,
      },
      {
        name: '👤 Added By',
        value: `<@${food.userId}>`,
        inline: true,
      },
    ];

    // Add description if available
    if (food.description) {
      fields.push({
        name: '📝 Description',
        value: food.description,
        inline: false,
      });
    }

    embed.addFields(fields);

    let attachment: AttachmentBuilder | null = null;

    // Handle image if available
    if (food.image) {
      const fullPath = this.uploadService.getFullPath(food.image);
      if (existsSync(fullPath)) {
        try {
          const imageBuffer = await fs.promises.readFile(fullPath);
          attachment = new AttachmentBuilder(imageBuffer, {
            name: 'food-image.png',
            description: `Image for ${food.name}`,
          });
          embed.setImage('attachment://food-image.png');
        } catch (error) {
          this.logger.warn(
            `Could not load image for food ${food.name} at ${fullPath}:`,
            error,
          );
        }
      }
    }

    embed.setTimestamp();
    return [embed, attachment];
  }

  async handleInfoFlow(
    message: Message,
    originalInteraction: any,
    currentPage: number,
  ): Promise<void> {
    const infoCollector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === originalInteraction.user.id,
      time: 300000, // 5 minutes
    });

    infoCollector.on('collect', async (interaction) => {
      try {
        if (interaction.customId === 'back_to_menu') {
          await interaction.update({
            content: 'Please select a food option:',
            components: [originalInteraction.foodService.createFoodMainMenu()],
            embeds: [],
          });
          infoCollector.stop();
          return;
        }

        if (interaction.isButton()) {
          if (
            interaction.customId === 'next_page' ||
            interaction.customId === 'prev_page'
          ) {
            currentPage += interaction.customId === 'next_page' ? 1 : -1;

            const [newEmbed, newCurrentPage, newTotalPages] =
              await this.createFoodListEmbed(currentPage, interaction.guildId);

            const newInfoSelectMenu = await this.createInfoFoodSelect(
              newCurrentPage,
              newTotalPages,
              interaction.guildId,
            );

            const updatedComponents = [];

            if (newTotalPages > 1) {
              updatedComponents.push(
                this.createPaginationButtons(newCurrentPage, newTotalPages),
              );
            }

            if (newInfoSelectMenu) {
              updatedComponents.push(newInfoSelectMenu);
            }

            await interaction.update({
              embeds: [newEmbed],
              components: updatedComponents,
            });
          } else if (interaction.customId === 'close_info') {
            await interaction.update({
              content: 'Food info view closed.',
              embeds: [],
              components: [],
              files: [],
            });
            infoCollector.stop();
          }
        }

        if (
          interaction.isStringSelectMenu() &&
          interaction.customId === 'info_food_select'
        ) {
          const selected = interaction.values[0];

          if (selected === 'cancel') {
            await interaction.update({
              content: 'Food info view canceled.',
              embeds: [],
              components: [],
            });
            infoCollector.stop();
            return;
          }

          const foodId = selected.replace('info_', '');
          const food = await this.foodRepository.findOne({
            where: { id: foodId },
            relations: ['category'],
          });

          if (!food) {
            await interaction.reply({
              content: 'Food not found!',
              ephemeral: true,
            });
            return;
          }

          const [infoEmbed, imageAttachment] =
            await this.createFoodInfoEmbed(food);

          const closeButton =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('close_info')
                .setLabel('Close')
                .setStyle(ButtonStyle.Secondary),
            );

          const updateOptions: any = {
            content: null,
            embeds: [infoEmbed],
            components: [closeButton],
          };

          if (imageAttachment) {
            updateOptions.files = [imageAttachment];
          }

          await interaction.update(updateOptions);
        }
      } catch (error) {
        this.logger.error('Error in info flow:', error);
        await interaction.followUp({
          content:
            'An error occurred while viewing food info. Please try again.',
          ephemeral: true,
        });
      }
    });

    infoCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        originalInteraction
          .editReply({
            content: 'Food info view timed out. Please try again.',
            components: [],
            embeds: [],
            files: [],
          })
          .catch(() => {});
      }
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  Message,
  MessageComponentInteraction,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Food, FoodCategory } from '../entities/food.entity';

@Injectable()
export class FoodsService {
  private readonly logger = new Logger(FoodsService.name);
  private readonly ITEMS_PER_PAGE = 4;

  private readonly foodEmojis = [
    '🍕',
    '🍔',
    '🍟',
    '🌭',
    '🍿',
    '🥨',
    '🥯',
    '🥖',
    '🥐',
    '🥪',
    '🥙',
    '🧆',
    '🌮',
    '🌯',
    '🥗',
    '🥘',
    '🫕',
    '🥫',
    '🍝',
    '🍜',
    '🍲',
    '🍛',
    '🍣',
    '🍱',
    '🥟',
    '🦪',
    '🍤',
    '🍗',
    '🍖',
    '🍘',
    '🍙',
    '🍚',
    '🍥',
    '🥠',
    '🥮',
    '🍡',
    '🍧',
    '🍨',
    '🍦',
    '🥧',
    '🧁',
    '🍰',
    '🎂',
    '🍮',
    '🍭',
    '🍬',
    '🍫',
    '🍩',
    '🍪',
    '🌰',
  ];
  constructor(
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
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

  // Get a random food emoji
  private getRandomFoodEmoji(): string {
    return this.foodEmojis[Math.floor(Math.random() * this.foodEmojis.length)];
  }

  async createFoodListEmbed(
    page: number = 1,
    forDeletion: boolean = false,
    guildId: string,
  ): Promise<[EmbedBuilder, number, number]> {
    await this.updateExistingRecordsWithGuildId(guildId);

    // Get foods with their categories
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
      .setTitle(forDeletion ? '🗑️ Delete Food' : '🍽️ Food Menu')
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
            const emoji = this.getRandomFoodEmoji();
            const description = food.description
              ? `\n   ↳ ${food.description.slice(0, 50)}${food.description.length > 50 ? '...' : ''}`
              : '';
            return `${emoji} ${food.name}${description}`;
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

  // Add food

  // Create food category selection menu for the add food form
  async createFoodCategorySelect() {
    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('add_food_category_select')
          .setPlaceholder('Select a category for the food'),
      );

    const categories = await this.foodCategoryRepository.find();

    categories.forEach((category) => {
      (selectMenu.components[0] as StringSelectMenuBuilder).addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setDescription(
            category.description?.slice(0, 50) || 'No description',
          )
          .setValue(`category_${category.id}`),
      );
    });

    return selectMenu;
  }

  // Create the add food modal
  createAddFoodModal(categoryId: string) {
    return new ModalBuilder()
      .setCustomId(`add_food_modal_${categoryId}`)
      .setTitle('Add New Food')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('food_name')
            .setLabel('Food Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter food name')
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('food_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter food description')
            .setRequired(false)
            .setMaxLength(200),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('food_image')
            .setLabel('Image URL')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter image URL (optional)')
            .setRequired(false)
            .setMaxLength(200),
        ),
      );
  }

  // Handle adding new food
  async handleAddFood(
    categoryId: string,
    name: string,
    description: string | null,
    image: string | null,
    userId: string,
    guildId: string,
  ): Promise<[Food | null, string | null]> {
    try {
      // Check if food with same name exists in the same category
      const existingFood = await this.foodRepository.findOne({
        where: {
          name,
          categoryId,
          guildId,
        },
      });

      if (existingFood) {
        return [null, `Food "${name}" already exists in this category!`];
      }

      // Create new food
      const newFood = new Food({
        name,
        description: description || null,
        image: image || null,
        categoryId,
        userId,
        guildId,
      });

      const savedFood = await this.foodRepository.save(newFood);
      return [savedFood, null];
    } catch (error) {
      this.logger.error('Error adding food:', error);
      return [null, 'Failed to create food. Please try again.'];
    }
  }

  // Create a new add food message
  async createAddFoodMessage(
    interaction: MessageComponentInteraction,
    isFollowUp: boolean = false,
  ): Promise<void> {
    const categorySelectMenu = await this.createFoodCategorySelect();

    const addFoodEmbed = new EmbedBuilder()
      .setTitle('🍽️ Add New Food')
      .setDescription('Please select a category for the new food item.')
      .setColor(Colors.Blue)
      .setTimestamp();

    const components = [
      categorySelectMenu,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_menu')
          .setLabel('Back to Menu')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    const addMessage = isFollowUp
      ? await interaction.followUp({
          embeds: [addFoodEmbed],
          components: components,
          ephemeral: true,
          fetchReply: true,
        })
      : await interaction.reply({
          embeds: [addFoodEmbed],
          components: components,
          ephemeral: true,
          fetchReply: true,
        });

    this.handleAddFlow(addMessage as Message, interaction);
  }

  // Handle the add food flow
  private async handleAddFlow(
    addMessage: Message,
    originalInteraction: MessageComponentInteraction,
  ): Promise<void> {
    const addCollector = addMessage.createMessageComponentCollector({
      filter: (interaction) =>
        interaction.user.id === originalInteraction.user.id,
      time: 300000,
    });

    addCollector.on('collect', async (interaction) => {
      if (interaction.isButton() && interaction.customId === 'back_to_menu') {
        await interaction.update({
          content: 'Please select a food option:',
          components: [this.createFoodMainMenu()],
          embeds: [],
        });
        addCollector.stop();
        return;
      }

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'add_food_category_select'
      ) {
        const selectedCategory = interaction.values[0];
        const categoryId = selectedCategory.replace('category_', '');

        try {
          await interaction.showModal(this.createAddFoodModal(categoryId));

          const modalSubmit = await interaction.awaitModalSubmit({
            time: 300000,
            filter: (i) => i.customId === `add_food_modal_${categoryId}`,
          });

          const name = modalSubmit.fields.getTextInputValue('food_name');
          const description =
            modalSubmit.fields.getTextInputValue('food_description');
          const image = modalSubmit.fields.getTextInputValue('food_image');

          const [newFood, error] = await this.handleAddFood(
            categoryId,
            name,
            description,
            image,
            modalSubmit.user.id,
            modalSubmit.guildId,
          );

          if (error) {
            await modalSubmit.reply({
              content: `❌ ${error}`,
              ephemeral: true,
            });
            return;
          }

          const category = await this.foodCategoryRepository.findOne({
            where: { id: categoryId },
          });

          // Send public success message
          await interaction.channel.send({
            content: `✅ Food "${newFood.name}" has been added to the ${category.name} category!`,
          });

          // First, acknowledge the modal submission
          await modalSubmit.reply({
            content: 'Processing...',
            ephemeral: true,
          });

          // Then, clean up the category selection message
          try {
            await interaction.update({
              content: 'Food added successfully!',
              components: [],
              embeds: [],
            });
          } catch (error) {
            this.logger.warn(
              'Could not update original message, may have been deleted',
            );
          }

          // Finally, edit the modal reply with the "Add Another" options
          await modalSubmit.editReply({
            content: 'Would you like to add another food?',
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('add_another')
                  .setLabel('Add Another')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId('finish_adding')
                  .setLabel('Finish')
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
          });

          const followupCollector =
            modalSubmit.channel.createMessageComponentCollector({
              filter: (i) =>
                i.user.id === modalSubmit.user.id &&
                ['add_another', 'finish_adding'].includes(i.customId),
              time: 300000,
              max: 1,
            });

          followupCollector.on('collect', async (followupInteraction) => {
            if (followupInteraction.customId === 'add_another') {
              // Clean up both messages
              try {
                await interaction.editReply({
                  // Original category selection message
                  content: 'Food added successfully.',
                  components: [],
                  embeds: [],
                });
              } catch (error) {
                this.logger.warn(
                  'Could not update original message, may have been deleted',
                );
              }

              await followupInteraction.update({
                // "Add Another" message
                content: 'Starting new food addition...',
                components: [],
              });

              // Create a fresh add food message with followUp
              await this.createAddFoodMessage(followupInteraction, true);
            } else {
              // Close both messages when finishing
              try {
                await interaction.editReply({
                  // Original category selection message
                  content: 'Food added successfully.',
                  components: [],
                  embeds: [],
                });
              } catch (error) {
                this.logger.warn(
                  'Could not update original message, may have been deleted',
                );
              }

              await followupInteraction.update({
                // "Add Another" message
                content: 'Food management completed.',
                components: [],
              });
            }
            // Stop both collectors
            addCollector.stop();
            followupCollector.stop();
          });
        } catch (error) {
          this.logger.error('Error handling food addition:', error);
          if (error instanceof Error && error.message.includes('time')) {
            await interaction.followUp({
              content: 'The operation timed out. Please try again.',
              ephemeral: true,
            });
          } else {
            await interaction.followUp({
              content:
                'An error occurred while adding the food. Please try again.',
              ephemeral: true,
            });
          }
        }
      }
    });

    addCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        originalInteraction
          .editReply({
            content: 'Food addition timed out. Please try again.',
            components: [],
            embeds: [],
          })
          .catch(() => {});
      }
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Food, FoodCategory } from '../entities/food.entity';
import { UploadService } from '../../../services/upload/upload.service';
import { existsSync } from 'fs';
import * as fs from 'node:fs';

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
    private uploadService: UploadService,
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

  // private async handleAddFood(
  //   categoryId: string,
  //   name: string,
  //   description: string | null,
  //   image: string | null,
  //   userId: string,
  //   guildId: string,
  // ): Promise<[Food | null, string | null]> {
  //   try {
  //     // Check if food with same name exists in the guild (regardless of category)
  //     const existingFood = await this.foodRepository.findOne({
  //       where: {
  //         name,
  //         guildId,
  //       },
  //     });
  //
  //     if (existingFood) {
  //       return [null, `Food "${name}" already exists in this server!`];
  //     }
  //
  //     // Create new food
  //     const newFood = new Food({
  //       name,
  //       description: description || null,
  //       image: image || null,
  //       categoryId,
  //       userId,
  //       guildId,
  //     });
  //
  //     const savedFood = await this.foodRepository.save(newFood);
  //     return [savedFood, null];
  //   } catch (error) {
  //     this.logger.error('Error adding food:', error);
  //     return [null, 'Failed to create food. Please try again.'];
  //   }
  // }

  // Create a new add food message
  public async createAddFoodMessage(
    interaction: MessageComponentInteraction,
    isFollowUp: boolean = false,
  ): Promise<void> {
    try {
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

      // Handle the message creation differently based on whether it's a follow-up
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

      // Start handling the add flow
      await this.handleAddFlow(addMessage as Message, interaction);
    } catch (error) {
      this.logger.error('Error creating add food message:', error);
      const errorResponse = {
        content:
          'An error occurred while setting up the food addition. Please try again.',
        components: [],
        embeds: [],
        ephemeral: true,
      };

      if (isFollowUp) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    }
  }

  // Handle the add food flow
  private async handleAddFlow(
    addMessage: Message,
    originalInteraction: MessageComponentInteraction,
  ): Promise<void> {
    const addCollector = addMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === originalInteraction.user.id,
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
          // Show the modal for food details
          await interaction.showModal(this.createAddFoodModal(categoryId));

          const modalSubmit = await interaction.awaitModalSubmit({
            time: 300000,
            filter: (i) => i.customId === `add_food_modal_${categoryId}`,
          });

          const name = modalSubmit.fields.getTextInputValue('food_name');
          const description =
            modalSubmit.fields.getTextInputValue('food_description');

          // Create attachment button row
          const attachmentRow =
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('attach_image')
                .setLabel('Add Image')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📎'),
              new ButtonBuilder()
                .setCustomId('skip_image')
                .setLabel('Skip')
                .setStyle(ButtonStyle.Secondary),
            );

          // Reply to modal with attachment options
          const attachmentMessage = await modalSubmit.reply({
            content: 'Would you like to add an image for this food?',
            components: [attachmentRow],
            ephemeral: true,
            fetchReply: true,
          });

          // Create collector for the attachment buttons
          const attachmentCollector =
            attachmentMessage.createMessageComponentCollector({
              filter: (i) => i.user.id === modalSubmit.user.id,
              time: 300000,
              max: 1,
            });

          attachmentCollector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'attach_image') {
              // Update with upload instructions
              await buttonInteraction.update({
                content:
                  '📤 **To add an image:**\n' +
                  '1. Click the plus icon (+) next to the chat box\n' +
                  '2. Select your image file\n' +
                  '3. Send it in this channel\n\n' +
                  '*Waiting for your image upload...*',
                components: [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('cancel_upload')
                      .setLabel('Cancel')
                      .setStyle(ButtonStyle.Secondary),
                  ),
                ],
              });

              // Create collector for the file upload
              const messageCollector =
                buttonInteraction.channel.createMessageCollector({
                  filter: (m) =>
                    m.author.id === modalSubmit.user.id &&
                    m.attachments.size > 0,
                  time: 300000,
                  max: 1,
                });

              messageCollector.on('collect', async (message) => {
                const attachment = message.attachments.first();

                if (!attachment.contentType?.startsWith('image/')) {
                  await buttonInteraction.editReply({
                    content: '❌ Please upload an image file (PNG, JPG, etc.)',
                    components: [
                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                          .setCustomId('cancel_upload')
                          .setLabel('Cancel')
                          .setStyle(ButtonStyle.Secondary),
                      ),
                    ],
                  });
                  return;
                }

                try {
                  await buttonInteraction.editReply({
                    content: '⏳ Processing image upload, please wait...',
                    components: [],
                  });

                  await this.processFoodAddition(
                    modalSubmit,
                    interaction,
                    categoryId,
                    name,
                    description,
                    attachment.url,
                  );

                  try {
                    await message.delete();
                  } catch (error) {
                    this.logger.warn('Could not delete upload message:', error);
                  }
                } catch (error) {
                  this.logger.error('Error processing upload:', error);
                  await buttonInteraction.editReply({
                    content: '❌ Failed to process image. Please try again.',
                    components: [],
                  });
                }
              });

              messageCollector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                  await buttonInteraction.editReply({
                    content:
                      '⏳ Upload timed out. Food will be added without an image.',
                    components: [],
                  });

                  await this.processFoodAddition(
                    modalSubmit,
                    interaction,
                    categoryId,
                    name,
                    description,
                    null,
                  );
                }
              });
            } else if (buttonInteraction.customId === 'skip_image') {
              await this.processFoodAddition(
                modalSubmit,
                interaction,
                categoryId,
                name,
                description,
                null,
              );
            }
          });
        } catch (error) {
          this.logger.error('Error in add flow:', error);
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

  private async processFoodAddition(
    modalSubmit,
    interaction: MessageComponentInteraction,
    categoryId: string,
    name: string,
    description: string,
    imageUrl: string | null,
  ) {
    let uploadedImagePath: string | null = null;

    if (imageUrl) {
      try {
        uploadedImagePath = await this.uploadService.uploadFromDiscord(
          imageUrl,
          modalSubmit.guildId,
          'foods',
        );

        if (!uploadedImagePath) {
          await modalSubmit.editReply({
            content:
              '❌ Failed to upload image. Food will be added without an image.',
            components: [],
          });
          uploadedImagePath = null;
        }
      } catch (error) {
        this.logger.error('Upload error:', error);
        await modalSubmit.editReply({
          content:
            '❌ Error uploading image. Food will be added without an image.',
          components: [],
        });
        uploadedImagePath = null;
      }
    }

    const [newFood, error] = await this.handleAddFood(
      categoryId,
      name,
      description,
      uploadedImagePath,
      modalSubmit.user.id,
      modalSubmit.guildId,
    );

    if (error) {
      await modalSubmit.editReply({
        content: `❌ ${error}`,
        components: [],
      });
      return;
    }

    const category = await this.foodCategoryRepository.findOne({
      where: { id: categoryId },
    });

    try {
      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ New Food Added')
        .setColor(Colors.Green)
        .addFields([
          { name: 'Name', value: newFood.name, inline: false },
          { name: 'Category', value: category.name, inline: false },
        ]);

      if (description) {
        successEmbed.addFields([{ name: 'Description', value: description }]);
      }

      successEmbed.setTimestamp();

      // Update the processing message to show success
      await modalSubmit.editReply({
        content: 'Food added successfully!',
        components: [],
        embeds: [],
      });

      // Update the original category selection message
      try {
        await interaction.editReply({
          content: 'Food added successfully!',
          components: [],
          embeds: [],
        });
      } catch (error) {
        this.logger.warn('Could not update original message:', error);
      }

      // Send success message with image if available
      if (uploadedImagePath) {
        const fullPath = this.uploadService.getFullPath(uploadedImagePath);
        if (existsSync(fullPath)) {
          const imageBuffer = await fs.promises.readFile(fullPath);
          const imageAttachment = new AttachmentBuilder(imageBuffer, {
            name: 'food-image.png',
            description: `Image for ${name}`,
          });
          successEmbed.setImage('attachment://food-image.png');

          await interaction.channel.send({
            embeds: [successEmbed],
            files: [imageAttachment],
          });
        } else {
          await interaction.channel.send({
            embeds: [successEmbed],
          });
        }
      } else {
        await interaction.channel.send({
          embeds: [successEmbed],
        });
      }

      // Add "Add Another" option with new message
      const followUpMessage = await modalSubmit.followUp({
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
        ephemeral: true,
        fetchReply: true,
      });

      // Create collector for Add Another/Finish buttons
      const addAnotherCollector =
        followUpMessage.createMessageComponentCollector({
          filter: (i) =>
            i.user.id === modalSubmit.user.id &&
            ['add_another', 'finish_adding'].includes(i.customId),
          time: 300000,
          max: 1,
        });

      addAnotherCollector.on('collect', async (followupInteraction) => {
        try {
          if (followupInteraction.customId === 'add_another') {
            // Update the "Add Another" message
            await followupInteraction.update({
              content: 'Starting new food addition...',
              components: [],
            });

            // Create new add food message
            await this.createAddFoodMessage(followupInteraction, true);
          } else {
            // Handle finish_adding
            await followupInteraction.update({
              content: 'Food addition completed.',
              components: [],
            });

            // Also update any remaining messages
            try {
              await interaction.editReply({
                content: 'Food addition completed.',
                components: [],
                embeds: [],
              });
            } catch (error) {
              this.logger.warn(
                'Could not update original message on finish:',
                error,
              );
            }
          }
        } catch (error) {
          this.logger.error('Error handling add another interaction:', error);
          await followupInteraction.update({
            content: 'An error occurred. Please try again.',
            components: [],
          });
        }
      });

      addAnotherCollector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          try {
            await followUpMessage.edit({
              content: 'Add another option timed out.',
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('timed_out')
                    .setLabel('Timed Out')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                ),
              ],
            });

            // Update the original message as well
            await interaction.editReply({
              content: 'Food addition timed out.',
              components: [],
              embeds: [],
            });
          } catch (error) {
            this.logger.warn('Could not update timeout messages:', error);
          }
        }
      });
    } catch (error) {
      this.logger.error('Error creating success message:', error);
      // Update both messages with the error
      await modalSubmit.editReply({
        content: `✅ Added food "${name}" to category "${category.name}"${
          error.message ? ` (Note: ${error.message})` : ''
        }`,
        components: [],
      });

      try {
        await interaction.editReply({
          content: `Food "${name}" added with some issues. Please check the result.`,
          components: [],
          embeds: [],
        });
      } catch (error) {
        this.logger.warn(
          'Could not update original message with error:',
          error,
        );
      }
    }
  }

  // edit food

  async createEditFoodCategorySelect(
    currentPage: number,
    totalPages: number,
    guildId: string,
  ) {
    const foods = await this.foodRepository.find({
      where: { guildId },
      relations: ['category'],
      skip: (currentPage - 1) * this.ITEMS_PER_PAGE,
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
          .setCustomId('edit_food_select')
          .setPlaceholder('Select food to edit')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel food editing')
              .setValue('cancel'),
          ]),
      );

    foods.forEach((food) => {
      (selectMenu.components[0] as StringSelectMenuBuilder).addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(food.name)
          .setDescription(
            `Category: ${food.category?.name || 'None'} | ${food.description?.slice(0, 50) || 'No description'}`,
          )
          .setValue(`edit_${food.id}`),
      );
    });

    return selectMenu;
  }

  // Create edit food modal
  createEditFoodModal(food: Food, category: FoodCategory) {
    return new ModalBuilder()
      .setCustomId(`edit_food_modal_${food.id}`)
      .setTitle('Edit Food')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('food_name')
            .setLabel('Food Name')
            .setStyle(TextInputStyle.Short)
            .setValue(food.name)
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('food_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(food.description || '')
            .setRequired(false)
            .setMaxLength(200),
        ),
      );
  }

  // Handle edit food
  async handleEditFood(
    foodId: string,
    name: string,
    description: string | null,
    newImage: string | null,
    guildId: string,
  ): Promise<[Food | null, string | null]> {
    let oldImagePath: string | null = null;

    try {
      // Find existing food with the same name (excluding current food)
      const existingFood = await this.foodRepository.findOne({
        where: {
          name,
          id: Not(foodId),
          guildId,
        },
        relations: ['category'],
      });

      if (existingFood) {
        // If we have a new image but got an error, clean it up
        if (newImage) {
          await this.uploadService.deleteFile(newImage);
        }
        return [null, `Food "${name}" already exists in this server!`];
      }

      // Find the food we want to edit
      const food = await this.foodRepository.findOne({
        where: { id: foodId, guildId },
        relations: ['category'],
      });

      if (!food) {
        // If we have a new image but food not found, clean it up
        if (newImage) {
          await this.uploadService.deleteFile(newImage);
        }
        return [null, 'Food not found!'];
      }

      // Store old image path for cleanup after successful update
      oldImagePath = food.image;

      // Update food properties
      food.name = name;
      food.description = description || null;

      // Only update image if a new one is provided (undefined means keep existing)
      if (newImage !== undefined) {
        food.image = newImage;
      }

      try {
        const savedFood = await this.foodRepository.save(food);

        // If update was successful and we have a new image, clean up the old one
        if (oldImagePath && newImage) {
          await this.uploadService.deleteFile(oldImagePath);
          this.logger.log(`Successfully removed old image: ${oldImagePath}`);
        }

        return [savedFood, null];
      } catch (error) {
        // If save failed and we have a new image, clean it up
        if (newImage) {
          await this.uploadService.deleteFile(newImage);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error('Error editing food:', error);
      return [null, 'Failed to update food. Please try again.'];
    }
  }

  public async handleEditSuccess(
    originalInteraction: MessageComponentInteraction,
    currentInteraction: ModalSubmitInteraction | MessageComponentInteraction,
    updatedFood: Food,
    imagePath: string | null,
  ) {
    try {
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Food Updated')
        .setColor(Colors.Green)
        .addFields([
          { name: 'Name', value: updatedFood.name, inline: false },
          { name: 'Category', value: updatedFood.category.name, inline: false },
        ]);

      if (updatedFood.description) {
        successEmbed.addFields([
          { name: 'Description', value: updatedFood.description },
        ]);
      }

      successEmbed.setTimestamp();

      try {
        // First, update the processing message to show success
        await this.handleSuccessResponse(
          currentInteraction,
          'Food updated successfully!',
        );

        // Update the original food selection message
        try {
          await originalInteraction.editReply({
            content: 'Food updated successfully!',
            components: [],
            embeds: [],
          });
        } catch (error) {
          this.logger.warn('Could not update original message:', error);
        }

        // Send the detailed success message to the channel
        if (imagePath) {
          const fullPath = this.uploadService.getFullPath(imagePath);
          if (existsSync(fullPath)) {
            try {
              const imageBuffer = await fs.promises.readFile(fullPath);
              const imageAttachment = new AttachmentBuilder(imageBuffer, {
                name: 'food-image.png',
                description: `Image for ${updatedFood.name}`,
              });
              successEmbed.setImage('attachment://food-image.png');

              await originalInteraction.channel.send({
                embeds: [successEmbed],
                files: [imageAttachment],
              });
            } catch (error) {
              this.logger.error(
                'Error attaching image to success message:',
                error,
              );
              await originalInteraction.channel.send({
                embeds: [successEmbed],
              });
            }
          } else {
            this.logger.warn(`Image file not found at path: ${fullPath}`);
            await originalInteraction.channel.send({
              embeds: [successEmbed],
            });
          }
        } else {
          await originalInteraction.channel.send({
            embeds: [successEmbed],
          });
        }

        // Add "Edit Another" option
        const editAnotherComponents = [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('edit_another')
              .setLabel('Edit Another')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('finish_editing')
              .setLabel('Finish')
              .setStyle(ButtonStyle.Secondary),
          ),
        ];

        const followUpMessage = await this.handleFollowUpResponse(
          currentInteraction,
          'Would you like to edit another food?',
          editAnotherComponents,
          [],
          true,
        );

        // Create collector for Edit Another/Finish buttons
        const editAnotherCollector =
          followUpMessage.createMessageComponentCollector({
            filter: (i) =>
              i.user.id === currentInteraction.user.id &&
              ['edit_another', 'finish_editing'].includes(i.customId),
            time: 300000,
            max: 1,
          });

        editAnotherCollector.on('collect', async (followupInteraction) => {
          try {
            if (followupInteraction.customId === 'edit_another') {
              await followupInteraction.update({
                content: 'Starting new food edit...',
                components: [],
              });

              await this.createEditFoodMessage(followupInteraction, true);

              try {
                await originalInteraction.editReply({
                  content: 'Started new food edit.',
                  components: [],
                  embeds: [],
                });
              } catch (error) {
                this.logger.warn(
                  'Could not update original message for new edit:',
                  error,
                );
              }
            } else {
              await followupInteraction.update({
                content: 'Food editing completed.',
                components: [],
              });

              try {
                await originalInteraction.editReply({
                  content: 'Food editing completed.',
                  components: [],
                  embeds: [],
                });
              } catch (error) {
                this.logger.warn(
                  'Could not update original message on finish:',
                  error,
                );
              }
            }
          } catch (error) {
            this.logger.error(
              'Error handling edit another interaction:',
              error,
            );
            await followupInteraction.update({
              content: 'An error occurred. Please try again.',
              components: [],
            });
          }
        });

        editAnotherCollector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            try {
              await followUpMessage.edit({
                content: 'Edit another option timed out.',
                components: [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('timed_out')
                      .setLabel('Timed Out')
                      .setStyle(ButtonStyle.Secondary)
                      .setDisabled(true),
                  ),
                ],
              });

              await originalInteraction.editReply({
                content: 'Food editing timed out.',
                components: [],
                embeds: [],
              });
            } catch (error) {
              this.logger.warn('Could not update timeout messages:', error);
            }
          }
        });
      } catch (error) {
        this.logger.error('Error handling success messages:', error);
        await this.handleSuccessResponse(
          currentInteraction,
          `✅ Successfully updated food "${updatedFood.name}"${
            error.message ? ` (Note: ${error.message})` : ''
          }`,
        );
      }
    } catch (error) {
      this.logger.error('Error handling success messages:', error);
      await this.handleSuccessResponse(
        currentInteraction,
        `✅ Successfully updated food "${updatedFood.name}"${
          error.message ? ` (Note: ${error.message})` : ''
        }`,
      );
    }
  }

  public async createEditFoodMessage(
    interaction: MessageComponentInteraction,
    isFollowUp: boolean = false,
  ): Promise<void> {
    try {
      let editCurrentPage = 1;
      const [editInitialEmbed, editInitialCurrentPage, editTotalPages] =
        await this.createFoodListEmbed(
          editCurrentPage,
          false,
          interaction.guildId,
        );

      const editSelectMenu = await this.createEditFoodCategorySelect(
        editInitialCurrentPage,
        editTotalPages,
        interaction.guildId,
      );

      const editComponents = [];

      if (editTotalPages > 1) {
        editComponents.push(
          this.createPaginationButtons(editInitialCurrentPage, editTotalPages),
        );
      }

      if (editSelectMenu) {
        editComponents.push(editSelectMenu);
      } else {
        editComponents.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('back_to_menu')
              .setLabel('Back to Menu')
              .setStyle(ButtonStyle.Secondary),
          ),
        );
      }

      // Send the edit message based on whether it's a follow-up or not
      const editMessage = isFollowUp
        ? await interaction.followUp({
            content: editSelectMenu
              ? 'Select a food to edit:'
              : 'No foods available to edit.',
            embeds: [editInitialEmbed],
            components: editComponents,
            ephemeral: true,
            fetchReply: true,
          })
        : await interaction.reply({
            content: editSelectMenu
              ? 'Select a food to edit:'
              : 'No foods available to edit.',
            embeds: [editInitialEmbed],
            components: editComponents,
            ephemeral: true,
            fetchReply: true,
          });

      // Start the edit flow
      await this.handleEditFlow(
        editMessage as Message,
        interaction,
        editCurrentPage,
      );
    } catch (error) {
      this.logger.error('Error creating edit food message:', error);
      const errorResponse = {
        content:
          'An error occurred while setting up the food editing. Please try again.',
        components: [],
        embeds: [],
        ephemeral: true,
      };

      if (isFollowUp) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    }
  }

  private async handleEditFlow(
    editMessage: Message,
    originalInteraction: MessageComponentInteraction,
    currentPage: number,
  ): Promise<void> {
    const editCollector = editMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === originalInteraction.user.id,
      time: 300000,
    });

    editCollector.on('collect', async (interaction) => {
      try {
        if (interaction.customId === 'back_to_menu') {
          await interaction.update({
            content: 'Please select a food option:',
            components: [this.createFoodMainMenu()],
            embeds: [],
          });
          editCollector.stop();
          return;
        }

        if (interaction.isButton()) {
          if (interaction.customId === 'next_page') {
            currentPage++;
          } else if (interaction.customId === 'prev_page') {
            currentPage--;
          }

          const [newEmbed, newCurrentPage, newTotalPages] =
            await this.createFoodListEmbed(
              currentPage,
              false,
              interaction.guildId,
            );

          const newEditSelectMenu = await this.createEditFoodCategorySelect(
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

          if (newEditSelectMenu) {
            updatedComponents.push(newEditSelectMenu);
          } else {
            updatedComponents.push(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('back_to_menu')
                  .setLabel('Back to Menu')
                  .setStyle(ButtonStyle.Secondary),
              ),
            );
          }

          await interaction.update({
            embeds: [newEmbed],
            components: updatedComponents,
          });
        }

        if (
          interaction.isStringSelectMenu() &&
          interaction.customId === 'edit_food_select'
        ) {
          const selected = interaction.values[0];

          if (selected === 'cancel') {
            await interaction.update({
              content: 'Food editing canceled.',
              embeds: [],
              components: [],
            });
            editCollector.stop();
            return;
          }

          const foodId = selected.replace('edit_', '');
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

          await interaction.showModal(
            this.createEditFoodModal(food, food.category),
          );

          try {
            const modalSubmit = await interaction.awaitModalSubmit({
              time: 300000,
              filter: (i) => i.customId === `edit_food_modal_${food.id}`,
            });

            const newName = modalSubmit.fields.getTextInputValue('food_name');
            const newDescription =
              modalSubmit.fields.getTextInputValue('food_description');

            // Create image change options
            const attachmentRow =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('change_image')
                  .setLabel('Change Image')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('📎'),
                new ButtonBuilder()
                  .setCustomId('keep_image')
                  .setLabel('Keep Current Image')
                  .setStyle(ButtonStyle.Secondary),
              );

            // Show image change options
            const imageChoiceMessage = await modalSubmit.reply({
              content: 'Would you like to change the food image?',
              components: [attachmentRow],
              ephemeral: true,
              fetchReply: true,
            });

            // Create collector for image choice buttons
            const imageChoiceCollector =
              imageChoiceMessage.createMessageComponentCollector({
                filter: (i) => i.user.id === modalSubmit.user.id,
                time: 300000,
                max: 1,
              });

            imageChoiceCollector.on('collect', async (buttonInteraction) => {
              if (buttonInteraction.customId === 'change_image') {
                // Handle image upload
                await buttonInteraction.update({
                  content:
                    '📤 **To add a new image:**\n' +
                    '1. Click the plus icon (+) next to the chat box\n' +
                    '2. Select your image file\n' +
                    '3. Send it in this channel\n\n' +
                    '*Waiting for your image upload...*',
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setCustomId('cancel_upload')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    ),
                  ],
                });

                const messageCollector =
                  buttonInteraction.channel.createMessageCollector({
                    filter: (m) =>
                      m.author.id === modalSubmit.user.id &&
                      m.attachments.size > 0,
                    time: 300000,
                    max: 1,
                  });

                messageCollector.on('collect', async (message) => {
                  const attachment = message.attachments.first();

                  if (!attachment.contentType?.startsWith('image/')) {
                    await buttonInteraction.editReply({
                      content:
                        '❌ Please upload an image file (PNG, JPG, etc.)',
                      components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                          new ButtonBuilder()
                            .setCustomId('cancel_upload')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary),
                        ),
                      ],
                    });
                    return;
                  }

                  try {
                    await buttonInteraction.editReply({
                      content: '⏳ Processing image upload, please wait...',
                      components: [],
                    });

                    const uploadedImagePath =
                      await this.uploadService.uploadFromDiscord(
                        attachment.url,
                        modalSubmit.guildId,
                        'foods',
                      );

                    if (!uploadedImagePath) {
                      await buttonInteraction.editReply({
                        content: '❌ Failed to upload image. Please try again.',
                        components: [],
                      });
                      return;
                    }

                    const [updatedFood, error] = await this.handleEditFood(
                      food.id,
                      newName,
                      newDescription,
                      uploadedImagePath,
                      originalInteraction.guildId,
                    );

                    if (error) {
                      // If there's an error, clean up the newly uploaded image
                      await this.removeOldImage(uploadedImagePath);
                      await buttonInteraction.editReply({
                        content: `❌ ${error}`,
                        components: [],
                      });
                      return;
                    }

                    // If everything is successful and there was an old image, remove it
                    if (food.image) {
                      await this.removeOldImage(food.image);
                    }

                    await this.handleEditSuccess(
                      originalInteraction,
                      buttonInteraction,
                      updatedFood,
                      uploadedImagePath,
                    );

                    try {
                      await message.delete();
                    } catch (error) {
                      this.logger.warn(
                        'Could not delete upload message:',
                        error,
                      );
                    }
                  } catch (error) {
                    this.logger.error('Error processing upload:', error);
                    await buttonInteraction.editReply({
                      content: '❌ Failed to process image. Please try again.',
                      components: [],
                    });
                  }
                });
              } else if (buttonInteraction.customId === 'keep_image') {
                const [updatedFood, error] = await this.handleEditFood(
                  food.id,
                  newName,
                  newDescription,
                  undefined,
                  originalInteraction.guildId,
                );

                if (error) {
                  await buttonInteraction.update({
                    content: `❌ ${error}`,
                    components: [],
                  });
                  return;
                }

                await this.handleEditSuccess(
                  originalInteraction,
                  buttonInteraction,
                  updatedFood,
                  food.image,
                );
              }
            });

            imageChoiceCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                try {
                  await modalSubmit.editReply({
                    content:
                      'Image choice timed out. Food will keep its current image.',
                    components: [],
                  });

                  const [updatedFood, error] = await this.handleEditFood(
                    food.id,
                    newName,
                    newDescription,
                    undefined,
                    originalInteraction.guildId,
                  );

                  if (!error) {
                    // Handle timeout case by creating a new button interaction
                    const timeoutButton = await modalSubmit.followUp({
                      content: 'Processing timed out update...',
                      components: [],
                      ephemeral: true,
                      fetchReply: true,
                    });

                    if (timeoutButton instanceof Message) {
                      const buttonInteraction =
                        await timeoutButton.createMessageComponentCollector({
                          time: 100,
                          max: 1,
                        }).next;

                      if (buttonInteraction) {
                        await this.handleEditSuccess(
                          originalInteraction,
                          buttonInteraction,
                          updatedFood,
                          food.image,
                        );
                      } else {
                        // Fallback if we can't get a button interaction
                        await modalSubmit.editReply({
                          content:
                            'Food updated successfully (timed out during image selection).',
                          components: [],
                        });

                        // Send success embed to channel
                        const successEmbed = new EmbedBuilder()
                          .setTitle('✅ Food Updated')
                          .setColor(Colors.Green)
                          .addFields([
                            {
                              name: 'Name',
                              value: updatedFood.name,
                              inline: false,
                            },
                            {
                              name: 'Category',
                              value: updatedFood.category.name,
                              inline: false,
                            },
                          ])
                          .setTimestamp();

                        if (updatedFood.description) {
                          successEmbed.addFields([
                            {
                              name: 'Description',
                              value: updatedFood.description,
                            },
                          ]);
                        }

                        await originalInteraction.channel.send({
                          embeds: [successEmbed],
                        });
                      }
                    }
                  }
                } catch (error) {
                  this.logger.error('Error handling timeout:', error);
                  await modalSubmit.editReply({
                    content: 'An error occurred while processing the timeout.',
                    components: [],
                  });
                }
              }
            });
          } catch (error) {
            this.logger.error('Error handling modal or image choice:', error);
            await interaction.followUp({
              content: 'An error occurred. Please try again.',
              ephemeral: true,
            });
          }
        }
      } catch (error) {
        this.logger.error('Error in edit flow:', error);
        await interaction.followUp({
          content:
            'An error occurred while editing the food. Please try again.',
          ephemeral: true,
        });
      }
    });

    editCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        originalInteraction
          .editReply({
            content: 'Food edit selection timed out. Please try again.',
            components: [],
            embeds: [],
          })
          .catch(() => {});
      }
    });
  }

  private async handleSuccessResponse(
    interaction: ModalSubmitInteraction | MessageComponentInteraction,
    content: string,
    components: any[] = [],
    embeds: EmbedBuilder[] = [],
  ) {
    if (interaction.replied) {
      await interaction.editReply({ content, components, embeds });
    } else {
      await interaction.reply({ content, components, embeds, ephemeral: true });
    }
  }

  private async handleFollowUpResponse(
    interaction: ModalSubmitInteraction | MessageComponentInteraction,
    content: string,
    components: any[] = [],
    embeds: EmbedBuilder[] = [],
    fetchReply: boolean = false,
  ) {
    return await interaction.followUp({
      content,
      components,
      embeds,
      ephemeral: true,
      fetchReply,
    });
  }

  private async removeOldImage(imagePath: string): Promise<boolean> {
    try {
      const success = await this.uploadService.deleteFile(imagePath);
      if (success) {
        this.logger.log(`Successfully removed old image: ${imagePath}`);
      } else {
        this.logger.warn(`Failed to remove old image: ${imagePath}`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Error removing old image: ${error.message}`);
      return false;
    }
  }

  // delete food

  public async createDeleteFoodSelect(
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
          .setCustomId('delete_food_select')
          .setPlaceholder('Select food to delete')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel food deletion')
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
          .setValue(`delete_${food.id}`),
      );
    });

    return selectMenu;
  }

  // Create confirmation message for food deletion
  private async createDeleteConfirmationMessage(
    food: Food,
  ): Promise<[EmbedBuilder, AttachmentBuilder | null]> {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Food Deletion')
      .setColor(Colors.Yellow)
      .addFields([
        { name: 'Food Name', value: food.name, inline: false },
        {
          name: 'Category',
          value: food.category?.name || 'None',
          inline: false,
        },
      ]);

    if (food.description) {
      embed.addFields([
        { name: 'Description', value: food.description, inline: false },
      ]);
    }

    embed.setDescription(
      '⚠️ Are you sure you want to delete this food? This action cannot be undone.\n' +
        'All associated data including images will be permanently deleted.',
    );

    let attachment: AttachmentBuilder | null = null;

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

  // Handle the food deletion process
  private async handleFoodDeletion(
    food: Food,
  ): Promise<[boolean, string | null]> {
    try {
      const imagePath = food.image;

      // Delete the food from the database
      await this.foodRepository.remove(food);

      // If the food had an image, delete it
      if (imagePath) {
        const imageDeleted = await this.uploadService.deleteFile(imagePath);
        if (!imageDeleted) {
          this.logger.warn(
            `Could not delete image file for food ${food.name}: ${imagePath}`,
          );
        }
      }

      return [true, null];
    } catch (error) {
      this.logger.error(`Error deleting food ${food.name}:`, error);
      return [false, 'Failed to delete food. Please try again.'];
    }
  }

  // Create and handle the delete food message
  public async createDeleteFoodMessage(
    interaction: MessageComponentInteraction,
    isFollowUp: boolean = false,
  ): Promise<void> {
    try {
      let deleteCurrentPage = 1;
      const [deleteInitialEmbed, deleteInitialCurrentPage, deleteTotalPages] =
        await this.createFoodListEmbed(
          deleteCurrentPage,
          true,
          interaction.guildId,
        );

      const deleteSelectMenu = await this.createDeleteFoodSelect(
        deleteInitialCurrentPage,
        deleteTotalPages,
        interaction.guildId,
      );

      // Prepare components array
      const deleteComponents = [];

      if (deleteTotalPages > 1) {
        deleteComponents.push(
          this.createPaginationButtons(
            deleteInitialCurrentPage,
            deleteTotalPages,
          ),
        );
      }

      if (deleteSelectMenu) {
        deleteComponents.push(deleteSelectMenu);
      } else {
        // If no foods, add a back to menu button
        deleteComponents.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('back_to_menu')
              .setLabel('Back to Menu')
              .setStyle(ButtonStyle.Secondary),
          ),
        );
      }

      // Send the delete message
      const deleteMessage = isFollowUp
        ? await interaction.followUp({
            content: deleteSelectMenu
              ? 'Select a food to delete:'
              : 'No foods available to delete.',
            embeds: [deleteInitialEmbed],
            components: deleteComponents,
            ephemeral: true,
            fetchReply: true,
          })
        : await interaction.reply({
            content: deleteSelectMenu
              ? 'Select a food to delete:'
              : 'No foods available to delete.',
            embeds: [deleteInitialEmbed],
            components: deleteComponents,
            ephemeral: true,
            fetchReply: true,
          });

      // Start the delete flow
      await this.handleDeleteFlow(
        deleteMessage as Message,
        interaction,
        deleteCurrentPage,
      );
    } catch (error) {
      this.logger.error('Error creating delete food message:', error);
      const errorResponse = {
        content:
          'An error occurred while setting up the food deletion. Please try again.',
        components: [],
        embeds: [],
        ephemeral: true,
      };

      if (isFollowUp) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    }
  }

  // Handle the delete flow
  private async handleDeleteFlow(
    deleteMessage: Message,
    originalInteraction: MessageComponentInteraction,
    currentPage: number,
  ): Promise<void> {
    const deleteCollector = deleteMessage.createMessageComponentCollector({
      filter: (i) => i.user.id === originalInteraction.user.id,
      time: 300000, // 5 minutes
    });

    deleteCollector.on('collect', async (interaction) => {
      try {
        if (interaction.customId === 'back_to_menu') {
          await interaction.update({
            content: 'Please select a food option:',
            components: [this.createFoodMainMenu()],
            embeds: [],
          });
          deleteCollector.stop();
          return;
        }

        // Handle pagination
        if (interaction.isButton()) {
          if (
            interaction.customId === 'next_page' ||
            interaction.customId === 'prev_page'
          ) {
            currentPage += interaction.customId === 'next_page' ? 1 : -1;
            const [newEmbed, newCurrentPage, newTotalPages] =
              await this.createFoodListEmbed(
                currentPage,
                true,
                interaction.guildId,
              );

            const newDeleteSelectMenu = await this.createDeleteFoodSelect(
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

            if (newDeleteSelectMenu) {
              updatedComponents.push(newDeleteSelectMenu);
            }

            await interaction.update({
              embeds: [newEmbed],
              components: updatedComponents,
            });
          }
          return;
        }

        // Handle food selection
        if (
          interaction.isStringSelectMenu() &&
          interaction.customId === 'delete_food_select'
        ) {
          const selected = interaction.values[0];

          if (selected === 'cancel') {
            await interaction.update({
              content: 'Food deletion canceled.',
              embeds: [],
              components: [],
            });
            deleteCollector.stop();
            return;
          }

          const foodId = selected.replace('delete_', '');
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

          // Create confirmation message with image
          const [confirmationEmbed, imageAttachment] =
            await this.createDeleteConfirmationMessage(food);

          const confirmationComponents = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId('confirm_delete')
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('cancel_delete')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
            ),
          ];

          // Update with confirmation message and image if available
          const updateOptions: any = {
            embeds: [confirmationEmbed],
            components: confirmationComponents,
          };

          if (imageAttachment) {
            updateOptions.files = [imageAttachment];
          }

          await interaction.update(updateOptions);

          // Handle confirmation
          const confirmationCollector =
            deleteMessage.createMessageComponentCollector({
              filter: (i) => i.user.id === originalInteraction.user.id,
              time: 30000, // 30 seconds
              max: 1,
            });

          confirmationCollector.on('collect', async (confirmInteraction) => {
            if (confirmInteraction.customId === 'confirm_delete') {
              const [success, error] = await this.handleFoodDeletion(food);

              if (success) {
                // Create success embed
                const successEmbed = new EmbedBuilder()
                  .setTitle('✅ Food Deleted')
                  .setColor(Colors.Green)
                  .addFields([
                    { name: 'Food Name', value: food.name },
                    { name: 'Category', value: food.category?.name || 'None' },
                  ])
                  .setTimestamp();

                // Send success messages
                await interaction.channel.send({
                  embeds: [successEmbed],
                });

                await confirmInteraction.update({
                  content: 'Food deleted successfully!',
                  embeds: [],
                  components: [],
                  files: [], // Clear any existing images
                });

                // Offer to delete another
                const deleteAnotherComponents = [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('delete_another')
                      .setLabel('Delete Another')
                      .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                      .setCustomId('finish_deleting')
                      .setLabel('Finish')
                      .setStyle(ButtonStyle.Secondary),
                  ),
                ];

                const followUpMessage = await interaction.followUp({
                  content: 'Would you like to delete another food?',
                  components: deleteAnotherComponents,
                  ephemeral: true,
                  fetchReply: true,
                });

                const deleteAnotherCollector =
                  followUpMessage.createMessageComponentCollector({
                    filter: (i) => i.user.id === originalInteraction.user.id,
                    time: 30000,
                    max: 1,
                  });

                deleteAnotherCollector.on(
                  'collect',
                  async (followupInteraction) => {
                    if (followupInteraction.customId === 'delete_another') {
                      await followupInteraction.update({
                        content: 'Starting new food deletion...',
                        components: [],
                      });
                      await this.createDeleteFoodMessage(
                        followupInteraction,
                        true,
                      );
                    } else {
                      await followupInteraction.update({
                        content: 'Food deletion completed.',
                        components: [],
                      });
                    }
                  },
                );
              } else {
                await confirmInteraction.update({
                  content: `❌ ${error || 'An error occurred while deleting the food.'}`,
                  embeds: [],
                  components: [],
                  files: [], // Clear any existing images
                });
              }
            } else {
              await confirmInteraction.update({
                content: 'Food deletion canceled.',
                embeds: [],
                components: [],
                files: [], // Clear any existing images
              });
            }
          });

          confirmationCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
              interaction
                .editReply({
                  content: 'Food deletion timed out.',
                  embeds: [],
                  components: [],
                  files: [], // Clear any existing images
                })
                .catch(() => {});
            }
          });
        }
      } catch (error) {
        this.logger.error('Error in delete flow:', error);
        await interaction.followUp({
          content:
            'An error occurred while deleting the food. Please try again.',
          ephemeral: true,
        });
      }
    });

    deleteCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        originalInteraction
          .editReply({
            content: 'Food deletion timed out. Please try again.',
            components: [],
            embeds: [],
            files: [], // Clear any existing images
          })
          .catch(() => {});
      }
    });
  }
}

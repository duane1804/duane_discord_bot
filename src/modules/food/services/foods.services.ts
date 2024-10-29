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
  MessageComponentInteraction,
  ModalBuilder,
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

              // Collector for the actual file upload
              const messageCollector =
                buttonInteraction.channel.createMessageCollector({
                  filter: (m) =>
                    m.author.id === modalSubmit.user.id &&
                    m.attachments.size > 0,
                  time: 300000,
                  max: 1,
                });

              // Listen for file upload
              messageCollector.on('collect', async (message) => {
                const attachment = message.attachments.first();

                // Validate file type
                if (!attachment.contentType?.startsWith('image/')) {
                  await buttonInteraction.editReply({
                    content:
                      '❌ Please upload an image file (PNG, JPG, etc.)\n\n' +
                      'Try again or click Cancel to skip the image.',
                    components: [
                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                          .setCustomId('cancel_upload')
                          .setLabel('Cancel')
                          .setStyle(ButtonStyle.Secondary),
                      ),
                    ],
                  });

                  // Delete invalid upload
                  try {
                    await message.delete();
                  } catch (error) {
                    this.logger.warn('Could not delete invalid upload');
                  }
                  return;
                }

                try {
                  // Update message to show uploading status
                  await buttonInteraction.editReply({
                    content: '⏳ Processing image upload, please wait...',
                    components: [],
                  });

                  // Store the attachment URL
                  const attachmentUrl = attachment.url;

                  // Wait for 3 seconds to ensure the upload is complete
                  await new Promise((resolve) => setTimeout(resolve, 3000));

                  // Try to process the food addition with image
                  await this.processFoodAddition(
                    modalSubmit,
                    interaction,
                    categoryId,
                    name,
                    description,
                    attachmentUrl,
                  );

                  // If processing succeeds, delete the upload message
                  try {
                    await message.delete();
                  } catch (error) {
                    this.logger.warn('Could not delete upload message:', error);
                  }

                  messageCollector.stop();
                } catch (error) {
                  this.logger.error('Error processing upload:', error);
                  await buttonInteraction.editReply({
                    content:
                      '❌ Failed to process image. Please try again or cancel.',
                    components: [
                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                          .setCustomId('cancel_upload')
                          .setLabel('Cancel')
                          .setStyle(ButtonStyle.Secondary),
                      ),
                    ],
                  });

                  // Try to delete the message if there was an error
                  try {
                    await message.delete();
                  } catch (deleteError) {
                    this.logger.warn(
                      'Could not delete message after error:',
                      deleteError,
                    );
                  }
                }
              });

              // Handle upload cancellation
              const uploadCancelCollector =
                buttonInteraction.channel.createMessageComponentCollector({
                  filter: (i) =>
                    i.user.id === modalSubmit.user.id &&
                    i.customId === 'cancel_upload',
                  time: 300000,
                  max: 1,
                });

              uploadCancelCollector.on('collect', async (cancelInteraction) => {
                messageCollector.stop();
                // Process without image
                await this.processFoodAddition(
                  modalSubmit,
                  interaction,
                  categoryId,
                  name,
                  description,
                  null,
                );
              });

              // Handle upload timeout
              messageCollector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                  await buttonInteraction.editReply({
                    content:
                      '⏳ Upload timed out. Food will be added without an image.',
                    components: [],
                  });

                  // Process without image after timeout
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
              // Process without image
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

  private async processFoodAddition(
    modalSubmit,
    interaction,
    categoryId: string,
    name: string,
    description: string,
    imageUrl: string | null,
  ) {
    let uploadedImagePath: string | null = null;

    if (imageUrl) {
      await modalSubmit.editReply({
        content: 'Uploading image...',
        components: [],
      });

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
      if (uploadedImagePath) {
        const fullPath = this.uploadService.getFullPath(uploadedImagePath);

        // Verify file exists
        if (!existsSync(fullPath)) {
          this.logger.error(`File does not exist at path: ${fullPath}`);
          throw new Error('Image file not found');
        }

        // Create success embed with image
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

        try {
          // Read the image file
          const imageBuffer = await fs.promises.readFile(fullPath);

          // Create attachment from buffer
          const imageAttachment = new AttachmentBuilder(imageBuffer, {
            name: 'food-image.png',
            description: `Image for ${name}`,
          });

          // Set the image in embed using the attachment name
          successEmbed.setImage('attachment://food-image.png');

          // Send message with both embed and file
          await interaction.channel.send({
            embeds: [successEmbed],
            files: [imageAttachment],
          });
        } catch (error) {
          this.logger.error('Error handling image file:', error);
          throw error;
        }
      } else {
        // Send without image (existing code)
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

        await interaction.channel.send({
          embeds: [successEmbed],
        });
      }

      // Update original message with success
      await modalSubmit.editReply({
        content: 'Food added successfully!',
        components: [],
        embeds: [],
      });

      // Send "Add Another" prompt as a new message
      const addAnotherMessage = await modalSubmit.followUp({
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
      const followupCollector =
        addAnotherMessage.createMessageComponentCollector({
          filter: (i) =>
            i.user.id === modalSubmit.user.id &&
            ['add_another', 'finish_adding'].includes(i.customId),
          time: 300000,
          max: 1,
        });

      followupCollector.on('collect', async (followupInteraction) => {
        try {
          if (followupInteraction.customId === 'add_another') {
            // Update the "Add Another" message
            await followupInteraction.update({
              content: 'Starting new food addition...',
              components: [],
            });

            // Create a fresh add food message
            await this.createAddFoodMessage(followupInteraction, true);
          } else {
            // Close the current message when finished
            await followupInteraction.update({
              content: 'Food management completed.',
              components: [],
            });
          }
        } catch (error) {
          this.logger.error('Error handling followup interaction:', error);
          try {
            await followupInteraction.editReply({
              content: 'An error occurred. Please try again.',
              components: [],
            });
          } catch {
            await modalSubmit.followUp({
              content: 'An error occurred. Please try again.',
              ephemeral: true,
            });
          }
        }
      });

      followupCollector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          try {
            await addAnotherMessage.edit({
              content: 'Food management timed out.',
              components: [],
            });
          } catch (error) {
            this.logger.warn('Could not update timeout message');
          }
        }
      });
    } catch (error) {
      this.logger.error('Error creating success message:', error);
      // Send basic success message if image handling fails
      await interaction.channel.send({
        content: `✅ Added food "${name}" to category "${category.name}"${
          error.message ? ` (Image error: ${error.message})` : ''
        }`,
      });
    }
  }
}

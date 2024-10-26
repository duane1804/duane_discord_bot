import { Injectable, Logger } from '@nestjs/common';
import { Food, FoodCategory } from './entities/food.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { OptionDto } from './dto/food.dto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
  PermissionsBitField,
  StringSelectMenuInteraction,
} from 'discord.js';
import { FoodCategoryService } from './services/category.service';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);
  constructor(
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
    private foodCategoryService: FoodCategoryService,
  ) {}

  private isAdmin(
    interaction: SlashCommandContext[0] | StringSelectMenuInteraction,
  ): boolean {
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
    if (option === 'category') {
      const reply = await interaction.reply({
        content: 'Please select a category option:',
        components: [this.foodCategoryService.createCategoryMainMenu()],
        ephemeral: true,
        fetchReply: true,
      });

      const collector = (reply as Message).createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 3_600_000, // 1 hour
      });

      collector.on('collect', async (i: StringSelectMenuInteraction) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({
            content: 'This menu is not for you!',
            ephemeral: true,
          });
          return;
        }

        const selected = i.values[0];

        if (selected === 'back') {
          await i.update({
            content: 'Please select a category option:',
            components: [this.foodCategoryService.createCategoryMainMenu()],
            embeds: [],
          });
          return;
        }

        const categories = await this.foodCategoryRepository.find();

        switch (selected) {
          case 'list':
            let currentPage = 1;
            const [initialEmbed, initialCurrentPage, totalPages] =
              await this.foodCategoryService.createCategoryListEmbed(
                currentPage,
              );

            // Initial update
            await i.update({
              content: null,
              embeds: [initialEmbed],
              components: [
                this.foodCategoryService.createPaginationButtons(
                  currentPage,
                  totalPages,
                ),
                this.foodCategoryService.createCategoryListMenu(),
              ],
            });

            const collector = i.message.createMessageComponentCollector({
              filter: (interaction) => interaction.user.id === i.user.id,
              time: 300000, // 5 minutes
            });

            collector.on('collect', async (interaction) => {
              // Handle back button with error handling
              if (
                interaction.isStringSelectMenu() &&
                interaction.customId === 'category_select'
              ) {
                if (interaction.values[0] === 'back') {
                  try {
                    await interaction.update({
                      content: 'Please select a category option:',
                      components: [
                        this.foodCategoryService.createCategoryMainMenu(),
                      ],
                      embeds: [],
                    });
                  } catch (error) {
                    // If interaction was already acknowledged, try to edit the reply
                    try {
                      await i.editReply({
                        content: 'Please select a category option:',
                        components: [
                          this.foodCategoryService.createCategoryMainMenu(),
                        ],
                        embeds: [],
                      });
                    } catch (editError) {
                      this.logger.error(
                        'Error handling back button:',
                        editError,
                      );
                    }
                  }
                  collector.stop();
                  return;
                }
              }

              // Handle pagination buttons
              if (interaction.isButton()) {
                try {
                  if (interaction.customId === 'next_page') {
                    currentPage++;
                  } else if (interaction.customId === 'prev_page') {
                    currentPage--;
                  }

                  const [newEmbed, newCurrentPage, newTotalPages] =
                    await this.foodCategoryService.createCategoryListEmbed(
                      currentPage,
                    );

                  await interaction.update({
                    embeds: [newEmbed],
                    components: [
                      this.foodCategoryService.createPaginationButtons(
                        newCurrentPage,
                        newTotalPages,
                      ),
                      this.foodCategoryService.createCategoryListMenu(),
                    ],
                  });
                } catch (error) {
                  this.logger.error('Error handling pagination:', error);
                }
              }
            });

            collector.on('end', (collected, reason) => {
              if (reason !== 'messageDelete' && reason !== 'user') {
                try {
                  i.editReply({
                    components: [],
                  }).catch(() => {});
                } catch (error) {
                  this.logger.error('Error removing components:', error);
                }
              }
            });
            break;

          case 'add':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can add categories.',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
              return;
            }

            try {
              await i.showModal(
                this.foodCategoryService.createAddCategoryModal(),
              );

              const modalSubmit = await i.awaitModalSubmit({
                time: 300000, // 5 minutes timeout
                filter: (i) => i.customId === 'add_category_modal',
              });

              const categoryName =
                modalSubmit.fields.getTextInputValue('category_name');
              const description = modalSubmit.fields.getTextInputValue(
                'category_description',
              );

              // Create the category and handle unique name check
              const [newCategory, error] =
                await this.foodCategoryService.handleAddCategory(
                  categoryName,
                  description,
                );

              if (error) {
                // If there was an error (like duplicate name), show error message
                await modalSubmit.reply({
                  content: `❌ ${error}`,
                  ephemeral: true,
                });

                // Update the original menu
                await i.editReply({
                  content: 'Please select a category option:',
                  components: [
                    this.foodCategoryService.createCategoryMainMenu(),
                  ],
                  embeds: [],
                });

                return;
              }

              // Send permanent ephemeral success message
              await modalSubmit.reply({
                content: `✅ Category "${categoryName}" has been added successfully!`,
                ephemeral: true,
              });

              // Update the original menu
              await i.editReply({
                content: 'Please select a category option:',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
            } catch (error) {
              // Only try to edit reply if it's a timeout error
              if (error instanceof Error && error.message.includes('time')) {
                await i.editReply({
                  content: 'The modal timed out. Please try again.',
                  components: [
                    this.foodCategoryService.createCategoryMainMenu(),
                  ],
                  embeds: [],
                });
              } else {
                this.logger.error('Error adding category:', error);
                await i.editReply({
                  content:
                    'An error occurred while adding the category. Please try again.',
                  components: [
                    this.foodCategoryService.createCategoryMainMenu(),
                  ],
                  embeds: [],
                });
              }
            }
            break;

          case 'edit':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can edit categories.',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
              return;
            }

            // Check for categories existence
            if (categories.length == 0) {
              await i.update({
                content:
                  '❌ There are currently no categories to edit. Add some categories first!',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
              return;
            }

            // Show category select menu
            const editSelectMenu =
              await this.foodCategoryService.updateEditCategorySelect();
            await i.reply({
              content:
                'Select a category to edit:\n\n*You can delete this message or use the Up Menu button to return to the main menu.*',
              components: [editSelectMenu],
              ephemeral: true,
              fetchReply: true,
            });

            const editCollector = i.channel.createMessageComponentCollector({
              filter: (interaction) => interaction.user.id === i.user.id,
              time: 300000, // 5 minutes
            });

            editCollector.on('collect', async (interaction) => {
              if (!interaction.isStringSelectMenu()) return;

              try {
                if (interaction.customId === 'edit_category_select') {
                  const selected = interaction.values[0];

                  // Handle category edit selection
                  const categoryId = selected.replace('edit_', '');
                  const category = await this.foodCategoryRepository.findOne({
                    where: { id: categoryId },
                  });

                  if (!category) {
                    await interaction.reply({
                      content: 'Category not found!',
                      ephemeral: true,
                    });
                    return;
                  }

                  // Show edit modal
                  await interaction.showModal(
                    this.foodCategoryService.createEditCategoryModal(category),
                  );

                  try {
                    const modalSubmit = await interaction.awaitModalSubmit({
                      time: 300000,
                      filter: (i) =>
                        i.customId === `edit_category_modal_${category.id}`,
                    });

                    const newName =
                      modalSubmit.fields.getTextInputValue('category_name');
                    const newDescription = modalSubmit.fields.getTextInputValue(
                      'category_description',
                    );

                    const [updatedCategory, error] =
                      await this.foodCategoryService.handleEditCategory(
                        category.id,
                        newName,
                        newDescription,
                      );

                    if (error) {
                      await modalSubmit.reply({
                        content: `❌ ${error}`,
                        ephemeral: true,
                      });
                      return;
                    }

                    await modalSubmit.reply({
                      content: `✅ Category "${updatedCategory.name}" has been updated successfully!`,
                      ephemeral: true,
                    });

                    // Update the select menu with new category data
                    const updatedSelectMenu =
                      await this.foodCategoryService.updateEditCategorySelect();
                    await interaction.message.edit({
                      content:
                        'Select a category to edit:\n\n*You can delete this message or use the Up Menu button to return to the main menu.*',
                      components: [updatedSelectMenu],
                    });
                  } catch (error) {
                    this.logger.error('Error handling modal:', error);
                  }
                }
              } catch (error) {
                this.logger.error('Error handling edit selection:', error);
                try {
                  await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true,
                  });
                } catch (e) {
                  this.logger.error('Error sending error message:', e);
                }
              }
            });

            editCollector.on('end', (collected, reason) => {
              if (reason !== 'messageDelete' && reason !== 'user') {
                try {
                  i.deleteReply().catch(() => {});
                } catch (error) {
                  this.logger.error('Error removing message:', error);
                }
              }
            });

            break;

          case 'delete':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can delete categories.',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
              return;
            }

            // Check for categories existence
            if (categories.length === 0) {
              await i.update({
                content:
                  '❌ There are currently no categories to delete. Add some categories first!',
                components: [this.foodCategoryService.createCategoryMainMenu()],
                embeds: [],
              });
              return;
            }

            let deleteCurrentPage = 1;
            const [
              deleteInitialEmbed,
              deleteInitialCurrentPage,
              deleteTotalPages,
            ] = await this.foodCategoryService.createCategoryListEmbed(
              deleteCurrentPage,
              true,
            );

            const deleteSelectMenu =
              await this.foodCategoryService.updateDeleteCategorySelect(
                deleteInitialCurrentPage,
                deleteTotalPages,
              );

            const deleteMessage = await i.reply({
              content: 'Select a category to delete:',
              embeds: [deleteInitialEmbed],
              components: [
                this.foodCategoryService.createPaginationButtons(
                  deleteInitialCurrentPage,
                  deleteTotalPages,
                ),
                deleteSelectMenu,
              ],
              ephemeral: true,
              fetchReply: true,
            });

            if (deleteTotalPages === 0) {
              deleteMessage.edit({
                content: 'No categories available for deletion.',
                embeds: [],
                components: [],
              });
              return;
            }

            const deleteCollector =
              deleteMessage.createMessageComponentCollector({
                filter: (interaction) => interaction.user.id === i.user.id,
                time: 300000, // 5 minutes
              });

            deleteCollector.on('collect', async (interaction) => {
              if (interaction.isButton()) {
                if (interaction.customId === 'next_page') {
                  deleteCurrentPage++;
                } else if (interaction.customId === 'prev_page') {
                  deleteCurrentPage--;
                }

                const [newEmbed, newCurrentPage, newTotalPages] =
                  await this.foodCategoryService.createCategoryListEmbed(
                    deleteCurrentPage,
                    true,
                  );

                const newDeleteSelectMenu =
                  await this.foodCategoryService.updateDeleteCategorySelect(
                    newCurrentPage,
                    newTotalPages,
                  );

                await interaction.update({
                  embeds: [newEmbed],
                  components: [
                    this.foodCategoryService.createPaginationButtons(
                      newCurrentPage,
                      newTotalPages,
                    ),
                    newDeleteSelectMenu,
                  ],
                });
              } else if (interaction.isStringSelectMenu()) {
                const selected = interaction.values[0];

                if (selected === 'cancel') {
                  await interaction.update({
                    content: 'Category deletion canceled.',
                    embeds: [],
                    components: [],
                  });
                  deleteCollector.stop();
                  return;
                }

                const categoryId = selected.replace('delete_', '');
                const category = await this.foodCategoryRepository.findOne({
                  where: { id: categoryId },
                });

                if (!category) {
                  await interaction.reply({
                    content: 'Category not found!',
                    ephemeral: true,
                  });
                  return;
                }

                // Send confirmation message with buttons
                const confirmationMessage = await interaction.reply({
                  content: `Are you sure you want to delete the category "${category.name}"?`,
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setCustomId('confirm_delete')
                        .setLabel('Yes')
                        .setStyle(ButtonStyle.Danger),
                      new ButtonBuilder()
                        .setCustomId('cancel_delete')
                        .setLabel('No')
                        .setStyle(ButtonStyle.Secondary),
                    ),
                  ],
                  fetchReply: true,
                });

                const confirmationCollector =
                  confirmationMessage.createMessageComponentCollector({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 300000, // 5 minutes
                  });

                confirmationCollector.on('collect', async (i) => {
                  if (i.customId === 'confirm_delete') {
                    await this.foodCategoryRepository.remove(category);

                    await i.update({
                      content: `Category "${category.name}" has been deleted.`,
                      components: [],
                    });

                    // Update the category list embed and select menu
                    const [
                      updatedEmbed,
                      updatedCurrentPage,
                      updatedTotalPages,
                    ] = await this.foodCategoryService.createCategoryListEmbed(
                      deleteCurrentPage,
                      true,
                    );

                    const updatedDeleteSelectMenu =
                      await this.foodCategoryService.updateDeleteCategorySelect(
                        updatedCurrentPage,
                        updatedTotalPages,
                      );

                    await interaction.editReply({
                      embeds: [updatedEmbed],
                      components: [
                        this.foodCategoryService.createPaginationButtons(
                          updatedCurrentPage,
                          updatedTotalPages,
                        ),
                        updatedDeleteSelectMenu,
                      ],
                    });
                  } else if (i.customId === 'cancel_delete') {
                    await i.update({
                      content: 'Category deletion canceled.',
                      components: [],
                    });
                  }

                  confirmationCollector.stop();
                });

                confirmationCollector.on('end', (collected, reason) => {
                  if (reason === 'time') {
                    confirmationMessage.edit({
                      content: 'Confirmation timed out. Please try again.',
                      components: [],
                    });
                  }
                });

                deleteCollector.stop();
              }
            });

            deleteCollector.on('end', (collected, reason) => {
              if (reason === 'time') {
                deleteMessage.edit({
                  content: 'Category deletion timed out.',
                  embeds: [],
                  components: [],
                });
              }
            });

            break;

          default:
            await i.update({
              content: '❗️Invalid selection!',
              components: [this.foodCategoryService.createCategoryMainMenu()],
              embeds: [],
            });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          await interaction.editReply({
            content: 'Menu timed out. Please run the command again.',
            components: [],
            embeds: [],
          });
        }
      });

      return;
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

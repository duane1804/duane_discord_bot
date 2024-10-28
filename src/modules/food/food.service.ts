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

              // Send public success message
              await interaction.channel.send({
                content: `✅ Category "${categoryName}" has been created successfully!`,
              });

              // Send permanent ephemeral success message
              await modalSubmit.reply({
                content: 'Category created successfully!',
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

            let editCurrentPage = 1;
            const [editInitialEmbed, editInitialCurrentPage, editTotalPages] =
              await this.foodCategoryService.createCategoryListEmbed(
                editCurrentPage,
                false,
              );

            const editSelectMenu =
              await this.foodCategoryService.updateEditCategorySelect(
                editInitialCurrentPage,
                editTotalPages,
              );

            // Prepare components array based on whether we have categories
            const editComponents = [];

            if (editTotalPages > 1) {
              editComponents.push(
                this.foodCategoryService.createPaginationButtons(
                  editInitialCurrentPage,
                  editTotalPages,
                ),
              );
            }

            if (editSelectMenu) {
              editComponents.push(editSelectMenu);
            } else {
              // If no categories, add a back to menu button
              editComponents.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('back_to_menu')
                    .setLabel('Back to Menu')
                    .setStyle(ButtonStyle.Secondary),
                ),
              );
            }

            // Create a new message for the edit view
            const editMessage = await i.reply({
              content: editSelectMenu ? 'Select a category to edit:' : null,
              embeds: [editInitialEmbed],
              components: editComponents,
              ephemeral: true,
              fetchReply: true,
            });

            const editCollector = editMessage.createMessageComponentCollector({
              filter: (interaction) => interaction.user.id === i.user.id,
              time: 300000, // 5 minutes
            });

            editCollector.on('collect', async (interaction) => {
              if (interaction.customId === 'back_to_menu') {
                await interaction.update({
                  content: 'Please select a category option:',
                  components: [
                    this.foodCategoryService.createCategoryMainMenu(),
                  ],
                  embeds: [],
                });
                editCollector.stop();
                return;
              }

              if (interaction.isButton()) {
                if (interaction.customId === 'next_page') {
                  editCurrentPage++;
                } else if (interaction.customId === 'prev_page') {
                  editCurrentPage--;
                }

                const [newEmbed, newCurrentPage, newTotalPages] =
                  await this.foodCategoryService.createCategoryListEmbed(
                    editCurrentPage,
                    false,
                  );

                const newEditSelectMenu =
                  await this.foodCategoryService.updateEditCategorySelect(
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
                    newEditSelectMenu,
                  ],
                });
              }

              if (
                interaction.isStringSelectMenu() &&
                interaction.customId === 'edit_category_select'
              ) {
                const selected = interaction.values[0];
                if (selected === 'cancel') {
                  await interaction.update({
                    content: 'Category editing canceled.',
                    embeds: [],
                    components: [],
                  });
                  editCollector.stop();
                  return;
                }

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

                try {
                  // Show edit modal
                  await interaction.showModal(
                    this.foodCategoryService.createEditCategoryModal(category),
                  );

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

                  // Send public success message
                  await interaction.channel.send({
                    content: `✅ Category "${updatedCategory.name}" has been updated successfully!`,
                  });

                  // Update original message with success message only
                  await interaction.editReply({
                    content: 'Category updated successfully!',
                    embeds: [],
                    components: [], // Remove all components including back to menu
                  });

                  // Acknowledge the modal submission
                  await modalSubmit.reply({
                    content: 'Category updated successfully!',
                    ephemeral: true,
                  });
                } catch (error) {
                  this.logger.error('Error handling modal:', error);
                  if (
                    error instanceof Error &&
                    error.message.includes('time')
                  ) {
                    await interaction.followUp({
                      content: 'The modal timed out. Please try again.',
                      ephemeral: true,
                    });
                  }
                }
              }
            });

            editCollector.on('end', (collected, reason) => {
              if (reason === 'time') {
                i.editReply({
                  content: 'Category edit timed out.',
                  embeds: [],
                  components: [],
                }).catch(() => {}); // Ignore errors if message was deleted
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

            // Prepare components array based on whether we have categories
            const deleteComponents = [];

            if (deleteTotalPages > 1) {
              deleteComponents.push(
                this.foodCategoryService.createPaginationButtons(
                  deleteInitialCurrentPage,
                  deleteTotalPages,
                ),
              );
            }

            if (deleteSelectMenu) {
              deleteComponents.push(deleteSelectMenu);
            } else {
              // If no categories, add a back to menu button
              deleteComponents.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId('back_to_menu')
                    .setLabel('Back to Menu')
                    .setStyle(ButtonStyle.Secondary),
                ),
              );
            }

            // Create a new message for the delete view
            const deleteMessage = await i.reply({
              content: deleteSelectMenu ? 'Select a category to delete:' : null,
              embeds: [deleteInitialEmbed],
              components: deleteComponents,
              ephemeral: true,
              fetchReply: true,
            });

            const deleteCollector =
              deleteMessage.createMessageComponentCollector({
                filter: (interaction) => interaction.user.id === i.user.id,
                time: 300000, // 5 minutes
              });

            deleteCollector.on('collect', async (interaction) => {
              if (interaction.customId === 'back_to_menu') {
                await interaction.update({
                  content: 'Please select a category option:',
                  components: [
                    this.foodCategoryService.createCategoryMainMenu(),
                  ],
                  embeds: [],
                });
                deleteCollector.stop();
                return;
              }

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
              }

              if (interaction.isStringSelectMenu()) {
                const selected = interaction.values[0];

                if (selected === 'cancel') {
                  await interaction.update({
                    content: 'Category deletion canceled.',
                    embeds: [],
                    components: [],
                  });
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

                // Send confirmation message with buttons - ephemeral
                await interaction.reply({
                  content: `⚠️ Are you sure you want to delete the category "${category.name}"?`,
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
                  ephemeral: true,
                });

                const confirmationCollector =
                  interaction.channel.createMessageComponentCollector({
                    filter: (i) =>
                      i.user.id === interaction.user.id &&
                      (i.customId === 'confirm_delete' ||
                        i.customId === 'cancel_delete'),
                    time: 300000,
                    max: 1,
                  });

                confirmationCollector.on('collect', async (i) => {
                  if (i.customId === 'confirm_delete') {
                    await this.foodCategoryRepository.remove(category);

                    // Send public success message
                    await interaction.channel.send({
                      content: `✅ Category "${category.name}" has been deleted successfully!`,
                    });

                    // Update the confirmation message
                    await i.update({
                      content: 'Category deleted successfully!',
                      components: [],
                    });
                  } else if (i.customId === 'cancel_delete') {
                    // Only update the confirmation message
                    await i.update({
                      content: '❌ Category deletion canceled.',
                      components: [],
                    });
                  }

                  confirmationCollector.stop();
                });
              }
            });

            deleteCollector.on('end', (collected, reason) => {
              if (reason === 'time') {
                i.editReply({
                  content: 'Category deletion timed out.',
                  embeds: [],
                  components: [],
                }).catch(() => {}); // Ignore errors if message was deleted
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

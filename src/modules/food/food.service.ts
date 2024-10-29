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
import { FoodsService } from './services/foods.services';
import { UploadService } from '../../services/upload/upload.service';

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);
  constructor(
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
    @InjectRepository(Food)
    private readonly foodRepository: Repository<Food>,
    private foodCategoryService: FoodCategoryService,
    private foodService: FoodsService,
    private uploadService: UploadService,
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
        time: 600000, // 10 minutes
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

        switch (selected) {
          case 'list':
            let listCurrentPage = 1;
            const [listInitialEmbed, listInitialCurrentPage, listTotalPages] =
              await this.foodCategoryService.createCategoryListEmbed(
                listCurrentPage,
                false,
                i.guildId,
              );

            // Create components array with pagination and close button
            const listComponents = [];

            if (listTotalPages > 1) {
              listComponents.push(
                this.foodCategoryService.createPaginationButtons(
                  listInitialCurrentPage,
                  listTotalPages,
                ),
              );
            }

            listComponents.push(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('close_view')
                  .setLabel('Close View')
                  .setStyle(ButtonStyle.Secondary),
              ),
            );

            // Create a new message for the list view
            const listMessage = await i.reply({
              content: null,
              embeds: [listInitialEmbed],
              components: listComponents,
              ephemeral: true,
              fetchReply: true,
            });

            const listCollector = listMessage.createMessageComponentCollector({
              filter: (interaction) => interaction.user.id === i.user.id,
              time: 300000, // 5 minutes
            });

            listCollector.on('collect', async (interaction) => {
              // Handle close button
              if (interaction.customId === 'close_view') {
                await interaction.update({
                  content: 'Category list view closed.',
                  embeds: [],
                  components: [],
                });
                listCollector.stop();
                return;
              }

              // Handle pagination buttons
              if (interaction.isButton()) {
                if (interaction.customId === 'next_page') {
                  listCurrentPage++;
                } else if (interaction.customId === 'prev_page') {
                  listCurrentPage--;
                } else {
                  return; // Not a pagination button
                }

                const [newEmbed, newCurrentPage, newTotalPages] =
                  await this.foodCategoryService.createCategoryListEmbed(
                    listCurrentPage,
                    false,
                    interaction.guildId,
                  );

                // Rebuild components array
                const updatedComponents = [];

                if (newTotalPages > 1) {
                  updatedComponents.push(
                    this.foodCategoryService.createPaginationButtons(
                      newCurrentPage,
                      newTotalPages,
                    ),
                  );
                }

                updatedComponents.push(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('close_view')
                      .setLabel('Close View')
                      .setStyle(ButtonStyle.Secondary),
                  ),
                );

                await interaction.update({
                  embeds: [newEmbed],
                  components: updatedComponents,
                });
              }
            });

            listCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && listMessage) {
                // Create a disabled "View Timed Out" button
                const timeoutAlertComponents = [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('view_timed_out')
                      .setLabel('View Timed Out')
                      .setStyle(ButtonStyle.Danger)
                      .setDisabled(true),
                  ),
                ];

                await i
                  .editReply({
                    content:
                      'The category list view has timed out. Please reopen to continue.',
                    embeds: [],
                    components: timeoutAlertComponents,
                  })
                  .catch(() => {}); // Ignore errors if message was deleted
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
                  i.guildId,
                );

              if (error) {
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
                i.guildId,
              );

            const editSelectMenu =
              await this.foodCategoryService.updateEditCategorySelect(
                editInitialCurrentPage,
                editTotalPages,
                i.guildId,
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
                    interaction.guildId,
                  );

                const newEditSelectMenu =
                  await this.foodCategoryService.updateEditCategorySelect(
                    newCurrentPage,
                    newTotalPages,
                    interaction.guildId,
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
                      interaction.guildId,
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

                  // Update original message with success message
                  await interaction.editReply({
                    content: 'Category updated successfully!',
                    embeds: [],
                    components: [],
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
              i.guildId,
            );

            const deleteSelectMenu =
              await this.foodCategoryService.updateDeleteCategorySelect(
                deleteInitialCurrentPage,
                deleteTotalPages,
                i.guildId,
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
                    interaction.guildId,
                  );

                const newDeleteSelectMenu =
                  await this.foodCategoryService.updateDeleteCategorySelect(
                    newCurrentPage,
                    newTotalPages,
                    interaction.guildId,
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
            break;
        }
      });

      collector.on('end', async (collected, reason) => {
        // if (reason === 'time') {
        //   await interaction.editReply({
        //     content: 'Menu timed out. Please run the command again.',
        //     components: [],
        //     embeds: [],
        //   });
        // }
        if (reason === 'time') {
          interaction
            .editReply({
              content: 'Menu timed out. Please run the command again.',
              components: [this.foodCategoryService.createTimeoutButton()],
              embeds: [],
            })
            .catch(() => {});
        }
      });

      return;
    }

    if (option === 'food') {
      const reply = await interaction.reply({
        content: 'Please select a food option:',
        components: [this.foodService.createFoodMainMenu()],
        ephemeral: true,
        fetchReply: true,
      });

      const collector = (reply as Message).createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 600000, // 10 minutes
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
            content: 'Please select a food option:',
            components: [this.foodService.createFoodMainMenu()],
            embeds: [],
          });
          return;
        }

        switch (selected) {
          case 'list':
            let listCurrentPage = 1;
            const [listInitialEmbed, listInitialCurrentPage, listTotalPages] =
              await this.foodService.createFoodListEmbed(
                listCurrentPage,
                false,
                i.guildId,
              );

            // Create components array with pagination and close button
            const listComponents = [];

            if (listTotalPages > 1) {
              listComponents.push(
                this.foodService.createPaginationButtons(
                  listInitialCurrentPage,
                  listTotalPages,
                ),
              );
            }

            listComponents.push(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('close_view')
                  .setLabel('Close View')
                  .setStyle(ButtonStyle.Secondary),
              ),
            );

            // Create a new message for the list view
            const listMessage = await i.reply({
              content: null,
              embeds: [listInitialEmbed],
              components: listComponents,
              ephemeral: true,
              fetchReply: true,
            });

            const listCollector = listMessage.createMessageComponentCollector({
              filter: (interaction) => interaction.user.id === i.user.id,
              time: 300000, // 5 minutes
            });

            listCollector.on('collect', async (interaction) => {
              // Handle close button
              if (interaction.customId === 'close_view') {
                await interaction.update({
                  content: 'Food list view closed.',
                  embeds: [],
                  components: [],
                });
                listCollector.stop();
                return;
              }

              // Handle pagination buttons
              if (interaction.isButton()) {
                if (interaction.customId === 'next_page') {
                  listCurrentPage++;
                } else if (interaction.customId === 'prev_page') {
                  listCurrentPage--;
                } else {
                  return; // Not a pagination button
                }

                const [newEmbed, newCurrentPage, newTotalPages] =
                  await this.foodService.createFoodListEmbed(
                    listCurrentPage,
                    false,
                    interaction.guildId,
                  );

                // Rebuild components array
                const updatedComponents = [];

                if (newTotalPages > 1) {
                  updatedComponents.push(
                    this.foodService.createPaginationButtons(
                      newCurrentPage,
                      newTotalPages,
                    ),
                  );
                }

                updatedComponents.push(
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('close_view')
                      .setLabel('Close View')
                      .setStyle(ButtonStyle.Secondary),
                  ),
                );

                await interaction.update({
                  embeds: [newEmbed],
                  components: updatedComponents,
                });
              }
            });

            listCollector.on('end', (collected, reason) => {
              if (reason === 'time' && listMessage) {
                i.editReply({
                  content: 'Food list view timed out.',
                  embeds: [],
                  components: [],
                }).catch(() => {}); // Ignore errors if message was deleted
              }
            });
            break;
          case 'add':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can add foods.',
                components: [this.foodService.createFoodMainMenu()],
                embeds: [],
              });
              return;
            }

            // Start the add food flow
            await this.foodService.createAddFoodMessage(i);
            break;

          case 'edit':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can edit foods.',
                components: [this.foodService.createFoodMainMenu()],
                embeds: [],
              });
              return;
            }

            let editCurrentPage = 1;
            const [editInitialEmbed, editInitialCurrentPage, editTotalPages] =
              await this.foodService.createFoodListEmbed(
                editCurrentPage,
                false,
                i.guildId,
              );

            const editSelectMenu =
              await this.foodService.createEditFoodCategorySelect(
                editInitialCurrentPage,
                editTotalPages,
                i.guildId,
              );

            // Prepare components array based on whether we have foods
            const editComponents = [];

            if (editTotalPages > 1) {
              editComponents.push(
                this.foodService.createPaginationButtons(
                  editInitialCurrentPage,
                  editTotalPages,
                ),
              );
            }

            if (editSelectMenu) {
              editComponents.push(editSelectMenu);
            } else {
              // If no foods, add a back to menu button
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
              content: editSelectMenu ? 'Select a food to edit:' : null,
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
                  content: 'Please select a food option:',
                  components: [this.foodService.createFoodMainMenu()],
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
                  await this.foodService.createFoodListEmbed(
                    editCurrentPage,
                    false,
                    interaction.guildId,
                  );

                const newEditSelectMenu =
                  await this.foodService.createEditFoodCategorySelect(
                    newCurrentPage,
                    newTotalPages,
                    interaction.guildId,
                  );

                await interaction.update({
                  embeds: [newEmbed],
                  components: [
                    this.foodService.createPaginationButtons(
                      newCurrentPage,
                      newTotalPages,
                    ),
                    newEditSelectMenu,
                  ],
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

                try {
                  // Show edit modal
                  await interaction.showModal(
                    this.foodService.createEditFoodModal(food, food.category),
                  );

                  const modalSubmit = await interaction.awaitModalSubmit({
                    time: 300000,
                    filter: (i) => i.customId === `edit_food_modal_${food.id}`,
                  });

                  const newName =
                    modalSubmit.fields.getTextInputValue('food_name');
                  const newDescription =
                    modalSubmit.fields.getTextInputValue('food_description');

                  // Check if user wants to edit image
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

                  // Ask about image change
                  const imageChoiceMessage = await modalSubmit.reply({
                    content: 'Would you like to change the food image?',
                    components: [attachmentRow],
                    ephemeral: true,
                    fetchReply: true,
                  });

                  const imageChoiceCollector =
                    imageChoiceMessage.createMessageComponentCollector({
                      filter: (i) => i.user.id === modalSubmit.user.id,
                      time: 300000,
                      max: 1,
                    });

                  imageChoiceCollector.on(
                    'collect',
                    async (buttonInteraction) => {
                      if (buttonInteraction.customId === 'change_image') {
                        // Handle image upload similar to add food
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
                            // Update message to show uploading status
                            await buttonInteraction.editReply({
                              content:
                                '⏳ Processing image upload, please wait...',
                              components: [],
                            });

                            const uploadedImagePath =
                              await this.uploadService.uploadFromDiscord(
                                attachment.url,
                                modalSubmit.guildId,
                                'foods',
                              );

                            // Update the food with new information including image
                            const [updatedFood, error] =
                              await this.foodService.handleEditFood(
                                food.id,
                                newName,
                                newDescription,
                                uploadedImagePath,
                                interaction.guildId,
                              );

                            if (error) {
                              await buttonInteraction.editReply({
                                content: `❌ ${error}`,
                                components: [],
                              });
                              return;
                            }

                            // Send success messages and handle cleanup
                            await this.foodService.handleEditSuccess(
                              interaction,
                              buttonInteraction,
                              updatedFood,
                              uploadedImagePath,
                            );

                            // Delete the upload message
                            try {
                              await message.delete();
                            } catch (error) {
                              this.logger.warn(
                                'Could not delete upload message:',
                                error,
                              );
                            }
                          } catch (error) {
                            this.logger.error(
                              'Error processing upload:',
                              error,
                            );
                            await buttonInteraction.editReply({
                              content:
                                '❌ Failed to process image. Please try again.',
                              components: [],
                            });
                          }
                        });
                      } else if (buttonInteraction.customId === 'keep_image') {
                        // Update food without changing image
                        const [updatedFood, error] =
                          await this.foodService.handleEditFood(
                            food.id,
                            newName,
                            newDescription,
                            undefined, // undefined means keep existing image
                            interaction.guildId,
                          );

                        if (error) {
                          await buttonInteraction.update({
                            content: `❌ ${error}`,
                            components: [],
                          });
                          return;
                        }

                        // Send success messages
                        await this.foodService.handleEditSuccess(
                          interaction,
                          buttonInteraction,
                          updatedFood,
                          food.image,
                        );
                      }
                    },
                  );
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
                  content: 'Food edit timed out.',
                  embeds: [],
                  components: [],
                }).catch(() => {}); // Ignore errors if message was deleted
              }
            });
            break;

          case 'delete':
            if (!this.isAdmin(interaction)) {
              await i.update({
                content: '❌ Only administrators can delete foods.',
                components: [this.foodService.createFoodMainMenu()],
                embeds: [],
              });
              return;
            }

            await this.foodService.createDeleteFoodMessage(i);
            break;
          default:
            await i.update({
              content: '❗️Invalid selection!',
              components: [this.foodService.createFoodMainMenu()],
              embeds: [],
            });
            break;
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

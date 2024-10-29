import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { FoodCategory } from '../entities/food.entity';

@Injectable()
export class FoodCategoryService {
  private readonly logger = new Logger(FoodCategoryService.name);
  private readonly ITEMS_PER_PAGE = 4;
  constructor(
    @InjectRepository(FoodCategory)
    private readonly foodCategoryRepository: Repository<FoodCategory>,
  ) {}

  // Category Menu

  public createCategoryMainMenu() {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('category_select')
        .setPlaceholder('Select a category option')
        .addOptions([
          {
            label: 'List categories',
            description: 'View all available categories',
            value: 'list',
          },
          {
            label: 'Add category',
            description: 'Add a new category',
            value: 'add',
          },
          {
            label: 'Edit category',
            description: 'Edit an existing category',
            value: 'edit',
          },
          {
            label: 'Delete category',
            description: 'Delete an existing category',
            value: 'delete',
          },
        ]),
    );
  }

  // List Categories

  createCategoryListMenu() {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('category_select')
        .setPlaceholder('Select an option')
        .addOptions([
          {
            label: 'Back to menu',
            description: 'Return to main menu',
            value: 'back',
          },
        ]),
    );
  }

  public createTimeoutButton(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('timed_out')
        .setLabel('Timed Out')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );
  }

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
      await this.foodCategoryRepository
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

  public async createCategoryListEmbed(
    page: number = 1,
    forDeletion: boolean = false,
    guildId: string,
  ): Promise<[EmbedBuilder, number, number]> {
    await this.updateExistingRecordsWithGuildId(guildId);

    // Get total count first
    const totalCategories = await this.foodCategoryRepository.count({
      where: { guildId },
    });

    const totalPages = Math.ceil(totalCategories / this.ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const skip = (currentPage - 1) * this.ITEMS_PER_PAGE;

    // Fetch categories for current page
    const categories = await this.foodCategoryRepository.find({
      where: { guildId },
      relations: ['foods'],
      order: { name: 'ASC' },
      skip: skip,
      take: this.ITEMS_PER_PAGE,
    });

    const embed = new EmbedBuilder()
      .setTitle(forDeletion ? '🗑️ Delete Category' : '🍽️ Food Categories!')
      .setColor(Colors.Blue)
      .setTimestamp();

    if (totalCategories === 0) {
      embed.setDescription(
        'No categories found. Add some categories to get started!',
      );
    } else {
      const categoryFields = categories.map((category) => ({
        name: `📁 ${category.name}`,
        value: `Description: ${category.description || 'No description'}\nFoods: ${category.foods?.length || 0}`,
        inline: false,
      }));

      embed.addFields(categoryFields);
      embed.setFooter({
        text: `Page ${currentPage}/${totalPages} • Total Categories: ${totalCategories}`,
      });
    }

    return [embed, currentPage, totalPages];
  }

  // Add Category

  createAddCategoryModal() {
    return new ModalBuilder()
      .setCustomId('add_category_modal')
      .setTitle('Add New Category')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('category_name')
            .setLabel('Category Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter category name')
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('category_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter category description')
            .setRequired(false)
            .setMaxLength(200),
        ),
      );
  }

  async handleAddCategory(
    name: string,
    description: string | null,
    guildId: string,
  ): Promise<[FoodCategory | null, string | null]> {
    try {
      // First try to update any records without guildId
      await this.updateExistingRecordsWithGuildId(guildId);

      // Check if category with same name exists in the same guild
      const existingCategory = await this.foodCategoryRepository.findOne({
        where: { name, guildId },
      });

      if (existingCategory) {
        return [null, `Category "${name}" already exists!`];
      }

      const newCategory = new FoodCategory({
        name,
        description: description || null,
        guildId,
      });

      const savedCategory = await this.foodCategoryRepository.save(newCategory);
      return [savedCategory, null];
    } catch (error) {
      return [null, 'Failed to create category. Please try again.'];
    }
  }

  // Edit Category

  createEditCategorySelect() {
    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('edit_category_select')
          .setPlaceholder('Select category to edit')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel category editing')
              .setValue('cancel'),
          ]),
      );

    return selectMenu;
  }

  async updateEditCategorySelect(
    page: number,
    totalPages: number,
    guildId: string,
  ) {
    const categories = await this.foodCategoryRepository.find({
      where: { guildId },
      skip: (page - 1) * this.ITEMS_PER_PAGE,
      take: this.ITEMS_PER_PAGE,
      relations: ['foods'],
    });

    if (categories.length === 0) {
      return null;
    }

    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('edit_category_select')
          .setPlaceholder('Select category to edit')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel category editing')
              .setValue('cancel'),
          ]),
      );

    categories.forEach((category) => {
      (selectMenu.components[0] as StringSelectMenuBuilder).addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setDescription(
            `Foods: ${category.foods?.length || 0} | ${category.description?.slice(0, 50) || 'No description'}`,
          )
          .setValue(`edit_${category.id}`),
      );
    });

    return selectMenu;
  }

  createEditCategoryModal(category: FoodCategory) {
    return new ModalBuilder()
      .setCustomId(`edit_category_modal_${category.id}`)
      .setTitle('Edit Category')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('category_name')
            .setLabel('Category Name')
            .setStyle(TextInputStyle.Short)
            .setValue(category.name)
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('category_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(category.description || '')
            .setRequired(false)
            .setMaxLength(200),
        ),
      );
  }

  async handleEditCategory(
    categoryId: string,
    name: string,
    description?: string,
    guildId?: string,
  ): Promise<[FoodCategory | null, string | null]> {
    try {
      // Check if new name already exists for other categories in the same guild
      const existingCategory = await this.foodCategoryRepository.findOne({
        where: {
          name,
          id: Not(categoryId),
          ...(guildId && { guildId }),
        },
      });

      if (existingCategory) {
        return [null, `Category name "${name}" is already taken!`];
      }

      const category = await this.foodCategoryRepository.findOne({
        where: { id: categoryId, ...(guildId && { guildId }) },
      });

      if (!category) {
        return [null, 'Category not found!'];
      }

      category.name = name;
      category.description = description || null;

      const savedCategory = await this.foodCategoryRepository.save(category);
      return [savedCategory, null];
    } catch (error) {
      return [null, 'Failed to update category. Please try again.'];
    }
  }

  // Delete Category

  createDeleteCategorySelect() {
    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('delete_category_select')
          .setPlaceholder('Select a category to delete')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel category deletion')
              .setValue('cancel'),
          ]),
      );

    return selectMenu;
  }

  public async updateDeleteCategorySelect(
    page: number,
    totalPages: number,
    guildId: string,
  ) {
    // Calculate the skip and take values based on the page
    const skip = (page - 1) * this.ITEMS_PER_PAGE;

    // Fetch categories with pagination
    const categories = await this.foodCategoryRepository.find({
      where: { guildId },
      relations: ['foods'],
      order: { name: 'ASC' },
      skip: skip,
      take: this.ITEMS_PER_PAGE,
    });

    if (categories.length === 0) {
      return null;
    }

    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('delete_category_select')
          .setPlaceholder('Select a category to delete')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Cancel')
              .setDescription('Cancel category deletion')
              .setValue('cancel'),
          ]),
      );

    // Add the categories from the current page
    categories.forEach((category) => {
      (selectMenu.components[0] as StringSelectMenuBuilder).addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setDescription(
            `Foods: ${category.foods?.length || 0} | ${category.description?.slice(0, 50) || 'No description'}`,
          )
          .setValue(`delete_${category.id}`),
      );
    });

    return selectMenu;
  }
}

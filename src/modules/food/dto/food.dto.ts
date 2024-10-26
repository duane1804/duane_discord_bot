import { StringOption } from 'necord';

export class FoodCategoryDto {}
export class FoodDto {}

export class OptionDto {
  @StringOption({
    name: 'option',
    description: 'Option to choose',
    required: true,
    choices: [
      { name: 'Category', value: 'category' },
      { name: 'Food', value: 'food' },
      { name: 'Random a food', value: 'random' },
    ],
  })
  option: string;

  // @StringOption({
  //   name: 'category_option',
  //   description: 'Category management options',
  //   required: false,
  //   choices: [
  //     { name: 'List categories', value: 'list' },
  //     { name: 'Add category', value: 'add' },
  //     { name: 'Edit category', value: 'edit' },
  //     { name: 'Delete category', value: 'delete' },
  //   ],
  // })
  // categoryOption?: string;
}

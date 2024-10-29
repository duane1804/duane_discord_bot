import { StringOption } from 'necord';

export class FoodCategoryDto {}
export class FoodDto {}

export class OptionDto {
  @StringOption({
    name: 'option',
    description: 'Option to choose',
    required: true,
    choices: [
      { name: 'Food Info', value: 'info' },
      { name: 'Category', value: 'category' },
      { name: 'Food', value: 'food' },
      { name: 'Random a food', value: 'random' },
    ],
  })
  option: string;
}

import { StringOption } from 'necord';

export class FoodCategoryDto {}
export class FoodDto {}

export class OptionDto {
  @StringOption({
    name: 'option',
    description: 'Option to choose',
    required: true,
    choices: [
      { name: 'Category', value: 'Category' },
      { name: 'Food', value: 'food' },
      { name: 'Random a food', value: 'random' },
    ],
  })
  option: string;
}

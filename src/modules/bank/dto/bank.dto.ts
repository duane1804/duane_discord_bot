import { StringOption } from 'necord';

export class FoodCategoryDto {}
export class FoodDto {}

export class OptionDto {
  @StringOption({
    name: 'option',
    description: 'Option to choose',
    required: true,
    choices: [
      { name: 'List Bank Supports', value: 'list_bank' },
      { name: 'Add Account Number', value: 'add_account' },
      { name: 'Generate QR Payment', value: 'generate_qr' },
    ],
  })
  option: string;
}

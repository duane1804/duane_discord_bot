import { StringOption, AttachmentOption } from 'necord';
import { Attachment } from 'discord.js';

export class KissDto {
  @StringOption({
    name: 'user',
    description: 'Tag a user to kiss',
    required: false,
  })
  user: string;

  @StringOption({
    name: 'kissing',
    description: 'Use kissing command with random saved image',
    required: false,
  })
  kissing?: string;

  @AttachmentOption({
    name: 'addimage',
    description: 'Upload an image file',
    required: false,
  })
  addimage?: Attachment;

  @StringOption({
    name: 'remove',
    description: 'Remove kiss images',
    required: false,
    choices: [
      { name: '📋 Show image list', value: 'list' }, // Clipboard emoji
      { name: '🗑️ Remove all images', value: 'all' }, // Trash bin emoji
    ],
  })
  remove?: string;
}

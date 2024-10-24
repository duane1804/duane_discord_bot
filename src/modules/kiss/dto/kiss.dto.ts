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
      description: 'Remove a kiss image by filename or "all" to remove all images',
      required: false,
    })
    remove?: string;
}

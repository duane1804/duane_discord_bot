import { Injectable } from '@nestjs/common';
import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { KissDto } from './dto/kiss.dto';
import {
  EmbedBuilder,
  Attachment,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  Interaction,
} from 'discord.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { Logger } from '@nestjs/common';
@Injectable()
export class KissService {
  private readonly imageFolder: string;
  private readonly allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
  private readonly maxPreviewsPerPage = 5;
  private readonly logger = new Logger(KissService.name);
  constructor() {
    this.imageFolder = path.join(process.cwd(), 'uploads', 'kiss-images');
    this.initializeImageFolder();
  }

  private async initializeImageFolder() {
    try {
      await fs.mkdir(this.imageFolder, { recursive: true });
      this.logger.warn('Images will be stored in:' + this.imageFolder);
    } catch (error) {
      this.logger.error('Error creating image folder:', error);
    }
  }

  private isAdmin(interaction: SlashCommandContext[0]): boolean {
    // Check if the user is a guild member and has administrator permission
    if (!interaction.guild) return false;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member) return false;

    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }

  private createNavigationRow(
    currentPage: number,
    totalPages: number,
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('first_page')
        .setLabel('<<')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('<')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('page_info')
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('>')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1),
      new ButtonBuilder()
        .setCustomId('last_page')
        .setLabel('>>')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1),
    );
  }

  private async createImagePreviewEmbed(
    files: string[],
    page = 0,
  ): Promise<{
    embed: EmbedBuilder;
    menu: ActionRowBuilder<StringSelectMenuBuilder>;
    navigation: ActionRowBuilder<ButtonBuilder>;
    fileBuffers: { [key: string]: Buffer };
  }> {
    const startIdx = page * this.maxPreviewsPerPage;
    const pageFiles = files.slice(startIdx, startIdx + this.maxPreviewsPerPage);
    const fileBuffers: { [key: string]: Buffer } = {};
    const totalPages = Math.ceil(files.length / this.maxPreviewsPerPage);

    // Read all image files for the current page
    for (const file of pageFiles) {
      try {
        const filePath = path.join(this.imageFolder, file);
        fileBuffers[file] = await fs.readFile(filePath);
      } catch (error) {
        this.logger.error(`Error reading file ${file}:`, error);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('🗑️ Kiss Image Removal')
      .setDescription('Select an image to remove from the list below:')
      .setFooter({ text: `Total Images: ${files.length}` })
      .setTimestamp();

    // Add thumbnails to the embed
    let previewImages = '';
    pageFiles.forEach((file, index) => {
      previewImages += `${startIdx + index + 1}. \`${file}\`\n`;
    });
    embed.addFields({
      name: 'Available Images:',
      value: previewImages || 'No images on this page',
    });

    // Create menu options
    const selectMenu =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('remove_kiss_image')
          .setPlaceholder('Select an image to remove')
          .addOptions(
            pageFiles.map((file, index) => ({
              label: `Image ${startIdx + index + 1}`,
              description: file.substring(0, 100),
              value: file,
            })),
          ),
      );

    // Create navigation buttons
    const navigation = this.createNavigationRow(page, totalPages);

    return { embed, menu: selectMenu, navigation, fileBuffers };
  }

  private async updatePreviewMessage(
    interaction: ButtonInteraction,
    files: string[],
    currentPage: number
) {
    const { embed, menu, navigation, fileBuffers } = await this.createImagePreviewEmbed(files, currentPage);

    const previewEmbed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('📸 Image Previews')
        .setDescription('Here are the available images:');

    await interaction.update({
        embeds: [previewEmbed, embed],
        components: [menu, navigation],
        files: Object.entries(fileBuffers).map(([filename, buffer]) => ({
            attachment: buffer,
            name: filename
        }))
    });
}

private async handleButtonInteraction(
  interaction: ButtonInteraction,
  files: string[],
  currentPage: number
): Promise<number> {
  let newPage = currentPage;

  switch (interaction.customId) {
      case 'first_page':
          newPage = 0;
          break;
      case 'prev_page':
          newPage = Math.max(0, currentPage - 1);
          break;
      case 'next_page':
          newPage = Math.min(Math.ceil(files.length / this.maxPreviewsPerPage) - 1, currentPage + 1);
          break;
      case 'last_page':
          newPage = Math.ceil(files.length / this.maxPreviewsPerPage) - 1;
          break;
  }

  await this.updatePreviewMessage(interaction, files, newPage);
  return newPage;
}


  private async handleImageRemoval(
    interaction: StringSelectMenuInteraction,
    fileBuffers: { [key: string]: Buffer },
  ): Promise<void> {
    const selectedFile = interaction.values[0];

    try {
      // Get the image buffer from our cached buffers
      const imageBuffer = fileBuffers[selectedFile];
      if (!imageBuffer) {
        throw new Error('Image buffer not found');
      }

      // Remove the image
      const success = await this.removeImage(selectedFile);

      if (success) {
        const removedEmbed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('✅ Kiss Image Removed Successfully')
          .setDescription(`Removed: \`${selectedFile}\``)
          .setImage(`attachment://${selectedFile}`)
          .setFooter({
            text: 'This image has been removed from the kiss command',
          })
          .setTimestamp();

        await interaction.reply({
          embeds: [removedEmbed],
          files: [
            {
              attachment: imageBuffer,
              name: selectedFile,
            },
          ],
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '❌ Failed to remove the image.',
          ephemeral: true,
        });
      }
    } catch (error) {
      this.logger.error('Error handling image removal:', error);
      await interaction.reply({
        content: '❌ Error processing the image removal.',
        ephemeral: true,
      });
    }
  }

  private async listImages(): Promise<string[]> {
    try {
      return await fs.readdir(this.imageFolder);
    } catch (error) {
      this.logger.error('Error listing images:', error);
      return [];
    }
  }

  private async removeImage(filename: string): Promise<boolean> {
    try {
      const filePath = path.join(this.imageFolder, filename);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      this.logger.error('Error removing image:', error);
      return false;
    }
  }

  private async removeAllImages(): Promise<number> {
    try {
      const files = await this.listImages();
      let removedCount = 0;

      for (const file of files) {
        if (await this.removeImage(file)) {
          removedCount++;
        }
      }

      return removedCount;
    } catch (error) {
      this.logger.error('Error removing all images:', error);
      return 0;
    }
  }

  private async saveUploadedImage(
    attachment: Attachment,
  ): Promise<{ fileName: string; buffer: Buffer } | null> {
    try {
      const fileExtension = path.extname(attachment.name).toLowerCase();

      if (!this.allowedExtensions.includes(fileExtension)) {
        throw new Error(
          'Invalid file type. Only jpg, jpeg, png, and gif files are allowed.',
        );
      }

      const response = await axios.get(attachment.url, {
        responseType: 'arraybuffer',
      });
      const fileName = `kiss_${Date.now() + Math.random()}${fileExtension}`;
      const filePath = path.join(this.imageFolder, fileName);

      await fs.writeFile(filePath, response.data);
      return {
        fileName: fileName,
        buffer: Buffer.from(response.data),
      };
    } catch (error) {
      this.logger.error('Error saving uploaded image:', error);
      return null;
    }
  }

  private async getRandomImage(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.imageFolder);
      if (files.length === 0) return null;

      const randomFile = files[Math.floor(Math.random() * files.length)];
      return path.join(this.imageFolder, randomFile);
    } catch (error) {
      this.logger.error('Error getting random image:', error);
      return null;
    }
  }

  @SlashCommand({
    name: 'kiss',
    description: 'Send a virtual kiss to someone.',
  })
  public async onKiss(
    @Context() [interaction]: SlashCommandContext,
    @Options() { user, kissing, addimage, remove }: KissDto,
  ) {
    // Handle image upload (admin only)
    if (addimage) {
      if (!this.isAdmin(interaction)) {
        return interaction.reply({
          content: '❌ Only administrators can add kiss images.',
          ephemeral: true,
        });
      }

      const savedImage = await this.saveUploadedImage(addimage);
      if (savedImage) {
        const previewEmbed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('✅ Kiss Image Added Successfully')
          .setDescription(`Filename: \`${savedImage.fileName}\``)
          .setImage(`attachment://${savedImage.fileName}`)
          .setFooter({
            text: 'This image is now available for the kiss command',
          })
          .setTimestamp();

        return interaction.reply({
          embeds: [previewEmbed],
          files: [
            {
              attachment: savedImage.buffer,
              name: savedImage.fileName,
            },
          ],
          ephemeral: true,
        });
      } else {
        return interaction.reply({
          content:
            "❌ Failed to save the image. Please make sure it's a valid image file (jpg, jpeg, png, or gif).",
          ephemeral: true,
        });
      }
    }

    // Handle image removal (admin only)
    if (remove) {
      if (!this.isAdmin(interaction)) {
          return interaction.reply({
              content: '❌ Only administrators can remove kiss images.',
              ephemeral: true
          });
      }

      if (remove === 'all') {
          const count = await this.removeAllImages();
          return interaction.reply({
              content: `✅ Successfully removed ${count} kiss images.`,
              ephemeral: true
          });
      } else if (remove === 'list') {
          const files = await this.listImages();
          if (files.length === 0) {
              return interaction.reply({
                  content: '❌ No images found to remove.',
                  ephemeral: true
              });
          }

          let currentPage = 0;
          const { embed, menu, navigation, fileBuffers } = await this.createImagePreviewEmbed(files, currentPage);

          const previewEmbed = new EmbedBuilder()
              .setColor('#FF69B4')
              .setTitle('📸 Image Previews')
              .setDescription('Here are the available images:');

          const response = await interaction.reply({
              embeds: [previewEmbed, embed],
              components: [menu, navigation],
              files: Object.entries(fileBuffers).map(([filename, buffer]) => ({
                  attachment: buffer,
                  name: filename
              })),
              ephemeral: true
          });

          // Create collector for both buttons and select menu
          const collector = response.createMessageComponentCollector({
              time: 60000 // 1 minute timeout
          });

          collector.on('collect', async (i: Interaction) => {
              // Handle select menu interaction
              if (i.isStringSelectMenu()) {
                  await this.handleImageRemoval(i, fileBuffers);
                  collector.stop();
                  return;
              }
              
              // Handle button interaction
              if (i.isButton()) {
                  currentPage = await this.handleButtonInteraction(i, files, currentPage);
              }
          });

          collector.on('end', async (collected, reason) => {
              if (reason === 'time') {
                  await interaction.editReply({
                      content: '❌ Image selection timed out.',
                      components: [],
                      embeds: []
                  });
              }
          });

          return;
      }
  }

    // Send message with random saved image
    if (kissing) {
      const imagePath = await this.getRandomImage();
      if (!imagePath) {
        return interaction.reply({
          content:
            '❌ No kiss images found. Please ask an administrator to add some images first.',
          ephemeral: true,
        });
      }

      try {
        const imageBuffer = await fs.readFile(imagePath);
        const fileExtension = path.extname(imagePath);

        const kissEmbed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setDescription(`${interaction.user} 💋 ${kissing} ${user ? user : ''}`)
          .setImage(`attachment://kiss${fileExtension}`)
          .setTimestamp();

        return interaction.reply({
          embeds: [kissEmbed],
          files: [
            {
              attachment: imageBuffer,
              name: `kiss${fileExtension}`,
            },
          ],
        });
      } catch (error) {
        this.logger.error('Error sending image:', error);
        return interaction.reply({
          content: '❌ Error sending the image. Please try again.',
          ephemeral: true,
        });
      }
    }

    // Default text-only response
    return interaction.reply({
      content: `${interaction.user} 💋 Sending a virtual kiss to ${user}`,
    });
  }
}

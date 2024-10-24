import { Injectable } from '@nestjs/common';
import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { KissDto } from './dto/kiss.dto';
import { EmbedBuilder, Attachment, PermissionsBitField } from 'discord.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class KissService {
    private readonly imageFolder: string;
    private readonly allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];

    constructor() {
        this.imageFolder = path.join(process.cwd(), 'uploads', 'kiss-images');
        this.initializeImageFolder();
    }

    private async initializeImageFolder() {
        try {
            await fs.mkdir(this.imageFolder, { recursive: true });
            console.log('Images will be stored in:', this.imageFolder);
        } catch (error) {
            console.error('Error creating image folder:', error);
        }
    }

    private isAdmin(interaction: SlashCommandContext[0]): boolean {
        // Check if the user is a guild member and has administrator permission
        if (!interaction.guild) return false;
        
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member) return false;

        return member.permissions.has(PermissionsBitField.Flags.Administrator);
    }

    private async listImages(): Promise<string[]> {
        try {
            return await fs.readdir(this.imageFolder);
        } catch (error) {
            console.error('Error listing images:', error);
            return [];
        }
    }

    private async removeImage(filename: string): Promise<boolean> {
        try {
            const filePath = path.join(this.imageFolder, filename);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Error removing image:', error);
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
            console.error('Error removing all images:', error);
            return 0;
        }
    }

    private async saveUploadedImage(attachment: Attachment): Promise<string | null> {
        try {
            const fileExtension = path.extname(attachment.name).toLowerCase();
            
            if (!this.allowedExtensions.includes(fileExtension)) {
                throw new Error('Invalid file type. Only jpg, jpeg, png, and gif files are allowed.');
            }

            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const fileName = `kiss_${Date.now()}${fileExtension}`;
            const filePath = path.join(this.imageFolder, fileName);
            
            await fs.writeFile(filePath, response.data);
            return fileName;
        } catch (error) {
            console.error('Error saving uploaded image:', error);
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
            console.error('Error getting random image:', error);
            return null;
        }
    }

    @SlashCommand({
        name: 'kiss',
        description: 'Send a virtual kiss to someone.',
    })
    public async onKiss(
        @Context() [interaction]: SlashCommandContext,
        @Options() { user, kissing, addimage, remove }: KissDto
    ) {
        // Handle image removal (admin only)
        if (remove) {
            // Check if user is an admin
            if (!this.isAdmin(interaction)) {
                return interaction.reply({
                    content: '❌ Only administrators can remove kiss images.',
                    ephemeral: true
                });
            }

            if (remove.toLowerCase() === 'all') {
                const count = await this.removeAllImages();
                return interaction.reply({
                    content: `✅ Successfully removed ${count} kiss images.`,
                    ephemeral: true
                });
            } else {
                const files = await this.listImages();
                const fileToRemove = files.find(f => f.includes(remove));

                if (!fileToRemove) {
                    return interaction.reply({
                        content: '❌ Image not found. Use the exact filename or "all" to remove all images.',
                        ephemeral: true
                    });
                }

                const success = await this.removeImage(fileToRemove);
                return interaction.reply({
                    content: success 
                        ? `✅ Successfully removed image: ${fileToRemove}`
                        : '❌ Failed to remove the image.',
                    ephemeral: true
                });
            }
        }

        // Handle image upload (admin only)
        if (addimage) {
            // Check if user is an admin
            if (!this.isAdmin(interaction)) {
                return interaction.reply({
                    content: '❌ Only administrators can add kiss images.',
                    ephemeral: true
                });
            }

            const savedFileName = await this.saveUploadedImage(addimage);
            if (savedFileName) {
                return interaction.reply({ 
                    content: `✅ Successfully saved kiss image: ${savedFileName}`,
                    ephemeral: true
                });
            } else {
                return interaction.reply({ 
                    content: '❌ Failed to save the image. Please make sure it\'s a valid image file (jpg, jpeg, png, or gif).',
                    ephemeral: true 
                });
            }
        }

        // Send message with random saved image
        if (kissing) {
            const imagePath = await this.getRandomImage();
            if (!imagePath) {
                return interaction.reply({ 
                    content: '❌ No kiss images found. Please ask an administrator to add some images first.',
                    ephemeral: true 
                });
            }

            try {
                const imageBuffer = await fs.readFile(imagePath);
                const fileExtension = path.extname(imagePath);
                
                const kissEmbed = new EmbedBuilder()
                    .setColor('#FF69B4')
                    .setDescription(`${interaction.user} 💋 ${kissing} ${user ? `<@${user}>` : ''}`)
                    .setImage(`attachment://kiss${fileExtension}`)
                    .setTimestamp();

                return interaction.reply({ 
                    embeds: [kissEmbed],
                    files: [{
                        attachment: imageBuffer,
                        name: `kiss${fileExtension}`
                    }]
                });
            } catch (error) {
                console.error('Error sending image:', error);
                return interaction.reply({ 
                    content: '❌ Error sending the image. Please try again.',
                    ephemeral: true 
                });
            }
        }

        // Default text-only response
        return interaction.reply({ 
            content: `${interaction.user} 💋 Sending a virtual kiss to ${user}!` 
        });
    }
}
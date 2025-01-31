import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from './entities/bank.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  Context,
  Options,
  SlashCommand,
  SlashCommandContext,
} from 'necord';
import { OptionDto } from './dto/bank.dto';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder as ModalActionRowBuilder } from 'discord.js';

@Injectable()
export class BankService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BankService.name);

  constructor(
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  /**
   * Ensure the data directory exists.
   */
  private ensureDirectoryExists(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      this.logger.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Fetch the list of banks from the API and save it to a JSON file.
   */
  private async fetchAndSaveBanks() {
    try {
      this.logger.log('Fetching bank list from API...');
      const response = await axios.get('https://api.vietqr.io/v2/banks');
      if (response.data.code === '00') {
        const banks = response.data.data;
        // Define the file path
        const filePath = path.resolve(__dirname, '../../data/banks.json');
        // Ensure the directory exists
        this.ensureDirectoryExists(filePath);
        // Save the bank list to a JSON file
        fs.writeFileSync(filePath, JSON.stringify(banks, null, 2));
        this.logger.log(`Bank list saved successfully to ${filePath}`);
      } else {
        this.logger.error('Failed to fetch bank list:', response.data.desc);
      }
    } catch (error) {
      this.logger.error('Error fetching or saving bank list:', error.message);
    }
  }

  /**
   * Lifecycle hook: Called when the application starts.
   */
  async onApplicationBootstrap() {
    this.logger.log('Application starting up. Fetching initial bank list...');
    await this.fetchAndSaveBanks();
  }

  /**
   * Scheduled task: Fetch and save banks every day at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  private async scheduledFetchAndSaveBanks() {
    this.logger.log('Scheduled task: Fetching bank list...');
    await this.fetchAndSaveBanks();
  }

  /**
   * Read the bank list from the JSON file.
   */
  private readBankList(): any[] {
    try {
      const filePath = path.resolve(__dirname, '../../data/banks.json');
      // Ensure the directory exists before reading
      this.ensureDirectoryExists(filePath);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      this.logger.error('Error reading bank list from file:', error.message);
      return [];
    }
  }

  /**
   * Slash command to list banks with pagination.
   */
  @SlashCommand({
    name: 'bank',
    description: 'Bank command!',
  })
  private async onBank(
    @Context() [interaction]: SlashCommandContext,
    @Options() { option }: OptionDto,
  ) {
    if (option === 'list_bank') {
      const banks = this.readBankList();

      if (banks.length === 0) {
        await interaction.reply({
          content: 'No banks available.',
          ephemeral: true, // Make the message ephemeral
        });
        return;
      }

      // Initial page setup
      const itemsPerPage = 10;
      let currentPage = 1;

      // Function to generate embed for the current page
      const generateEmbed = (page: number, filteredBanks?: any[]) => {
        const banksToDisplay = filteredBanks || banks;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(banksToDisplay.length / itemsPerPage);

        const embed = new EmbedBuilder()
          .setTitle('List of Banks')
          .setDescription(`Page ${page} of ${totalPages}`)
          .addFields(
            banksToDisplay.slice(startIndex, endIndex).map((bank) => ({
              name: bank.shortName || bank.name,
              value: `Code: ${bank.code}, BIN: ${bank.bin}`,
            })),
          )
          .setFooter({ text: 'Data fetched from VietQR API' });

        return embed;
      };

      // Send initial reply as an ephemeral message
      const initialReply = await interaction.reply({
        embeds: [generateEmbed(currentPage)],
        components: [this.generateActionRow(currentPage)],
        ephemeral: true, // Make the message ephemeral
        fetchReply: true,
      });

      // Handle button interactions
      const collector = initialReply.createMessageComponentCollector({
        time: 5 * 60 * 1000, // 5 minutes timeout
      });

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: 'This interaction is not for you.',
            ephemeral: true,
          });
          return;
        }

        if (buttonInteraction.customId === 'previous') {
          currentPage -= 1;
        } else if (buttonInteraction.customId === 'next') {
          currentPage += 1;
        } else if (buttonInteraction.customId === 'search') {
          // Show the search modal
          const modal = this.createSearchModal();
          await buttonInteraction.showModal(modal);

          // Handle modal submission
          try {
            const modalResponse = await buttonInteraction.awaitModalSubmit({
              time: 5 * 60 * 1000, // 5 minutes timeout
            });

            const searchQuery = modalResponse.fields
              .getTextInputValue('searchInput')
              .toLowerCase();

            // Filter banks by name or short_name
            const filteredBanks = banks.filter(
              (bank) =>
                bank.name.toLowerCase().includes(searchQuery) ||
                (bank.shortName && bank.shortName.toLowerCase().includes(searchQuery)),
            );

            if (filteredBanks.length === 0) {
              await modalResponse.reply({
                content: 'No banks found matching your search.',
                ephemeral: true,
              });
              return;
            }

            // Update the embed with search results
            currentPage = 1; // Reset to the first page
            // Acknowledge the modal submission
            await modalResponse.deferUpdate();

            // Edit the original message with the search results
            await interaction.editReply({
              embeds: [generateEmbed(currentPage, filteredBanks)],
              components: [this.generateActionRow(currentPage)],
            });
          } catch (error) {
            this.logger.error('Error handling modal submission:', error.message);
          }
          return;
        }

        await buttonInteraction.update({
          embeds: [generateEmbed(currentPage)],
          components: [this.generateActionRow(currentPage)],
        });
      });

      collector.on('end', () => {
        interaction.editReply({
          components: [],
        });
      });
    }
  }

  private generateActionRow(page: number): ActionRowBuilder<ButtonBuilder> {
    const totalPages = Math.ceil(this.readBankList().length / 10);

    const previousButton = new ButtonBuilder()
      .setCustomId('previous')
      .setLabel('⬅️ Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
      .setCustomId('next')
      .setLabel('➡️ Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages);

    const searchButton = new ButtonBuilder()
      .setCustomId('search')
      .setLabel('🔍 Search')
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      previousButton,
      nextButton,
      searchButton,
    );
  }

  private createSearchModal(): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId('searchBankModal')
      .setTitle('Search Bank');

    const searchInput = new TextInputBuilder()
      .setCustomId('searchInput')
      .setLabel('Enter bank name or short name:')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow = new ModalActionRowBuilder<TextInputBuilder>().addComponents(
      searchInput,
    );

    modal.addComponents(actionRow);
    return modal;
  }
}
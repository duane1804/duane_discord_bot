import { customAlphabet } from 'nanoid';
import { SlashCommandContext } from 'necord';
import { PermissionsBitField, StringSelectMenuInteraction } from 'discord.js';

const alphabet =
  '123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/*
 *****************************************
 *
 *
 */

export function getNanoId(length = 15): string {
  const nanoid = customAlphabet(alphabet, length);
  return nanoid();
}

/*
 *****************************************
 *
 *
 */

export const getEnumKeys = (entity: any) => {
  const keys = Object.keys(entity).filter((key) => isNaN(Number(key)));
  return keys;
};

export const isAdmin = async (
  interaction: SlashCommandContext[0] | StringSelectMenuInteraction,
): Promise<boolean> => {
  // Ensure the interaction is from a guild
  if (!interaction.guild) return false;

  try {
    // Try to get the member from the cache
    let member = interaction.guild.members.cache.get(interaction.user.id);

    // If the member is not in the cache, fetch it from the API
    if (!member) {
      member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    }

    // If the member still can't be found, return false
    if (!member) return false;

    // Check if the member has the Administrator permission
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  } catch (error) {
    console.error('Error checking admin permissions:', error);
    return false;
  }
};
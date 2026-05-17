import { PermissionFlagsBits, type Client } from 'discord.js';

export function generateInviteUrl(client: Client): string {
  const clientId = client.user!.id;
  const permissions = (
    PermissionFlagsBits.ManageEvents |
    PermissionFlagsBits.ViewChannel
  ).toString();
  // Both bot and applications.commands scopes are required by Discord's current OAuth2 flow
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
}

import { Client, GatewayIntentBits } from 'discord.js';

export function buildDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildScheduledEvents,
    ],
  });
}

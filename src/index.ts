import 'dotenv/config';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { createLogger } from './logger';
import { buildAppAuthProvider } from './twitch/auth';
import { buildApiClient } from './twitch/client';
import { buildDiscordClient } from './discord/client';
import { createExpressApp } from './web/server';
import { runSync, runSyncForChannel, type AppState } from './sync/engine';
import { startScheduler } from './sync/scheduler';

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.DB_PATH);
  const logger = createLogger(db);

  logger.info('app', 'Starting TwitchcordSchedule');

  const authProvider = buildAppAuthProvider(config);
  const apiClient = buildApiClient(authProvider);

  const appState: AppState = {
    twitchConnected: false,
    lastSync: null,
    nextSync: null,
    syncInProgress: false,
  };

  const savedChannels = db.getAllChannels();
  if (savedChannels.length > 0) {
    appState.twitchConnected = true;
    logger.info('app', `Restored ${savedChannels.length} Twitch channel(s): ${savedChannels.map(c => c.display_name).join(', ')}`);
  }

  const discordClient = buildDiscordClient();

  discordClient.once('clientReady', () => {
    logger.success('discord', `Bot ready as ${discordClient.user?.tag}`);
    for (const [, guild] of discordClient.guilds.cache) {
      db.upsertGuild(guild.id, guild.name, guild.iconURL({ size: 64 }));
    }
  });

  discordClient.on('guildCreate', guild => {
    db.upsertGuild(guild.id, guild.name, guild.iconURL({ size: 64 }));
    db.linkGuildToAllChannels(guild.id);
    logger.info('discord', `Bot joined new guild: ${guild.name} (${guild.id})`);
  });

  discordClient.on('guildDelete', guild => {
    db.setGuildEnabled(guild.id, false);
    logger.warn('discord', `Bot removed from guild: ${guild.name} (${guild.id})`);
  });

  await discordClient.login(config.DISCORD_BOT_TOKEN);

  const syncFn = () => runSync(apiClient, discordClient, db, logger, appState);
  const syncChannelFn = (id: string) => runSyncForChannel(id, apiClient, discordClient, db, logger, appState);

  startScheduler(syncFn);
  logger.info('app', 'Sync scheduler started (every 30 minutes)');

  const app = createExpressApp({
    config,
    db,
    apiClient,
    discordClient,
    logger,
    appState,
    syncFn,
    syncChannelFn,
  });

  app.listen(config.PORT, () => {
    logger.success('app', `Dashboard running at ${config.BASE_URL}`);
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

import type { ApiClient } from '@twurple/api';
import type { Client } from 'discord.js';
import type { DatabaseQueries, TwitchChannelRow } from '../db';
import type { Logger } from '../logger';
import { fetchScheduleSegments, type NormalizedSegment } from '../twitch/schedule';
import { getBroadcasterImage, getGameImage, clearImageCache } from '../twitch/images';
import { createEvent, updateEvent, deleteEvent, cancelEvent, type EventPayload } from '../discord/events';

export interface AppState {
  twitchConnected: boolean;
  lastSync: Date | null;
  nextSync: Date | null;
  syncInProgress: boolean;
}

interface PayloadConfig {
  broadcaster_id: string;
  broadcaster_name: string;
  broadcaster_description: string;
  display_name: string;
  title_template: string;
  description_template: string;
  image_type: 'none' | 'profile' | 'game';
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([\w.]+)(?::([A-Za-z]))?\}/g, (match, key, style) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return '';
    if ((key === 'event.start_time' || key === 'event.end_time') && vars[key]) {
      return style ? `<t:${vars[key]}:${style}>` : `<t:${vars[key]}>`;
    }
    return vars[key];
  });
}

async function buildPayload(
  segment: NormalizedSegment,
  config: PayloadConfig,
  apiClient: ApiClient
): Promise<EventPayload> {
  const vars: Record<string, string> = {
    title: segment.title,
    category: segment.categoryName ?? '',
    broadcaster: config.display_name,
    'stream.title': segment.title,
    'game.name': segment.categoryName ?? '',
    'game.__id__': segment.categoryId ?? '',
    'user.twitch_url': `https://twitch.tv/${config.broadcaster_name}`,
    'user.twitch_name': config.broadcaster_name,
    'user.name': config.broadcaster_name,
    'user.description': config.broadcaster_description,
    'user.__id__': config.broadcaster_id,
    'event.start_time': String(Math.floor(segment.startTime.getTime() / 1000)),
    'event.end_time': String(Math.floor(segment.endTime.getTime() / 1000)),
  };

  const name = applyTemplate(config.title_template || '{title}', vars).trim() || segment.title;
  const description = applyTemplate(config.description_template, vars).trim();

  let coverImage: string | null = null;
  if (config.image_type === 'profile') {
    coverImage = await getBroadcasterImage(apiClient, config.broadcaster_id);
  } else if (config.image_type === 'game' && segment.categoryId) {
    coverImage = await getGameImage(apiClient, segment.categoryId);
  }

  return {
    name,
    description,
    scheduledStartTime: segment.startTime,
    scheduledEndTime: segment.endTime,
    coverImage,
  };
}

async function syncChannel(
  channel: TwitchChannelRow,
  apiClient: ApiClient,
  discordClient: Client,
  db: DatabaseQueries,
  logger: Logger
): Promise<void> {
  let allSegments: NormalizedSegment[];
  try {
    allSegments = await fetchScheduleSegments(apiClient, channel.broadcaster_id);
  } catch (err) {
    logger.error('sync', `Failed to fetch schedule for ${channel.display_name}: ${String(err)}`);
    return;
  }

  logger.info('sync', `${channel.display_name}: fetched ${allSegments.length} segment(s)`);

  const linkedGuilds = db.getLinkedGuildsWithSettings(channel.broadcaster_id);

  for (const linkRow of linkedGuilds) {
    const { guild_id: guildId, name: guildName } = linkRow;
    try {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        logger.warn(`discord:${guildId}`, `Guild "${guildName}" not in bot cache — skipping`);
        continue;
      }

      const capped = allSegments.slice(0, linkRow.max_events);
      const activeSegments = capped.filter(s => !s.isCanceled);
      const cancelledIds = new Set(capped.filter(s => s.isCanceled).map(s => s.id));
      const desiredMap = new Map<string, NormalizedSegment>(activeSegments.map(s => [s.id, s]));

      const existingMappings = db.getMappingsByGuild(guildId)
        .filter(m => m.broadcaster_id === channel.broadcaster_id);
      const mappingMap = new Map(existingMappings.map(m => [m.twitch_segment_id, m.discord_event_id]));

      const config: PayloadConfig = {
        broadcaster_id: channel.broadcaster_id,
        broadcaster_name: channel.broadcaster_name,
        broadcaster_description: channel.broadcaster_description,
        display_name: channel.display_name,
        title_template: linkRow.title_template,
        description_template: linkRow.description_template,
        image_type: linkRow.image_type,
      };

      let created = 0, updated = 0, deleted = 0, cancelled = 0;

      for (const [segmentId, segment] of desiredMap) {
        const payload = await buildPayload(segment, config, apiClient);
        const existingEventId = mappingMap.get(segmentId);
        if (!existingEventId || !await updateEvent(guild, existingEventId, payload)) {
          const newEventId = await createEvent(guild, payload);
          db.upsertSyncMapping(segmentId, guildId, newEventId, channel.broadcaster_id);
          created++;
        } else {
          db.upsertSyncMapping(segmentId, guildId, existingEventId, channel.broadcaster_id);
          updated++;
        }
      }

      for (const mapping of existingMappings) {
        if (cancelledIds.has(mapping.twitch_segment_id)) {
          await cancelEvent(guild, mapping.discord_event_id);
          db.deleteMappingByDiscordEventId(mapping.discord_event_id, guildId);
          cancelled++;
        } else if (!desiredMap.has(mapping.twitch_segment_id)) {
          await deleteEvent(guild, mapping.discord_event_id);
          db.deleteMappingByDiscordEventId(mapping.discord_event_id, guildId);
          deleted++;
        }
      }

      logger.success(`discord:${guildId}`, `"${guildName}" ← ${channel.display_name}: +${created} ~${updated} -${deleted} ✕${cancelled}`);
    } catch (err) {
      logger.error(`discord:${guildId}`, `"${guildName}" sync failed: ${String(err)}`);
    }
  }
}

export async function runSyncForChannel(
  broadcasterId: string,
  apiClient: ApiClient,
  discordClient: Client,
  db: DatabaseQueries,
  logger: Logger,
  appState: AppState
): Promise<void> {
  const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
  if (!channel) {
    logger.warn('sync', `Channel ${broadcasterId} not found`);
    return;
  }
  if (appState.syncInProgress) {
    logger.warn('sync', 'Sync already in progress, skipping');
    return;
  }

  appState.syncInProgress = true;
  clearImageCache();
  logger.info('sync', `Manual sync for ${channel.display_name}`);

  await syncChannel(channel, apiClient, discordClient, db, logger);

  appState.lastSync = new Date();
  appState.syncInProgress = false;
  logger.success('sync', `Manual sync complete for ${channel.display_name}`);
}

export async function runSync(
  apiClient: ApiClient,
  discordClient: Client,
  db: DatabaseQueries,
  logger: Logger,
  appState: AppState
): Promise<void> {
  const channels = db.getAllChannels();
  if (channels.length === 0) {
    logger.warn('sync', 'Skipping sync — no Twitch channels configured');
    return;
  }
  if (appState.syncInProgress) {
    logger.warn('sync', 'Sync already in progress, skipping');
    return;
  }

  appState.syncInProgress = true;
  clearImageCache();
  logger.info('sync', `Starting sync for ${channels.map(c => c.display_name).join(', ')}`);

  for (const channel of channels) {
    await syncChannel(channel, apiClient, discordClient, db, logger);
  }

  appState.lastSync = new Date();
  appState.syncInProgress = false;
  logger.success('sync', 'Sync run complete');
}

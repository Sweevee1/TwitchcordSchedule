import { Router } from 'express';
import type { Client } from 'discord.js';
import type { DatabaseQueries } from '../../db';
import type { Logger } from '../../logger';
import type { AppState } from '../../sync/engine';
import { generateInviteUrl } from '../../discord/invite';
import { triggerManualSync } from '../../sync/scheduler';
import { deleteEvent } from '../../discord/events';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function createApiRouter(
  db: DatabaseQueries,
  discordClient: Client,
  logger: Logger,
  appState: AppState,
  syncFn: () => Promise<void>,
  syncChannelFn: (broadcasterId: string) => Promise<void>
): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const guilds = db.getAllGuilds();
    const channels = db.getAllChannels();
    const nextSync = appState.lastSync
      ? new Date(appState.lastSync.getTime() + THIRTY_MINUTES_MS)
      : null;

    const rawLinks = db.getAllChannelGuildLinks();
    const channelLinks: Record<string, string[]> = {};
    for (const l of rawLinks) {
      (channelLinks[l.broadcaster_id] ??= []).push(l.guild_id);
    }

    res.json({
      twitchConnected: appState.twitchConnected,
      syncInProgress: appState.syncInProgress,
      lastSync: appState.lastSync?.toISOString() ?? null,
      nextSync: nextSync?.toISOString() ?? null,
      channels,
      guilds,
      channelLinks,
    });
  });

  router.get('/logs', (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10), 500);
    res.json(db.getRecentLogs(limit));
  });

  router.delete('/logs', (_req, res) => {
    db.clearLogs();
    logger.info('api', 'Activity log cleared');
    res.json({ ok: true });
  });

  router.post('/guilds/:guildId/toggle', (req, res) => {
    const { guildId } = req.params;
    const guilds = db.getAllGuilds();
    const guild = guilds.find(g => g.guild_id === guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const newEnabled = guild.enabled === 0;
    db.setGuildEnabled(guildId, newEnabled);
    logger.info('api', `Guild ${guild.name} (${guildId}) ${newEnabled ? 'enabled' : 'disabled'}`);
    res.json({ guild_id: guildId, enabled: newEnabled ? 1 : 0 });
  });

  // Per-channel: get settings + guild routing
  router.get('/channels/:broadcasterId/config', (req, res) => {
    const { broadcasterId } = req.params;
    const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const guilds = db.getGuildsForChannel(broadcasterId);
    res.json({ channel, guilds });
  });

  // Per-link: get template settings for a (channel, guild) pair
  router.get('/channels/:broadcasterId/guilds/:guildId/settings', (req, res) => {
    const { broadcasterId, guildId } = req.params;
    const settings = db.getLinkSettings(broadcasterId, guildId);
    if (!settings) return res.status(404).json({ error: 'Link not found' });
    res.json(settings);
  });

  // Per-link: save template settings for a (channel, guild) pair
  router.post('/channels/:broadcasterId/guilds/:guildId/settings', (req, res) => {
    const { broadcasterId, guildId } = req.params;
    const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!db.getLinkSettings(broadcasterId, guildId)) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { title_template, description_template, image_type, max_events } = req.body as Record<string, string>;
    const validImageTypes = ['none', 'profile', 'game'] as const;
    if (!validImageTypes.includes(image_type as typeof validImageTypes[number])) {
      return res.status(400).json({ error: 'Invalid image_type' });
    }
    db.updateLinkSettings(broadcasterId, guildId, {
      title_template: String(title_template ?? '{title}').slice(0, 100),
      description_template: String(description_template ?? '').slice(0, 940),
      image_type: image_type as 'none' | 'profile' | 'game',
      max_events: Math.max(1, Math.min(25, parseInt(max_events, 10) || 5)),
    });
    logger.success('api', `Settings saved for ${channel.display_name} → guild ${guildId}`);
    res.json({ ok: true });
  });

  // Per-channel: toggle guild link
  router.post('/channels/:broadcasterId/guilds/:guildId/toggle', (req, res) => {
    const { broadcasterId, guildId } = req.params;
    const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const guilds = db.getGuildsForChannel(broadcasterId);
    const guild = guilds.find(g => g.guild_id === guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const newLinked = guild.linked === 0;
    db.setChannelGuildLink(broadcasterId, guildId, newLinked);
    res.json({ linked: newLinked ? 1 : 0 });
  });

  // Per-channel: trigger sync
  router.post('/channels/:broadcasterId/sync', (req, res) => {
    const { broadcasterId } = req.params;
    const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (appState.syncInProgress) return res.status(409).json({ error: 'Sync already in progress' });
    triggerManualSync(() => syncChannelFn(broadcasterId));
    res.json({ ok: true });
  });

  // Per-channel: remove channel and clean up Discord events
  router.delete('/channels/:broadcasterId', async (req, res) => {
    const { broadcasterId } = req.params;
    const channel = db.getAllChannels().find(c => c.broadcaster_id === broadcasterId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const mappings = db.getMappingsByBroadcaster(broadcasterId);
    let cleaned = 0;
    for (const mapping of mappings) {
      const guild = discordClient.guilds.cache.get(mapping.guild_id);
      if (guild) {
        try { await deleteEvent(guild, mapping.discord_event_id); cleaned++; } catch {}
      }
      db.deleteMappingByDiscordEventId(mapping.discord_event_id, mapping.guild_id);
    }

    db.removeChannel(broadcasterId);
    appState.twitchConnected = db.getAllChannels().length > 0;

    logger.info('api', `Removed ${channel.display_name}, cleaned ${cleaned} Discord events`);
    res.json({ ok: true });
  });

  router.post('/sync', (_req, res) => {
    if (!appState.twitchConnected) {
      return res.status(400).json({ error: 'No Twitch channels configured' });
    }
    triggerManualSync(syncFn);
    res.json({ ok: true, message: 'Sync triggered' });
  });

  router.get('/settings', (_req, res) => {
    res.json(db.getSettings());
  });

  router.post('/settings', (req, res) => {
    const { title_template, description_template, image_type, max_events } = req.body as Record<string, string>;
    const validImageTypes = ['none', 'profile', 'game'] as const;
    if (!validImageTypes.includes(image_type as typeof validImageTypes[number])) {
      return res.status(400).json({ error: 'Invalid image_type' });
    }
    const maxEventsNum = Math.max(1, Math.min(25, parseInt(max_events, 10) || 5));
    db.setSettings({
      title_template: String(title_template ?? '{title}').slice(0, 100),
      description_template: String(description_template ?? '').slice(0, 940),
      image_type: image_type as 'none' | 'profile' | 'game',
      max_events: maxEventsNum,
    });
    res.json({ ok: true });
  });

  router.get('/invite', (_req, res) => {
    if (!discordClient.user) {
      return res.status(503).json({ error: 'Discord bot not ready' });
    }
    res.json({ url: generateInviteUrl(discordClient) });
  });

  return router;
}

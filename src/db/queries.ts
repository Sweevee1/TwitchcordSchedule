import { DatabaseSync } from 'node:sqlite';

export interface TwitchChannelRow {
  broadcaster_id: string;
  broadcaster_name: string;
  display_name: string;
  profile_image_url: string;
  broadcaster_description: string;
  title_template: string;
  description_template: string;
  image_type: 'none' | 'profile' | 'game';
  max_events: number;
  added_at: number;
}

export interface GuildRow {
  guild_id: string;
  name: string;
  icon: string | null;
  enabled: number;
  added_at: number;
}

export interface GuildWithLink extends GuildRow {
  linked: number;
}

export interface ChannelGuildLinkRow {
  broadcaster_id: string;
  guild_id: string;
  title_template: string;
  description_template: string;
  image_type: 'none' | 'profile' | 'game';
  max_events: number;
}

export interface GuildWithLinkSettings extends GuildRow, ChannelGuildLinkRow {}

export interface SyncMappingRow {
  id: number;
  twitch_segment_id: string;
  guild_id: string;
  discord_event_id: string;
  broadcaster_id: string;
  last_synced_at: number;
}

export interface LogRow {
  id: number;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  scope: string;
  message: string;
}

export interface SettingsRow {
  title_template: string;
  description_template: string;
  image_type: 'none' | 'profile' | 'game';
  max_events: number;
}

export interface LinkSettings {
  title_template: string;
  description_template: string;
  image_type: 'none' | 'profile' | 'game';
  max_events: number;
}

export interface DatabaseQueries {
  getAllChannels(): TwitchChannelRow[];
  addChannel(broadcasterId: string, broadcasterName: string, displayName: string, profileImageUrl: string, description: string): void;
  removeChannel(broadcasterId: string): void;
  getGuildsForChannel(broadcasterId: string): GuildWithLink[];
  getLinkedGuildsWithSettings(broadcasterId: string): GuildWithLinkSettings[];
  getLinkedEnabledGuilds(broadcasterId: string): GuildRow[];
  getLinkSettings(broadcasterId: string, guildId: string): ChannelGuildLinkRow | null;
  updateLinkSettings(broadcasterId: string, guildId: string, settings: LinkSettings): void;
  getAllChannelGuildLinks(): { broadcaster_id: string; guild_id: string }[];
  setChannelGuildLink(broadcasterId: string, guildId: string, linked: boolean): void;
  linkChannelToAllGuilds(broadcasterId: string): void;
  linkGuildToAllChannels(guildId: string): void;
  upsertGuild(guildId: string, name: string, icon: string | null): void;
  setGuildEnabled(guildId: string, enabled: boolean): void;
  getAllGuilds(): GuildRow[];
  getEnabledGuilds(): GuildRow[];
  upsertSyncMapping(twitchSegmentId: string, guildId: string, discordEventId: string, broadcasterId: string): void;
  getMappingsByGuild(guildId: string): SyncMappingRow[];
  getMappingsByBroadcaster(broadcasterId: string): SyncMappingRow[];
  deleteMappingByDiscordEventId(discordEventId: string, guildId: string): void;
  insertLog(level: LogRow['level'], scope: string, message: string): void;
  getRecentLogs(limit: number): LogRow[];
  clearLogs(): void;
  getSettings(): SettingsRow;
  setSettings(s: SettingsRow): void;
}

export function buildQueries(db: DatabaseSync): DatabaseQueries {
  const stmts = {
    getAllChannels: db.prepare(`SELECT * FROM twitch_channels ORDER BY added_at`),
    addChannel: db.prepare(
      `INSERT INTO twitch_channels (broadcaster_id, broadcaster_name, display_name, profile_image_url, broadcaster_description, added_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(broadcaster_id) DO UPDATE SET
         broadcaster_name = excluded.broadcaster_name,
         display_name = excluded.display_name,
         profile_image_url = excluded.profile_image_url,
         broadcaster_description = excluded.broadcaster_description`
    ),
    removeChannel: db.prepare(`DELETE FROM twitch_channels WHERE broadcaster_id = ?`),
    removeChannelLinks: db.prepare(`DELETE FROM channel_guild_links WHERE broadcaster_id = ?`),
    getGuildsForChannel: db.prepare(`
      SELECT g.*,
        CASE WHEN cgl.guild_id IS NOT NULL THEN 1 ELSE 0 END AS linked
      FROM guilds g
      LEFT JOIN channel_guild_links cgl
        ON cgl.guild_id = g.guild_id AND cgl.broadcaster_id = ?
      ORDER BY g.name
    `),
    getLinkedGuildsWithSettings: db.prepare(`
      SELECT g.*, cgl.title_template, cgl.description_template, cgl.image_type, cgl.max_events
      FROM guilds g
      JOIN channel_guild_links cgl ON cgl.guild_id = g.guild_id AND cgl.broadcaster_id = ?
      WHERE g.enabled = 1
      ORDER BY g.name
    `),
    getLinkedEnabledGuilds: db.prepare(`
      SELECT g.* FROM guilds g
      JOIN channel_guild_links cgl ON cgl.guild_id = g.guild_id
      WHERE cgl.broadcaster_id = ? AND g.enabled = 1
      ORDER BY g.name
    `),
    getLinkSettings: db.prepare(
      `SELECT * FROM channel_guild_links WHERE broadcaster_id = ? AND guild_id = ?`
    ),
    updateLinkSettings: db.prepare(
      `UPDATE channel_guild_links
         SET title_template = ?, description_template = ?, image_type = ?, max_events = ?
       WHERE broadcaster_id = ? AND guild_id = ?`
    ),
    getAllChannelGuildLinks: db.prepare(`SELECT broadcaster_id, guild_id FROM channel_guild_links`),
    addChannelGuildLink: db.prepare(
      `INSERT OR IGNORE INTO channel_guild_links
         (broadcaster_id, guild_id,
          title_template, description_template, image_type, max_events)
       VALUES (?, ?,
         COALESCE((SELECT title_template FROM settings WHERE id=1), '{title}'),
         COALESCE((SELECT description_template FROM settings WHERE id=1), '{category}'),
         COALESCE((SELECT image_type FROM settings WHERE id=1), 'none'),
         COALESCE((SELECT max_events FROM settings WHERE id=1), 5))`
    ),
    removeChannelGuildLink: db.prepare(
      `DELETE FROM channel_guild_links WHERE broadcaster_id = ? AND guild_id = ?`
    ),
    linkChannelToAllGuilds: db.prepare(
      `INSERT OR IGNORE INTO channel_guild_links
         (broadcaster_id, guild_id,
          title_template, description_template, image_type, max_events)
       SELECT ?, guild_id,
         COALESCE((SELECT title_template FROM settings WHERE id=1), '{title}'),
         COALESCE((SELECT description_template FROM settings WHERE id=1), '{category}'),
         COALESCE((SELECT image_type FROM settings WHERE id=1), 'none'),
         COALESCE((SELECT max_events FROM settings WHERE id=1), 5)
       FROM guilds`
    ),
    linkGuildToAllChannels: db.prepare(
      `INSERT OR IGNORE INTO channel_guild_links
         (broadcaster_id, guild_id,
          title_template, description_template, image_type, max_events)
       SELECT broadcaster_id, ?,
         COALESCE((SELECT title_template FROM settings WHERE id=1), '{title}'),
         COALESCE((SELECT description_template FROM settings WHERE id=1), '{category}'),
         COALESCE((SELECT image_type FROM settings WHERE id=1), 'none'),
         COALESCE((SELECT max_events FROM settings WHERE id=1), 5)
       FROM twitch_channels`
    ),
    upsertGuild: db.prepare(
      `INSERT INTO guilds (guild_id, name, icon, added_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET name = excluded.name, icon = excluded.icon`
    ),
    setGuildEnabled: db.prepare(`UPDATE guilds SET enabled = ? WHERE guild_id = ?`),
    getAllGuilds: db.prepare(`SELECT * FROM guilds ORDER BY name`),
    getEnabledGuilds: db.prepare(`SELECT * FROM guilds WHERE enabled = 1 ORDER BY name`),
    upsertSyncMapping: db.prepare(
      `INSERT INTO sync_mappings (twitch_segment_id, guild_id, discord_event_id, broadcaster_id, last_synced_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(twitch_segment_id, guild_id) DO UPDATE SET
         discord_event_id = excluded.discord_event_id,
         broadcaster_id = excluded.broadcaster_id,
         last_synced_at = excluded.last_synced_at`
    ),
    getMappingsByGuild: db.prepare(`SELECT * FROM sync_mappings WHERE guild_id = ?`),
    getMappingsByBroadcaster: db.prepare(`SELECT * FROM sync_mappings WHERE broadcaster_id = ?`),
    deleteMappingByDiscordEventId: db.prepare(
      `DELETE FROM sync_mappings WHERE discord_event_id = ? AND guild_id = ?`
    ),
    insertLog: db.prepare(`INSERT INTO logs (ts, level, scope, message) VALUES (?, ?, ?, ?)`),
    trimLogs: db.prepare(
      `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1000)`
    ),
    clearLogs: db.prepare(`DELETE FROM logs`),
    getRecentLogs: db.prepare(`SELECT * FROM logs ORDER BY id DESC LIMIT ?`),
    getSettings: db.prepare(
      `SELECT title_template, description_template, image_type, max_events FROM settings WHERE id = 1`
    ),
    setSettings: db.prepare(
      `UPDATE settings SET title_template = ?, description_template = ?, image_type = ?, max_events = ? WHERE id = 1`
    ),
  };

  return {
    getAllChannels() {
      return stmts.getAllChannels.all() as unknown as TwitchChannelRow[];
    },
    addChannel(broadcasterId, broadcasterName, displayName, profileImageUrl, description) {
      stmts.addChannel.run(broadcasterId, broadcasterName, displayName, profileImageUrl, description, Date.now());
    },
    removeChannel(broadcasterId) {
      stmts.removeChannelLinks.run(broadcasterId);
      stmts.removeChannel.run(broadcasterId);
    },
    getGuildsForChannel(broadcasterId) {
      return stmts.getGuildsForChannel.all(broadcasterId) as unknown as GuildWithLink[];
    },
    getLinkedGuildsWithSettings(broadcasterId) {
      return stmts.getLinkedGuildsWithSettings.all(broadcasterId) as unknown as GuildWithLinkSettings[];
    },
    getLinkedEnabledGuilds(broadcasterId) {
      return stmts.getLinkedEnabledGuilds.all(broadcasterId) as unknown as GuildRow[];
    },
    getLinkSettings(broadcasterId, guildId) {
      return (stmts.getLinkSettings.get(broadcasterId, guildId) as unknown as ChannelGuildLinkRow | undefined) ?? null;
    },
    updateLinkSettings(broadcasterId, guildId, settings) {
      stmts.updateLinkSettings.run(
        settings.title_template, settings.description_template,
        settings.image_type, settings.max_events,
        broadcasterId, guildId
      );
    },
    getAllChannelGuildLinks() {
      return stmts.getAllChannelGuildLinks.all() as unknown as { broadcaster_id: string; guild_id: string }[];
    },
    setChannelGuildLink(broadcasterId, guildId, linked) {
      if (linked) stmts.addChannelGuildLink.run(broadcasterId, guildId);
      else stmts.removeChannelGuildLink.run(broadcasterId, guildId);
    },
    linkChannelToAllGuilds(broadcasterId) {
      stmts.linkChannelToAllGuilds.run(broadcasterId);
    },
    linkGuildToAllChannels(guildId) {
      stmts.linkGuildToAllChannels.run(guildId);
    },
    upsertGuild(guildId, name, icon) {
      stmts.upsertGuild.run(guildId, name, icon, Date.now());
    },
    setGuildEnabled(guildId, enabled) {
      stmts.setGuildEnabled.run(enabled ? 1 : 0, guildId);
    },
    getAllGuilds() {
      return stmts.getAllGuilds.all() as unknown as GuildRow[];
    },
    getEnabledGuilds() {
      return stmts.getEnabledGuilds.all() as unknown as GuildRow[];
    },
    upsertSyncMapping(twitchSegmentId, guildId, discordEventId, broadcasterId) {
      stmts.upsertSyncMapping.run(twitchSegmentId, guildId, discordEventId, broadcasterId, Date.now());
    },
    getMappingsByGuild(guildId) {
      return stmts.getMappingsByGuild.all(guildId) as unknown as SyncMappingRow[];
    },
    getMappingsByBroadcaster(broadcasterId) {
      return stmts.getMappingsByBroadcaster.all(broadcasterId) as unknown as SyncMappingRow[];
    },
    deleteMappingByDiscordEventId(discordEventId, guildId) {
      stmts.deleteMappingByDiscordEventId.run(discordEventId, guildId);
    },
    insertLog(level, scope, message) {
      stmts.insertLog.run(Date.now(), level, scope, message);
      stmts.trimLogs.run();
    },
    getRecentLogs(limit) {
      return stmts.getRecentLogs.all(limit) as unknown as LogRow[];
    },
    clearLogs() {
      stmts.clearLogs.run();
    },
    getSettings() {
      return stmts.getSettings.get() as unknown as SettingsRow;
    },
    setSettings(s) {
      stmts.setSettings.run(s.title_template, s.description_template, s.image_type, s.max_events);
    },
  };
}

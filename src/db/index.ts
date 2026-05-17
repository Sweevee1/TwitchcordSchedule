import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './schema';
import { buildQueries, type DatabaseQueries } from './queries';

export type { DatabaseQueries, TwitchChannelRow, GuildRow, GuildWithLink, ChannelGuildLinkRow, GuildWithLinkSettings, SyncMappingRow, LogRow, SettingsRow } from './queries';

export function openDatabase(dbPath: string): DatabaseQueries {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return buildQueries(db);
}

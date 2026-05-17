import { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS twitch_config (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      broadcaster_id   TEXT NOT NULL,
      broadcaster_name TEXT NOT NULL,
      display_name     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS twitch_channels (
      broadcaster_id       TEXT PRIMARY KEY,
      broadcaster_name     TEXT NOT NULL,
      display_name         TEXT NOT NULL,
      profile_image_url    TEXT NOT NULL DEFAULT '',
      title_template       TEXT NOT NULL DEFAULT '{title}',
      description_template TEXT NOT NULL DEFAULT '{category}',
      image_type           TEXT NOT NULL DEFAULT 'none',
      max_events           INTEGER NOT NULL DEFAULT 5,
      added_at             INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_guild_links (
      broadcaster_id       TEXT NOT NULL,
      guild_id             TEXT NOT NULL,
      title_template       TEXT NOT NULL DEFAULT '{title}',
      description_template TEXT NOT NULL DEFAULT '{category}',
      image_type           TEXT NOT NULL DEFAULT 'none',
      max_events           INTEGER NOT NULL DEFAULT 5,
      PRIMARY KEY (broadcaster_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS guilds (
      guild_id  TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      icon      TEXT,
      enabled   INTEGER NOT NULL DEFAULT 1,
      added_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_mappings (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      twitch_segment_id   TEXT NOT NULL,
      guild_id            TEXT NOT NULL,
      discord_event_id    TEXT NOT NULL,
      broadcaster_id      TEXT NOT NULL DEFAULT '',
      last_synced_at      INTEGER NOT NULL,
      UNIQUE (twitch_segment_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      level   TEXT NOT NULL,
      scope   TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id                   INTEGER PRIMARY KEY CHECK (id = 1),
      title_template       TEXT NOT NULL DEFAULT '{title}',
      description_template TEXT NOT NULL DEFAULT '{category}',
      image_type           TEXT NOT NULL DEFAULT 'none',
      max_events           INTEGER NOT NULL DEFAULT 5
    );

    CREATE INDEX IF NOT EXISTS idx_sync_twitch       ON sync_mappings(twitch_segment_id);
    CREATE INDEX IF NOT EXISTS idx_sync_guild        ON sync_mappings(guild_id);
    CREATE INDEX IF NOT EXISTS idx_sync_broadcaster  ON sync_mappings(broadcaster_id);
    CREATE INDEX IF NOT EXISTS idx_logs_ts           ON logs(ts DESC);
  `);

  // Column migrations for existing databases
  try { db.exec(`ALTER TABLE guilds ADD COLUMN icon TEXT`); } catch {}
  try { db.exec(`ALTER TABLE sync_mappings ADD COLUMN broadcaster_id TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE twitch_channels ADD COLUMN profile_image_url TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE twitch_channels ADD COLUMN title_template TEXT NOT NULL DEFAULT '{title}'`); } catch {}
  try { db.exec(`ALTER TABLE twitch_channels ADD COLUMN description_template TEXT NOT NULL DEFAULT '{category}'`); } catch {}
  try { db.exec(`ALTER TABLE twitch_channels ADD COLUMN image_type TEXT NOT NULL DEFAULT 'none'`); } catch {}
  try { db.exec(`ALTER TABLE twitch_channels ADD COLUMN max_events INTEGER NOT NULL DEFAULT 5`); } catch {}
  try { db.exec(`ALTER TABLE channel_guild_links ADD COLUMN title_template TEXT NOT NULL DEFAULT '{title}'`); } catch {}
  try { db.exec(`ALTER TABLE channel_guild_links ADD COLUMN description_template TEXT NOT NULL DEFAULT '{category}'`); } catch {}
  try { db.exec(`ALTER TABLE channel_guild_links ADD COLUMN image_type TEXT NOT NULL DEFAULT 'none'`); } catch {}
  try { db.exec(`ALTER TABLE channel_guild_links ADD COLUMN max_events INTEGER NOT NULL DEFAULT 5`); } catch {}

  // Seed default settings
  db.exec(`INSERT OR IGNORE INTO settings (id) VALUES (1)`);

  // Migrate twitch_config → twitch_channels (single-channel upgrade)
  db.exec(`
    INSERT OR IGNORE INTO twitch_channels (broadcaster_id, broadcaster_name, display_name, added_at)
      SELECT broadcaster_id, broadcaster_name, display_name, ${Date.now()}
      FROM twitch_config WHERE id = 1;
  `);

  // Backfill broadcaster_id in sync_mappings
  db.exec(`
    UPDATE sync_mappings
      SET broadcaster_id = (SELECT broadcaster_id FROM twitch_config WHERE id = 1)
      WHERE broadcaster_id = ''
        AND EXISTS (SELECT 1 FROM twitch_config WHERE id = 1);
  `);

  // Populate channel_guild_links for existing (channel × guild) pairs
  db.exec(`
    INSERT OR IGNORE INTO channel_guild_links (broadcaster_id, guild_id)
      SELECT c.broadcaster_id, g.guild_id
      FROM twitch_channels c CROSS JOIN guilds g;
  `);

  // Copy per-channel templates into links that still have bare defaults
  db.exec(`
    UPDATE channel_guild_links
      SET title_template       = (SELECT title_template FROM twitch_channels tc WHERE tc.broadcaster_id = channel_guild_links.broadcaster_id),
          description_template = (SELECT description_template FROM twitch_channels tc WHERE tc.broadcaster_id = channel_guild_links.broadcaster_id),
          image_type           = (SELECT image_type FROM twitch_channels tc WHERE tc.broadcaster_id = channel_guild_links.broadcaster_id),
          max_events           = (SELECT max_events FROM twitch_channels tc WHERE tc.broadcaster_id = channel_guild_links.broadcaster_id)
      WHERE title_template = '{title}' AND description_template = '{category}'
        AND image_type = 'none' AND max_events = 10;
  `);
}

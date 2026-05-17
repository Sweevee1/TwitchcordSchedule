# TwitchcordSchedule — Claude Context

## What this project is
A Node.js/TypeScript app that polls one or more Twitch channels' stream schedules every 30 minutes and syncs segments as Discord Guild Scheduled Events across multiple Discord servers. Runs 24/7 as a Docker container. Has a dark web dashboard at port 3000.

## Dev commands
```
npm run dev       # run with ts-node (local dev)
npm run build     # compile TypeScript to dist/
npm start         # run compiled JS (production)
npx tsc --noEmit  # type-check only
docker compose build && docker compose up -d  # Docker
```

## Key architecture decisions
- **No user OAuth for Twitch** — uses App Access Token (client credentials) via `@twurple/auth` `AppTokenAuthProvider`. Twitch channels are added by typing a username in the dashboard UI, which does a broadcaster lookup.
- **node:sqlite (built-in)** instead of `better-sqlite3` — avoids native C++ compilation requirement. Requires Node 22.5+.
- **Sync is Twitch → Discord only**. Twitch is source of truth. Only Discord events stored in `sync_mappings` are ever touched — user-created Discord events are never affected.
- **Per-guild failure isolation** — if one Discord server fails during sync, the rest continue.
- **Per-connection templates** — each (Twitch channel × Discord server) link has its own independent title template, description template, cover image, and max events setting stored in `channel_guild_links`.
- **Image cache** cleared at the start of each sync run (`clearImageCache()` in `engine.ts`).

## Project structure
```
src/
  index.ts              # entry point — startup sequence
  config.ts             # env var loading + validation
  logger.ts             # structured logger (DB + console)
  db/
    index.ts            # opens SQLite, runs migrations, returns DatabaseQueries
    schema.ts           # CREATE TABLE statements + migrations + default settings seed
    queries.ts          # all prepared statements wrapped as DatabaseQueries interface
  twitch/
    auth.ts             # AppTokenAuthProvider + lookupBroadcaster() → { id, name, displayName, profileImageUrl }
    client.ts           # builds ApiClient from auth provider
    schedule.ts         # fetchScheduleSegments() → NormalizedSegment[]
    images.ts           # URL → base64 data URI, in-memory cache per sync run
  discord/
    client.ts           # builds discord.js Client with correct intents
    events.ts           # createEvent / updateEvent / deleteEvent via EventPayload
    invite.ts           # generates bot invite URL (bot + applications.commands scopes)
  sync/
    engine.ts           # runSync() — diff-and-apply logic, applies per-link templates + image
    scheduler.ts        # node-cron job (0,30 * * * *) + triggerManualSync()
  web/
    server.ts           # Express app factory
    routes/
      auth.ts           # POST /auth/twitch/channel — adds channel by username
      api.ts            # REST API for dashboard
      dashboard.ts      # GET / — serves index.html
    public/             # vanilla HTML/CSS/JS, no build step
      index.html
      style.css
      app.js
      favicon.svg       # logo: gradient bg, calendar body, play triangle
      vars.html         # template variable reference docs page
```

## SQLite tables
| Table | Purpose |
|---|---|
| `twitch_channels` | All tracked Twitch channels: broadcaster_id, broadcaster_name, display_name, profile_image_url, added_at |
| `channel_guild_links` | Per-connection settings: (broadcaster_id × guild_id) + title_template, description_template, image_type, max_events |
| `guilds` | All Discord servers the bot is in; `enabled` toggle |
| `sync_mappings` | Maps (twitch_segment_id, guild_id) → discord_event_id |
| `logs` | Ring buffer of 1000 most recent log entries |
| `settings` | Global defaults (single row): title_template, description_template, image_type, max_events — used when creating new links |

## AppState (in-memory, src/sync/engine.ts)
```typescript
interface AppState {
  twitchConnected: boolean;
  twitchBroadcasterId: string | null;
  twitchDisplayName: string | null;
  lastSync: Date | null;
  nextSync: Date | null;
  syncInProgress: boolean;
}
```

## Template system
Templates in `channel_guild_links` use `{variable}` syntax. Available variables: `{title}`, `{category}`, `{broadcaster}`. Applied in `engine.ts` via `applyTemplate()`. Global defaults from `settings` are copied into new links on creation. Default `max_events` is **5**.

## Dashboard API routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Connection status, guilds, channel links, sync times |
| GET | `/api/logs?limit=N` | Recent log entries (newest first) |
| DELETE | `/api/logs` | Clear all logs |
| POST | `/api/guilds/:id/toggle` | Enable/disable a guild |
| POST | `/api/sync` | Trigger manual sync |
| GET | `/api/invite` | Get bot invite URL |
| GET | `/api/channels/:broadcasterId/config` | Channel config + linked guilds with link settings |
| GET | `/api/channels/:broadcasterId/guilds/:guildId/settings` | Per-link template settings |
| POST | `/api/channels/:broadcasterId/guilds/:guildId/settings` | Save per-link template settings |
| DELETE | `/api/channels/:broadcasterId` | Remove a Twitch channel |
| POST | `/auth/twitch/channel` | Add Twitch channel by username |

## Dashboard UI notes
- **Sidebar**: shows linked guilds for the selected Twitch channel only (unlinked servers hidden). Toggling a guild off unlinks it immediately.
- **Schedule tab**: two-level selector (channel + server). Templates are saved per-connection. "Apply to all linked servers" checkbox saves to all linked guilds at once (auto-unchecks after save).
- **Remove channel**: two-step confirmation — first click shows "Remove?" button (red, 3 s timeout), second click executes.
- **Description toolbar**: `#` inserts `#` (channel mention), `@` inserts `@` (role mention), plus bold/italic/underline/strikethrough/link/code. All buttons have hover tooltip popups.

## Required env vars
```
TWITCH_CLIENT_ID        # from dev.twitch.tv
TWITCH_CLIENT_SECRET    # from dev.twitch.tv
DISCORD_BOT_TOKEN       # from discord.com/developers
BASE_URL                # public-facing URL e.g. http://myserver:3000
PORT                    # default 3000
DB_PATH                 # default ./data/db.sqlite
```

## Discord bot requirements
- Permissions: `ManageEvents` + `ViewChannel`
- Scopes for invite URL: `bot` + `applications.commands` (both required — bot-only scope triggers code grant error)
- Intents: `Guilds` + `GuildScheduledEvents`

## Known gotchas
- `channel:read:schedule` Twitch OAuth scope causes "invalid scope" errors for new apps — this is why we use app token + username lookup instead of user OAuth.
- The invite URL MUST include `applications.commands` scope alongside `bot`, otherwise Discord shows "integration requires code grant".
- `node:sqlite` returns `Record<string, SQLOutputValue>[]` from `.all()`, requiring `as unknown as T[]` cast.
- `HelixPaginatedScheduleResult` wraps the schedule — access segments via `result.data.segments`, not `result.segments`.
- `better-sqlite3` requires Visual Studio C++ build tools on Windows — do NOT reintroduce it.
- Static files (`src/web/public/`) are not copied by `tsc`. The Dockerfile handles this with an explicit `COPY` step.
- SQLite can't drop columns — dead template columns on `twitch_channels` are left in place; the sync engine reads from `channel_guild_links` instead.

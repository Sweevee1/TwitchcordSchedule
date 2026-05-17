# TwitchcordSchedule

Automatically syncs your Twitch channel's stream schedule to Discord Guild Scheduled Events. Similar to Streamcord's premium feature, self-hosted.

- Creates, updates, and deletes Discord events to mirror your Twitch schedule
- Supports multiple Discord servers simultaneously
- Dark web dashboard with live logs and error details
- Configurable event title/description templates and cover image options
- Runs 24/7 as a Docker container

## Prerequisites

### Twitch
1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) and create an application
2. Set the OAuth Redirect URL to `{BASE_URL}/auth/twitch/callback` (e.g. `http://localhost:3000/auth/twitch/callback`)
3. Copy the **Client ID** and **Client Secret**

### Discord
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create an application
2. Go to **Bot** → click **Add Bot**
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Guild Scheduled Events**
4. Copy the **Bot Token**

## Setup

### Local development

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Fill in TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, DISCORD_BOT_TOKEN, BASE_URL

# 3. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker (recommended for 24/7 hosting)

```bash
# 1. Create your .env file
cp .env.example .env
# Fill in your credentials and set BASE_URL to your server's address

# 2. Build and run
docker compose build
docker compose up -d

# View logs
docker compose logs -f
```

The SQLite database is stored in a named Docker volume (`sqlite_data`) so data persists across restarts.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TWITCH_CLIENT_ID` | Yes | — | From dev.twitch.tv |
| `TWITCH_CLIENT_SECRET` | Yes | — | From dev.twitch.tv |
| `DISCORD_BOT_TOKEN` | Yes | — | From Discord Developer Portal |
| `BASE_URL` | Yes | — | Public URL of this server (e.g. `http://myserver:3000`) |
| `PORT` | No | `3000` | Web dashboard port |
| `DB_PATH` | No | `./data/db.sqlite` | SQLite database path |

## First-time configuration

1. Open the dashboard at your `BASE_URL`
2. Enter your **Twitch username** and click **Connect**
3. Click **Copy Invite Link** and use it to add the bot to your Discord server(s)
4. Toggle the server **on** in the Servers section
5. Click **Sync Now** to run an immediate sync

## Templates

In the **Templates & Settings** card you can customise how events appear in Discord.

**Available variables:**

| Variable | Value |
|---|---|
| `{title}` | Stream title from Twitch |
| `{category}` | Game or category name |
| `{broadcaster}` | Your Twitch display name |

**Example title template:** `🔴 {title}`  
**Example description template:**
```
Now playing: {category}

Streamed by {broadcaster}
```

### Cover Image options
- **None** — no cover image
- **Broadcaster Avatar** — your Twitch profile picture
- **Game Box Art** — the box art for the scheduled game/category

### More Settings
- **Max events to sync** — cap how many upcoming segments are pushed to Discord (1–25, default 10)

## How sync works

Every 30 minutes the app:
1. Fetches your upcoming Twitch schedule segments
2. For each enabled Discord server:
   - **Creates** Discord events for new Twitch segments
   - **Updates** existing Discord events if the title, time, or other fields changed
   - **Deletes** Discord events whose Twitch segment was removed

Only events created by this bot are ever modified — Discord events you created manually are untouched.

## Dashboard

| Section | Description |
|---|---|
| Header badge | Twitch connection status + active sync indicator |
| Status row | Time since last sync and time until next sync |
| Action bar | Sync Now, Copy Invite Link, Change Channel |
| Templates & Settings | Event templates, image type, max events |
| Discord Servers | Toggle sync on/off per server |
| Activity Log | Color-coded live log with Clear button |

## Tech stack

- **Node.js 20+ / TypeScript**
- **@twurple/api + @twurple/auth** — Twitch API (app token, no user OAuth required)
- **discord.js v14** — Discord bot and Guild Scheduled Events
- **node:sqlite** (Node.js built-in) — zero-dependency SQLite
- **Express** — web dashboard and API
- **node-cron** — 30-minute polling scheduler

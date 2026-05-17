# TwitchcordSchedule

Syncs Twitch stream schedules to Discord Guild Scheduled Events. Self-hosted alternative to Streamcord's premium schedule feature.

- Creates, updates, and deletes Discord events to mirror your Twitch schedule
- **Cancels** Discord events (with subscriber notification) when a stream is cancelled on Twitch
- Supports multiple Twitch channels and multiple Discord servers from one instance
- Per-server settings: custom title/description templates, cover image style, max events
- Cover images sourced from IGDB (landscape artwork — never stretched)
- Dark web dashboard at port 3000
- Runs 24/7 as a Docker container, SQLite database (no external DB needed)

---

## Prerequisites

### Twitch Application
1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) → Register Your Application
2. Set OAuth Redirect URL to `http://localhost` (placeholder — not actually used)
3. Save and note your **Client ID** and **Client Secret**

### Discord Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. **Bot** tab → Add Bot → copy the **Bot Token**
3. **Bot** tab → Privileged Gateway Intents → enable **Server Members Intent**
4. **OAuth2** tab → URL Generator:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: `Manage Events` + `View Channels`
5. Copy the generated URL and invite the bot to your server(s)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TWITCH_CLIENT_ID` | Yes | From dev.twitch.tv |
| `TWITCH_CLIENT_SECRET` | Yes | From dev.twitch.tv |
| `DISCORD_BOT_TOKEN` | Yes | From discord.com/developers |
| `PORT` | No | Dashboard port (default `3000`) |
| `DB_PATH` | No | SQLite file path (default `/app/data/db.sqlite`) |
| `BASE_URL` | No | Dashboard URL shown in startup log only |

---

## Template Variables

Use `{variable}` syntax in event title and description templates:

| Variable | Value |
|---|---|
| `{title}` / `{stream.title}` | Stream title |
| `{category}` / `{game.name}` | Game/category name |
| `{broadcaster}` / `{user.name}` / `{user.twitch_name}` | Broadcaster display name |
| `{user.twitch_url}` | `https://twitch.tv/username` |
| `{user.description}` | Twitch channel bio |
| `{user.__id__}` | Twitch broadcaster ID |
| `{game.__id__}` | Twitch category ID |
| `{event.start_time}` | Discord timestamp `<t:UNIX>` |
| `{event.start_time:R}` | Relative time (e.g. "in 2 hours") |
| `{event.start_time:F}` | Full date and time |
| `{event.end_time}` | End time timestamp |

Any `{event.start_time:X}` or `{event.end_time:X}` where X is a Discord timestamp style (`t T d D f F R`) is supported.

---

## Docker Compose (quick start)

```bash
git clone https://github.com/Sweevee1/TwitchcordSchedule.git
cd TwitchcordSchedule
```

Create a `.env` file:
```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
```

Build and run:
```bash
docker compose up -d --build
```

Open the dashboard at [http://localhost:3000](http://localhost:3000).

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev            # ts-node
```

Type-check only:
```bash
npx tsc --noEmit
```

---

## Tech Stack

- **Node.js 22 / TypeScript**
- **@twurple/api + @twurple/auth** — Twitch API (app token, no user OAuth)
- **discord.js v14** — Discord bot and Guild Scheduled Events
- **node:sqlite** (Node.js built-in) — zero native dependencies
- **Express** — web dashboard
- **node-cron** — 30-minute scheduler

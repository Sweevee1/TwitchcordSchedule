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
| `BASE_URL` | Yes | Public-facing URL of the dashboard, e.g. `http://192.168.1.10:3000` |
| `PORT` | No | Dashboard port (default `3000`) |
| `DB_PATH` | No | SQLite file path (default `/app/data/db.sqlite`) |

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
BASE_URL=http://localhost:3000
PORT=3000
```

Build and run:
```bash
docker compose up -d --build
```

Open the dashboard at [http://localhost:3000](http://localhost:3000).

---

## Unraid Installation

### Step 1 — SSH into Unraid (or use Tools → Terminal)

### Step 2 — Create an app directory and clone the repo
```bash
mkdir -p /mnt/user/appdata/twitchcordschedule
cd /mnt/user/appdata/twitchcordschedule
git clone https://github.com/Sweevee1/TwitchcordSchedule.git .
```

### Step 3 — Create your `.env` file
```bash
cat > .env << 'EOF'
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
BASE_URL=http://YOUR_UNRAID_IP:3000
PORT=3000
EOF
```
Replace `YOUR_UNRAID_IP` with your Unraid server's LAN IP (e.g. `192.168.1.10`).

### Step 4 — Build and start
```bash
docker compose up -d --build
```

### Step 5 — Open the dashboard
`http://YOUR_UNRAID_IP:3000`

From there: add a Twitch channel by username, then use the invite link in the dashboard to add the bot to your Discord server(s).

---

### Keeping the database in a specific folder (easier Unraid backups)

By default the database lives in a named Docker volume. To use a host path instead, edit `docker-compose.yml`:

```yaml
volumes:
  - /mnt/user/appdata/twitchcordschedule/data:/app/data
```

### Auto-start on Unraid boot

`restart: unless-stopped` is already set. Once started, the container restarts automatically.

### Updating

```bash
cd /mnt/user/appdata/twitchcordschedule
git pull
docker compose up -d --build
```

---

## How sync works

Every 30 minutes the app:
1. Fetches upcoming Twitch schedule segments for each configured channel
2. For each linked Discord server:
   - **Creates** Discord events for new segments
   - **Updates** existing events if anything changed
   - **Cancels** Discord events for segments that were cancelled on Twitch (sends subscriber notification)
   - **Deletes** Discord events for segments that were removed entirely

Only events created by this bot are ever modified — manually created Discord events are never touched.

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

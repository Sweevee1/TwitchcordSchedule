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

## Step 1 — Create a Twitch Application

You need a Twitch developer app so the bot can read stream schedules.

1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console) and log in
2. Click **Register Your Application**
3. Fill in any name (e.g. `TwitchcordSchedule`), set the OAuth Redirect URL to `http://localhost`, and set Category to **Other**
4. Click **Create**
5. Click **Manage** on your new app, then click **New Secret**
6. Copy and save your **Client ID** and **Client Secret** — you'll need these later

---

## Step 2 — Create a Discord Bot

You need a Discord bot that can create and manage server events.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and log in
2. Click **New Application**, give it a name (e.g. `TwitchcordSchedule`), and click **Create**
3. Go to the **Bot** tab on the left → scroll down to **Privileged Gateway Intents** → enable **Server Members Intent**
4. Still on the **Bot** tab, click **Reset Token**, then copy and save your **Bot Token** — you'll need this later
5. Go to the **OAuth2** tab → **URL Generator**:
   - Under **Scopes**, check `bot` and `applications.commands`
   - Under **Bot Permissions**, check `Manage Events` and `View Channels`
6. Scroll down, copy the generated URL, open it in your browser, and invite the bot to your Discord server(s)

---

## Step 3 — Install & Run

### Option A — Docker Compose

If you have Docker installed on your machine or server:

1. Download the project:
   ```bash
   git clone https://github.com/Sweevee1/TwitchcordSchedule.git
   cd TwitchcordSchedule
   ```

2. Create a file named `.env` in the project folder with your credentials:
   ```env
   TWITCH_CLIENT_ID=your_client_id_here
   TWITCH_CLIENT_SECRET=your_client_secret_here
   DISCORD_BOT_TOKEN=your_bot_token_here
   ```

3. Start the container:
   ```bash
   docker compose up -d
   ```

4. Open the dashboard at [http://localhost:3000](http://localhost:3000)

---

### Option B — Unraid

> **Note:** Use **Host** network mode — bridge mode prevents the container from receiving the correct local IP.

1. In the Unraid UI, go to the **Docker** tab and click **Add Container**

2. Fill in the following fields:

   | Field | Value |
   |---|---|
   | **Name** | `TwitchcordSchedule` |
   | **Repository** | `ghcr.io/sweevee1/twitchcordschedule:latest` |
   | **Network Type** | `Host` |

3. Click **Add another Path, Port, Variable, Label or Device** to add a volume:

   | Type | Name | Container Path | Host Path |
   |---|---|---|---|
   | Path | `Data` | `/app/data` | `/mnt/user/appdata/twitchcordschedule` |

4. Add the following environment variables (click **Add another Path...** → Variable for each):

   | Name | Value |
   |---|---|
   | `TWITCH_CLIENT_ID` | your Client ID from Step 1 |
   | `TWITCH_CLIENT_SECRET` | your Client Secret from Step 1 |
   | `DISCORD_BOT_TOKEN` | your Bot Token from Step 2 |

5. Click **Apply** — Unraid will pull the image and start the container

6. Open the dashboard at `http://YOUR-UNRAID-IP:3000`

---

## Step 4 — Add your first channel

1. Open the dashboard (port `3000`)
2. In the **Channels** section, type a Twitch username and click **Add**
3. The bot will link it to any Discord servers it's already in
4. Click a server in the sidebar to configure templates, cover images, and max events per server

The bot syncs every 30 minutes automatically. You can also trigger a manual sync from the dashboard.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TWITCH_CLIENT_ID` | Yes | From dev.twitch.tv |
| `TWITCH_CLIENT_SECRET` | Yes | From dev.twitch.tv |
| `DISCORD_BOT_TOKEN` | Yes | From discord.com/developers |
| `PORT` | No | Dashboard port (default `3000`) |
| `DB_PATH` | No | SQLite file path (default `/app/data/db.sqlite`) |
| `BASE_URL` | No | Cosmetic label shown in startup log only |

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

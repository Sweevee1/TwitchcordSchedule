import { Router } from 'express';
import type { Config } from '../../config';
import type { DatabaseQueries } from '../../db';
import type { Logger } from '../../logger';
import type { AppState } from '../../sync/engine';
import { lookupBroadcaster } from '../../twitch/auth';

export function createAuthRouter(
  config: Config,
  db: DatabaseQueries,
  logger: Logger,
  appState: AppState
): Router {
  const router = Router();

  router.post('/twitch/channel', async (req, res) => {
    const { channelName } = req.body as { channelName?: string };
    if (!channelName?.trim()) {
      return res.status(400).json({ error: 'channelName is required' });
    }

    try {
      const broadcaster = await lookupBroadcaster(channelName.trim(), config);
      if (!broadcaster) {
        return res.status(404).json({ error: `Twitch channel "${channelName}" not found` });
      }

      db.addChannel(broadcaster.id, broadcaster.name, broadcaster.displayName, broadcaster.profileImageUrl, broadcaster.description);
      db.linkChannelToAllGuilds(broadcaster.id);
      appState.twitchConnected = true;

      logger.success('auth', `Added Twitch channel: ${broadcaster.displayName} (${broadcaster.id})`);
      res.json({ ok: true, broadcaster });
    } catch (err) {
      logger.error('auth', `Channel lookup failed: ${String(err)}`);
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

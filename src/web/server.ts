import express from 'express';
import path from 'path';
import type { ApiClient } from '@twurple/api';
import type { Client } from 'discord.js';
import type { Config } from '../config';
import type { DatabaseQueries } from '../db';
import type { Logger } from '../logger';
import type { AppState } from '../sync/engine';
import { createAuthRouter } from './routes/auth';
import { createApiRouter } from './routes/api';
import { createDashboardRouter } from './routes/dashboard';

export function createExpressApp(deps: {
  config: Config;
  db: DatabaseQueries;
  apiClient: ApiClient;
  discordClient: Client;
  logger: Logger;
  appState: AppState;
  syncFn: () => Promise<void>;
  syncChannelFn: (broadcasterId: string) => Promise<void>;
}): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/auth', createAuthRouter(deps.config, deps.db, deps.logger, deps.appState));
  app.use('/api', createApiRouter(deps.db, deps.discordClient, deps.logger, deps.appState, deps.syncFn, deps.syncChannelFn));
  app.use('/', createDashboardRouter());

  return app;
}

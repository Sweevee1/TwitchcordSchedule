import { Router } from 'express';
import path from 'path';

export function createDashboardRouter(): Router {
  const router = Router();
  const publicDir = path.join(__dirname, '..', 'public');

  router.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return router;
}

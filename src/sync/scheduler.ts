import cron from 'node-cron';

export function startScheduler(syncFn: () => Promise<void>): cron.ScheduledTask {
  // Runs at :00 and :30 of every hour
  return cron.schedule('0,30 * * * *', () => {
    syncFn().catch(() => { /* errors already logged inside syncFn */ });
  });
}

export function triggerManualSync(syncFn: () => Promise<void>): void {
  syncFn().catch(() => { /* errors already logged inside syncFn */ });
}

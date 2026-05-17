import type { DatabaseQueries, LogRow } from './db';

export type LogLevel = LogRow['level'];

export interface Logger {
  info(scope: string, message: string): void;
  warn(scope: string, message: string): void;
  error(scope: string, message: string): void;
  success(scope: string, message: string): void;
}

const COLORS: Record<LogLevel, string> = {
  info:    '\x1b[90m',
  warn:    '\x1b[33m',
  error:   '\x1b[31m',
  success: '\x1b[32m',
};
const RESET = '\x1b[0m';

export function createLogger(db: DatabaseQueries): Logger {
  function log(level: LogLevel, scope: string, message: string): void {
    const color = COLORS[level];
    const time = new Date().toISOString();
    console.log(`${color}[${level.toUpperCase()}]${RESET} ${time} [${scope}] ${message}`);
    db.insertLog(level, scope, message);
  }

  return {
    info:    (scope, message) => log('info',    scope, message),
    warn:    (scope, message) => log('warn',    scope, message),
    error:   (scope, message) => log('error',   scope, message),
    success: (scope, message) => log('success', scope, message),
  };
}

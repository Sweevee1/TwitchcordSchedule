export interface Config {
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  PORT: number;
  BASE_URL: string;
  DB_PATH: string;
}

export function loadConfig(): Config {
  const required = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'BASE_URL'] as const;
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID!,
    TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET!,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
    PORT: parseInt(process.env.PORT ?? '3000', 10),
    BASE_URL: process.env.BASE_URL!.replace(/\/$/, ''),
    DB_PATH: process.env.DB_PATH ?? './data/db.sqlite',
  };
}

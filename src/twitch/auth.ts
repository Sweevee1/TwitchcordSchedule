import { AppTokenAuthProvider } from '@twurple/auth';
import type { Config } from '../config';

export function buildAppAuthProvider(config: Config): AppTokenAuthProvider {
  return new AppTokenAuthProvider(config.TWITCH_CLIENT_ID, config.TWITCH_CLIENT_SECRET);
}

export async function lookupBroadcaster(
  channelName: string,
  config: Config
): Promise<{ id: string; name: string; displayName: string; profileImageUrl: string } | null> {
  // Use app access token via client credentials to look up the user
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.TWITCH_CLIENT_ID,
      client_secret: config.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Failed to get app token: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json() as { access_token: string };

  const userRes = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelName.toLowerCase())}`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-Id': config.TWITCH_CLIENT_ID,
      },
    }
  );
  if (!userRes.ok) throw new Error(`Twitch user lookup failed: ${userRes.status}`);
  const data = await userRes.json() as { data: Array<{ id: string; login: string; display_name: string; profile_image_url: string }> };
  const user = data.data[0];
  if (!user) return null;
  return { id: user.id, name: user.login, displayName: user.display_name, profileImageUrl: user.profile_image_url ?? '' };
}

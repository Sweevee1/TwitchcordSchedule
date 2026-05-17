import type { ApiClient } from '@twurple/api';

const imageCache = new Map<string, string | null>();

let _clientId = '';
let _clientSecret = '';
let _cachedToken: string | null = null;

export function initImageCredentials(clientId: string, clientSecret: string): void {
  _clientId = clientId;
  _clientSecret = clientSecret;
}

async function urlToBase64DataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${ct};base64,${base64}`;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string> {
  if (!_cachedToken) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: _clientId,
        client_secret: _clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new Error('Token fetch failed');
    const { access_token } = await res.json() as { access_token: string };
    _cachedToken = access_token;
  }
  return _cachedToken;
}

async function fetchIgdbArtwork(twitchCategoryId: string): Promise<string | null> {
  if (!_clientId || !_clientSecret) return null;
  try {
    const token = await getToken();

    // Look up by Twitch category ID — exact match, never wrong game
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': _clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: `fields artworks.url,artworks.width,artworks.height,screenshots.url; where external_games.uid = "${twitchCategoryId}"; limit 1;`,
    });

    if (!res.ok) {
      if (res.status === 401) _cachedToken = null;
      return null;
    }

    const data = await res.json() as Array<{
      artworks?: Array<{ url: string; width: number; height: number }>;
      screenshots?: Array<{ url: string }>;
    }>;
    if (!data?.length) return null;

    const game = data[0];

    // Pick the landscape artwork closest to 16:9
    const landscape = (game.artworks ?? []).filter(a => a.width > a.height);
    if (landscape.length) {
      const TARGET = 16 / 9;
      const best = landscape.sort((a, b) =>
        Math.abs(a.width / a.height - TARGET) - Math.abs(b.width / b.height - TARGET)
      )[0];
      return urlToBase64DataUri('https:' + best.url.replace('/t_thumb/', '/t_1080p/'));
    }

    // Screenshots are always 16:9 — use as fallback
    const shot = game.screenshots?.[0];
    if (shot) {
      return urlToBase64DataUri('https:' + shot.url.replace('/t_thumb/', '/t_screenshot_huge/'));
    }

    return null;
  } catch {
    return null;
  }
}

export function clearImageCache(): void {
  imageCache.clear();
}

export async function getBroadcasterImage(
  apiClient: ApiClient,
  broadcasterId: string
): Promise<string | null> {
  const cacheKey = `profile:${broadcasterId}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
  try {
    const user = await apiClient.users.getUserById(broadcasterId);
    const dataUri = user ? await urlToBase64DataUri(user.profilePictureUrl) : null;
    imageCache.set(cacheKey, dataUri);
    return dataUri;
  } catch {
    imageCache.set(cacheKey, null);
    return null;
  }
}

export async function getGameImage(
  apiClient: ApiClient,
  categoryId: string
): Promise<string | null> {
  const cacheKey = `game:${categoryId}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
  // apiClient unused now but kept in signature to avoid touching engine.ts call sites
  void apiClient;
  try {
    const dataUri = await fetchIgdbArtwork(categoryId);
    imageCache.set(cacheKey, dataUri);
    return dataUri;
  } catch {
    imageCache.set(cacheKey, null);
    return null;
  }
}

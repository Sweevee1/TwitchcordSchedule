import type { ApiClient } from '@twurple/api';

const imageCache = new Map<string, string | null>();

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
  try {
    const game = await apiClient.games.getGameById(categoryId);
    if (!game) { imageCache.set(cacheKey, null); return null; }
    const url = game.boxArtUrl.replace('{width}', '480').replace('{height}', '270');
    const dataUri = await urlToBase64DataUri(url);
    imageCache.set(cacheKey, dataUri);
    return dataUri;
  } catch {
    imageCache.set(cacheKey, null);
    return null;
  }
}

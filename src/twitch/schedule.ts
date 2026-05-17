import type { ApiClient } from '@twurple/api';

export interface NormalizedSegment {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  startTime: Date;
  endTime: Date;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export async function fetchScheduleSegments(
  apiClient: ApiClient,
  broadcasterId: string
): Promise<NormalizedSegment[]> {
  const result = await apiClient.schedule.getSchedule(broadcasterId);
  const segments = result.data.segments;

  const now = Date.now();
  const cutoff = now - FIFTEEN_MINUTES_MS;
  const results: NormalizedSegment[] = [];

  for (const segment of segments) {
    if (segment.startDate.getTime() < cutoff) continue;
    const endTime = segment.endDate ?? new Date(segment.startDate.getTime() + TWO_HOURS_MS);
    results.push({
      id: segment.id,
      title: (segment.title || 'Untitled Stream').slice(0, 100),
      categoryId: segment.categoryId,
      categoryName: segment.categoryName,
      startTime: segment.startDate,
      endTime,
    });
  }

  return results;
}

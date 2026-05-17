import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  DiscordAPIError,
  type Guild,
} from 'discord.js';

const UNKNOWN_SCHEDULED_EVENT = 10070;

export interface EventPayload {
  name: string;
  description: string;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  coverImage?: string | null;
}

function buildOptions(payload: EventPayload) {
  return {
    name: payload.name.slice(0, 100) || 'Untitled Stream',
    description: payload.description.slice(0, 1000),
    scheduledStartTime: payload.scheduledStartTime,
    scheduledEndTime: payload.scheduledEndTime,
    entityType: GuildScheduledEventEntityType.External,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityMetadata: { location: 'Twitch' },
    ...(payload.coverImage ? { image: payload.coverImage } : {}),
  };
}

export async function createEvent(guild: Guild, payload: EventPayload): Promise<string> {
  const event = await guild.scheduledEvents.create(buildOptions(payload));
  return event.id;
}

export async function updateEvent(guild: Guild, eventId: string, payload: EventPayload): Promise<void> {
  try {
    await guild.scheduledEvents.edit(eventId, buildOptions(payload));
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === UNKNOWN_SCHEDULED_EVENT) return;
    throw err;
  }
}

export async function deleteEvent(guild: Guild, eventId: string): Promise<void> {
  try {
    await guild.scheduledEvents.delete(eventId);
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === UNKNOWN_SCHEDULED_EVENT) return;
    throw err;
  }
}

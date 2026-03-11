import { DateTime } from "luxon";

import { haversineDistanceMeters } from "./haversine";

const TZ = "America/Bahia";
const PROXIMITY_RADIUS_M = 2000;
const TIME_WINDOW_MINUTES = 30;
const MAX_ALTERNATIVES = 4;
const MAX_TIME_ONLY = 5;

export interface ScheduleEntryForSuggestion {
  id: string;
  stop_name: string;
  arrival_time: string; // HH:mm
  stop_sequence: number;
  stop_lat: number | null;
  stop_lng: number | null;
}

export interface StopSuggestion {
  id: string;
  name: string;
  arrivalTime: string;
}

export interface ColdStartSuggestion {
  suggestedStop: StopSuggestion | null;
  alternatives: StopSuggestion[];
}

/**
 * Two-pass suggestion algorithm for cold-start stop confirmation.
 *
 * Pass 1: Filter schedule entries within 2km of GPS position.
 * Pass 2: Filter to scheduled_time <= now + 30min, sort by |now - scheduled_time|.
 *
 * If no GPS: time-only fallback with up to 5 stops, no highlighted suggestion.
 */
export function suggestStartStop(args: {
  entries: ScheduleEntryForSuggestion[];
  lat: number | null;
  lng: number | null;
  now?: DateTime;
}): ColdStartSuggestion {
  const { entries, lat, lng } = args;
  const now = (args.now ?? DateTime.now().setZone(TZ)).setZone(TZ);

  const toStopSuggestion = (e: ScheduleEntryForSuggestion): StopSuggestion => ({
    id: e.id,
    name: e.stop_name,
    arrivalTime: e.arrival_time,
  });

  const timeDiff = (e: ScheduleEntryForSuggestion): number => {
    const [h, m] = e.arrival_time.split(":").map(Number);
    const stopTime = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    return Math.abs(now.diff(stopTime, "minutes").minutes);
  };

  const isWithinTimeWindow = (e: ScheduleEntryForSuggestion): boolean => {
    const [h, m] = e.arrival_time.split(":").map(Number);
    const stopTime = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    return stopTime <= now.plus({ minutes: TIME_WINDOW_MINUTES });
  };

  // No GPS → time-only fallback
  if (lat == null || lng == null) {
    const timeFiltered = entries
      .filter(isWithinTimeWindow)
      .sort((a, b) => timeDiff(a) - timeDiff(b))
      .slice(0, MAX_TIME_ONLY);

    return {
      suggestedStop: null,
      alternatives: timeFiltered.map(toStopSuggestion),
    };
  }

  // Pass 1: proximity filter (2km)
  const nearby = entries.filter((e) => {
    if (e.stop_lat == null || e.stop_lng == null) return false;
    const dist = haversineDistanceMeters(lat, lng, e.stop_lat, e.stop_lng);
    return dist <= PROXIMITY_RADIUS_M;
  });

  // Pass 2: time window filter + sort by closeness to now
  const candidates = nearby
    .filter(isWithinTimeWindow)
    .sort((a, b) => timeDiff(a) - timeDiff(b));

  if (candidates.length === 0) {
    // No nearby candidates within time window → time-only fallback
    const timeFiltered = entries
      .filter(isWithinTimeWindow)
      .sort((a, b) => timeDiff(a) - timeDiff(b))
      .slice(0, MAX_TIME_ONLY);

    return {
      suggestedStop: null,
      alternatives: timeFiltered.map(toStopSuggestion),
    };
  }

  const [best, ...rest] = candidates;
  return {
    suggestedStop: toStopSuggestion(best),
    alternatives: rest.slice(0, MAX_ALTERNATIVES).map(toStopSuggestion),
  };
}

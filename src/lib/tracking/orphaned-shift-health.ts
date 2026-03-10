import { DateTime } from "luxon";

export const SCHEDULE_OVERDUE_MINUTES = 90;
export const INACTIVITY_MINUTES = 30;

export function isOrphanedShift(args: {
  scheduledEnd: DateTime;
  lastActivity: DateTime;
  now: DateTime;
  scheduleOverdueMinutes?: number;
  inactivityMinutes?: number;
}): boolean {
  const {
    scheduledEnd,
    lastActivity,
    now,
    scheduleOverdueMinutes = SCHEDULE_OVERDUE_MINUTES,
    inactivityMinutes = INACTIVITY_MINUTES,
  } = args;

  const pastSchedule = now > scheduledEnd.plus({ minutes: scheduleOverdueMinutes });
  const inactive = now > lastActivity.plus({ minutes: inactivityMinutes });

  return pastSchedule && inactive;
}

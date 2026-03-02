import { DateTime } from "luxon";
import { parseTime } from "@/lib/time";

interface Stop {
  scheduleEntryId: string;
  time: string; // HH:mm
  status: "pending" | "passed";
  passedAt: string | null;
}

interface EtaResult {
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
  nextStopId: string | null;
  passedStopIds: string[];
}

export function computeEta(args: {
  stops: Stop[];
  now: DateTime;
}): EtaResult {
  const { stops, now } = args;

  const passed = stops.filter((s) => s.status === "passed");
  const pending = stops.filter((s) => s.status === "pending");
  const passedStopIds = passed.map((s) => s.scheduleEntryId);

  // Filter pending stops to only those at or after the current time
  const nowHHmm = now.toFormat("HH:mm");
  const futurePending = pending.filter((s) => s.time >= nowHHmm);

  if (futurePending.length === 0) {
    return {
      etaNextStopISO: null,
      etaNextStopMinutes: null,
      delayMinutes: null,
      nextStopId: null,
      passedStopIds,
    };
  }

  const sortedPending = [...futurePending].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const nextStop = sortedPending[0];
  const nextStopId = nextStop.scheduleEntryId;

  const sortedPassed = [...passed].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const lastPassed = sortedPassed.length > 0 ? sortedPassed.at(-1)! : null;

  let delay: number | null = null;
  let etaDateTime: DateTime;

  if (!lastPassed) {
    etaDateTime = parseTime(nextStop.time);
  } else {
    delay = DateTime.fromISO(lastPassed.passedAt!)
      .diff(parseTime(lastPassed.time), "minutes").minutes;
    etaDateTime = parseTime(nextStop.time).plus({ minutes: delay });
  }

  const etaNextStopMinutes = Math.max(
    0,
    Math.ceil(etaDateTime.diff(now, "minutes").minutes),
  );

  return {
    etaNextStopISO: etaDateTime.toISO(),
    etaNextStopMinutes,
    delayMinutes: delay != null ? Math.round(delay) : null,
    nextStopId,
    passedStopIds,
  };
}

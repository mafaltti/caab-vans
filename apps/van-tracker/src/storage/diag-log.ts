import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_KEY = "@diagLog";
const MAX_LOG_SIZE = 1100;

// --- Types ---

export type FilterReason = "acc" | "dup" | "stale";

export interface MinuteSummary {
  type: "summary";
  t: number;
  ok: number;
  fail: number;
  buf: number;
  thr: number;
  flt: number;
  flt_acc: number;
  flt_dup: number;
  flt_stale: number;
  cb: number;
}

export type EventType =
  | "tracking_start"
  | "tracking_stop"
  | "cold_start"
  | "task_error"
  | "flush"
  | "buffer_full"
  | "network_down"
  | "network_up"
  | "error"
  | "state_change"
  | "boot_restart";

export interface EventEntry {
  type: "event";
  t: number;
  e: EventType;
  d?: string;
}

export type LogEntry = MinuteSummary | EventEntry;

// --- In-memory state ---

let diskLog: LogEntry[] | null = null;
let currentMinute: MinuteSummary | null = null;
let pendingEvents: LogEntry[] = [];
let lastNetworkState: boolean | null = null;

function getMinuteTs(): number {
  const now = Date.now();
  return now - (now % 60_000);
}

function countOf(s: MinuteSummary): number {
  return s.ok + s.fail + s.buf + s.thr + s.flt + s.cb;
}

function ensureCurrentMinute(): MinuteSummary {
  const minuteTs = getMinuteTs();
  if (!currentMinute || currentMinute.t !== minuteTs) {
    if (currentMinute && countOf(currentMinute) > 0) {
      pendingEvents.push(currentMinute);
    }
    currentMinute = {
      type: "summary",
      t: minuteTs,
      ok: 0,
      fail: 0,
      buf: 0,
      thr: 0,
      flt: 0,
      flt_acc: 0,
      flt_dup: 0,
      flt_stale: 0,
      cb: 0,
    };
  }
  return currentMinute;
}

// --- Public API: increment counters (synchronous, no I/O) ---

export function logOk(): void {
  ensureCurrentMinute().ok++;
}
export function logFail(): void {
  ensureCurrentMinute().fail++;
}
export function logBuffered(): void {
  ensureCurrentMinute().buf++;
}
export function logThrottled(): void {
  ensureCurrentMinute().thr++;
}
export function logFiltered(reason: FilterReason): void {
  const m = ensureCurrentMinute();
  m.flt++;
  if (reason === "acc") m.flt_acc++;
  else if (reason === "dup") m.flt_dup++;
  else m.flt_stale++;
}
export function logCallback(): void {
  ensureCurrentMinute().cb++;
}

// --- Public API: individual events (synchronous, no I/O) ---

export function logEvent(event: EventType, detail?: string): void {
  pendingEvents.push({
    type: "event",
    t: Date.now(),
    e: event,
    d: detail ? detail.slice(0, 80) : undefined,
  });
}

export function logNetworkState(connected: boolean): void {
  if (lastNetworkState === null) {
    lastNetworkState = connected;
    return;
  }
  if (connected !== lastNetworkState) {
    logEvent(connected ? "network_up" : "network_down");
    lastNetworkState = connected;
  }
}

// --- Disk persistence (async, call periodically) ---

let flushChain: Promise<void> = Promise.resolve();

async function ensureDiskLogLoaded(): Promise<void> {
  if (diskLog !== null) return;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    diskLog = Array.isArray(parsed) ? parsed : [];
  } catch {
    diskLog = [];
  }
}

export async function flushLog(): Promise<void> {
  flushChain = flushChain.then(async () => {
    await ensureDiskLogLoaded();
    const toFlush = [...pendingEvents];
    pendingEvents = [];
    if (toFlush.length === 0) return;

    diskLog!.push(...toFlush);
    if (diskLog!.length > MAX_LOG_SIZE) {
      diskLog!.splice(0, diskLog!.length - MAX_LOG_SIZE);
    }
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(diskLog));
  });
  return flushChain;
}

export async function getLog(): Promise<LogEntry[]> {
  await ensureDiskLogLoaded();
  await flushLog();
  const result = [...(diskLog ?? [])];
  if (currentMinute && countOf(currentMinute) > 0) {
    result.push(currentMinute);
  }
  return result;
}

export async function clearLog(): Promise<void> {
  pendingEvents = [];
  currentMinute = null;
  diskLog = [];
  lastNetworkState = null;
  await AsyncStorage.removeItem(LOG_KEY);
}

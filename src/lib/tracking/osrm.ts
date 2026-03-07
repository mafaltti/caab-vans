export interface OsrmRouteResult {
  distanceMeters: number;
  durationSeconds: number;
}

const MAX_TIMEOUT_MS = 2_147_483_647; // setTimeout max (signed 32-bit int)

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n <= MAX_TIMEOUT_MS ? n : fallback;
}

const ROUTE_TIMEOUT_MS = parsePositiveInt(process.env.OSRM_ROUTE_TIMEOUT_MS, 300);
const MATCH_TIMEOUT_MS = parsePositiveInt(process.env.OSRM_MATCH_TIMEOUT_MS, 200);

/**
 * Get road distance and duration between two points via OSRM /route.
 * Returns null on any failure (timeout, network error, no route).
 */
export async function osrmRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  osrmBaseUrl: string,
): Promise<OsrmRouteResult | null> {
  const url = `${osrmBaseUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false&annotations=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return {
      distanceMeters: data.routes[0].distance,
      durationSeconds: data.routes[0].duration,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

type Coord = { lat: number; lng: number; ts: number; accuracy?: number };

type Tracepoint = {
  location: [number, number]; // [lng, lat]
} | null;

type MatchResponse = {
  code: string;
  tracepoints: Tracepoint[];
};

/**
 * Snap a GPS trajectory to the nearest road using OSRM /match.
 * Returns the snapped position for the last coordinate, or null on any failure.
 */
export async function snapToRoad(
  coords: Coord[],
  osrmBaseUrl: string,
): Promise<{ lat: number; lng: number } | null> {
  if (coords.length < 2) return null;

  const coordinates = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const timestamps = coords
    .map((c) => Math.round(c.ts / 1000))
    .join(";");
  const radiuses = coords
    .map((c) => (c.accuracy != null ? Math.round(c.accuracy) : 10))
    .join(";");

  const url = `${osrmBaseUrl}/match/v1/driving/${coordinates}?timestamps=${timestamps}&radiuses=${radiuses}&geometries=geojson&overview=false&annotations=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MATCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[osrm] HTTP ${res.status} from OSRM match`);
      return null;
    }

    const data = (await res.json()) as MatchResponse;

    if (data.code !== "Ok") {
      console.warn(`[osrm] OSRM returned code: ${data.code}`);
      return null;
    }

    const lastTracepoint = data.tracepoints[data.tracepoints.length - 1];
    if (!lastTracepoint) {
      console.warn("[osrm] Last tracepoint is null — no match for current ping");
      return null;
    }

    const [lng, lat] = lastTracepoint.location;
    return { lat, lng };
  } catch (err) {
    clearTimeout(timer);
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? `OSRM request timed out (${MATCH_TIMEOUT_MS}ms)`
        : `OSRM request failed: ${err}`;
    console.warn(`[osrm] ${msg}`);
    return null;
  }
}

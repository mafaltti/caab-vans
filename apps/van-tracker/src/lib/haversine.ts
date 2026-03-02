export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const EARTH_RADIUS = 6371000; // meters
  const DEG_TO_RAD = Math.PI / 180;

  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δφ = (lat2 - lat1) * DEG_TO_RAD;
  const Δλ = (lng2 - lng1) * DEG_TO_RAD;

  const a = Math.max(
    0,
    Math.min(
      1,
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2),
    ),
  );

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS * c;
}

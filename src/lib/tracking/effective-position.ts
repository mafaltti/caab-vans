import { haversineDistanceMeters } from "./haversine";

export function chooseEffectivePosition(args: {
  rawLat: number;
  rawLng: number;
  snappedLat: number | null | undefined;
  snappedLng: number | null | undefined;
  targetLat: number;
  targetLng: number;
  snapDisplacementThreshold: number;
}): { lat: number; lng: number; source: "raw" | "snapped" } {
  const { rawLat, rawLng, snappedLat, snappedLng, targetLat, targetLng, snapDisplacementThreshold } = args;

  // No snapped coords — use raw
  if (snappedLat == null || snappedLng == null) {
    return { lat: rawLat, lng: rawLng, source: "raw" };
  }

  // Snap displacement too large — unreliable
  const displacement = haversineDistanceMeters(rawLat, rawLng, snappedLat, snappedLng);
  if (displacement > snapDisplacementThreshold) {
    return { lat: rawLat, lng: rawLng, source: "raw" };
  }

  // Use whichever is closer to target
  const rawDist = haversineDistanceMeters(rawLat, rawLng, targetLat, targetLng);
  const snappedDist = haversineDistanceMeters(snappedLat, snappedLng, targetLat, targetLng);

  if (snappedDist < rawDist) {
    return { lat: snappedLat, lng: snappedLng, source: "snapped" };
  }
  return { lat: rawLat, lng: rawLng, source: "raw" };
}

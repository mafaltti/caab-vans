"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Map, Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";

type VanTrackingMapProps = {
  vanLat: number;
  vanLng: number;
  isLocationOutdated: boolean;
  stops: Array<{
    id: string;
    stopName: string;
    stopLat: number;
    stopLng: number;
  }>;
  nextStopId: string | null;
  passedStopIds: string[];
};

const TILE_URL =
  process.env.NEXT_PUBLIC_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: [TILE_URL],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
    },
  ],
};

const ANIMATION_DURATION_MS = 1000;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function VanTrackingMap({
  vanLat,
  vanLng,
  isLocationOutdated,
  stops,
  nextStopId,
  passedStopIds,
}: VanTrackingMapProps) {
  const mapRef = useRef<MapRef>(null);
  const prevPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);

  const [animatedPosition, setAnimatedPosition] = useState({
    lat: vanLat,
    lng: vanLng,
  });
  const [tileError, setTileError] = useState(false);
  const [showRecenter, setShowRecenter] = useState(false);

  // Smooth van marker animation on position change
  useEffect(() => {
    const prev = prevPositionRef.current;
    if (!prev) {
      prevPositionRef.current = { lat: vanLat, lng: vanLng };
      return;
    }

    if (prev.lat === vanLat && prev.lng === vanLng) return;

    const startLat = prev.lat;
    const startLng = prev.lng;
    let startTime: number | null = null;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    function animate(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      const eased = t * (2 - t); // ease-out quad

      const currentLat = lerp(startLat, vanLat, eased);
      const currentLng = lerp(startLng, vanLng, eased);
      setAnimatedPosition({ lat: currentLat, lng: currentLng });

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
        prevPositionRef.current = { lat: vanLat, lng: vanLng };
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [vanLat, vanLng]);

  // Auto-pan to follow van when user hasn't interacted
  useEffect(() => {
    if (userInteractedRef.current || !mapRef.current) return;
    if (!initialFitDoneRef.current) return;

    mapRef.current.easeTo({
      center: [vanLng, vanLat],
      duration: ANIMATION_DURATION_MS,
    });
  }, [vanLat, vanLng]);

  // Auto-fit viewport on initial load
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current;
    if (!map || initialFitDoneRef.current) return;
    initialFitDoneRef.current = true;

    // Listen for tile errors
    map.getMap().on("error", (e: { error?: { status?: number } }) => {
      if (e.error && typeof e.error.status === "number") {
        setTileError(true);
      }
    });

    const validStops = stops.filter((s) => s.stopLat != null && s.stopLng != null);
    if (validStops.length === 0) {
      map.flyTo({ center: [vanLng, vanLat], zoom: 14, duration: 0 });
      return;
    }

    const allPoints = [
      { lat: vanLat, lng: vanLng },
      ...validStops.map((s) => ({ lat: s.stopLat, lng: s.stopLng })),
    ];

    const bounds = new maplibregl.LngLatBounds(
      [allPoints[0].lng, allPoints[0].lat],
      [allPoints[0].lng, allPoints[0].lat]
    );
    for (const p of allPoints) {
      bounds.extend([p.lng, p.lat]);
    }

    map.fitBounds(bounds, { padding: 40, duration: 0 });
  }, [vanLat, vanLng, stops]);

  // Track user interaction
  const handleMoveStart = useCallback(
    (e: { originalEvent?: MouseEvent | TouchEvent | WheelEvent }) => {
      if (e.originalEvent) {
        userInteractedRef.current = true;
        setShowRecenter(true);
      }
    },
    []
  );

  // Re-center button handler
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    userInteractedRef.current = false;
    setShowRecenter(false);
    map.flyTo({ center: [vanLng, vanLat], zoom: 14 });
  }, [vanLat, vanLng]);

  return (
    <div className="relative">
      <div className="h-[250px] rounded-2xl overflow-hidden shadow-sm bg-white">
        {tileError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-2xl">
            Mapa indisponível
          </div>
        )}
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          initialViewState={{
            longitude: vanLng,
            latitude: vanLat,
            zoom: 14,
          }}
          style={{ width: "100%", height: "100%" }}
          onLoad={handleMapLoad}
          onMoveStart={handleMoveStart}
          attributionControl={{ compact: true }}
        >
          {/* Van marker - pulsing blue dot */}
          <Marker
            longitude={animatedPosition.lng}
            latitude={animatedPosition.lat}
            anchor="center"
          >
            <div
              className={isLocationOutdated ? "opacity-40" : ""}
              style={{ position: "relative", width: 20, height: 20 }}
            >
              <style>{`
                @keyframes van-pulse {
                  0% { transform: scale(1); opacity: 0.8; }
                  50% { transform: scale(2.2); opacity: 0; }
                  100% { transform: scale(1); opacity: 0; }
                }
              `}</style>
              {/* Pulse ring */}
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: "#2563eb",
                  animation: "van-pulse 2s ease-out infinite",
                }}
              />
              {/* Solid dot */}
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: "#2563eb",
                  border: "2px solid white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
          </Marker>

          {/* Stop markers */}
          {stops
            .filter((s) => s.stopLat != null && s.stopLng != null)
            .map((stop) => {
              const isNext = stop.id === nextStopId;
              const isPassed = passedStopIds.includes(stop.id);

              let markerStyle: React.CSSProperties;
              if (isNext) {
                markerStyle = {
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: "#2563eb",
                };
              } else if (isPassed) {
                markerStyle = {
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: "#cbd5e1",
                };
              } else {
                markerStyle = {
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: "white",
                  border: "2px solid #94a3b8",
                };
              }

              return (
                <Marker
                  key={stop.id}
                  longitude={stop.stopLng}
                  latitude={stop.stopLat}
                  anchor="center"
                >
                  <div style={markerStyle} />
                </Marker>
              );
            })}
        </Map>

        {/* Re-center button */}
        {showRecenter && (
          <button
            type="button"
            onClick={handleRecenter}
            className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md"
            aria-label="Recentrar mapa"
          >
            <LocateFixed className="size-5 text-slate-700" />
          </button>
        )}
      </div>

      {/* Stale location warning */}
      {isLocationOutdated && (
        <p className="mt-1.5 text-xs text-amber-600">
          Localização desatualizada
        </p>
      )}
    </div>
  );
}

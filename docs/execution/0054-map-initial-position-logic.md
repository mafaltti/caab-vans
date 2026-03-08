# Map Initial Position Logic

● The initial map position is determined by the `handleMapLoad` callback in `van-tracking-map.tsx:144-176`. Here's what it does:

1. **Collects all points** — the van's current position (`vanLat`, `vanLng`) plus all stops that have valid coordinates (`stopLat`/`stopLng`)
2. **Creates a bounding box** — uses `maplibregl.LngLatBounds` to compute the smallest rectangle that contains all points
3. **Fits the viewport** — calls `map.fitBounds(bounds, { ...fitBoundsPadding, duration: 0 })` to zoom/pan so all points are visible with the specified padding

In sheet mode, `fitBoundsPadding` starts at `{ top: 80, bottom: 220, left: 40, right: 40 }` (the peek-state padding from `getSheetPadding`), so the initial view already accounts for the sheet covering the bottom 220px. The `top: 80` accounts for the fixed header.

If there are no valid stops (all missing coordinates), it falls back to centering on just the van at zoom level 14:

```js
map.flyTo({ center: [vanLng, vanLat], zoom: 14, duration: 0 });
```

So the initial view is sheet-aware and shows all route points (van + stops) within the visible map area above the bottom sheet.

# Map Customization Options — Van Tracking

## QUESTION: Is there anyway to customize the map of route details like icons that show?

● Let me look at the current map implementation in the route details page.

● Searched for 3 patterns, read 2 files (ctrl+o to expand)

● Yes, you can customize the map markers/icons. Here's what the current implementation uses (`src/components/public/van-tracking-map.tsx`):

### Current Markers

1. **Van marker** (lines 208-253): A pulsing blue dot (`#2563eb`) with a white border and pulse animation. Becomes semi-transparent when location is outdated.
2. **Stop markers** (lines 255-297): Simple colored circles:
   - **Next stop:** 12px blue filled circle (`#2563eb`)
   - **Passed stop:** 10px gray circle (`#cbd5e1`)
   - **Future stop:** 10px white circle with gray border (`#94a3b8`)

### What You Can Customize

Since the map uses `react-map-gl/maplibre` with custom `<Marker>` components, you can put any React content inside each marker. Options include:

- Custom SVG icons or images (e.g., a van icon for the vehicle, pin icons for stops)
- Custom PNG/SVG files from `public/icons/` (I see that folder exists)
- Lucide icons (already in the project)
- Stop labels (show stop name on hover/tap)
- Different colors/sizes per stop state
- Route line connecting stops (would need a MapLibre layer)

### What kind of customization are you looking for?

For example:
- Replace the blue dot with a van/bus icon?
- Add stop name labels on the map?
- Draw a route line between stops?
- Change marker colors/sizes?
- Something else entirely?

Let me know what you'd like to change and I'll implement it.

---

## QUESTION: What about other details of the map like icons of places

● The map currently uses OpenStreetMap raster tiles (lines 24-46 in `van-tracking-map.tsx`), which are pre-rendered images. With raster tiles, what you see is what you get — the tile server decides what icons/labels appear (restaurants, hospitals, parks, etc.). You can't toggle or customize those.

### Options to get more control

1. **Switch tile provider** — Different raster tile servers render different levels of detail:
   - **OpenStreetMap** (current): Shows most POIs and labels
   - **CartoDB Positron/Voyager**: Cleaner, minimal — fewer distracting icons
   - **Stadia Maps**: Various styles with different detail levels
   - **MapTiler**: Multiple styles, some free tier

2. **Switch to vector tiles** — MapLibre supports vector tile sources (e.g., MapTiler, Protomaps), which give you full control over what's displayed. You could hide/show categories like restaurants, ATMs, gas stations, etc. This is significantly more work and usually requires an API key.

3. **Use a cleaner raster style** — The simplest change. For example, CartoDB Positron gives a very clean, minimal basemap that won't show POI icons at all, keeping focus on your van/stop markers.

### Quick example

Changing `TILE_URL` to a cleaner tile server would be a one-line change:

```js
// Current (OSM - lots of detail/icons)
"https://tile.openstreetmap.org/{z}/{x}/{y}.png"

// CartoDB Positron (clean, minimal, no POI icons)
"https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"

// CartoDB Voyager (clean but with some color/detail)
"https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
```

Would you like me to swap to a cleaner tile style, or are you looking for something more specific?

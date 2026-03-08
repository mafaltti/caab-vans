# Clarification: Route Polyline on Map

## Question 1 of 2: Route Polyline on Map

The mockup (`option-b-bottom-sheet.html`) shows a route polyline drawn on the map with two segments: a dashed lighter line for the passed portion and a solid blue line for the upcoming portion. However, the current `VanTrackingMap` only displays markers (dots for stops, pulsing dot for the van) — no polyline connecting them. The spec doesn't mention adding a route polyline.

**Recommended: Option B** — The polyline is a significant scope addition (requires route geometry data that may not exist in the current data model). Keeping it out of scope keeps this feature focused on the layout change. It can be added as a follow-up feature.

| Option | Description |
|--------|-------------|
| A | In scope — add route polyline (passed + upcoming segments) as part of this feature |
| B | Out of scope — no polyline; only the existing stop markers and van marker on the fullscreen map |
| C | Out of scope now, but add a placeholder note for a follow-up feature |

You can reply with the option letter (e.g., `A`), accept the recommendation by saying `yes` or `recommended`, or provide your own short answer.

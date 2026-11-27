# Measured performance — 2026-11-28

Method: headless Chrome 158 (`--headless=new`, SwiftShader) + CDP, app on Vite dev,
district loaded, 180 requestAnimationFrame frames timed in-page.

| Metric | Value |
|---|---|
| Measured FPS | **60** (vsync-capped) |
| Canvas present | yes |
| Status pill | `demo API connected · fps 60 · presence live (1)` |
| Frame capture | 756×469, **1,068 distinct colours**, 98.2% non-background pixels |

Caveats: software rasterisation (SwiftShader), not a GPU run; 60 is the display cap, so this
shows the loop keeps up rather than proving headroom. Re-measure on the Mac Studio's GPU for
the desktop profile, and on a phone for the 30 FPS mobile profile.

Bundle: app shell 17.15 kB (5.63 kB gzip); three.js 1168 kB lazy-loaded on “Enter the city”.

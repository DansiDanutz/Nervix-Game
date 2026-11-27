# Measured performance — 2026-11-28

Method: headless Chrome 158 + CDP, app on Vite, district loaded, 180 requestAnimationFrame
frames timed in-page, `?enter=1` deep link.

| Renderer | FPS | Note |
|---|---|---|
| **GPU (Metal, default headless)** | **60** | vsync-capped; the real Mac Studio path |
| SwiftShader (software) | 22–27 | CPU rasteriser, not representative |

Frame capture at 756×469: 1,068+ distinct colours, ~98% non-background — geometry is drawing.

Optimisations applied: static meshes joined per chunk, small props no longer cast shadows,
shadow map 1024, DPR capped at 1.5, sphere/cylinder segments reduced.

Bundle: app shell 17.15 kB (5.63 kB gzip); three.js 1168 kB lazy on entry.

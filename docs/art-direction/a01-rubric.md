# A01 rubric and judge protocol (V1)

This rubric scores how close the game comes to `assets/references/A01-plaza.png`. Judges score the game frame taken at the fixed A01 camera, not the street spawn.

## Camera

| Item | Value |
|---|---|
| Blender camera | `CAM_A01` in its own collection `A01_CAMERA` of `blender/scenes/nervix_city_slice_01.blend`. No other scene content changed. |
| Script | `blender/scripts/arrival_camera.py`. It writes `app/public/slice/a01-camera.json`. |
| Pose (Blender, Z up) | eye (15.6, −1.2, 6.0), target (−14.094, −4.583, 3.385), vertical FOV 66°, frame 1672×941 |
| Pose (runtime, three.js) | position (15.6, 6.0, 1.2), target (−14.094, 3.385, 4.583), fov 66°, yaw 96.5°, pitch −5.0° |
| Game | DEV only: `?cam=a01` (`app/src/scene/devCamera.ts`). It hides the avatar and the HUD. |
| Proof | `app/e2e/a01-camera.spec.ts` checks the pose to within 1 cm and 0.5°. Evidence: `docs/evidence/slice/game-A01-camera.png`. |
| Strip and metrics | `node scripts/compare-a01.mjs` builds `docs/evidence/slice/compare-A01-baseline.png` and `a01-metrics.json`. |

**How the pose was chosen.** The camera went through ten Blender iterations (`docs/evidence/slice/iterations/a01cam-iter1..10.png`). A01 is a painting, and its perspective is not consistent. Its fountain spout sits at the horizon, which implies an eye about 7 m up. Its casino doors sit above the horizon, which implies an eye about 2 m up.

The slice layout also limits the choice. The red-carpet portal (`casino_portal`) stands at the mouth of the square. From the street, side buildings hide it, and from inside the square it falls out of frame.

The chosen pose stands at the near-left edge of the square, 6 m up, looking across the fountain. On screen:

| Element | Position (fraction of width / height) | A01 |
|---|---|---|
| Fountain base | 0.58 / 0.71 | 0.60 / 0.70 |
| Casino front doors and red steps | 0.88 | 0.86 |
| Cafe awning | 0.37 | 0.36 |
| Horizon | 0.46 | about 0.45 |

**Known differences from A01 (by construction):**
- The arcade street's vanishing point is at 0.56, which is centre-right of the arch but not as far right as in A01.
- The fountain is taller and narrower than A01's.
- The portal with the second dome is out of frame on the right.

## Elements and weights (sum = 100)

Each judge scores each element from 0 to 100 against the "100" description. Use these anchors:
- **100**: indistinguishable in kind and quality from A01.
- **85**: same design and every listed feature present, with small fidelity gaps.
- **60**: right idea, with clear missing features or a plainly lower fidelity.
- **30**: only a placeholder or proxy.
- **0**: absent.

| # | Element | Weight | 100 looks like (from A01) | 85 looks like | Judges check |
|---|---|---|---|---|---|
| 1 | **Paving** | 10 | Concentric rings around the fountain with plum and cream bands, and gold inlays. Irregular warm cobbles with visible relief and grout. Radial fan paving into the streets. | Rings, plum bands and inlays all present. Cobbles are textured but flatter or more uniform. | Ring and band count and colour, cobble relief at mid distance, and tiling repeats. |
| 2 | **Fountain** | 10 | Two-tier carved stone bowl on an octagonal plinth with a plum and gold frieze. Clear teal water, arcing jets and splash. Flower pots and gold urns around it. | Same form and frieze. Water reads as water, but jets or splash are simplified. | Proportions (squat, wide bowl), stone carving, water transparency and motion, surrounding pots. |
| 3 | **Left facades** (house and cafe) | 12 | Stone house with teal shutters, arched teal door, iron lanterns, balcony with flower boxes, hanging banner. Cafe with a scalloped teal awning, parasols, bistro tables and chairs, pergola with vines. | Every listed feature present. Detail density or modelling a step simpler. | Shutters, balcony, awning scallops, tables and parasols, lanterns, door arch. |
| 4 | **Right casino** | 12 | Domed rotunda in plum and gold. Plum banners with a gold shell crest. Gilded arched double doors under swagged drapes. Wide stone steps with a red carpet runner. Gold finials and lanterns. | Dome, banners, portal and red steps present and placed right. Ornament simplified. | Dome shape and ribs, banners, portal drape, step width and carpet, gold accents. |
| 5 | **Back arcade and arch** | 8 | A colonnade of round arches with plum banners and lit shopfronts receding to a big stone arch that frames the hill. | Arcade and arch read clearly. Fewer banners and less shop detail. | Arch rhythm, banners, warm interior glow, the arch framing the view. |
| 6 | **Skyline** | 8 | Layered hills with olives and cypress. A village on the slopes. A multi-arch aqueduct. A domed temple on the summit. A waterfall. Pink and gold clouds in a soft sky. | Hill, aqueduct, temple and sky gradient present. No waterfall, or simpler clouds. | Depth layering, the aqueduct, the summit temple, cloud and sky colour. |
| 7 | **Light** | 12 | Late golden hour. Warm, low key light from the left. Long soft shadows on the paving. Warm bounce on the stone. Glowing lanterns. Lavender shadows. | Clearly golden hour, with directional shadows and warm stone. Bounce or lantern glow weaker. | Shadow direction and length, warmth of lit stone, cool shadow tint, haze, overall exposure. |
| 8 | **Materials** | 10 | Sandstone with grain and chipped edges. Clay roof tiles with variation. Polished gold with highlights. Fabric with folds. Glazed pots. | PBR-looking stone, tiles and gold. Some surfaces still flat-coloured. | Stone grain, tile relief, gold specular, fabric, bevels. |
| 9 | **Density and greenery** | 8 | Bougainvillea, flowers in pots and boxes on every frontage, climbing vines, olive trees, lavender in the foreground. Rich clutter: jars, benches, lanterns. | Greenery on most frontages, with flowers and vines visible. Less clutter. | Plant count and variety, vine coverage, foreground plants, props. |
| 10 | **People** | 5 | Pedestrians in robes walking the square and the street, scaled to the architecture. The A13–A15 characters are on the plaza. | Some pedestrians present at the right scale, possibly static or simple. | Count, scale, costume, placement. |
| 11 | **Composition and sightline** | 5 | Fountain lower-centre. House and cafe in the left third. Casino in the right third. Arcade vanishing centre-right. Sky in the top band. Foreground balustrade and flowers framing the lower left. | Same placement within about 5% of the frame. One secondary anchor off. | Landmark positions against A01. Read this from the strip. |

## Protocol

1. **Evidence.** Build the strip with `node scripts/compare-a01.mjs` after the A01 E2E. The strip shows A01, then Blender CAM_A01, then the game ?cam=a01. The game frame is what gets scored. The Blender frame shows what the export should reach.
2. **Judges.** Three independent model judges each get only the strip, this rubric and the A01 image. They never see each other's scores. Each returns a JSON object of 11 element scores (0–100), each with a one-line reason.
3. **Aggregate.** Take the median per element across the three judges. The weighted total is Σ(weight × median) / 100.
4. **Pass (default D11).** The weighted total must be at least 95 **and** every element median at least 85.
5. **Support metrics.** The metrics file `a01-metrics.json` holds SSIM and mean ΔE, for the whole frame and a 3×3 grid. Judges may cite them but they never decide. A01 is a painting, so a perfect render of the same scene still scores low SSIM against it. Blender versus game is the useful pair, because it measures export fidelity.
6. **David has the final say.** He may overrule the judges in either direction. Record his decision next to the scorecard.

## Baseline scorecard (V1, 2026-11-28)

The scores below are the **builder's provisional pre-score of the game frame**. They are given so every element has an evidence-backed starting value. They are **not** the three-judge result. The judge round and David's review are still open.

| # | Element | Weight | Pre-score | Evidence (game frame in `compare-A01-baseline.png`) |
|---|---|---|---|---|
| 1 | Paving | 10 | 55 | Rings, plum bands and gold diamonds present. Cobbles are a flat tiled texture with no relief. Strong repeats. |
| 2 | Fountain | 10 | 55 | Tiered and on a plinth with a plum frieze and pots. Too tall and narrow against A01. Water is a flat teal disc with thin jet strands. |
| 3 | Left facades | 12 | 50 | Teal shutters, balcony, banner, scalloped awning, parasols and tables present. Boxy and low detail. No pergola. Vines are hexagon chains. |
| 4 | Right casino | 12 | 45 | Dome, spade crest, red steps and carpet present. Banners mostly absent. The portal with drapes is out of frame. Gold reads as flat paint. |
| 5 | Back arcade and arch | 8 | 40 | Arcade and arch present but small and dim. Few banners, and shop glow barely reads. |
| 6 | Skyline | 8 | 50 | Hill, cypress, village, aqueduct and summit temple present. No waterfall or clouds. Flat faceted hill, and a washed beige sky in the game. |
| 7 | Light | 12 | 35 | Game: hazy and neutral, with weak shadows and no golden warmth. Blender is warmer. Lantern glow is minimal. |
| 8 | Materials | 10 | 35 | Stone uses a large-block texture with no grain or bevel wear. Roof tiles are flat. Gold has no specular. |
| 9 | Density and greenery | 8 | 30 | Flower boxes and a few topiary balls. Sparse compared with A01's bougainvillea and foreground plants. |
| 10 | People | 5 | 0 | No pedestrians or characters in the frame (NPCs are hidden in the slice). |
| 11 | Composition and sightline | 5 | 60 | Fountain, cafe, casino and horizon placed close to A01. Vanishing point not as far right. Foreground balustrade present, but its flowers are sparse. |
| | **Weighted total** | **100** | **42.7** | **Fails.** The total is below 95 and every element is below 85. |

**Support metrics** (`a01-metrics.json`, 836×470, whole frame):

| Pair | SSIM | ΔE |
|---|---|---|
| Reference vs Blender | 0.099 | 32.6 |
| Reference vs game | 0.098 | 31.6 |
| Blender vs game | 0.826 | 9.0 |

The worst Blender-vs-game cells are top-left (SSIM 0.73) and top-centre (ΔE 12.3). That is the sky and haze, which is the light gap V2 owns.

Where the biggest weighted gains are, in order:
- light (V2)
- materials (V3)
- the left and right facade detail and casino banners
- density
- people

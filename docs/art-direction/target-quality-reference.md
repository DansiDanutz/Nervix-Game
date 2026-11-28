# Target quality reference (what "done" should feel like)

Source: "How To Turn a GPT 6.2 Astra + Sol Swarm Into Your Own 3D Studio" (Chase AI),
https://www.youtube.com/watch?v=pXro0-ijFhM. David marked this as exactly the desired *result
quality*. It is third-party: frames stay local in `docs/references/external/target-result-pXro0/`
(gitignored). Never copy its assets. A01–A18 still control our *design* (Nervix palette,
fountain square, OpenPoker); this video controls the *fidelity bar*.

What the result shows (local frames f_027, f_029):
- You walk through the town **in first person**. Stone paving has real texture variation and worn
  edges. A market street has stalls with striped awnings and a stone fountain on stepped round
  platforms. Bunting is strung *beside* the fountain, not across the view.
- Lighting reads as real: warm lamps, night sky, soft shadows, ambient occlusion in corners.
- Density: 399 distinct models per map, 446 in the library (houses, stalls, props, characters).
  The town has hundreds of varied buildings, a harbour bridge, a lighthouse and mountains behind.

How it was made (from the video's slides):
1. **One lead, three workers.** A lead model plans and reviews; worker agents build in parallel.
2. **One agent, two tools:** Blender for modelling, the engine for assembly. Connectors included
   Higgsfield MCP for some asset generation. Higgsfield is **paid**: in Nervix it needs David's
   explicit go-ahead per job, never automatic.
3. **Stages:** Plan (map and reference images) → **Gray box first** (cheap to change) → Build
   assets → Assemble → Playtest.
4. **Build, check, repeat. Nothing ships unchecked:** every asset is held to a reference image and
   passes a reviewer before use.
5. **Playtest on foot.** Fixes were found by walking, and frame time was measured (one hitch was
   228 ms).
6. **Scale:** about 20 h wall clock, 8.7 h of agent time, 58 agent sessions, about 1.4B tokens
   processed. The final capture was in **Unreal Engine**.

Implications for Nervix (browser, three.js):
- We render in the browser, not Unreal, so the closest route to this look is:
  - Blender PBR materials (colour, normal and roughness maps, and bevels);
  - **lighting and AO baked in Blender Cycles into lightmaps**, exported with the GLB, so three.js
    shows Blender's lighting;
  - an HDRI or sky environment, ACES tone mapping, sRGB output and light post-processing (SSAO,
    bloom for lamps).
- Adopt the same pipeline per district: plan → gray box approved at the spawn camera → asset kit
  (each asset checked against an A-reference) → assemble → playtest on foot with fps budget →
  judged comparison.
- Keep performance: instancing for repeated props, texture atlases, KTX2 textures, a draw-call
  budget, and a frame-time check in E2E.

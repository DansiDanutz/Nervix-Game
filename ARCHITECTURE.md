# Architecture and ownership
- **Visual source:** assets/references contains the original art. Author scene geometry, materials, camera targets and collision markers in Blender under blender/. Follow BLENDER_GUIDE.md and docs/ASSETS.md. Preserve hand-authored objects.
- **Runtime:** app/ loads exported GLBs from app/public/. Keep Blender sources, export manifest and browser assets aligned. Validate the actual player camera; thumbnails and staged cameras do not prove gameplay.
- **Business data:** server/ owns authentication, eligibility, merchant ownership and catalogs. The client requests the current house record and renders it; it is not an authorization boundary. Never put secrets or real customer records into scene files.
- **Navigation:** street spawn → Fountain Square → merchant door → interior → return point. Platform and merchant identities are separate. Each room resolves only its own catalog and app.
- **Handoff:** start with game.md, Roadmap.md, AGENTS.md and PROGRESS.md. See SETUP.md for running the project and ACCEPTANCE.md for existing checks.

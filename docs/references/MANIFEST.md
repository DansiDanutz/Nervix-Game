# Art reference manifest

Consolidated 2026-11-28 from `~/Documents/ChatGPT/SemeOS/art-direction/` and `~/Downloads/`.
Copies are byte-identical to their sources unless marked *edited*. SHA-256 was checked on
source and copy after copying.

## Local images (present in this folder)

| ID | File | Size (px) | SHA-256 | Source | Role |
|---|---|---|---|---|---|
| ref1 | `ref1-city-overview.png` | 1672×941 | `c655d9d110e7…` | already filed | city composition |
| ref2 | `ref2-merchant-buildings.png` | 1672×941 | `2a9591b60bef…` | already filed | house / café / casino façades |
| ref3 | `ref3-character-lineup.png` | 1672×941 | `5c7b30dff931…` | already filed | characters |
| ref4 | `ref4-cafe-interior.png` | 1672×941 | `3983df7acf86…` | already filed | café interior |
| A16 | `A16-casino-entrance-assembly.png` | 1536×1024 | `a2bb3cacd082…` | `art-direction/references/A16-casino-entrance-assembly.png` (= `Downloads/Mediterranean Casino Entrance Reference Sheet.png`) | **selected**: casino doorway, elevation / ¾ / cutaway |
| A17 | `A17-casino-salon.png` | 1672×941 | `e80e5c147e28…` | `art-direction/references/A17-casino-salon.png` (= `Downloads/Mediterranean Casino Salon Interior.png`) | **selected**: casino interior master, threshold view |
| A18 | `A18-roulette-table.png` | 1536×1024 | `eaa26e3a46f9…` | `art-direction/references/A18-roulette-table.png` | **selected**: roulette hero prop |
| A18-alt | `A18-alt-antique-roulette-table-sheet.png` | 1536×1024 | `db5943a4c9f4…` | `Downloads/Antique Roulette Table Reference Sheet.png` | **alternate only** — different design (darker mahogany, flared fluted pedestal, plum stool with gold cord, green zero pockets). Not the selected A18. |

Full hashes:

```
a2bb3cacd0829c7af918f6790b44aad5bb30c183f374a64917ccdf735a4efc60  A16-casino-entrance-assembly.png
e80e5c147e2836114b2174ea61d0440ed9952025f57efbe5d6cfc163a5c26ba1  A17-casino-salon.png
eaa26e3a46f9b02e2adff774c4c55e87133b29f5c27ab6eb2963cfcb77594cb3  A18-roulette-table.png
db5943a4c9f46b86d8d1b792a72a4aad9f6ea718a66b23833df45934a4c360c3  A18-alt-antique-roulette-table-sheet.png
c655d9d110e75831429cffea03b9ff3e6028968ed0d8c860aebbe44987a0bc30  ref1-city-overview.png
2a9591b60bef9591442562125578b23be86139449dabc9635e985d3548807ca2  ref2-merchant-buildings.png
5c7b30dff931a113b23bb6c9c9329456dc20cbdc4d813a1df41c225ae4efd2af  ref3-character-lineup.png
3983df7acf869cd58eab43b0ecc96353e689ba52e77be04f4ab3ea2f8ab0d783  ref4-cafe-interior.png
```

Verify: `cd docs/references && shasum -a 256 -c <(sed -n '/^```$/,/^```$/p' MANIFEST.md | grep -v '```')`

A16, A17, A18 and A18-alt were visually inspected by the agent on 2026-11-28 (image input
available this session). ref1–ref4 status is unchanged from `README.md`.

## A01–A15 — present in `assets/references/` (canonical collection)

**Superseded 2026-11-28:** the earlier note here said A01–A15 existed only as ChatGPT Library
links. That is obsolete. All 23 original PNGs (A01–A18, A18-alt, ref1–ref4) were published in
handoff PR #2 (`codex/world-builder-handoff`) and are committed at
[`assets/references/`](../../assets/references/), with `SHA256SUMS` and a `README.md`.

`assets/references/` is the **canonical** art collection. This folder (`docs/references/`) keeps
byte-identical working copies of ref1–ref4 and A16–A18 for the docs; the hashes above match the
same files in `assets/references/`.

Verify the full set: `cd assets/references && shasum -a 256 -c SHA256SUMS` (23/23 OK on 2026-11-28).

ref1 is still *not* A01: A01-plaza is the controlling arrival/composition target (street spawn
first frame); ref1 is supporting context only.

## Art-direction briefs (`../art-direction/`)

| File | SHA-256 (copy) | vs source |
|---|---|---|
| `A16-casino-entrance-assembly.md` | `8793530a2c6eaafa92fa4f0a3cf81548c35156fc96b36ab53d0259c30d406d5b` | identical |
| `Nervix-World-15-image-prompts.md` | `37822caebfab3724e0110137202dcce1b767d685db28e147ff7c8f92082698ad` | identical |
| `Nervix-World-casino-A17-A26.md` | `4cfc470a3620fa1ee60f28f565e73b25b0a39c723a427bee6fe3886cddf59220` | identical |
| `Nervix-World-selected-references.md` | `49efb2ba733d2ab7b1bafd05bf2668cc74b463446db4d9cf7bac86d0edbbde7a` | *edited*: `references/…png` links rewritten to `../references/…png`; source `39484ebb…2b4273` |

A19–A26 (card table, reception, stair, arch bay, lighting, floor inlay, dealer, tabletop) are
prompts only; no images have been generated.

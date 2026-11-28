/**
 * The K1 character kit manifest (app/public/kits/k1/manifest.json) as the skinned avatar reads it:
 * GLB, material slots, parts, presets and the authored speed of each clip. Validated at the
 * boundary and frozen. No runtime imports: unit-tested with Node type stripping.
 */

export interface K1Part {
  readonly id: string;
  readonly node: string;
  readonly category: string;
}

export interface K1Preset {
  readonly id: string;
  readonly parts: readonly string[];
  /** Material slot -> #rrggbb. */
  readonly palette: Readonly<Record<string, string>>;
}

export interface K1Clip {
  readonly name: string;
  /** Ground speed the clip was authored at, m/s (0 for idle and talk). */
  readonly speedMps: number;
}

export interface K1Kit {
  readonly glb: string;
  /** Material slot -> material name in the GLB. */
  readonly slots: Readonly<Record<string, string>>;
  readonly parts: readonly K1Part[];
  readonly presets: readonly K1Preset[];
  readonly clips: readonly K1Clip[];
}

type Obj = Record<string, unknown>;
const HEX = /^#[0-9a-f]{6}$/i;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(path: string, rule: string): never {
  throw new Error(`k1 manifest: ${path} ${rule}`);
}

function str(v: unknown, path: string): string {
  return typeof v === "string" && v ? v : fail(path, "must be a non-empty string");
}

function objects(v: unknown, path: string, nonEmpty = false): Obj[] {
  if (!Array.isArray(v) || (nonEmpty && v.length === 0)) fail(path, nonEmpty ? "must be a non-empty array" : "must be an array");
  return v.map((x, i) => (isObj(x) ? x : fail(`${path}[${i}]`, "must be an object")));
}

function parsePreset(p: Obj, i: number): K1Preset {
  const palette = isObj(p.palette) ? p.palette : {};
  const parts = Array.isArray(p.parts) ? p.parts.map((x, j) => str(x, `presets[${i}].parts[${j}]`)) : [];
  const colours = Object.entries(palette).filter((e): e is [string, string] => typeof e[1] === "string" && HEX.test(e[1]));
  return Object.freeze({ id: str(p.id, `presets[${i}].id`), parts: Object.freeze(parts), palette: Object.freeze(Object.fromEntries(colours)) });
}

function parseClip(c: Obj, i: number): K1Clip {
  const speed = c.speed_mps ?? 0;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0) fail(`clips[${i}].speed_mps`, "must be a number >= 0");
  return Object.freeze({ name: str(c.name, `clips[${i}].name`), speedMps: speed });
}

export function parseK1Kit(json: unknown): K1Kit {
  if (!isObj(json)) throw new Error("k1 manifest: not an object");
  const slotsRaw = isObj(json.material_slots) ? json.material_slots : fail("material_slots", "must be an object");
  const slots = Object.fromEntries(Object.entries(slotsRaw).map(([k, v]) => [k, str(v, `material_slots.${k}`)]));
  const parts = objects(json.parts, "parts").map((p, i) =>
    Object.freeze({ id: str(p.id, `parts[${i}].id`), node: str(p.node, `parts[${i}].node`), category: str(p.category, `parts[${i}].category`) }),
  );
  return Object.freeze({
    glb: str(json.glb, "glb"),
    slots: Object.freeze(slots),
    parts: Object.freeze(parts),
    presets: Object.freeze(objects(json.presets, "presets", true).map(parsePreset)),
    clips: Object.freeze(objects(json.clips, "clips").map(parseClip)),
  });
}

/** A known preset id, or the kit's first preset: an unknown id never blanks the body. */
export function resolvePreset(kit: K1Kit, preset: string): string {
  return kit.presets.some((p) => p.id === preset) ? preset : kit.presets[0].id;
}

/** Node names shown for a preset: every base part plus the preset's own parts. */
export function visiblePartNodes(kit: K1Kit, presetId: string): ReadonlySet<string> {
  const wanted = new Set(kit.presets.find((p) => p.id === presetId)?.parts ?? []);
  return new Set(kit.parts.filter((p) => p.category === "base" || wanted.has(p.id)).map((p) => p.node));
}

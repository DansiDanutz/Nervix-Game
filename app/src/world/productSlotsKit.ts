/**
 * P3: the K3 product-display kit (app/public/kits/k3/manifest.json) and the
 * instancing plan the scene draws from a ProductLayout. Pure and frozen; no
 * runtime imports, so it is unit-tested with Node type stripping.
 *
 * K3 sizes (`product_size_m`) are Blender (width, depth, height); K2 slot
 * `max_extent` is runtime (x, y-up, z). Product origins are at the base centre.
 */
import type { ProductLayout, Vec3 } from "./productSlots";

/** Every runtime product label reads exactly this (display only, never a checkout). */
export const DISPLAY_LABEL = "demo · display only";

export interface K3Category {
  readonly id: string;
  readonly label: string;
  /** GLB node holding the category's single product mesh, e.g. `display.seat.product`. */
  readonly productNode: string;
  readonly productSize: Vec3;
}

export interface K3Kit {
  readonly glb: string;
  readonly categoryIds: readonly string[];
  readonly fallback: K3Category;
  /** The category, or the generic fallback for any unknown id. */
  readonly byId: (id: string) => K3Category;
}

export interface ProductInstance {
  readonly listingId: string;
  readonly position: Vec3;
  readonly scale: number;
}

export interface ProductInstanceGroup {
  readonly category: string;
  readonly productNode: string;
  readonly items: readonly ProductInstance[];
}

const GLB_FILE = /^[a-z0-9_]{1,64}\.glb$/;
const ID = /^[a-z0-9_]{1,32}$/;
const NODE = /^[a-z0-9_.]{1,96}$/;

type Raw = Record<string, unknown>;
const fail = (path: string, what: string): never => {
  throw new Error(`k3 manifest: ${path} ${what}`);
};
const rec = (v: unknown, path: string): Raw => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : fail(path, "must be an object"));
const matching = (v: unknown, re: RegExp, path: string): string => (typeof v === "string" && re.test(v) ? v : fail(path, `is not allowed: ${String(v)}`));
const vec3 = (v: unknown, path: string): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)
    ? (Object.freeze([...v]) as unknown as Vec3)
    : fail(path, "must be 3 non-negative numbers");

function parseCategory(raw: unknown, path: string): K3Category {
  const c = rec(raw, path);
  const display = matching(c.display, NODE, `${path}.display`);
  return Object.freeze({
    id: matching(c.id, ID, `${path}.id`),
    label: typeof c.label === "string" ? c.label : String(c.id),
    productNode: `${display}.product`,
    productSize: vec3(c.product_size_m, `${path}.product_size_m`),
  });
}

/** Validates the K3 manifest (external data); throws with the failing path. */
export function parseK3(json: unknown): K3Kit {
  const m = rec(json, "root");
  const glb = matching(m.glb, GLB_FILE, "glb");
  if (!Array.isArray(m.categories)) fail("categories", "must be an array");
  const categories = (m.categories as unknown[]).map((c, i) => parseCategory(c, `categories[${i}]`));
  const fallback = parseCategory(m.fallback, "fallback");
  const index = new Map(categories.map((c) => [c.id, c]));
  return Object.freeze({
    glb,
    categoryIds: Object.freeze(categories.map((c) => c.id)),
    fallback,
    byId: (id: string) => index.get(id) ?? fallback,
  });
}

/** three.js PropertyBinding.sanitizeNodeName: GLTFLoader stores node names this way (spaces -> _, drops []:./). */
export function k3NodeName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[[\]\.:/]/g, "");
}

/** Uniform scale (<= 1) that keeps a product of (w, d, h) inside a slot extent (x, y-up, z). */
export function fitScale(productSize: Vec3, maxExtent: Vec3): number {
  const [w, d, h] = productSize;
  const [mx, my, mz] = maxExtent;
  const ratios = [[mx, w], [my, h], [mz, d]].filter(([, size]) => size > 0).map(([limit, size]) => limit / size);
  return Math.min(1, ...ratios);
}

/** One instancing group per display category (sorted by id), items in slot order. */
export function productInstances(layout: ProductLayout, kit: K3Kit): readonly ProductInstanceGroup[] {
  const groups = new Map<string, ProductInstance[]>();
  for (const p of layout.placed) {
    const category = kit.byId(p.displayCategory);
    const item = Object.freeze({ listingId: p.listingId, position: p.position, scale: fitScale(category.productSize, p.maxExtent) });
    groups.set(category.id, [...(groups.get(category.id) ?? []), item]);
  }
  return Object.freeze(
    [...groups.keys()].sort().map((id) =>
      Object.freeze({ category: id, productNode: kit.byId(id).productNode, items: Object.freeze(groups.get(id) ?? []) }),
    ),
  );
}


/**
 * B4 signboard: a merchant record (from GET /world/houses) becomes a paint
 * spec for the K2 sign surface. Identity is runtime data, never baked into the
 * GLB. Pure and frozen; no runtime imports, so it is unit-tested with Node type
 * stripping. paintSignboard() is the only browser-facing part and needs just a
 * canvas with a 2D context.
 */

export interface SignRecord {
  readonly merchantName: string;
  readonly accent: string;
  readonly verified: boolean;
}

export interface SignOptions {
  /** anchors.sign.size from the K2 manifest, in metres [width, height]. */
  readonly size?: readonly [number, number] | readonly number[];
}

export interface SignSeal {
  readonly label: "verified";
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fill: string;
  readonly mark: string;
}

export interface SignboardSpec {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly border: string;
  readonly text: {
    readonly value: string;
    readonly colour: string;
    readonly font: string;
    readonly size: number;
    readonly x: number;
    readonly y: number;
    readonly maxWidth: number;
  };
  readonly seal: SignSeal | null;
}

/** Same value as DEFAULT_ACCENT in net/api/world.ts (a test keeps them equal). */
export const SIGN_DEFAULT_ACCENT = "#e8dcc0";
export const FALLBACK_SIGN_NAME = "Merchant";
export const SIGN_MAX_CHARS = 28;

const CANVAS_WIDTH = 512;
const DEFAULT_ASPECT = 0.3;
const MIN_HEIGHT = 64;
const PADDING_RATIO = 0.06;
const MAX_FONT_RATIO = 0.46;
const MIN_FONT_RATIO = 0.24;
const SHORT_NAME = 10;
const LIGHT_INK = "#f6efe0";
const DARK_INK = "#1d1a16";
const SEAL_FILL = "#d4af37";
const BORDER = "#3a2a1c";
const FONT_FAMILY = "Georgia, 'Times New Roman', serif";
const LUMINANCE_SPLIT = 0.45;
const HEX = /^#[0-9a-fA-F]{6}$/;
// Control characters, bidi embeddings/overrides/isolates, zero-width marks and the BOM.
const UNSAFE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Text safe to draw: NFC, no control/bidi/zero-width characters, single spaces. */
export function safeSignText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
}

/** Truncates by code point so a surrogate pair is never split; the result has at most `max` code points. */
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

const safeAccent = (accent: unknown) => (typeof accent === "string" && HEX.test(accent) ? accent.toLowerCase() : SIGN_DEFAULT_ACCENT);

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function canvasHeight(size: SignOptions["size"]): number {
  const [w, h] = size ?? [];
  const aspect = typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? Math.min(h / w, 1) : DEFAULT_ASPECT;
  return Math.max(MIN_HEIGHT, Math.round(CANVAS_WIDTH * aspect));
}

function fontSize(height: number, chars: number): number {
  const max = height * MAX_FONT_RATIO;
  const min = height * MIN_FONT_RATIO;
  if (chars <= SHORT_NAME) return Math.round(max);
  const t = Math.min(1, (chars - SHORT_NAME) / (SIGN_MAX_CHARS - SHORT_NAME));
  return Math.round(max - (max - min) * t);
}

function seal(width: number, height: number, pad: number): SignSeal {
  const radius = Math.round(height * 0.22);
  return Object.freeze({ label: "verified", x: width - pad - radius, y: Math.round(height / 2), radius, fill: SEAL_FILL, mark: "✓" });
}

/** The paint spec for one merchant sign. The input is never mutated. */
export function signboardSpec(record: SignRecord, options: SignOptions = {}): SignboardSpec {
  const width = CANVAS_WIDTH;
  const height = canvasHeight(options.size);
  const pad = Math.round(width * PADDING_RATIO);
  const background = safeAccent(record.accent);
  const value = truncate(safeSignText(record.merchantName) || FALLBACK_SIGN_NAME, SIGN_MAX_CHARS);
  const size = fontSize(height, Array.from(value).length);
  const badge = record.verified === true ? seal(width, height, pad) : null;
  const reserved = badge ? badge.radius * 2 + pad : 0;
  const text = Object.freeze({
    value,
    colour: luminance(background) > LUMINANCE_SPLIT ? DARK_INK : LIGHT_INK,
    font: `600 ${size}px ${FONT_FAMILY}`,
    size,
    x: Math.round((width - reserved) / 2),
    y: Math.round(height / 2),
    maxWidth: width - pad * 2 - reserved,
  });
  return Object.freeze({ width, height, background, border: BORDER, text, seal: badge });
}

/** The slice of HTMLCanvasElement the painter needs (lets tests pass a fake). */
export interface SignCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasRenderingContext2D | null;
}

function paintSeal(ctx: CanvasRenderingContext2D, s: SignSeal, ink: string): void {
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
  ctx.fillStyle = s.fill;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(s.radius * 1.2)}px ${FONT_FAMILY}`;
  ctx.fillText(s.mark, s.x, s.y);
}

/** Browser adapter: paints the spec onto a canvas. Returns false when no 2D context exists. */
export function paintSignboard(canvas: SignCanvas, spec: SignboardSpec): boolean {
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const edge = Math.max(2, Math.round(spec.height * 0.05));
  ctx.fillStyle = spec.border;
  ctx.fillRect(0, 0, spec.width, spec.height);
  ctx.fillStyle = spec.background;
  ctx.fillRect(edge, edge, spec.width - edge * 2, spec.height - edge * 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = spec.text.colour;
  ctx.font = spec.text.font;
  ctx.fillText(spec.text.value, spec.text.x, spec.text.y, spec.text.maxWidth);
  if (spec.seal) paintSeal(ctx, spec.seal, DARK_INK);
  return true;
}

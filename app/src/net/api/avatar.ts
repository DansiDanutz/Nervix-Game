/**
 * Avatar appearance (C5): the preset list and the /me/avatar endpoints.
 * Players store a preset id, never raw colours. Identity is the session, so
 * no userId is ever sent.
 */
import type { Call } from "./http";

export interface AvatarPalette {
  readonly tunic: string;
  readonly trim: string;
  readonly legs: string;
  readonly skin: string;
  readonly hair: string;
  readonly eyes: string;
  readonly leather: string;
  readonly accent: string;
}

export interface AvatarPreset {
  readonly id: string;
  readonly label: string;
  readonly palette: AvatarPalette;
}

/** GET/PUT /me/avatar response: `default` when the player has not chosen yet. */
export interface MyAvatar {
  readonly preset: string;
  readonly source: "saved" | "default";
}

const preset = (id: string, label: string, palette: AvatarPalette): AvatarPreset =>
  Object.freeze({ id, label, palette: Object.freeze({ ...palette }) });

/** Mirrors shared/contracts/avatar-presets.json (v1); a test guards drift against it and the K1 kit. */
export const AVATAR_PRESETS: readonly AvatarPreset[] = Object.freeze([
  preset("teal", "Teal tunic", { tunic: "#2f7a76", trim: "#c9993f", legs: "#5a2a44", skin: "#e2b08a", hair: "#3b2418", eyes: "#2b2118", leather: "#6b4128", accent: "#e8d9b8" }),
  preset("terracotta", "Terracotta tunic", { tunic: "#b5651d", trim: "#e0c07a", legs: "#4a3328", skin: "#f0c9a0", hair: "#5b3a22", eyes: "#2b2118", leather: "#5a3420", accent: "#3f6f6a" }),
  preset("burgundy", "Burgundy coat", { tunic: "#7a2636", trim: "#c9993f", legs: "#e6d5b8", skin: "#d9a27c", hair: "#3a2219", eyes: "#2b2118", leather: "#6b4128", accent: "#7a2636" }),
  preset("linen", "Linen and teal apron", { tunic: "#e6d6b8", trim: "#c9a96a", legs: "#b48e62", skin: "#c98e68", hair: "#3b2418", eyes: "#2b2118", leather: "#6b4128", accent: "#3e6c68" }),
  preset("traveller", "Sand tunic and blue shawl", { tunic: "#d8c095", trim: "#8fa3a0", legs: "#6e5a3e", skin: "#b97b55", hair: "#2e1c14", eyes: "#2b2118", leather: "#6e4127", accent: "#4b6f76" }),
  preset("sage", "Teal robe", { tunic: "#3d7f7a", trim: "#e3cf9e", legs: "#efe3c8", skin: "#9a6444", hair: "#22150f", eyes: "#1f1813", leather: "#5a3420", accent: "#efe3c8" }),
]);

export const DEFAULT_PRESET = AVATAR_PRESETS[0].id;

export function isAvatarPresetId(value: unknown): value is string {
  return typeof value === "string" && AVATAR_PRESETS.some((p) => p.id === value);
}

export const avatarEndpoints = (call: Call) => ({
  myAvatar: () => call<MyAvatar>("/me/avatar"),
  saveAvatar: (presetId: string) => call<MyAvatar>("/me/avatar", { preset: presetId }, "PUT"),
});

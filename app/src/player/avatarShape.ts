/**
 * Avatar proportions and palette (no runtime imports: unit-tested with Node type stripping).
 *
 * The arrival camera is fixed by contract (3 m behind, eye 1.98 m, FOV 55), so the only lever
 * on how much of the frame the avatar fills is its size. A stylised figure at AVATAR_SCALE keeps
 * the avatar under ~30% of the frame height, clear of the compass-star medallion and the cafe.
 * Collision (PLAYER_RADIUS) is unchanged.
 */

/** Uniform scale of the full-size build below. */
export const AVATAR_SCALE = 0.72;

/** Full-size build in metres (head top at 1.63 m), before AVATAR_SCALE. */
export const AVATAR_BUILD = Object.freeze({
  legRadius: 0.085,
  legLength: 0.36,
  legY: 0.27,
  legX: 0.1,
  bodyRadius: 0.25,
  bodyLength: 0.42,
  bodyY: 0.86,
  beltY: 0.7,
  beltRadius: 0.262,
  beltHeight: 0.07,
  headRadius: 0.21,
  headY: 1.42,
  hairRadius: 0.222,
  /** Hair cap opening below the crown (rad from the top) and its backward tilt (rad). */
  hairCover: 1.45,
  hairTilt: -0.35,
  eyeY: 1.45,
  eyeX: 0.075,
  eyeRadius: 0.035,
});

/** Head-top height of the scaled avatar (m). */
export const AVATAR_HEIGHT = (AVATAR_BUILD.headY + AVATAR_BUILD.headRadius) * AVATAR_SCALE;
/** Widest radius of the scaled avatar (m). */
export const AVATAR_RADIUS = AVATAR_BUILD.beltRadius * AVATAR_SCALE;

export interface AvatarPalette {
  tunic: string;
  trim: string;
  legs: string;
  skin: string;
  hair: string;
  eyes: string;
}

/** Local player: A01 teal tunic, gold belt, plum trousers. */
export const LOCAL_PALETTE: Readonly<AvatarPalette> = Object.freeze({
  tunic: "#2f7a76",
  trim: "#c9993f",
  legs: "#5a2a44",
  skin: "#e2b08a",
  hair: "#3b2418",
  eyes: "#2b2118",
});

/** Other players: terracotta tunic so they read apart from the local avatar. */
export const REMOTE_PALETTE: Readonly<AvatarPalette> = Object.freeze({
  tunic: "#b5651d",
  trim: "#e0c07a",
  legs: "#4a3328",
  skin: "#f0c9a0",
  hair: "#5b3a22",
  eyes: "#2b2118",
});

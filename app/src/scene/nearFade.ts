/** Pure label-fade maths (no runtime imports: unit-tested with Node type stripping). */

/** World labels appear only when the player walks up, so they never sit on the arrival facades. */
export const LABEL_FADE = Object.freeze({ near: 5, far: 7.5 });

/** 1 within `near` metres of the camera, 0 beyond `far`, linear in between. */
export function nearFadeOpacity(distance: number, fade: { near: number; far: number } = LABEL_FADE) {
  if (distance <= fade.near) return 1;
  if (distance >= fade.far) return 0;
  return (fade.far - distance) / (fade.far - fade.near);
}

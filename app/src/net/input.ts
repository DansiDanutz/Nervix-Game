/** Shared touch/click input, merged with the keyboard by PlayerController. */
export const touch = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

export function resetTouch() {
  touch.forward = touch.back = touch.left = touch.right = false;
}
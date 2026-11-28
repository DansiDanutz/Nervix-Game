import { useEffect, useRef } from "react";
import { bindDragLook } from "./pointer";

/**
 * Mouse look: drag on the canvas to orbit the camera. A press that stays
 * within the click threshold is left alone, so doors still get their onClick.
 */
export function useDragLook(el: HTMLElement, onDrag: (dx: number, dy: number) => void) {
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  useEffect(() => bindDragLook(el, window, (dx, dy) => onDragRef.current(dx, dy)), [el]);
}

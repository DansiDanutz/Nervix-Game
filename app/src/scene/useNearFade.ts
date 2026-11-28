import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { nearFadeOpacity } from "./nearFade";

/**
 * Ref for an Html label's element: its opacity follows the camera's ground distance to
 * (x, z). Written straight to the element style each frame (no React re-render).
 */
export function useNearFade<T extends HTMLElement>(x: number, z: number) {
  const ref = useRef<T>(null);
  const last = useRef(-1);
  useFrame(({ camera }) => {
    const el = ref.current;
    if (!el) return;
    const opacity = +nearFadeOpacity(Math.hypot(camera.position.x - x, camera.position.z - z)).toFixed(2);
    if (opacity === last.current) return;
    last.current = opacity;
    el.style.opacity = String(opacity);
    el.style.visibility = opacity === 0 ? "hidden" : "visible";
  });
  return ref;
}

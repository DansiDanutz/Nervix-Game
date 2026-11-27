import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Reports measured frames per second. This is an observation, not a target:
 * the 60 FPS desktop / 30 FPS mobile profiles are only meaningful once the
 * Blender district is loaded.
 */
export function PerfMeter({ onFps }: { onFps: (fps: number) => void }) {
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed >= 500) {
      onFps(Math.round((frames.current * 1000) / elapsed));
      frames.current = 0;
      last.current = now;
    }
  });

  return null;
}
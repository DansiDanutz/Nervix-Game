
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Dev-only: raycast camera -> fountain and expose the first hit. */
export function DevRaycast() {
  const { camera, scene } = useThree();
  const ray = new THREE.Raycaster();
  const target = new THREE.Vector3(0, 1.0, 0);
  useFrame(() => {
    const dir = target.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object.visible);
    const first = hits[0];
    const project = (name: string) => {
      const o = scene.getObjectByName(name);
      if (!o) return null;
      const v = o.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: +v.x.toFixed(2), y: +v.y.toFixed(2) };
    };
    (window as unknown as Record<string, unknown>).__nervixCam = { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2), room: !!scene.getObjectByName("nervix_interior") };
    const near = scene.children
      .flatMap((c) => c.children)
      .filter((o) => o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) < 9)
      .map((o) => o.name || o.type)
      .slice(0, 12);
    (window as unknown as Record<string, unknown>).__nervixNear = near;
    (window as unknown as Record<string, unknown>).__nervixLayout = {
      house: project("house"), cafe: project("cafe"), casino: project("casino"),
    };
    (window as unknown as Record<string, unknown>).__nervixRay = {
      distance: +dist.toFixed(2),
      hit: first ? first.object.name || first.object.type : null,
      hitDistance: first ? +first.distance.toFixed(2) : null,
      clear: !!first && first.distance > dist - 1.5,
    };
  });
  return null;
}

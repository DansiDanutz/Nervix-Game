/**
 * Golden-hour sky dome as a shader that reproduces Blender's ArrivalWorld (skyRamp.ts): the
 * six-stop colour ramp over the view height, cream cloud banks from a 3D noise mask (scale 3,
 * linear ramp 0.55 -> 0.75), times the camera strength. Colours are linear-light uniforms
 * (THREE.Color converts the sRGB hex), and the result goes through the same tone mapping and
 * output colour space as the buildings, as Blender's camera sees its world through the AgX view.
 * Never fogged. Blender's sun lamp is invisible to the camera, so there is no sun disc.
 */
import * as THREE from "three";
import { BLENDER_WORLD, SKY_STOP_COUNT } from "./skyRamp";

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uStops[SKY_STOPS];
uniform float uPos[SKY_STOPS];
uniform float uStrength;
uniform vec3 uCloud;
uniform float uCloudScale;
uniform float uCloudLow;
uniform float uCloudHigh;
uniform float uTime;
varying vec3 vDir;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
// Four octaves like Blender's Noise (detail 4), normalised to 0..1 around 0.5.
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise3(p); p *= 2.0; a *= 0.5; }
  return s / 0.9375;
}

vec3 ramp(float fac) {
  vec3 col = uStops[0];
  for (int i = 0; i < SKY_STOPS - 1; i++) {
    float t = clamp((fac - uPos[i]) / max(uPos[i + 1] - uPos[i], 1e-5), 0.0, 1.0);
    col = mix(col, uStops[i + 1], t);
  }
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = ramp(d.y);
  // Blender's Generated world coordinates are the view direction (z up); runtime y is up.
  vec3 q = vec3(d.x, -d.z, d.y) * uCloudScale + vec3(uTime * 0.003, uTime * 0.001, 0.0);
  float cloud = clamp((fbm3(q) - uCloudLow) / (uCloudHigh - uCloudLow), 0.0, 1.0);
  col = mix(col, uCloud, cloud) * uStrength;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function skyMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "arrival_sky",
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { SKY_STOPS: SKY_STOP_COUNT },
    uniforms: {
      uStops: { value: BLENDER_WORLD.stops.map((s) => new THREE.Color(s.color)) },
      uPos: { value: BLENDER_WORLD.stops.map((s) => s.position) },
      uStrength: { value: BLENDER_WORLD.strength },
      uCloud: { value: new THREE.Color(BLENDER_WORLD.cloudColor) },
      uCloudScale: { value: BLENDER_WORLD.cloudScale },
      uCloudLow: { value: BLENDER_WORLD.cloudLow },
      uCloudHigh: { value: BLENDER_WORLD.cloudHigh },
      uTime: time,
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

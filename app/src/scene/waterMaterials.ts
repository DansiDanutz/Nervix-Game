/**
 * Animated fountain water (A01: clear teal pool, arcing jets, white splash).
 *
 * Both shaders are cheap fakes that read as water at the A01 distance:
 * - pool: transparent body that deepens toward the centre, fresnel mix toward the sky colour
 *   ("refraction-ish": you see into the basin from above, sky at grazing angles), scrolling
 *   directional sine waves as a normal perturbation, caustic shimmer and a sun glint;
 * - stream/foam: ribbons with streaks falling at `fallSpeed`, lanes de-phased around the fountain.
 * They honour scene fog, tone mapping and the output colour space like built-in materials.
 */
import * as THREE from "three";
import { WATER_LOOK, type WaterKind } from "./fountainWater";

export interface WaterContext {
  /** Shared, advanced once per frame by the owner. */
  time: { value: number };
  /** Fountain axis in world x/z. */
  center: [number, number];
  sky: string;
  sunDirection: [number, number, number];
  sunColor: string;
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const POOL_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uWave;
uniform float uSpeed;
uniform float uAlphaNear;
uniform float uAlphaGrazing;
uniform vec2 uCenter;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
varying vec3 vNormalW;

vec2 wave(vec2 dir, float k, float w, vec2 p, float t) {
  return dir * cos(dot(dir, p) * k + t * w); // unit slope per wave
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime * uSpeed * 6.0;
  vec2 g = wave(vec2(0.80, 0.60), 3.1, 1.7, p, t)
         + wave(vec2(-0.55, 0.83), 4.3, 2.3, p, t)
         + wave(vec2(0.20, -0.98), 6.7, 3.1, p, t) * 0.5
         + wave(vec2(-0.93, -0.37), 9.1, 4.0, p, t) * 0.35;
  vec3 n = normalize(vNormalW + vec3(-g.x, 0.0, -g.y) * uWave * 0.55);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  float r = length(p - uCenter);
  vec3 body = mix(uDeep, uShallow, smoothstep(0.0, 2.6, r));
  float caustic = sin(p.x * 5.0 + t * 1.3 + sin(p.y * 4.0 - t) * 1.5) * sin(p.y * 5.3 - t * 1.1 + sin(p.x * 3.7 + t) * 1.5);
  body += uShallow * 0.18 * pow(0.5 + 0.5 * caustic, 3.0);
  vec3 col = mix(body, uSky, fres);
  vec3 h = normalize(uSunDir + v);
  col += uSunColor * pow(max(dot(n, h), 0.0), 220.0) * 2.5;
  gl_FragColor = vec4(col, mix(uAlphaNear, uAlphaGrazing, fres));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const STREAM_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uDensity;
uniform float uFall;
uniform float uAlpha;
uniform float uFoam;
uniform vec2 uCenter;
uniform vec3 uColor;
uniform vec3 uFoamColor;
uniform vec3 uSky;
varying vec3 vWorld;
varying vec3 vNormalW;

float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 rel = vWorld.xz - uCenter;
  float lane = floor(atan(rel.y, rel.x) * 7.6394); // 48 lanes around the axis
  float phase = hash1(lane);
  float along = vWorld.y * uDensity + uTime * uFall * uDensity * (0.8 + 0.4 * phase) + phase * 7.0;
  float streak = pow(clamp(1.0 - abs(fract(along) - 0.5) * 2.0, 0.0, 1.0), 3.0);
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - abs(dot(normalize(vNormalW), v)), 2.0);
  vec3 col = mix(uColor, uFoamColor, clamp(streak * 0.7 + uFoam, 0.0, 1.0)) + uSky * rim * 0.25;
  float a = clamp(uAlpha * (0.45 + 0.55 * streak) + rim * 0.2, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const linear = (hex: string) => new THREE.Color(hex);

function base(name: string, uniforms: Record<string, THREE.IUniform>, fragmentShader: string) {
  return new THREE.ShaderMaterial({
    name,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    vertexShader: VERTEX,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/** UniformsUtils.merge clones values, so the shared clock is re-attached by reference. */
function withClock(material: THREE.ShaderMaterial, time: { value: number }) {
  material.uniforms.uTime = time;
  return material;
}

export function waterMaterial(kind: WaterKind, ctx: WaterContext, sourceName: string): THREE.ShaderMaterial {
  const center = new THREE.Vector2(...ctx.center);
  const sky = linear(ctx.sky);
  if (kind === "pool") {
    const m = base(`${sourceName}#pool`, {
      uTime: ctx.time,
      uWave: { value: WATER_LOOK.waveStrength },
      uSpeed: { value: WATER_LOOK.waveSpeed },
      uAlphaNear: { value: WATER_LOOK.alphaNear },
      uAlphaGrazing: { value: WATER_LOOK.alphaGrazing },
      uCenter: { value: center },
      uShallow: { value: linear(WATER_LOOK.shallow) },
      uDeep: { value: linear(WATER_LOOK.deep) },
      uSky: { value: sky },
      uSunDir: { value: new THREE.Vector3(...ctx.sunDirection) },
      uSunColor: { value: linear(ctx.sunColor) },
    }, POOL_FRAGMENT);
    // The pool is only ever seen from above; back faces would double the fresnel sheet.
    m.side = THREE.FrontSide;
    return withClock(m, ctx.time);
  }
  const foam = kind === "foam";
  const m = base(`${sourceName}#${kind}`, {
    uTime: ctx.time,
    uDensity: { value: WATER_LOOK.streakDensity * (foam ? 2 : 1) },
    uFall: { value: WATER_LOOK.fallSpeed * (foam ? -0.6 : 1) },
    uAlpha: { value: foam ? 0.7 : 0.6 },
    uFoam: { value: foam ? 0.55 : 0 },
    uCenter: { value: center },
    uColor: { value: linear(WATER_LOOK.shallow) },
    uFoamColor: { value: linear(WATER_LOOK.foam) },
    uSky: { value: sky },
  }, STREAM_FRAGMENT);
  return withClock(m, ctx.time);
}

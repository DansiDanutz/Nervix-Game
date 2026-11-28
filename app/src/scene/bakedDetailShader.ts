/**
 * GLSL for the baked-surface detail (bakedDetail.ts), injected into a lightmapped
 * MeshBasicMaterial with onBeforeCompile. The bake stays the lighting: relief, macro variation and
 * glaze only modulate it, and no runtime light is evaluated.
 */
import * as THREE from "three";
import { GLAZE, MACRO_PERIODS, RELIEF_MAX, RELIEF_MIN, SUNLIT_HIGH, SUNLIT_LOW, type SurfaceDetail } from "./bakedDetail";

/** Uniforms shared by every detailed material (one sun, one sky). */
export interface DetailShared {
  uDetailSun: { value: THREE.Vector3 };
  uDetailSunColor: { value: THREE.Color };
  uDetailSky: { value: THREE.Color };
}

export function detailShared(sunDirection: readonly [number, number, number], sunColor: string, sky: string): DetailShared {
  return {
    uDetailSun: { value: new THREE.Vector3(...sunDirection).normalize() },
    uDetailSunColor: { value: new THREE.Color(sunColor) },
    uDetailSky: { value: new THREE.Color(sky) },
  };
}

const f = (n: number) => n.toFixed(4);

const VERTEX_DECL = /* glsl */ `
varying vec3 vDetailNormal;
varying vec3 vDetailView;
varying vec3 vDetailWorld;
varying vec2 vDetailUv;
uniform mat3 uDetailUvMatrix;
`;

const VERTEX_BODY = /* glsl */ `
#include <project_vertex>
vec4 detailWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  detailWorld = instanceMatrix * detailWorld;
#endif
vDetailWorld = (modelMatrix * detailWorld).xyz;
vDetailNormal = normalize(normalMatrix * normal);
vDetailView = -mvPosition.xyz;
vDetailUv = (uDetailUvMatrix * vec3(uv, 1.0)).xy;
`;

const FRAGMENT_DECL = /* glsl */ `
varying vec3 vDetailNormal;
varying vec3 vDetailView;
varying vec3 vDetailWorld;
varying vec2 vDetailUv;
uniform vec3 uDetailSun;
uniform vec3 uDetailSunColor;
uniform vec3 uDetailSky;
uniform float uDetailRelief;
uniform float uDetailCavity;
uniform float uDetailMacro;
uniform float uDetailGlaze;
#ifdef DETAIL_RELIEF
  uniform sampler2D uDetailNormalMap;
  uniform vec2 uDetailNormalScale;
#endif

float detailHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float detailNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  float a = mix(detailHash(i), detailHash(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(detailHash(i + vec3(0.0, 1.0, 0.0)), detailHash(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(detailHash(i + vec3(0.0, 0.0, 1.0)), detailHash(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(detailHash(i + vec3(0.0, 1.0, 1.0)), detailHash(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

// three's derivative tangent frame (normal_pars_fragment), local so it never clashes.
mat3 detailFrame(vec3 eyePos, vec3 n, vec2 st) {
  vec3 q0 = dFdx(eyePos);
  vec3 q1 = dFdy(eyePos);
  vec2 st0 = dFdx(st);
  vec2 st1 = dFdy(st);
  vec3 q1perp = cross(q1, n);
  vec3 q0perp = cross(n, q0);
  vec3 t = q1perp * st0.x + q0perp * st1.x;
  vec3 b = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(t, t), dot(b, b));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(t * s, b * s, n);
}
`;

/** Runs after the bake has been multiplied into indirectDiffuse (lightMapTexel is in scope). */
const MODULATE = /* glsl */ `
reflectedLight.indirectDiffuse *= diffuseColor.rgb;
float detailFace = gl_FrontFacing ? 1.0 : -1.0;
vec3 detailN = normalize(vDetailNormal) * detailFace;
vec3 detailP = detailN;
vec3 detailL = normalize((viewMatrix * vec4(uDetailSun, 0.0)).xyz);
float detailLevel = dot(lightMapTexel.rgb, vec3(0.2126, 0.7152, 0.0722)) * lightMapIntensity * RECIPROCAL_PI;
float detailSunlit = smoothstep(${f(SUNLIT_LOW)}, ${f(SUNLIT_HIGH)}, detailLevel);
#ifdef DETAIL_RELIEF
  mat3 detailTbn = detailFrame(-vDetailView, detailN, vDetailUv);
  detailTbn[0] *= detailFace;
  detailTbn[1] *= detailFace;
  vec3 detailMapN = texture2D(uDetailNormalMap, vDetailUv).xyz * 2.0 - 1.0;
  detailMapN.xy *= uDetailNormalScale;
  detailP = normalize(detailTbn * detailMapN);
  float detailSunTerm = uDetailRelief * detailSunlit * (max(dot(detailP, detailL), 0.0) - max(dot(detailN, detailL), 0.0));
  float detailGroove = uDetailCavity * (1.0 - clamp(dot(detailP, detailN), 0.0, 1.0));
  reflectedLight.indirectDiffuse *= clamp(1.0 + detailSunTerm - detailGroove, ${f(RELIEF_MIN)}, ${f(RELIEF_MAX)});
#endif
#ifdef DETAIL_MACRO
  float detailM = 0.6 * detailNoise(vDetailWorld / ${f(MACRO_PERIODS[0])}) + 0.4 * detailNoise(vDetailWorld / ${f(MACRO_PERIODS[1])} + 17.0);
  float detailV = (detailM - 0.5) * 2.0 * uDetailMacro;
  // Warmer where lighter, cooler where darker, like weathered sandstone.
  reflectedLight.indirectDiffuse *= vec3(1.0 + detailV * 1.1, 1.0 + detailV, 1.0 + detailV * 0.8);
#endif
`;

const GLAZE_ADD = /* glsl */ `
vec3 outgoingLight = reflectedLight.indirectDiffuse;
#ifdef DETAIL_GLAZE
  vec3 detailV3 = normalize(vDetailView);
  vec3 detailH = normalize(detailL + detailV3);
  float detailSpec = pow(max(dot(detailP, detailH), 0.0), ${f(GLAZE.shininess)}) * ${f(GLAZE.highlight)} * detailSunlit;
  float detailRim = pow(1.0 - max(dot(detailP, detailV3), 0.0), 5.0) * ${f(GLAZE.rim)};
  outgoingLight += uDetailGlaze * (uDetailSunColor * detailSpec + uDetailSky * detailRim * max(detailLevel, 0.35));
#endif
`;

function must(source: string, chunk: string, label: string): string {
  if (!source.includes(chunk)) throw new Error(`baked detail: ${label} injection point missing`);
  return source;
}

/**
 * Adds the detail terms to `material` (a lightmapped MeshBasicMaterial this pass created and owns).
 * `normalMap` is the export's normal map, sampled on uv0 with its own texture transform.
 */
export function withBakedDetail(
  material: THREE.MeshBasicMaterial,
  detail: SurfaceDetail,
  shared: DetailShared,
  normalMap: THREE.Texture | null,
  normalScale: THREE.Vector2 | null,
): THREE.MeshBasicMaterial {
  const relief = !!normalMap && (detail.relief > 0 || detail.cavity > 0);
  const defines: Record<string, string> = {};
  if (relief) defines.DETAIL_RELIEF = "";
  if (detail.macro > 0) defines.DETAIL_MACRO = "";
  if (detail.glaze > 0) defines.DETAIL_GLAZE = "";
  if (!Object.keys(defines).length || !material.lightMap) return material;
  if (normalMap?.matrixAutoUpdate) normalMap.updateMatrix();
  const uvMatrix = normalMap ? normalMap.matrix.clone() : new THREE.Matrix3();
  material.defines = { ...(material.defines ?? {}), ...defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, {
      uDetailUvMatrix: { value: uvMatrix },
      uDetailRelief: { value: detail.relief },
      uDetailCavity: { value: detail.cavity },
      uDetailMacro: { value: detail.macro },
      uDetailGlaze: { value: detail.glaze },
      uDetailNormalMap: { value: normalMap },
      uDetailNormalScale: { value: normalScale?.clone() ?? new THREE.Vector2(1, 1) },
    });
    shader.vertexShader = must(shader.vertexShader, "#include <project_vertex>", "vertex")
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}`)
      .replace("#include <project_vertex>", VERTEX_BODY);
    const fragment = must(must(shader.fragmentShader, "reflectedLight.indirectDiffuse *= diffuseColor.rgb;", "modulate"), "vec3 outgoingLight = reflectedLight.indirectDiffuse;", "glaze");
    shader.fragmentShader = fragment
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`)
      .replace("reflectedLight.indirectDiffuse *= diffuseColor.rgb;", MODULATE)
      .replace("vec3 outgoingLight = reflectedLight.indirectDiffuse;", GLAZE_ADD);
  };
  material.customProgramCacheKey = () => `baked-detail:${Object.keys(defines).sort().join(",")}`;
  material.needsUpdate = true;
  return material;
}

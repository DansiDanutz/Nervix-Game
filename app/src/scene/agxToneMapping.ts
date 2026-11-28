/**
 * Runtime side of agxLook.ts: Blender's AgX - Punchy as three's CustomToneMapping, plus the
 * matching composer output pass.
 *
 * - installAgxPunchy() swaps three's placeholder `CustomToneMapping` (the documented hook, see three's
 *   webgl_tonemapping example) for AgX + Punchy. Only renderers whose toneMapping is
 *   CustomToneMapping use it, so other places (salon, houses) keep their own view.
 * - agxOutputPass() replaces OutputPass in the arrival composer: it tone maps the HDR target with the
 *   same GLSL and applies the sRGB transfer itself, so it does not depend on OutputPass supporting
 *   CustomToneMapping.
 */
import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { agxGlsl } from "./agxLook";

const PLACEHOLDER = "vec3 CustomToneMapping( vec3 color ) { return color; }";
let installed: boolean | null = null;

/** Idempotent. Returns false (and the caller should fall back to AgX) if three's chunk changed shape. */
export function installAgxPunchy(): boolean {
  if (installed !== null) return installed;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const source = chunks.tonemapping_pars_fragment;
  if (!source.includes(PLACEHOLDER)) {
    console.warn("[arrival] three's CustomToneMapping hook not found; using AgX without the Punchy look");
    installed = false;
    return installed;
  }
  chunks.tonemapping_pars_fragment = source.replace(
    PLACEHOLDER,
    `${agxGlsl("punchy")}\nvec3 CustomToneMapping( vec3 color ) { return nervixAgx( color * toneMappingExposure ); }`,
  );
  installed = true;
  return installed;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
varying vec2 vUv;
${agxGlsl("punchy")}
vec3 nervixSrgbOetf( vec3 c ) {
  return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
}
void main() {
  vec4 texel = texture2D( tDiffuse, vUv );
  gl_FragColor = vec4( nervixSrgbOetf( nervixAgx( texel.rgb * uExposure ) ), texel.a );
}
`;

/** Final composer pass: AgX - Punchy + sRGB. Call `sync(gl)` each frame to follow the exposure. */
export function agxOutputPass(): ShaderPass & { sync: (gl: THREE.WebGLRenderer) => void } {
  const material = new THREE.ShaderMaterial({
    name: "arrival_agx_output",
    uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const pass = new ShaderPass(material) as ShaderPass & { sync: (gl: THREE.WebGLRenderer) => void };
  pass.sync = (gl) => {
    pass.uniforms.uExposure.value = gl.toneMappingExposure;
  };
  return pass;
}

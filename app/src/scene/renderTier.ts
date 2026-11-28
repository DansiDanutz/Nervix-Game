/**
 * GPU vs software rendering tier, from the WebGL renderer string.
 * Software rasterisers (SwiftShader, llvmpipe) run the arrival at ~22-27 fps already, so
 * screen-space effects such as ambient occlusion are enabled only on the GPU tier.
 *
 * No runtime imports: unit-tested with Node type stripping.
 */

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i;

export type RenderTier = "gpu" | "software";

export function renderTier(rendererName: string | null | undefined): RenderTier {
  if (!rendererName) return "software";
  return SOFTWARE.test(rendererName) ? "software" : "gpu";
}

interface GlLike {
  getExtension(name: string): unknown;
  getParameter(p: number): unknown;
  RENDERER: number;
}

/** The unmasked renderer string when the browser exposes it, else the masked one. */
export function rendererName(gl: GlLike): string {
  const info = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
  const name = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof name === "string" ? name : "";
}

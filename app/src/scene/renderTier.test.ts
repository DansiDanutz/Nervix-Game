// Run from app/: node --test src/scene/renderTier.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { renderTier, rendererName } from "./renderTier.ts";

test("software rasterisers are the software tier", () => {
  for (const name of [
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Microsoft Basic Render Driver",
    "Google SwiftShader",
  ]) assert.equal(renderTier(name), "software", name);
});

test("hardware GPUs are the GPU tier", () => {
  for (const name of ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Ultra, Unspecified Version)", "Apple GPU", "NVIDIA GeForce RTX 4070/PCIe/SSE2"])
    assert.equal(renderTier(name), "gpu", name);
});

test("an unknown renderer is treated as software (effects stay off)", () => {
  assert.equal(renderTier(""), "software");
  assert.equal(renderTier(undefined), "software");
});

test("rendererName prefers the unmasked renderer and falls back to RENDERER", () => {
  const unmasked = { RENDERER: 1, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }), getParameter: (p: number) => (p === 2 ? "Apple M2" : "WebKit WebGL") };
  assert.equal(rendererName(unmasked), "Apple M2");
  const masked = { RENDERER: 1, getExtension: () => null, getParameter: (p: number) => (p === 1 ? "WebKit WebGL" : null) };
  assert.equal(rendererName(masked), "WebKit WebGL");
  const broken = { RENDERER: 1, getExtension: () => null, getParameter: () => null };
  assert.equal(rendererName(broken), "");
});

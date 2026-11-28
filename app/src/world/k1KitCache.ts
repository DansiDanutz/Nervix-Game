/**
 * One shared K1 manifest load for every skinned avatar (C7): the first caller fetches and parses
 * kits/k1/manifest.json, everyone after reuses the same promise and the same frozen kit. A failed
 * fetch or an invalid manifest is not cached, so a later avatar retries.
 *
 * No runtime imports (unit-tested with Node type stripping): fetch and the parser are injected.
 * world3d/k1Dress.ts wires it to window.fetch and locomotionKit.parseK1Kit.
 */

export interface ManifestResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchManifest = (url: string) => Promise<ManifestResponse>;

export function createK1KitLoader<Kit>(kitDir: string, fetchImpl: FetchManifest, parse: (json: unknown) => Kit): () => Promise<Kit> {
  let cached: Promise<Kit> | null = null;
  const fetchOnce = async (): Promise<Kit> => {
    const res = await fetchImpl(`${kitDir}/manifest.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.json());
  };
  return () => {
    if (!cached) {
      cached = fetchOnce().catch((error: unknown) => {
        cached = null;
        throw error;
      });
    }
    return cached;
  };
}

// Single source of truth: the pinned manifest the build script verifies the model files against.
// Bundling it means sizes and sha256 hashes ship inside the app (security rule 5) and no registry is fetched at runtime.
import manifest from '../../../../scripts/translation-models.manifest.json';
import type { BergamotModelFile, BergamotModelPart, BergamotRegistry, BergamotRegistryKey } from './model-fetch';

const REGISTRY_KEYS: readonly BergamotRegistryKey[] = ['enpt', 'pten'];
const MODEL_PARTS: readonly BergamotModelPart[] = ['model', 'lex', 'vocab'];

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Registry with names relative to the models base URL, in the format `scripts/fetch-translation-models.mjs` writes. */
export const BUNDLED_MODEL_REGISTRY: BergamotRegistry = Object.fromEntries(
  REGISTRY_KEYS.map((key) => [
    key,
    Object.fromEntries(
      MODEL_PARTS.map((part): [BergamotModelPart, BergamotModelFile] => {
        const file = manifest.pairs[key][part];
        return [
          part,
          {
            name: `${key}/${basename(file.path)}`,
            size: file.size,
            expectedSha256Hash: file.sha256,
            rawSize: file.rawSize,
            rawSha256Hash: file.rawSha256,
          },
        ];
      }),
    ),
  ]),
) as BergamotRegistry;

/** The bundled registry with every file name resolved to an absolute URL under `baseUrl`. */
export function modelRegistry(baseUrl: string): BergamotRegistry {
  const resolved = {} as BergamotRegistry;
  for (const key of REGISTRY_KEYS) {
    const files = {} as Record<BergamotModelPart, BergamotModelFile>;
    for (const part of MODEL_PARTS) {
      const file = BUNDLED_MODEL_REGISTRY[key][part];
      files[part] = { ...file, name: new URL(file.name, baseUrl).href };
    }
    resolved[key] = files;
  }
  return resolved;
}

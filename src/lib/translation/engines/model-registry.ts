import manifest from '../../../../scripts/translation-models.manifest.json';
import type { BergamotModelFile, BergamotModelPart, BergamotRegistry, BergamotRegistryKey } from './model-fetch';

const REGISTRY_KEYS: readonly BergamotRegistryKey[] = ['enpt', 'pten'];
const MODEL_PARTS: readonly BergamotModelPart[] = ['model', 'lex', 'vocab'];

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

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

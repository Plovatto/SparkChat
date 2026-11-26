import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = resolve(root, 'src/features/assistant/look-catalog.json');

function readJson(relative) {
  return JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
}

export async function buildCatalog() {
  const { THEME_BASES } = await import('../src/features/theme/constants/theme-bases.ts');
  const { COLOR_THEMES } = await import('../src/features/theme/constants/color-themes.ts');
  const { CHAT_BACKGROUNDS } = await import('../src/features/theme/constants/chat-backgrounds.ts');
  const { APPEARANCE_RANGES } = await import('../src/features/theme/constants/chat-appearance.ts');
  const pt = readJson('src/locales/pt/themes.json');
  const en = readJson('src/locales/en/themes.json');

  const bases = Object.keys(THEME_BASES).map((id) => ({ id, name: pt.bases[id] }));
  const colors = Object.values(COLOR_THEMES).map((theme) => ({
    id: theme.id,
    namePt: pt.colors[theme.id],
    nameEn: en.colors[theme.id],
    accent: theme.dark.accent,
    tint: theme.dark.tint,
    gradient: theme.dark.gradient ?? null,
  }));
  const wallpapers = CHAT_BACKGROUNDS.map((background) => ({
    id: background.id,
    namePt: pt.wallpapers[background.id],
    nameEn: en.wallpapers[background.id],
    kind: background.background === null ? 'none' : background.isImage ? 'image' : 'gradient',
  }));
  const appearanceRanges = Object.fromEntries(Object.entries(APPEARANCE_RANGES).map(([field, range]) => [field, [...range]]));

  return { bases, colors, wallpapers, appearanceRanges };
}

export function serializeCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const serialized = serializeCatalog(await buildCatalog());
  if (args.includes('--stdout')) {
    process.stdout.write(serialized);
    return;
  }
  const targets = [defaultOut];
  const outIndex = args.indexOf('--out');
  if (outIndex !== -1) {
    const target = args[outIndex + 1];
    if (!target) {
      throw new Error('--out requires a path');
    }
    targets.push(resolve(process.cwd(), target));
  }
  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serialized);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

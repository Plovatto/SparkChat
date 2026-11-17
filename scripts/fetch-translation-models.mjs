// Fetches the pinned Mozilla pt<->en translation models and copies the Bergamot
// runtime into public/. Every file is verified by sha256; nothing here is committed.
// The app's model registry is bundled from the manifest (src/lib/translation/engines/model-registry.ts), so no
// registry file is written here.
//
// `--dev` (predev): a failure is a warning and the script exits 0, so the dev server still starts offline (the
// Bergamot fallback just won't work). Without it (prebuild, CI) any failure exits 1.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, verifyModelFile } from './translation-model-verify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(join(root, 'scripts', 'translation-models.manifest.json'), 'utf8'),
);
const modelsDir = join(root, 'public', 'translation-models', manifest.version);
const runtimeDir = join(root, 'public', 'bergamot');
const runtimeSrc = join(root, 'node_modules', '@mkljczk', 'bergamot-translator', 'worker');
const devMode = process.argv.includes('--dev');
const DOWNLOAD_TIMEOUT_MS = 60_000;

async function hasHash(file, expected) {
  if (!existsSync(file)) return false;
  return sha256(await readFile(file)) === expected;
}

async function writeAtomic(file, buf) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, buf);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function fail(message) {
  if (devMode) {
    console.warn(`[translation-models] warning: ${message}; continuing without the translation fallback models`);
    process.exit(0);
  }
  console.error(`[translation-models] ${message}`);
  process.exit(1);
}

let downloaded = 0;

for (const [pair, files] of Object.entries(manifest.pairs)) {
  const dir = join(modelsDir, pair);
  await mkdir(dir, { recursive: true });
  for (const entry of Object.values(files)) {
    const name = basename(entry.path);
    const target = join(dir, name);
    // Existing files are re-verified too (compressed and, after gunzip, raw hashes), so the manifest stays checked.
    const existing = existsSync(target) ? await readFile(target) : null;
    if (!existing || verifyModelFile(existing, entry) !== null) {
      const url = `${manifest.sourceBaseUrl}/${entry.path}`;
      console.log(`[translation-models] downloading ${pair}/${name}`);
      let buf;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!res.ok) fail(`HTTP ${res.status} for ${url}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        fail(`download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
      const problem = verifyModelFile(buf, entry);
      if (problem) fail(`${problem} for ${pair}/${name}`);
      await writeAtomic(target, buf);
      downloaded++;
    }
  }
}

// Left over by earlier versions of this script; nothing reads it.
await rm(join(modelsDir, 'registry.json'), { force: true });

await mkdir(runtimeDir, { recursive: true });
for (const [file, expected] of Object.entries(manifest.runtime)) {
  const src = join(runtimeSrc, file);
  if (!existsSync(src)) fail(`runtime file missing in node_modules: ${file} (run npm ci)`);
  if (sha256(await readFile(src)) !== expected) {
    fail(`sha256 mismatch for runtime ${file}; review the package update and the manifest`);
  }
  const target = join(runtimeDir, file);
  if (await hasHash(target, expected)) continue;
  const tmp = `${target}.${process.pid}.tmp`;
  await copyFile(src, tmp);
  await rename(tmp, target);
  downloaded++;
}

if (downloaded === 0) {
  console.log('[translation-models] up to date');
} else {
  console.log(`[translation-models] done (${downloaded} file(s) written)`);
}

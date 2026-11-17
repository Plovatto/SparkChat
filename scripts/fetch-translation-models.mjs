// Fetches the pinned Mozilla pt<->en translation models and copies the Bergamot
// runtime into public/. Every file is verified by sha256; nothing here is committed.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(join(root, 'scripts', 'translation-models.manifest.json'), 'utf8'),
);
const modelsDir = join(root, 'public', 'translation-models', manifest.version);
const runtimeDir = join(root, 'public', 'bergamot');
const runtimeSrc = join(root, 'node_modules', '@mkljczk', 'bergamot-translator', 'worker');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

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
  console.error(`[translation-models] ${message}`);
  process.exit(1);
}

let downloaded = 0;
const registry = {};

for (const [pair, files] of Object.entries(manifest.pairs)) {
  const dir = join(modelsDir, pair);
  await mkdir(dir, { recursive: true });
  registry[pair] = {};
  for (const [kind, entry] of Object.entries(files)) {
    const name = basename(entry.path);
    const target = join(dir, name);
    if (!(await hasHash(target, entry.sha256))) {
      const url = `${manifest.sourceBaseUrl}/${entry.path}`;
      console.log(`[translation-models] downloading ${pair}/${name}`);
      let buf;
      try {
        const res = await fetch(url);
        if (!res.ok) fail(`HTTP ${res.status} for ${url}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        fail(`download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (sha256(buf) !== entry.sha256) fail(`sha256 mismatch for ${pair}/${name}`);
      if (buf.length !== entry.size) fail(`size mismatch for ${pair}/${name}`);
      await writeAtomic(target, buf);
      downloaded++;
    }
    registry[pair][kind] = {
      name: `${pair}/${name}`,
      size: entry.size,
      expectedSha256Hash: entry.sha256,
    };
  }
}

await writeAtomic(join(modelsDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');

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
  const total = (await stat(join(modelsDir, 'registry.json'))).size;
  console.log(`[translation-models] done (${downloaded} file(s) written, registry ${total} bytes)`);
}

// Verifies a downloaded model file against its manifest entry: the compressed bytes (size + sha256)
// and, after gunzip, the uncompressed bytes (rawSize + rawSha256) the browser may receive when a
// server decodes `Content-Encoding: gzip`. Returns an error message, or null when the file is valid.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function verifyModelFile(buf, entry) {
  if (buf.length !== entry.size) return 'size mismatch';
  if (sha256(buf) !== entry.sha256) return 'sha256 mismatch';
  let raw;
  try {
    raw = gunzipSync(buf);
  } catch {
    return 'not a valid gzip file';
  }
  if (raw.length !== entry.rawSize) return 'raw size mismatch';
  if (sha256(raw) !== entry.rawSha256) return 'raw sha256 mismatch';
  return null;
}

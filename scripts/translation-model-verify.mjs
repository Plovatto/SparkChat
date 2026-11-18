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

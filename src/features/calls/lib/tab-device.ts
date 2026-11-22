const STORAGE_KEY = 'sparkchat:call-tab-device';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

let memoryToken: string | null = null;

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readStorage(storage: Storage | null): string | null {
  try {
    const value = storage?.getItem(STORAGE_KEY) ?? null;
    return value && TOKEN_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function tabDeviceToken(storage: Storage | null = sessionStore()): string {
  const stored = readStorage(storage);
  if (stored) {
    memoryToken = stored;
    return stored;
  }
  const token = memoryToken ?? randomToken();
  memoryToken = token;
  try {
    storage?.setItem(STORAGE_KEY, token);
  } catch {
    return token;
  }
  return token;
}

export function resetTabDeviceForTests(): void {
  memoryToken = null;
}

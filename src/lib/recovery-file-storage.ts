import { base64ToBytes, downloadBytes } from './download-file';

const DB_NAME = 'sparkchat-recovery-files';
const STORE_NAME = 'handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function getStoredHandle(userId: string): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(userId);
      request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
  } catch {
    return null;
  }
}

async function setStoredHandle(userId: string, handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(handle, userId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
  } catch {
    return;
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

async function hasReadWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if ((await handle.queryPermission(descriptor)) === 'granted') {
    return true;
  }
  return (await handle.requestPermission(descriptor)) === 'granted';
}

async function tryRename(handle: FileSystemFileHandle, filename: string): Promise<boolean> {
  if (typeof handle.move !== 'function') {
    return false;
  }
  try {
    await handle.move(filename);
    return true;
  } catch {
    return false;
  }
}

async function tryOverwrite(handle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>, filename: string): Promise<boolean> {
  try {
    if (!(await hasReadWritePermission(handle))) {
      return false;
    }
    if (handle.name !== filename && !(await tryRename(handle, filename))) {
      return false;
    }
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function ensureAutoSavePermission(userId: string): Promise<boolean> {
  if (!isFileSystemAccessSupported()) {
    return false;
  }

  const handle = await getStoredHandle(userId);
  if (!handle) {
    return false;
  }

  return hasReadWritePermission(handle);
}

export async function tryAutoOverwrite(base64: string, filename: string, userId: string): Promise<boolean> {
  if (!isFileSystemAccessSupported()) {
    return false;
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return false;
  }

  const handle = await getStoredHandle(userId);
  if (!handle) {
    return false;
  }

  return tryOverwrite(handle, bytes, filename);
}

export async function saveRecoveryFileWithPicker(base64: string, filename: string, userId: string): Promise<boolean> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return false;
  }

  if (!isFileSystemAccessSupported()) {
    downloadBytes(bytes, filename);
    return true;
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'Arquivo de recuperação SparkChat', accept: { 'application/octet-stream': ['.sparkkey'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    await setStoredHandle(userId, handle);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    downloadBytes(bytes, filename);
    return true;
  }
}

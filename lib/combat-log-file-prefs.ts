const DB_NAME = 'raidflow-combat-log';
const DB_VERSION = 1;
const STORE = 'handles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function storageKey(userId: string): string {
  return `raidflow-combat-log-meta:${userId.trim()}`;
}

export interface CombatLogFileMeta {
  fileName: string;
  lastUsedAt: string;
}

export function getCombatLogFileMeta(userId: string): CombatLogFileMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const j = JSON.parse(raw) as CombatLogFileMeta;
    if (!j?.fileName) return null;
    return j;
  } catch {
    return null;
  }
}

export function setCombatLogFileMeta(userId: string, fileName: string): void {
  if (typeof window === 'undefined') return;
  const meta: CombatLogFileMeta = {
    fileName,
    lastUsedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(storageKey(userId), JSON.stringify(meta));
}

async function saveFileHandle(userId: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).put(handle, userId.trim());
  });
}

async function loadFileHandle(userId: string): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    return await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      const req = tx.objectStore(STORE).get(userId.trim());
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function readHandleFile(handle: FileSystemFileHandle): Promise<File | null> {
  let perm = await handle.queryPermission({ mode: 'read' });
  if (perm !== 'granted') {
    perm = await handle.requestPermission({ mode: 'read' });
  }
  if (perm !== 'granted') return null;
  return handle.getFile();
}

export function supportsCombatLogFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/** Opens stored file when possible; otherwise native file picker. */
export async function pickCombatLogFile(userId: string): Promise<File | null> {
  if (typeof window === 'undefined') return null;

  if (supportsCombatLogFilePicker()) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'WoW Combat Log',
            accept: { 'text/plain': ['.txt'] },
          },
        ],
        multiple: false,
      });
      await saveFileHandle(userId, handle);
      const file = await handle.getFile();
      setCombatLogFileMeta(userId, file.name);
      return file;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      if (file) setCombatLogFileMeta(userId, file.name);
      resolve(file);
    };
    input.click();
  });
}

export async function openStoredCombatLogFile(userId: string): Promise<File | null> {
  const handle = await loadFileHandle(userId);
  if (!handle) return null;
  const file = await readHandleFile(handle);
  if (file) setCombatLogFileMeta(userId, file.name);
  return file;
}

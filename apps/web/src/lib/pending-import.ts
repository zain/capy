import { importSchema, type EquityImport } from "@capy/equity";
const POINTER = "capy.pending-import";
const MAX_AGE = 24 * 60 * 60 * 1000;
export type PendingImport = {
  data: EquityImport;
  filename: string;
  ownerId?: string;
  expiresAt: number;
};
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("capy-import-preview", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("drafts");
      store.createIndex("expiresAt", "expiresAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Your browser couldn’t save this preview. Please enable site storage and try again.",
        ),
      );
  });
}
async function useStore<T>(
  operation: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("Your preview couldn’t be saved. Please try again."));
    };
    tx.onabort = tx.onerror;
    operation(tx.objectStore("drafts"), (next) => {
      value = next;
    });
  });
}
export async function savePendingImport(data: EquityImport, filename: string) {
  const key = sessionStorage.getItem(POINTER) || crypto.randomUUID();
  await useStore<void>((store, done) => {
    const expired = store.index("expiresAt").openCursor(IDBKeyRange.upperBound(Date.now()));
    expired.onsuccess = () => {
      const cursor = expired.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    store.put({ data, filename, expiresAt: Date.now() + MAX_AGE } satisfies PendingImport, key);
    done(undefined);
  });
  sessionStorage.setItem(POINTER, key);
}
export async function loadPendingImport(userId: string): Promise<PendingImport | null> {
  const key = sessionStorage.getItem(POINTER);
  if (!key) return null;
  return useStore<PendingImport | null>((store, done) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const value = request.result as PendingImport | undefined;
      if (!value || value.expiresAt <= Date.now() || (value.ownerId && value.ownerId !== userId)) {
        store.delete(key);
        sessionStorage.removeItem(POINTER);
        done(null);
        return;
      }
      const parsed = importSchema.safeParse(value.data);
      if (!parsed.success) {
        store.delete(key);
        sessionStorage.removeItem(POINTER);
        done(null);
        return;
      }
      const bound = { ...value, data: parsed.data, ownerId: userId };
      store.put(bound, key);
      done(bound);
    };
  });
}
export async function clearPendingImport() {
  const key = sessionStorage.getItem(POINTER);
  sessionStorage.removeItem(POINTER);
  if (key)
    await useStore<void>((store, done) => {
      store.delete(key);
      done(undefined);
    });
}

export function hasPendingImport() {
  try {
    return !!sessionStorage.getItem(POINTER);
  } catch {
    return false;
  }
}

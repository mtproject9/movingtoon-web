import type { TrashEntry } from "./types";

// 휴지통도 Blob(캐릭터/시리즈에 딸려오는 참조 이미지 원본)을 담을 수 있어
// localStorage가 아닌 IndexedDB에 별도 DB로 보관한다.
const DB_NAME = "movingtoon-trash";
const DB_VERSION = 1;
const TRASH_STORE = "trash";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRASH_STORE)) {
        db.createObjectStore(TRASH_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function addTrashEntry(entry: TrashEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TRASH_STORE, "readwrite");
  tx.objectStore(TRASH_STORE).put(entry);
  await promisifyTx(tx);
}

export async function addTrashEntries(entries: TrashEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(TRASH_STORE, "readwrite");
  const store = tx.objectStore(TRASH_STORE);
  for (const entry of entries) store.put(entry);
  await promisifyTx(tx);
}

export async function listTrashEntries(): Promise<TrashEntry[]> {
  const db = await openDb();
  const tx = db.transaction(TRASH_STORE, "readonly");
  const results = await promisifyRequest(tx.objectStore(TRASH_STORE).getAll());
  return (results as TrashEntry[]).sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function removeTrashEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(TRASH_STORE, "readwrite");
  const store = tx.objectStore(TRASH_STORE);
  for (const id of ids) store.delete(id);
  await promisifyTx(tx);
}

export async function clearTrashEntries(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(TRASH_STORE, "readwrite");
  tx.objectStore(TRASH_STORE).clear();
  await promisifyTx(tx);
}

import type { Cut } from "./types";

// localStorage는 용량 제한/사생활 보호 모드 등에서 조용히 비워질 수 있어, 회차별 작업
// 데이터(컷 목록 + 원고 텍스트)를 IndexedDB에도 동일하게 미러링해 둔다 — 하이드레이션 시
// localStorage가 비어 있으면 이 저장소에서 마지막 저장 상태를 복구한다.
const DB_NAME = "movingtoon-cuts";
const DB_VERSION = 1;
const CUTS_STORE = "cuts";

export interface EpisodeDraft {
  cuts: Cut[];
  scriptText: string;
}

interface EpisodeDraftRecord extends EpisodeDraft {
  episodeId: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUTS_STORE)) {
        db.createObjectStore(CUTS_STORE, { keyPath: "episodeId" });
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

export async function saveEpisodeDraftToDb(episodeId: string, draft: EpisodeDraft): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CUTS_STORE, "readwrite");
  const record: EpisodeDraftRecord = { episodeId, ...draft, updatedAt: Date.now() };
  tx.objectStore(CUTS_STORE).put(record);
  await promisifyTx(tx);
}

export async function loadEpisodeDraftFromDb(episodeId: string): Promise<EpisodeDraft | null> {
  const db = await openDb();
  const tx = db.transaction(CUTS_STORE, "readonly");
  const result = await promisifyRequest<EpisodeDraftRecord | undefined>(
    tx.objectStore(CUTS_STORE).get(episodeId)
  );
  if (!result) return null;
  return { cuts: result.cuts, scriptText: result.scriptText ?? "" };
}

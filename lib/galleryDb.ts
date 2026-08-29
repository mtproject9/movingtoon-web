import type { GalleryImageMeta } from "./types";

// 캐릭터 참조 이미지(최대 100장, 고화질)는 localStorage 용량을 쉽게 초과하므로
// IndexedDB에 저장한다. 목록/그리드 렌더링은 작은 썸네일만 읽는 "thumbnails" 스토어를
// 쓰고, 라이트박스·다운로드처럼 실제로 원본이 필요할 때만 "originals" 스토어에서
// 개별 조회한다 — 100장을 한 번에 메모리에 올리지 않기 위한 핵심 설계.
const DB_NAME = "movingtoon-gallery";
const DB_VERSION = 1;
const THUMB_STORE = "thumbnails";
const ORIGINAL_STORE = "originals";
const CHARACTER_INDEX = "characterId";

export const MAX_GALLERY_IMAGES = 100;
const THUMBNAIL_MAX_SIZE = 320;

interface OriginalRecord {
  id: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THUMB_STORE)) {
        const store = db.createObjectStore(THUMB_STORE, { keyPath: "id" });
        store.createIndex(CHARACTER_INDEX, "characterId", { unique: false });
      }
      if (!db.objectStoreNames.contains(ORIGINAL_STORE)) {
        db.createObjectStore(ORIGINAL_STORE, { keyPath: "id" });
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

function makeId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function createThumbnail(
  file: File
): Promise<{ blob: Blob; originalWidth: number; originalHeight: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("썸네일 생성에 실패했습니다."))),
        "image/jpeg",
        0.85
      );
    });

    return { blob, originalWidth: bitmap.width, originalHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** 파일 배열을 캐릭터 갤러리에 추가한다. 호출 전에 100장 제한을 직접 확인해서 넘길 것. */
export async function addGalleryImages(
  characterId: string,
  files: File[]
): Promise<GalleryImageMeta[]> {
  const db = await openDb();
  const created: GalleryImageMeta[] = [];

  for (const [i, file] of files.entries()) {
    const { blob: thumbnailBlob, originalWidth, originalHeight } = await createThumbnail(file);
    const id = makeId();
    const meta: GalleryImageMeta = {
      id,
      characterId,
      fileName: file.name,
      thumbnailBlob,
      originalWidth,
      originalHeight,
      order: Date.now() + i,
      createdAt: Date.now(),
    };

    const tx = db.transaction([THUMB_STORE, ORIGINAL_STORE], "readwrite");
    tx.objectStore(THUMB_STORE).put(meta);
    tx.objectStore(ORIGINAL_STORE).put({ id, blob: file } satisfies OriginalRecord);
    await promisifyTx(tx);

    created.push(meta);
  }

  return created;
}

/** 휴지통 복원 전용: 새 썸네일을 만들지 않고 지웠던 레코드를 그대로 되살린다. */
export async function restoreGalleryImage(meta: GalleryImageMeta, originalBlob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([THUMB_STORE, ORIGINAL_STORE], "readwrite");
  tx.objectStore(THUMB_STORE).put(meta);
  tx.objectStore(ORIGINAL_STORE).put({ id: meta.id, blob: originalBlob } satisfies OriginalRecord);
  await promisifyTx(tx);
}

export async function listGalleryImages(characterId: string): Promise<GalleryImageMeta[]> {
  const db = await openDb();
  const tx = db.transaction(THUMB_STORE, "readonly");
  const index = tx.objectStore(THUMB_STORE).index(CHARACTER_INDEX);
  const results = await promisifyRequest(index.getAll(characterId));
  return (results as GalleryImageMeta[]).sort((a, b) => a.order - b.order);
}

export async function getOriginalImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(ORIGINAL_STORE, "readonly");
  const record = (await promisifyRequest(
    tx.objectStore(ORIGINAL_STORE).get(id)
  )) as OriginalRecord | undefined;
  return record?.blob ?? null;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([THUMB_STORE, ORIGINAL_STORE], "readwrite");
  tx.objectStore(THUMB_STORE).delete(id);
  tx.objectStore(ORIGINAL_STORE).delete(id);
  await promisifyTx(tx);
}

export async function deleteGalleryImagesForCharacter(characterId: string): Promise<void> {
  const images = await listGalleryImages(characterId);
  const db = await openDb();
  const tx = db.transaction([THUMB_STORE, ORIGINAL_STORE], "readwrite");
  for (const image of images) {
    tx.objectStore(THUMB_STORE).delete(image.id);
    tx.objectStore(ORIGINAL_STORE).delete(image.id);
  }
  await promisifyTx(tx);
}

/** 백업 복원(덮어쓰기) 전 기존 갤러리 전체를 비운다. 이미 열린 연결을 그대로 써서
 *  indexedDB.deleteDatabase()처럼 다른 연결에 의해 블로킹될 위험이 없다. */
export async function clearAllGalleryData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([THUMB_STORE, ORIGINAL_STORE], "readwrite");
  tx.objectStore(THUMB_STORE).clear();
  tx.objectStore(ORIGINAL_STORE).clear();
  await promisifyTx(tx);
}

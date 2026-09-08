import type { GalleryImageMeta } from "./types";

// 캐릭터 참조 이미지(최대 100장, 고화질)는 서버(Postgres 메타데이터 + Vercel Blob 파일)에
// 저장한다 — 예전엔 브라우저 IndexedDB에만 저장해 다른 기기/브라우저에서는 안 보였는데,
// 어디서 접속하든 똑같이 보이도록 여기서 서버 API를 거치게 바꿨다.
export const MAX_GALLERY_IMAGES = 100;
const THUMBNAIL_MAX_SIZE = 320;

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
  const created: GalleryImageMeta[] = [];

  for (const [i, file] of files.entries()) {
    const { blob: thumbnailBlob, originalWidth, originalHeight } = await createThumbnail(file);

    const form = new FormData();
    form.append("characterId", characterId);
    form.append("file", file);
    form.append("thumbnail", thumbnailBlob, "thumb.jpg");
    const uploadRes = await fetch("/api/gallery-images/upload", { method: "POST", body: form });
    if (!uploadRes.ok) throw new Error("이미지 업로드에 실패했습니다.");
    const { fileUrl, thumbnailUrl } = (await uploadRes.json()) as {
      fileUrl: string;
      thumbnailUrl: string;
    };

    const meta: GalleryImageMeta = {
      id: makeId(),
      characterId,
      fileName: file.name,
      thumbnailUrl,
      fileUrl,
      originalWidth,
      originalHeight,
      order: Date.now() + i,
      createdAt: Date.now(),
    };

    await fetch("/api/db/gallery-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });

    created.push(meta);
  }

  return created;
}

/** 휴지통 복원 전용: 파일은 이미 Blob에 그대로 남아있으므로 메타데이터 행만 되살린다. */
export async function restoreGalleryImage(meta: GalleryImageMeta): Promise<void> {
  await fetch("/api/db/gallery-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
}

export async function listGalleryImages(characterId: string): Promise<GalleryImageMeta[]> {
  const res = await fetch(`/api/db/gallery-images?characterId=${encodeURIComponent(characterId)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { images: GalleryImageMeta[] };
  return data.images.sort((a, b) => a.order - b.order);
}

/** 다운로드/ZIP처럼 실제 원본 바이트가 필요할 때만 원본 URL을 가져온다. */
export async function getOriginalImageBlob(fileUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function deleteGalleryImage(id: string): Promise<void> {
  await fetch(`/api/db/gallery-images/${id}`, { method: "DELETE" });
}

export async function deleteGalleryImagesForCharacter(characterId: string): Promise<void> {
  await fetch(`/api/db/gallery-images?characterId=${encodeURIComponent(characterId)}`, {
    method: "DELETE",
  });
}

/** 백업 복원(덮어쓰기) 전 기존 갤러리 메타데이터 행 전체를 비운다. */
export async function clearAllGalleryData(): Promise<void> {
  await fetch("/api/db/gallery-images", { method: "DELETE" });
}

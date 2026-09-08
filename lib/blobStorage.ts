import { del, put } from "@vercel/blob";

export function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function extFromName(name: string, fallback: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

export function makeFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** file/blob을 Vercel Blob에 올리고, 어디서든 접근 가능한 공개 URL을 돌려준다. */
export async function uploadToBlob(
  pathPrefix: string,
  fileId: string,
  data: File | Blob,
  originalName: string,
  suffix = "",
  extFallback = "bin"
): Promise<string> {
  const ext = extFromName(originalName, extFallback);
  const key = `${pathPrefix}/${fileId}${suffix}.${ext}`;
  // token을 명시하지 않으면 SDK가 VERCEL_OIDC_TOKEN을 우선 쓰려 하는데, 그 토큰은
  // "development" 환경(로컬 개발 서버)에서는 Blob 접근 권한이 없어 실패한다. 또한
  // 이 프로젝트의 원래 Blob 저장소(BLOB_READ_WRITE_TOKEN)는 비공개(Private)로 만들어져
  // access:"public" 업로드 자체가 거부된다 — 공개(Public)로 새로 만든 저장소의
  // PUBLIC_BLOB_READ_WRITE_TOKEN을 명시해 로컬/배포 어디서든 같은 방식으로 인증한다.
  const result = await put(key, data, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN,
  });
  return result.url;
}

/** Vercel Blob에 저장된 파일을 지운다. 이미 없어졌거나 blob URL이 아니면 조용히 무시한다. */
export async function deleteFromBlob(url: string | undefined | null): Promise<void> {
  if (!url) return;
  try {
    await del(url, { token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN });
  } catch {
    // 이미 지워졌거나 다른 스토리지의 경로(구버전 /uploads/... 등)면 무시
  }
}

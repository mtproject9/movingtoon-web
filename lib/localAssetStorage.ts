import { mkdir, writeFile } from "fs/promises";
import path from "path";

// 4K 이미지·오디오 에셋 공통 로컬 저장소. public/uploads/<episodeId>/ 아래 파일로
// 저장하고 fileUrl(정적 경로)만 CutAsset에 보관한다. /api/assets/upload(이미지)와
// /api/assets/audio-upload(오디오) 라우트가 이 파일 쓰기 로직을 공유한다.
export const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function extFromName(name: string, fallback: string): string {
  const ext = path.extname(name).toLowerCase().replace(".", "");
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

export function makeFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function resolveSafeEpisodeId(episodeId: string): string | null {
  const safe = sanitizeSegment(episodeId);
  return safe || null;
}

/** episodeId 폴더 아래에 파일을 쓰고 정적 서빙 경로를 돌려준다. */
export async function saveEpisodeFile(
  safeEpisodeId: string,
  fileId: string,
  file: File,
  suffix = "",
  extFallback = "bin"
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, safeEpisodeId);
  await mkdir(dir, { recursive: true });
  const fileName = `${fileId}${suffix}.${extFromName(file.name, extFallback)}`;
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${safeEpisodeId}/${fileName}`;
}

/**
 * "/uploads/..." 정적 경로를 실제 파일시스템 절대 경로로 바꾸면서, resolve 후
 * UPLOAD_ROOT 하위인지 다시 확인해 경로 순회 공격을 막는다. 삭제/읽기/복원 등
 * 기존 파일을 "경로로" 다루는 모든 라우트가 이 검증을 공유한다.
 */
export function resolvePublicPath(relativeUrl: string): string | null {
  if (!relativeUrl.startsWith("/uploads/")) return null;
  const absolute = path.resolve(path.join(process.cwd(), "public", relativeUrl));
  const uploadRootWithSep = UPLOAD_ROOT + path.sep;
  if (absolute !== UPLOAD_ROOT && !absolute.startsWith(uploadRootWithSep)) return null;
  return absolute;
}

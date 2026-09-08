export interface UploadedAsset {
  fileUrl: string;
  thumbnailUrl?: string;
  fileName: string;
}

const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a)$/i;

/** MIME이 브라우저/OS마다 비어 있거나 다르게 잡히는 경우(특히 .m4a)를 대비해
 *  확장자도 함께 확인한다. */
export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

/** 4K 원본(과 있다면 800px 썸네일)을 /api/assets/upload로 올려 서버 로컬 폴더에 저장한다. */
export async function uploadCutAsset(
  episodeId: string,
  file: File,
  thumbnailBlob?: Blob
): Promise<UploadedAsset> {
  const form = new FormData();
  form.append("episodeId", episodeId);
  form.append("file", file);
  if (thumbnailBlob) {
    form.append("thumbnail", thumbnailBlob, "thumb.webp");
  }

  const res = await fetch("/api/assets/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "업로드에 실패했습니다.");
  }
  return (await res.json()) as UploadedAsset;
}

/** 대사 오디오 파일을 /api/assets/audio-upload로 올려 서버 로컬 폴더에 저장한다. */
export async function uploadAudioAsset(episodeId: string, file: File): Promise<UploadedAsset> {
  const form = new FormData();
  form.append("episodeId", episodeId);
  form.append("file", file);

  const res = await fetch("/api/assets/audio-upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "업로드에 실패했습니다.");
  }
  return (await res.json()) as UploadedAsset;
}

/** 백업 복원 전용: 원래 경로 그대로 파일을 되살린다(/api/assets/upload처럼 새 파일명을
 *  만들지 않음) — 이미 CutAsset.fileUrl로 참조 중인 경로의 무결성을 지켜야 하기 때문. */
export async function restoreAssetFile(targetPath: string, blob: Blob): Promise<void> {
  const form = new FormData();
  form.append("path", targetPath);
  form.append("file", blob, targetPath.split("/").pop() || "file");

  const res = await fetch("/api/assets/restore", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "파일 복원에 실패했습니다.");
  }
}

/** 영구 삭제 시 더 이상 참조되지 않는 업로드 파일을 서버에서 정리한다(베스트 에포트).
 *  Vercel Blob의 공개 URL(https://...)만 대상으로 한다 — data URL(구버전 데이터)이나
 *  빈 값은 지울 파일이 없으므로 걸러낸다. */
export async function deleteUploadedFiles(paths: (string | undefined)[]): Promise<void> {
  const targets = paths.filter(
    (p): p is string => typeof p === "string" && /^https?:\/\//.test(p)
  );
  if (targets.length === 0) return;

  try {
    await fetch("/api/assets/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: targets }),
    });
  } catch {
    // 파일 정리 실패는 조용히 무시 — 다음 영구 삭제 때 다시 시도되지 않아도
    // 사용자 데이터 흐름에는 영향이 없다.
  }
}

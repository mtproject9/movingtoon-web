import { NextResponse } from "next/server";
import { makeFileId, sanitizeSegment, uploadToBlob } from "@/lib/blobStorage";

// 캐릭터 참조 이미지 파일(원본 + 320px 썸네일)을 Vercel Blob에 올린다.
// 컷 에셋 업로드(/api/assets/upload)와 같은 패턴이지만 회차가 아니라
// 캐릭터 단위로 경로를 나눈다.
const MAX_FILE_SIZE = 30 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 업로드 요청입니다." }, { status: 400 });
  }

  const characterId = form.get("characterId");
  const file = form.get("file");
  const thumbnail = form.get("thumbnail");

  if (typeof characterId !== "string" || !characterId.trim()) {
    return NextResponse.json({ error: "characterId가 필요합니다." }, { status: 400 });
  }
  const safeCharacterId = sanitizeSegment(characterId);
  if (!safeCharacterId) {
    return NextResponse.json({ error: "잘못된 characterId입니다." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "파일 용량이 너무 큽니다 (최대 30MB)." }, { status: 400 });
  }
  if (!(thumbnail instanceof File)) {
    return NextResponse.json({ error: "썸네일이 없습니다." }, { status: 400 });
  }

  const fileId = makeFileId();
  const fileUrl = await uploadToBlob(`gallery/${safeCharacterId}`, fileId, file, file.name);
  const thumbnailUrl = await uploadToBlob(
    `gallery/${safeCharacterId}`,
    fileId,
    thumbnail,
    "thumb.jpg",
    "_thumb",
    "jpg"
  );

  return NextResponse.json({ fileUrl, thumbnailUrl });
}

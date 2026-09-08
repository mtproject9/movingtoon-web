import { NextResponse } from "next/server";
import {
  deleteFromBlob,
  makeFileId,
  sanitizeSegment,
  uploadToBlob,
} from "@/lib/blobStorage";

// 4K 컷 이미지는 수 MB~수십 MB에 달해 브라우저 localStorage에 넣을 수 없으므로
// Vercel Blob에 저장하고, 화면에는 fileUrl(공개 URL)만 CutAsset에 보관한다.
const MAX_FILE_SIZE = 30 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 업로드 요청입니다." }, { status: 400 });
  }

  const episodeId = form.get("episodeId");
  const file = form.get("file");
  const thumbnail = form.get("thumbnail");

  if (typeof episodeId !== "string" || !episodeId.trim()) {
    return NextResponse.json({ error: "episodeId가 필요합니다." }, { status: 400 });
  }
  const safeEpisodeId = sanitizeSegment(episodeId);
  if (!safeEpisodeId) {
    return NextResponse.json({ error: "잘못된 episodeId입니다." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 용량이 너무 큽니다 (최대 30MB)." },
      { status: 400 }
    );
  }

  const fileId = makeFileId();
  const fileUrl = await uploadToBlob(`uploads/${safeEpisodeId}`, fileId, file, file.name);

  let thumbnailUrl: string | undefined;
  if (thumbnail instanceof File) {
    thumbnailUrl = await uploadToBlob(
      `uploads/${safeEpisodeId}`,
      fileId,
      thumbnail,
      "thumb.webp",
      "_thumb",
      "webp"
    );
  }

  return NextResponse.json({ fileUrl, thumbnailUrl, fileName: file.name });
}

export async function DELETE(request: Request) {
  let body: { paths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const paths = Array.isArray(body.paths) ? body.paths : [];

  for (const candidate of paths) {
    if (typeof candidate !== "string") continue;
    await deleteFromBlob(candidate);
  }

  return NextResponse.json({ ok: true });
}

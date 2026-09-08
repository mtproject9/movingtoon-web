import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

// 백업 복원 전용. 예전 형식(로컬 파일 경로) 백업을 새 저장소(Vercel Blob)로 복원할 때
// 쓰인다. path를 그대로 blob 키로 써서 새 공개 URL을 돌려준다 — 이제는 URL 자체가
// CutAsset.fileUrl로 저장되므로, 예전처럼 "정확히 같은 경로"를 지킬 필요는 없다.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const targetPath = form.get("path");
  const file = form.get("file");

  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return NextResponse.json({ error: "path가 필요합니다." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "복원할 파일이 없습니다." }, { status: 400 });
  }

  const key = targetPath.replace(/^\/+/, "");
  const result = await put(key, file, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN,
  });

  return NextResponse.json({ ok: true, fileUrl: result.url });
}

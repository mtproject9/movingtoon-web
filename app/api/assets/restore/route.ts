import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { resolvePublicPath } from "@/lib/localAssetStorage";

// 백업 복원 전용. /api/assets/upload는 항상 새 파일명을 만들어 저장하지만, 백업
// 안에는 이미 CutAsset.fileUrl로 참조되고 있는 "정확한 원래 경로"가 있으므로
// 그 경로 그대로 다시 써야 참조 무결성이 유지된다(파일명이 바뀌면 안 됨).
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const targetPath = form.get("path");
  const file = form.get("file");

  if (typeof targetPath !== "string") {
    return NextResponse.json({ error: "path가 필요합니다." }, { status: 400 });
  }
  const absolute = resolvePublicPath(targetPath);
  if (!absolute) {
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "복원할 파일이 없습니다." }, { status: 400 });
  }

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ ok: true });
}

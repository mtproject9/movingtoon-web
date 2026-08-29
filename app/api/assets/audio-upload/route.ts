import { NextResponse } from "next/server";
import { makeFileId, resolveSafeEpisodeId, saveEpisodeFile } from "@/lib/localAssetStorage";

// 대사 보이스 파일(.mp3/.wav/.m4a) 전용 업로드 라우트. 저장 로직 자체는
// /api/assets/upload와 같은 lib/localAssetStorage를 공유하지만, 오디오가 아닌
// 파일이 실수로 컷의 오디오 슬롯에 들어가지 않도록 확장자/MIME을 여기서 검증한다.
// 삭제는 /api/assets/upload의 DELETE가 경로 기반으로 이미 타입 구분 없이 처리한다.
// 무손실 원본(.wav)은 수백 MB까지도 흔해 4K 이미지와 달리 용량 상한을 두지 않는다 —
// Route Handler는 Server Action과 달리 기본 바디 크기 제한이 없어 별도 설정도 필요 없다.
const ALLOWED_EXTENSIONS = new Set(["mp3", "wav", "m4a"]);
const ALLOWED_MIME_PREFIXES = ["audio/"];

function isAllowedAudio(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ALLOWED_EXTENSIONS.has(ext)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 업로드 요청입니다." }, { status: 400 });
  }

  const episodeId = form.get("episodeId");
  const file = form.get("file");

  if (typeof episodeId !== "string" || !episodeId.trim()) {
    return NextResponse.json({ error: "episodeId가 필요합니다." }, { status: 400 });
  }
  const safeEpisodeId = resolveSafeEpisodeId(episodeId);
  if (!safeEpisodeId) {
    return NextResponse.json({ error: "잘못된 episodeId입니다." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }
  if (!isAllowedAudio(file)) {
    return NextResponse.json(
      { error: "지원하지 않는 오디오 형식입니다 (mp3, wav, m4a만 가능)." },
      { status: 400 }
    );
  }

  const fileUrl = await saveEpisodeFile(safeEpisodeId, makeFileId(), file, "", "mp3");

  return NextResponse.json({ fileUrl, fileName: file.name });
}

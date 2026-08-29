import { readFile } from "fs/promises";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { resolvePublicPath } from "@/lib/localAssetStorage";

// 회차 데이터(cuts/assets)는 클라이언트의 localStorage에만 있고 서버는 로컬 파일
// 시스템만 갖고 있으므로, 클라이언트가 컷 순서·대사·연출 메모와 각 컷의 최신
// 이미지/오디오 경로(/uploads/...)를 보내주면 서버가 그 경로의 실제 파일을 직접
// 디스크에서 읽어 압축한다 — 브라우저가 자기 자신에게 다시 fetch할 필요가 없다.
interface CutInput {
  cutNumber: number;
  sceneNumber: number;
  dialogue: string;
  directionNote: string;
  cameraAngle: string;
  emotionTag: string;
  expression: string;
  status: string;
  imagePath: string | null;
  audioPath: string | null;
}

interface PackageRequest {
  seriesTitle?: string;
  episodeTitle?: string;
  cuts?: CutInput[];
}

function extOf(assetPath: string, fallback: string): string {
  const ext = assetPath.split(".").pop();
  return ext && /^[a-zA-Z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

export async function POST(request: Request) {
  let body: PackageRequest;
  try {
    body = (await request.json()) as PackageRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 클라이언트가 보낸 순서를 신뢰하지 않고 컷 번호로 다시 정렬한다 — 파일명 정렬이
  // 컷 순서와 100% 일치하려면애초에 처리 순서 자체도 컷 번호 순이어야 한다.
  const cuts = (Array.isArray(body.cuts) ? body.cuts : []).slice().sort(
    (a, b) => a.cutNumber - b.cutNumber
  );
  if (cuts.length === 0) {
    return NextResponse.json({ error: "내보낼 컷이 없습니다." }, { status: 400 });
  }

  // 파일명 앞자리 숫자로 캡컷/탐색기에서 정렬했을 때 컷 순서와 어긋나지 않으려면
  // 자릿수가 "가장 큰 컷 번호"를 담을 만큼 넉넉해야 한다(컷 수가 아니라 번호 기준 —
  // 번호가 중간에 비어 있어도 정렬이 깨지지 않는다). 최소 2자리를 유지한다.
  const maxCutNumber = cuts.reduce((max, cut) => Math.max(max, cut.cutNumber), 0);
  const padWidth = Math.max(2, String(maxCutNumber).length);

  const zip = new JSZip();
  const imagesFolder = zip.folder("01_images");
  const audioFolder = zip.folder("02_audio");
  const scriptsFolder = zip.folder("03_scripts");
  if (!imagesFolder || !audioFolder || !scriptsFolder) {
    return NextResponse.json({ error: "ZIP 폴더를 만들지 못했습니다." }, { status: 500 });
  }

  const dialogueLines: string[] = [];
  const fullLines: string[] = [];
  const metadataCuts: Record<string, unknown>[] = [];

  for (const cut of cuts) {
    const tag = String(cut.cutNumber).padStart(padWidth, "0");

    let imageFile: string | null = null;
    if (cut.imagePath) {
      const absolute = resolvePublicPath(cut.imagePath);
      if (absolute) {
        try {
          const buffer = await readFile(absolute);
          imageFile = `${tag}_cut.${extOf(cut.imagePath, "png")}`;
          imagesFolder.file(imageFile, buffer);
        } catch {
          // 파일이 이미 지워졌으면 건너뛴다
        }
      }
    }

    let audioFile: string | null = null;
    if (cut.audioPath) {
      const absolute = resolvePublicPath(cut.audioPath);
      if (absolute) {
        try {
          const buffer = await readFile(absolute);
          audioFile = `${tag}_cut_voice.${extOf(cut.audioPath, "mp3")}`;
          audioFolder.file(audioFile, buffer);
        } catch {
          // 파일이 이미 지워졌으면 건너뛴다
        }
      }
    }

    if (cut.dialogue) dialogueLines.push(cut.dialogue);
    fullLines.push(
      `Cut_${tag} (Scene ${cut.sceneNumber})\n` +
        `[구도] ${cut.cameraAngle || "-"}\n[감정] ${cut.emotionTag || "-"}\n` +
        `[지문] ${cut.directionNote || "-"}\n[대사] ${cut.dialogue || "-"}\n`
    );

    metadataCuts.push({
      cutNumber: cut.cutNumber,
      sceneNumber: cut.sceneNumber,
      cameraAngle: cut.cameraAngle,
      emotionTag: cut.emotionTag,
      directionNote: cut.directionNote,
      status: cut.status,
      imageFile: imageFile ? `01_images/${imageFile}` : null,
      audioFile: audioFile ? `02_audio/${audioFile}` : null,
    });
  }

  scriptsFolder.file("script_dialogue.txt", dialogueLines.join("\n"));
  scriptsFolder.file("script_full.txt", fullLines.join("\n"));

  zip.file(
    "metadata.json",
    JSON.stringify(
      {
        seriesTitle: body.seriesTitle ?? "",
        episodeTitle: body.episodeTitle ?? "",
        exportedAt: new Date().toISOString(),
        cutCount: cuts.length,
        cuts: metadataCuts,
      },
      null,
      2
    )
  );

  const buffer = await zip.generateAsync({ type: "uint8array" });
  const fileNameBase = `${body.seriesTitle || "시리즈"}_${body.episodeTitle || "회차"}_CapCut_Package`
    .replace(/[\\/:*?"<>|]/g, "_");

  // Response/NextResponse는 런타임에 Uint8Array를 그대로 받아들이지만, 최신 TS의
  // Uint8Array<ArrayBufferLike> 제네릭이 BodyInit의 ArrayBufferView<ArrayBuffer>와
  // 정확히 맞물리지 않아 타입 체크에서만 어긋난다. 안전한 우회로 BodyInit으로 단언한다.
  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="package.zip"; filename*=UTF-8''${encodeURIComponent(fileNameBase)}.zip`,
    },
  });
}

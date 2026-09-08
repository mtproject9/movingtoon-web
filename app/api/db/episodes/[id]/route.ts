import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { BoardImage, Cut, CutAsset } from "@/lib/types";

interface EpisodeFullPatch {
  title?: string;
  episodeNumber?: number;
  cuts?: Cut[];
  scriptText?: string;
  assets?: CutAsset[];
  stylePreset?: string | null;
  board?: BoardImage[];
  finalVideoUrl?: string;
  // cuts를 함께 보낼 때만 의미가 있다 — 이 값을 GET으로 읽어온 시점의
  // cuts_updated_at과 대조해, 그 사이 다른 곳(다른 탭 등)에서 먼저 저장한 게
  // 있으면 이 요청은 거부한다(오래된 탭이 최신 내용을 덮어쓰는 사고 방지).
  expectedCutsUpdatedAt?: number;
  // board를 함께 보낼 때만 의미가 있다 — cuts와 같은 이유의 버전 대조용이지만,
  // 진행 보드 화면은 원고 분할 화면과 별개라 따로 관리한다(서로 충돌 안 함).
  expectedBoardUpdatedAt?: number;
}

// 컷 목록·원고·에셋 목록·진행 보드처럼 회차 화면들에 필요한 무거운 데이터까지
// 전부 담아 돌려준다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await sql`
    SELECT id, series_id, title, episode_number, created_at, cuts, script_text, assets, style_preset,
           cuts_updated_at, board, board_updated_at, final_video_url
    FROM episodes WHERE id = ${id}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }
  const r = rows[0];
  const cuts = r.cuts as Cut[];
  const scriptText = r.script_text as string;

  // 원인이 무엇이든(오래된 데이터 이전 등) 컷은 있는데 원고 원문이 비어 있으면
  // 안 되므로, 그런 경우 각 컷의 scriptText를 순서대로 이어붙여 대신 보여준다.
  const effectiveScriptText =
    !scriptText.trim() && cuts.length > 0
      ? cuts
          .slice()
          .sort((a, b) => a.cutNumber - b.cutNumber)
          .map((cut) => cut.scriptText)
          .filter(Boolean)
          .join("\n")
      : scriptText;

  return NextResponse.json({
    id: r.id,
    seriesId: r.series_id,
    title: r.title,
    episodeNumber: r.episode_number,
    createdAt: Number(r.created_at),
    cuts,
    scriptText: effectiveScriptText,
    assets: r.assets as CutAsset[],
    stylePreset: r.style_preset as string | null,
    cutsUpdatedAt: Number(r.cuts_updated_at),
    board: r.board as BoardImage[],
    boardUpdatedAt: Number(r.board_updated_at),
    finalVideoUrl: (r.final_video_url as string) || undefined,
  });
}

// 부분 업데이트: 넘어온 필드만 갱신한다(넘기지 않은 필드는 기존 값 유지).
//
// 컷 목록·에셋 목록·진행 보드는 서로 다른 Context(CutsContext/AssetsContext/board
// 페이지)가 각자 따로, 종종 거의 동시에(예: 이미지 업로드 한 번에 에셋 저장과
// 컷 상태 저장이 연달아 나감) PATCH를 보낸다. 예전에는 이 함수가 요청 맨 앞에서
// SELECT *로 전체 행을 읽어와 "안 바뀐 필드"를 그 스냅샷 값으로 다시 써넣었는데,
// 두 요청이 겹치면 뒤에 끝나는 요청이 앞 요청의 SELECT 시점 값으로 덮어써서
// 방금 저장된 다른 필드가 조용히 사라지는 경쟁 상태가 있었다. 지금은 안 바뀐
// 필드를 아예 SQL의 COALESCE/CASE로 "건드리지 않고 그대로 둔다" — 요청 시작
// 시점의 스냅샷을 다시 쓰는 게 아니라 DB가 알아서 현재 값을 유지하므로 경쟁이
// 생기지 않는다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = (await request.json()) as EpisodeFullPatch;

  const rows = await sql`
    SELECT cuts_updated_at, board_updated_at FROM episodes WHERE id = ${id}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }
  const current = rows[0];

  // cuts를 갱신하는 요청은 반드시 최신 cuts_updated_at을 함께 보내야 한다.
  // 값이 없거나(오래된 버전의 화면이 보낸 요청) 서버의 현재 값과 다르면(그 사이
  // 다른 곳에서 먼저 저장함) 거부한다 — 오래된 탭이 최신 내용을 예전 값으로
  // 덮어쓰는 사고를 서버 쪽에서 원천 차단한다.
  if (patch.cuts !== undefined) {
    const currentCutsUpdatedAt = Number(current.cuts_updated_at);
    if (
      typeof patch.expectedCutsUpdatedAt !== "number" ||
      patch.expectedCutsUpdatedAt !== currentCutsUpdatedAt
    ) {
      return NextResponse.json(
        {
          error: "이 화면을 연 뒤 다른 곳에서 먼저 저장되어, 오래된 내용으로 덮어쓰는 것을 막았습니다. 새로고침 후 다시 시도해주세요.",
          code: "STALE_CUTS",
          currentCutsUpdatedAt,
        },
        { status: 409 }
      );
    }
  }

  // board도 같은 원리로 보호한다(진행 보드 화면 자체의 버전).
  if (patch.board !== undefined) {
    const currentBoardUpdatedAt = Number(current.board_updated_at);
    if (
      typeof patch.expectedBoardUpdatedAt !== "number" ||
      patch.expectedBoardUpdatedAt !== currentBoardUpdatedAt
    ) {
      return NextResponse.json(
        {
          error: "이 화면을 연 뒤 다른 곳에서 먼저 저장되어, 오래된 내용으로 덮어쓰는 것을 막았습니다. 새로고침 후 다시 시도해주세요.",
          code: "STALE_BOARD",
          currentBoardUpdatedAt,
        },
        { status: 409 }
      );
    }
  }

  const nextCutsUpdatedAt = patch.cuts !== undefined ? Date.now() : null;
  const nextBoardUpdatedAt = patch.board !== undefined ? Date.now() : null;

  await sql`
    UPDATE episodes SET
      title = COALESCE(${patch.title ?? null}, title),
      episode_number = COALESCE(${patch.episodeNumber ?? null}, episode_number),
      cuts = COALESCE(${patch.cuts !== undefined ? JSON.stringify(patch.cuts) : null}::jsonb, cuts),
      script_text = COALESCE(${patch.scriptText ?? null}, script_text),
      assets = COALESCE(${patch.assets !== undefined ? JSON.stringify(patch.assets) : null}::jsonb, assets),
      style_preset = CASE WHEN ${patch.stylePreset !== undefined}
        THEN ${patch.stylePreset ?? null}
        ELSE style_preset
      END,
      cuts_updated_at = COALESCE(${nextCutsUpdatedAt}, cuts_updated_at),
      board = COALESCE(${patch.board !== undefined ? JSON.stringify(patch.board) : null}::jsonb, board),
      board_updated_at = COALESCE(${nextBoardUpdatedAt}, board_updated_at),
      final_video_url = COALESCE(${patch.finalVideoUrl ?? null}, final_video_url)
    WHERE id = ${id}
  `;

  return NextResponse.json({
    ok: true,
    cutsUpdatedAt: nextCutsUpdatedAt ?? Number(current.cuts_updated_at),
    boardUpdatedAt: nextBoardUpdatedAt ?? Number(current.board_updated_at),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await sql`DELETE FROM episodes WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

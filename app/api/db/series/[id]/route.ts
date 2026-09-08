import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Series } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = (await request.json()) as Partial<Series>;

  const rows = await sql`SELECT * FROM series WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "시리즈를 찾을 수 없습니다." }, { status: 404 });
  }
  const current = rows[0];

  await sql`
    UPDATE series SET
      title = ${patch.title ?? current.title},
      logline = ${patch.logline ?? current.logline},
      thumbnail = ${patch.thumbnail ?? current.thumbnail},
      custom_style_presets = ${JSON.stringify(
        patch.customStylePresets ?? current.custom_style_presets ?? []
      )}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

// 시리즈 삭제는 DB 외래키 CASCADE로 회차/캐릭터까지 함께 지운다. 실제 이미지 파일
// (Blob) 정리는 휴지통에서 영구 삭제할 때 처리되므로 여기서는 행 삭제만 담당한다 —
// 소프트 삭제(휴지통 이동)는 삭제 전에 클라이언트가 캡처해 별도로 옮겨둔다.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await sql`DELETE FROM series WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

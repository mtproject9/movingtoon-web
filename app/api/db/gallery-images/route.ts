import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { GalleryImageMeta } from "@/lib/types";

function rowToMeta(r: Record<string, unknown>): GalleryImageMeta {
  return {
    id: r.id as string,
    characterId: r.character_id as string,
    fileName: r.file_name as string,
    thumbnailUrl: r.thumbnail_url as string,
    fileUrl: r.original_url as string,
    originalWidth: r.original_width as number,
    originalHeight: r.original_height as number,
    order: Number(r.order_index),
    createdAt: Number(r.created_at),
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const characterId = new URL(request.url).searchParams.get("characterId");
  if (!characterId) {
    return NextResponse.json({ error: "characterId가 필요합니다." }, { status: 400 });
  }

  const rows = await sql`
    SELECT * FROM gallery_images WHERE character_id = ${characterId} ORDER BY order_index ASC
  `;
  return NextResponse.json({ images: rows.map(rowToMeta) });
}

// 신규 업로드와 휴지통 복원 양쪽에서 쓴다 — 복원 시에는 원래 id/order/createdAt을
// 그대로 넘겨 다시 삽입한다.
export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json()) as GalleryImageMeta;

  await sql`
    INSERT INTO gallery_images (
      id, character_id, file_name, thumbnail_url, original_url,
      original_width, original_height, order_index, created_at
    ) VALUES (
      ${body.id}, ${body.characterId}, ${body.fileName}, ${body.thumbnailUrl}, ${body.fileUrl},
      ${body.originalWidth}, ${body.originalHeight}, ${body.order}, ${body.createdAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}

// 캐릭터 삭제(휴지통 이동) 시 그 캐릭터의 갤러리 행 전체를 한 번에 지운다 —
// 실제 Blob 파일은 여기서 안 지운다(휴지통 payload가 URL을 그대로 들고 있다가
// 영구 삭제될 때 정리됨). characterId 없이 호출하면(백업 덮어쓰기 복원 전용) 전체를 지운다.
export async function DELETE(request: Request) {
  await ensureSchema();
  const characterId = new URL(request.url).searchParams.get("characterId");

  if (characterId) {
    await sql`DELETE FROM gallery_images WHERE character_id = ${characterId}`;
  } else {
    await sql`DELETE FROM gallery_images`;
  }

  return NextResponse.json({ ok: true });
}

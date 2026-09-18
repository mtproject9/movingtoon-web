import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { GalleryImageCategory } from "@/lib/types";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await sql`DELETE FROM gallery_images WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

// 골든셋 이미지에 카테고리(정체성/표정/의상)·라벨(자유 텍스트) 태그를 붙인다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as { category?: GalleryImageCategory; label?: string };

  await sql`
    UPDATE gallery_images SET
      category = COALESCE(${body.category ?? null}, category),
      label = CASE WHEN ${body.label !== undefined} THEN ${body.label ?? ""} ELSE label END
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

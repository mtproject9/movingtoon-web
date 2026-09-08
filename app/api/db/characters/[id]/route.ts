import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Character } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = (await request.json()) as Partial<Character>;

  const rows = await sql`SELECT * FROM characters WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
  }
  const current = rows[0];

  await sql`
    UPDATE characters SET
      name = ${patch.name ?? current.name},
      gender = ${patch.gender ?? current.gender},
      role = ${patch.role ?? current.role},
      hair_tag = ${patch.hairTag ?? current.hair_tag},
      eye_tag = ${patch.eyeTag ?? current.eye_tag},
      outfit_tag = ${patch.outfitTag ?? current.outfit_tag},
      profile_image = ${patch.profileImage ?? current.profile_image}
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await sql`DELETE FROM characters WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { Character } from "@/lib/types";

export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json()) as Partial<Character>;

  if (typeof body.id !== "string" || typeof body.seriesId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: "id, seriesId, name이 필요합니다." }, { status: 400 });
  }

  const createdAt = body.createdAt ?? Date.now();
  await sql`
    INSERT INTO characters (id, series_id, name, gender, role, hair_tag, eye_tag, outfit_tag, profile_image, created_at)
    VALUES (
      ${body.id}, ${body.seriesId}, ${body.name}, ${body.gender ?? "여성"}, ${body.role ?? ""},
      ${body.hairTag ?? ""}, ${body.eyeTag ?? ""}, ${body.outfitTag ?? ""}, ${body.profileImage ?? ""}, ${createdAt}
    )
  `;

  return NextResponse.json({ ok: true });
}

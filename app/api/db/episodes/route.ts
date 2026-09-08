import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { Episode } from "@/lib/types";

export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json()) as Partial<Episode>;

  if (
    typeof body.id !== "string" ||
    typeof body.seriesId !== "string" ||
    typeof body.title !== "string" ||
    typeof body.episodeNumber !== "number"
  ) {
    return NextResponse.json(
      { error: "id, seriesId, title, episodeNumber가 필요합니다." },
      { status: 400 }
    );
  }

  const createdAt = body.createdAt ?? Date.now();
  await sql`
    INSERT INTO episodes (id, series_id, title, episode_number, created_at, final_video_url)
    VALUES (${body.id}, ${body.seriesId}, ${body.title}, ${body.episodeNumber}, ${createdAt}, ${body.finalVideoUrl ?? ""})
  `;

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { Character, Episode, Series } from "@/lib/types";

// 앱 진입 시 한 번에 필요한 전체 목록(시리즈/회차 메타/캐릭터)을 불러온다.
// 회차의 cuts/scriptText/assets처럼 무거운 데이터는 화면②에 들어갈 때
// /api/db/episodes/[id]에서 따로 불러온다.
export async function GET() {
  await ensureSchema();

  const [seriesRows, episodeRows, characterRows] = await Promise.all([
    sql`SELECT id, title, logline, thumbnail, created_at, custom_style_presets FROM series ORDER BY created_at ASC`,
    sql`SELECT id, series_id, title, episode_number, created_at, final_video_url FROM episodes ORDER BY episode_number ASC`,
    sql`SELECT id, series_id, name, gender, role, hair_tag, eye_tag, outfit_tag, profile_image, created_at FROM characters ORDER BY created_at ASC`,
  ]);

  const series: Series[] = seriesRows.map((r) => ({
    id: r.id,
    title: r.title,
    logline: r.logline,
    thumbnail: r.thumbnail,
    createdAt: Number(r.created_at),
    customStylePresets: r.custom_style_presets ?? [],
  }));

  const episodes: Episode[] = episodeRows.map((r) => ({
    id: r.id,
    seriesId: r.series_id,
    title: r.title,
    episodeNumber: r.episode_number,
    createdAt: Number(r.created_at),
    finalVideoUrl: r.final_video_url || undefined,
  }));

  const characters: Character[] = characterRows.map((r) => ({
    id: r.id,
    seriesId: r.series_id,
    name: r.name,
    gender: r.gender,
    role: r.role,
    hairTag: r.hair_tag,
    eyeTag: r.eye_tag,
    outfitTag: r.outfit_tag,
    profileImage: r.profile_image,
    createdAt: Number(r.created_at),
  }));

  return NextResponse.json({ series, episodes, characters });
}

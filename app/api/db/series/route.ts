import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { Series } from "@/lib/types";

export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json()) as Partial<Series>;

  if (typeof body.id !== "string" || typeof body.title !== "string") {
    return NextResponse.json({ error: "id, title이 필요합니다." }, { status: 400 });
  }

  const createdAt = body.createdAt ?? Date.now();
  await sql`
    INSERT INTO series (id, title, logline, thumbnail, created_at)
    VALUES (${body.id}, ${body.title}, ${body.logline ?? ""}, ${body.thumbnail ?? ""}, ${createdAt})
  `;

  return NextResponse.json({ ok: true });
}

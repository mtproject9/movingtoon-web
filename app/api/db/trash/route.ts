import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import type { TrashEntry } from "@/lib/types";

function rowToEntry(r: Record<string, unknown>): TrashEntry {
  return {
    id: r.id as string,
    itemType: r.item_type as TrashEntry["itemType"],
    label: r.label as string,
    deletedAt: Number(r.deleted_at),
    originPath: r.origin_path as Record<string, string>,
    payload: r.payload as TrashEntry["payload"],
  };
}

export async function GET() {
  await ensureSchema();
  const rows = await sql`SELECT * FROM trash_entries ORDER BY deleted_at DESC`;
  return NextResponse.json({ entries: rows.map(rowToEntry) });
}

async function insertEntry(entry: TrashEntry) {
  await sql`
    INSERT INTO trash_entries (id, item_type, label, deleted_at, origin_path, payload)
    VALUES (
      ${entry.id}, ${entry.itemType}, ${entry.label}, ${entry.deletedAt},
      ${JSON.stringify(entry.originPath)}::jsonb, ${JSON.stringify(entry.payload)}::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

// 단건(TrashEntry 하나)과 배치({ entries: TrashEntry[] }) 양쪽을 다 받는다 —
// 컷 스냅샷처럼 여러 개를 한 번에 넣는 경우가 있어서다.
export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json()) as TrashEntry | { entries: TrashEntry[] };

  if ("entries" in body) {
    for (const entry of body.entries) await insertEntry(entry);
  } else {
    await insertEntry(body);
  }

  return NextResponse.json({ ok: true });
}

// { ids: string[] }가 오면 그 항목들만, { all: true }가 오면 휴지통 전체를 지운다.
export async function DELETE(request: Request) {
  await ensureSchema();
  const body = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };

  if (body.all) {
    await sql`DELETE FROM trash_entries`;
  } else if (body.ids && body.ids.length > 0) {
    await sql`DELETE FROM trash_entries WHERE id = ANY(${body.ids})`;
  }

  return NextResponse.json({ ok: true });
}

import type { TrashEntry } from "./types";

// 휴지통은 서버 DB(trash_entries 테이블)에 저장한다 — 예전엔 브라우저 IndexedDB에만
// 저장해 삭제한 기기가 아닌 다른 기기/브라우저에서는 복구 버튼을 눌러도 아무것도
// 없었는데, 어디서 접속하든 같은 휴지통이 보이도록 서버로 옮겼다.
export async function addTrashEntry(entry: TrashEntry): Promise<void> {
  await fetch("/api/db/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export async function addTrashEntries(entries: TrashEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await fetch("/api/db/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
}

export async function listTrashEntries(): Promise<TrashEntry[]> {
  const res = await fetch("/api/db/trash");
  if (!res.ok) return [];
  const data = (await res.json()) as { entries: TrashEntry[] };
  return data.entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function removeTrashEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await fetch("/api/db/trash", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function clearTrashEntries(): Promise<void> {
  await fetch("/api/db/trash", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
}

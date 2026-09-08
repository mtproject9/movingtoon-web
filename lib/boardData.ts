import type { BoardImage } from "./types";

export interface BoardData {
  board: BoardImage[];
  boardUpdatedAt: number;
}

export async function fetchBoardData(episodeId: string): Promise<BoardData> {
  try {
    const res = await fetch(`/api/db/episodes/${episodeId}`);
    if (!res.ok) return { board: [], boardUpdatedAt: 0 };
    const data = (await res.json()) as BoardData;
    return { board: data.board ?? [], boardUpdatedAt: data.boardUpdatedAt ?? 0 };
  } catch {
    return { board: [], boardUpdatedAt: 0 };
  }
}

export interface SaveBoardResult {
  ok: boolean;
  boardUpdatedAt?: number;
  error?: string;
}

/** 항상 GET으로 읽어온 최신 boardUpdatedAt을 함께 보내야 한다 — 서버가 그 사이
 *  다른 곳에서 먼저 저장한 게 없는지 대조해, 오래된 화면이 최신 내용을 덮어쓰는
 *  사고를 막는다. */
export async function saveBoardData(
  episodeId: string,
  board: BoardImage[],
  expectedBoardUpdatedAt: number
): Promise<SaveBoardResult> {
  try {
    const res = await fetch(`/api/db/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, expectedBoardUpdatedAt }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; boardUpdatedAt?: number; error?: string }
      | null;
    if (!res.ok) {
      return { ok: false, error: body?.error ?? "저장하지 못했습니다." };
    }
    return { ok: true, boardUpdatedAt: body?.boardUpdatedAt };
  } catch {
    return { ok: false, error: "저장하지 못했습니다. 인터넷 연결을 확인해주세요." };
  }
}

export function makeBoardImageId(): string {
  return `board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 컷 이미지를 "최종 이미지 모음"(진행 보드)에 사본으로 추가한다 — 원본 컷의
 *  버전 히스토리는 그대로 두고, 이 버전을 최종으로 쓰기로 한 결정만 복사한다. */
export async function addImageToBoard(
  episodeId: string,
  item: { fileUrl: string; thumbnailUrl?: string; fileName: string; sourceCutId?: string }
): Promise<SaveBoardResult> {
  const current = await fetchBoardData(episodeId);
  const nextOrder =
    current.board.length > 0 ? Math.max(...current.board.map((b) => b.order)) + 1 : 0;
  const newImage: BoardImage = {
    id: makeBoardImageId(),
    ...item,
    order: nextOrder,
    addedAt: Date.now(),
  };
  return saveBoardData(episodeId, [...current.board, newImage], current.boardUpdatedAt);
}

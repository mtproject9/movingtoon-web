"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, ChevronLeft, ChevronRight, Download, Star, Trash2, X } from "lucide-react";
import type { CutAsset } from "@/lib/types";

// fileUrl이 서버 정적 경로(/uploads/...) 또는 data URL이라 galleryDb의 LightboxModal과
// 달리 IndexedDB에서 원본을 따로 불러올 필요 없이 바로 <img>에 꽂아 4K 원본을 보여준다.
export default function CutAssetLightbox({
  assets,
  startIndex,
  onClose,
  onDownload,
  onDelete,
  onAddToBoard,
  onToggleLock,
}: {
  assets: CutAsset[];
  startIndex: number;
  onClose: () => void;
  onDownload: (asset: CutAsset) => void;
  onDelete: (asset: CutAsset) => void;
  // 회차 화면마다 "진행 보드"와의 연동 방식이 다를 수 있어(예: 갤러리는 필요, 다른
  // 화면은 이미 자체 버튼이 있어 불필요) 선택적으로만 받는다.
  onAddToBoard?: (asset: CutAsset) => void;
  // 삭제 잠금도 갤러리 화면에서만 필요해 선택적으로만 받는다 — 넘겨받을 때만
  // 별 아이콘과 잠금 상태에서의 삭제 비활성화를 보여준다.
  onToggleLock?: (asset: CutAsset) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const current = assets[index];

  useEffect(() => {
    // 다른 썸네일을 클릭해 startIndex가 바뀔 때 라이트박스 내부 위치를 맞춰준다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (index >= assets.length && assets.length > 0) {
      // 보고 있던 이미지가 삭제되어 배열이 줄어들면 마지막 이미지로 위치를 보정한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(assets.length - 1);
    }
  }, [assets.length, index]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(assets.length - 1, i + 1));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [assets.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/95 p-4">
      <div className="flex items-center justify-between text-white">
        <span className="text-sm text-slate-300">
          {index + 1} / {assets.length} · {current.fileName} · v{current.version}
        </span>
        <div className="flex items-center gap-1">
          {onToggleLock && (
            <button
              onClick={() => onToggleLock(current)}
              title={current.locked ? "삭제 잠금 해제" : "삭제 잠금"}
              className={`rounded-full p-2 hover:bg-white/10 ${
                current.locked ? "text-rose-400" : "text-slate-200"
              }`}
            >
              <Star className="h-5 w-5" fill={current.locked ? "currentColor" : "none"} />
            </button>
          )}
          {onAddToBoard && (
            <button
              onClick={() => onAddToBoard(current)}
              title="진행 보드(최종 이미지 모음)에 추가"
              className="rounded-full p-2 text-slate-200 hover:bg-white/10"
            >
              <BookmarkPlus className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => onDownload(current)}
            title="원본 다운로드"
            className="rounded-full p-2 text-slate-200 hover:bg-white/10"
          >
            <Download className="h-5 w-5" />
          </button>
          {!current.locked && (
            <button
              onClick={() => onDelete(current)}
              title="삭제"
              className="rounded-full p-2 text-slate-200 hover:bg-red-500/20 hover:text-red-300"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            title="닫기"
            className="rounded-full p-2 text-slate-200 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.fileUrl}
          alt={current.fileName}
          className="max-h-full max-w-full object-contain"
        />

        <button
          onClick={() => setIndex((i) => Math.min(assets.length - 1, i + 1))}
          disabled={index === assets.length - 1}
          className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Star, Trash2, X } from "lucide-react";
import type { GalleryImageMeta } from "@/lib/types";

export default function LightboxModal({
  images,
  startIndex,
  onClose,
  onDownload,
  onSetProfile,
  onDelete,
}: {
  images: GalleryImageMeta[];
  startIndex: number;
  onClose: () => void;
  onDownload: (image: GalleryImageMeta) => void;
  onSetProfile: (image: GalleryImageMeta) => void;
  onDelete: (image: GalleryImageMeta) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const current = images[index];

  useEffect(() => {
    // 다른 썸네일을 클릭해 startIndex가 바뀔 때 라이트박스 내부 위치를 맞춰준다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (index >= images.length && images.length > 0) {
      // 보고 있던 이미지가 삭제되어 배열이 줄어들면 마지막 이미지로 위치를 보정한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex(images.length - 1);
    }
  }, [images.length, index]);

  useEffect(() => {
    // 이미지 전환 시 새 원본을 불러오는 동안 로딩 상태를 보여준다 — 실제 로딩
    // 완료/실패는 <img>의 onLoad/onError가 갱신한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasError(false);
  }, [current]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/95 p-4">
      <div className="flex items-center justify-between text-white">
        <span className="text-sm text-slate-300">
          {index + 1} / {images.length} · {current.fileName}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSetProfile(current)}
            title="대표 프로필 이미지로 지정"
            className="rounded-full p-2 text-slate-200 hover:bg-white/10"
          >
            <Star className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDownload(current)}
            title="다운로드"
            className="rounded-full p-2 text-slate-200 hover:bg-white/10"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(current)}
            title="삭제"
            className="rounded-full p-2 text-slate-200 hover:bg-red-500/20 hover:text-red-300"
          >
            <Trash2 className="h-5 w-5" />
          </button>
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

        {isLoading && <Loader2 className="absolute h-8 w-8 animate-spin text-white/60" />}
        {hasError && !isLoading && (
          <p className="text-sm text-slate-400">이미지를 불러오지 못했습니다.</p>
        )}
        {!hasError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.fileUrl}
            alt={current.fileName}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            className={`max-h-full max-w-full object-contain ${isLoading ? "invisible" : ""}`}
          />
        )}

        <button
          onClick={() => setIndex((i) => Math.min(images.length - 1, i + 1))}
          disabled={index === images.length - 1}
          className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

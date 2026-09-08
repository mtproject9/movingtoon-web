"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { formatEpisodeLabel, type Episode } from "@/lib/types";

export default function FinalVideoModal({
  episode,
  onClose,
  onSave,
}: {
  episode: Episode;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  const [url, setUrl] = useState(episode.finalVideoUrl ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(url.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            {formatEpisodeLabel(episode)} · 완성 영상
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">
              구글 드라이브(등) 완성 영상 링크
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              autoFocus
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>

          {episode.finalVideoUrl && (
            <a
              href={episode.finalVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-rose-500 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              현재 등록된 링크 열어보기
            </a>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

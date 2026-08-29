"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function EpisodeModal({
  defaultTitle,
  onClose,
  onSubmit,
}: {
  defaultTitle: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(title);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">회차 추가</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">회차 제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>

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
              추가하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

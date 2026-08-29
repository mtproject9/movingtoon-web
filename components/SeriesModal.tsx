"use client";

import { useState } from "react";
import { Clapperboard, X } from "lucide-react";
import type { Series } from "@/lib/types";
import { compressImageToDataUrl } from "@/lib/images";

export type SeriesFormValues = Omit<Series, "id" | "createdAt">;

const EMPTY_FORM: SeriesFormValues = {
  title: "",
  logline: "",
  thumbnail: "",
};

export default function SeriesModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Series | null;
  onClose: () => void;
  onSubmit: (values: SeriesFormValues) => void;
}) {
  const [form, setForm] = useState<SeriesFormValues>(initial ?? EMPTY_FORM);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  function set<K extends keyof SeriesFormValues>(key: K, value: SeriesFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbnailError(null);
    try {
      // 원본 그대로 저장하면 localStorage 용량을 쉽게 초과하므로 업로드 즉시
      // 가로 최대 800px, 품질 0.75로 압축해 가벼운 데이터 URL로 바꿔 저장한다.
      const dataUrl = await compressImageToDataUrl(file);
      set("thumbnail", dataUrl);
    } catch {
      setThumbnailError("이미지를 처리하지 못했습니다. 다른 파일로 다시 시도해주세요.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            {initial ? "시리즈 수정" : "새 시리즈 만들기"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {form.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.thumbnail}
                  alt={form.title || "시리즈 썸네일"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Clapperboard className="h-7 w-7 text-slate-300" />
              )}
            </div>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">썸네일</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-full file:border-0 file:bg-rose-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-rose-600 hover:file:bg-rose-100"
              />
              {thumbnailError && <p className="mt-1 text-xs text-red-500">{thumbnailError}</p>}
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">제목</span>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="예: 재벌집 계약직 로맨스"
              required
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">로그라인</span>
            <textarea
              value={form.logline}
              onChange={(e) => set("logline", e.target.value)}
              rows={3}
              placeholder="한두 문장으로 시리즈를 소개해주세요."
              className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <div className="mt-2 flex justify-end gap-2">
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
              {initial ? "수정 완료" : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

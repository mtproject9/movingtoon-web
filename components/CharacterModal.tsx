"use client";

import { useState } from "react";
import { Images, X, UserRound } from "lucide-react";
import type { Character, CharacterGender } from "@/lib/types";
import { CHARACTER_GENDERS } from "@/lib/types";
import { readFileAsDataUrl } from "@/lib/files";

export type CharacterFormValues = Omit<Character, "id" | "seriesId" | "createdAt">;

const EMPTY_FORM: CharacterFormValues = {
  name: "",
  gender: "여성",
  role: "",
  hairTag: "",
  eyeTag: "",
  outfitTag: "",
  profileImage: "",
};

export default function CharacterModal({
  initial,
  onClose,
  onSubmit,
  onOpenGallery,
}: {
  initial: Character | null;
  onClose: () => void;
  onSubmit: (values: CharacterFormValues) => void;
  onOpenGallery?: () => void;
}) {
  const [form, setForm] = useState<CharacterFormValues>(initial ?? EMPTY_FORM);

  function set<K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      set("profileImage", dataUrl);
    } catch {
      // 파일 읽기 실패 시 이미지 변경 없이 무시
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            {initial ? "캐릭터 수정" : "캐릭터 추가"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {initial && onOpenGallery && (
          <button
            type="button"
            onClick={onOpenGallery}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            <Images className="h-3.5 w-3.5" />
            참조 이미지 갤러리 관리하기
          </button>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
              {form.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.profileImage}
                  alt={form.name || "캐릭터 프로필"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-7 w-7 text-slate-300" />
              )}
            </div>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                프로필 이미지
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-full file:border-0 file:bg-rose-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-rose-600 hover:file:bg-rose-100"
              />
            </label>
          </div>

          <Field label="이름">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 연수"
              required
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="성별">
              <select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as CharacterGender)}
                className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {CHARACTER_GENDERS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="역할">
              <input
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="예: 여주인공"
                className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </Field>
          </div>

          <p className="text-xs font-semibold text-slate-500">영문 외형 태그</p>
          <Field label="헤어 (hairTag)">
            <input
              value={form.hairTag}
              onChange={(e) => set("hairTag", e.target.value)}
              placeholder="e.g. long wavy brown hair"
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </Field>
          <Field label="눈 (eyeTag)">
            <input
              value={form.eyeTag}
              onChange={(e) => set("eyeTag", e.target.value)}
              placeholder="e.g. big sparkling brown eyes"
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </Field>
          <Field label="의상 (outfitTag)">
            <input
              value={form.outfitTag}
              onChange={(e) => set("outfitTag", e.target.value)}
              placeholder="e.g. cream knit sweater"
              className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </Field>

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
              {initial ? "수정 완료" : "추가하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

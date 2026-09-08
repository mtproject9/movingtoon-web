"use client";

import { useEffect, useState } from "react";
import { Camera, Images, Plus, X, UserRound } from "lucide-react";
import type { Character, CharacterGender } from "@/lib/types";
import { CHARACTER_GENDERS } from "@/lib/types";
import { compressImageToDataUrl } from "@/lib/images";

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
  // 새 캐릭터를 만들 때는 등록과 동시에 여러 장의 참조 이미지를 함께 올릴 수 있어
  // referenceImages로 넘겨준다(있으면 첫 장이 대표 프로필 이미지가 된다) — 수정
  // 모드에서는 항상 undefined(참조 이미지 갤러리는 별도 버튼으로 관리한다).
  onSubmit: (values: CharacterFormValues, referenceImages?: File[]) => void;
  onOpenGallery?: () => void;
}) {
  const [form, setForm] = useState<CharacterFormValues>(initial ?? EMPTY_FORM);
  // 새 캐릭터 등록 시에만 쓰는, 아직 저장 전인 참조 이미지들의 미리보기.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);

  function set<K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // 원본 그대로 저장하면 휴대폰 카메라 사진 기준 수 MB짜리 data URL이 그대로
      // DB에 박혀, 앱 진입 시마다 모든 캐릭터를 한 번에 불러오는 bootstrap 응답이
      // 캐릭터 수에 비례해 무거워진다 — 다른 이미지 업로드 경로와 동일하게 축소해 저장한다.
      const dataUrl = await compressImageToDataUrl(file);
      set("profileImage", dataUrl);
    } catch {
      // 파일 읽기 실패 시 이미지 변경 없이 무시
    }
  }

  function handleStagedFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length === 0) return;
    setStagedFiles((prev) => [...prev, ...files]);
  }

  function removeStagedFile(index: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    const urls = stagedFiles.map((f) => URL.createObjectURL(f));
    setStagedPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stagedFiles]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form, initial ? undefined : stagedFiles);
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
          {initial ? (
            <div className="flex items-center gap-3">
              <label
                title="프로필 이미지 변경"
                className="group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100"
              >
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
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/50">
                  <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>

              <Field label="이름">
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="예: 연수"
                  required
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </Field>
            </div>
          ) : (
            <>
              <Field label="이름">
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="예: 연수"
                  required
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  참조 이미지 (여러 장 선택 가능 · 첫 장이 대표 이미지가 됩니다)
                </span>
                <div className="flex flex-wrap gap-2">
                  {stagedPreviews.map((src, index) => (
                    <div
                      key={index}
                      className={`group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-slate-100 ${
                        index === 0 ? "border-rose-300" : "border-slate-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      {index === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 bg-rose-500/90 py-0.5 text-center text-[9px] font-semibold text-white">
                          대표
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStagedFile(index)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-rose-300 hover:text-rose-500">
                    <Plus className="h-4 w-4" />
                    <span className="text-[10px]">추가</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleStagedFilesChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </>
          )}

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

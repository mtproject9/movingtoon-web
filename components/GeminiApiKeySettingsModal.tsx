"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { clearGeminiApiKey, setGeminiApiKey } from "@/lib/geminiApiKey";

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

export default function GeminiApiKeySettingsModal({
  currentKey,
  onClose,
  onSaved,
}: {
  currentKey: string;
  onClose: () => void;
  onSaved: (key: string) => void;
}) {
  const [value, setValue] = useState(currentKey);

  function handleSave() {
    setGeminiApiKey(value);
    onSaved(value.trim());
    onClose();
  }

  function handleDelete() {
    clearGeminiApiKey();
    onSaved("");
    setValue("");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Gemini API 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-500">
          Google AI Studio(aistudio.google.com/apikey)에서 발급받은 API 키를 붙여넣으면 이
          브라우저의 localStorage에만 저장됩니다. 키가 있으면 프롬프트 자동 재생성/이미지 생성 시
          Gemini를 사용하고, 없으면 로컬 템플릿으로만 동작합니다.
        </p>

        {currentKey && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            현재 저장된 키: {maskKey(currentKey)}
          </div>
        )}

        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza..."
          className="mt-3 w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={!currentKey && !value}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            키 삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!value.trim()}
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-rose-300"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

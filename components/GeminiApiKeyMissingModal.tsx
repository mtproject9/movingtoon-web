"use client";

import { AlertCircle, X } from "lucide-react";

export default function GeminiApiKeyMissingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Gemini API 키가 필요해요</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-500">
          이미지 자동 생성을 쓰려면 프로젝트 루트의{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.local</code> 파일에
          Gemini API 키를 넣어야 합니다.
        </p>

        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
          GEMINI_API_KEY=발급받은_키
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Google AI Studio(aistudio.google.com/apikey)에서 무료로 키를 발급받을 수 있습니다.
          키를 넣은 뒤에는 개발 서버를 재시작해야 반영됩니다.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

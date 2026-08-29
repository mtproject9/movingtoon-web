"use client";

import { CheckCircle2, Loader2, Sparkles, X, XCircle } from "lucide-react";

export interface GeminiGenerationResult {
  cutLabel: string;
  ok: boolean;
  error?: string;
}

export interface GeminiGenerationStatus {
  isRunning: boolean;
  current: number;
  total: number;
  results: GeminiGenerationResult[];
}

// "Gemini 전체 컷 자동생성": 회차의 모든 컷 프롬프트를 순서대로 /api/gemini/generate에
// 보내 이미지를 받아오고, 성공한 컷은 바로 그 컷 슬롯에 새 버전으로 업로드한다.
// 실제 API 호출/진행 상태 관리는 prompts/page.tsx가 맡고, 이 컴포넌트는 진행률과
// 컷별 성공/실패 목록만 그린다.
export default function GeminiAutoGenerateModal({
  status,
  onStart,
  onCancel,
  onClose,
}: {
  status: GeminiGenerationStatus;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const { isRunning, current, total, results } = status;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const hasStarted = results.length > 0 || isRunning;
  const failedCount = results.filter((r) => !r.ok).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Gemini 전체 컷 자동생성</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasStarted ? (
            <p className="text-sm leading-relaxed text-slate-500">
              이 회차의 모든 컷 프롬프트를 순서대로 Gemini(나노바나나)에 전달해 이미지를
              자동 생성하고, 성공한 컷은 바로 그 슬롯에 새 버전으로 업로드합니다. 컷 수만큼
              API 요청이 발생하니 진행 중에는 창을 닫지 말아주세요.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {current} / {total} 컷 처리{isRunning ? " 중" : " 완료"}
                </span>
                <span>{percent}%</span>
              </div>
              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {!isRunning && failedCount > 0 && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {failedCount}개 컷 생성에 실패했습니다. 아래 목록에서 원인을 확인해주세요.
                </p>
              )}
              <ul className="flex flex-col gap-1.5">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    {r.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                    <span className="shrink-0 font-medium text-slate-700">{r.cutLabel}</span>
                    {!r.ok && r.error && (
                      <span className="truncate text-red-500">· {r.error}</span>
                    )}
                  </li>
                ))}
                {isRunning && current > results.length && (
                  <li className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    생성 중...
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {isRunning ? (
            <button
              onClick={onCancel}
              className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              중단
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                닫기
              </button>
              <button
                onClick={onStart}
                className="flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
              >
                <Sparkles className="h-4 w-4" />
                {hasStarted ? "다시 생성" : "생성 시작"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

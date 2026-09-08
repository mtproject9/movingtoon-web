"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // 저장/삭제 응답이 늦게 오면 "안 눌린 줄" 알고 여러 번 눌러 같은 항목이 휴지통에
  // 중복으로 쌓이는 사고를 막는다 — 한 번 누르면 이 다이얼로그가 떠 있는 동안은
  // 더 이상 onConfirm이 다시 불리지 않는다(호출부가 곧바로 닫지 않는 경우 대비).
  const [isConfirming, setIsConfirming] = useState(false);

  function handleConfirm() {
    if (isConfirming) return;
    setIsConfirming(true);
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-red-50 text-red-500" : "bg-rose-50 text-rose-500"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-rose-500 hover:bg-rose-600"
            }`}
          >
            {isConfirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

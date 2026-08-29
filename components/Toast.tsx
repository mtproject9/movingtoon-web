"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface ToastState {
  type: "success" | "error";
  message: string;
}

// 백업/복원, 원고 분할 등 "성공/실패 한 줄 알림"이 필요한 여러 화면이 공유하는 토스트.
export default function Toast({ type, message }: ToastState) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        type === "success" ? "bg-emerald-600" : "bg-red-600"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      {message}
    </div>
  );
}

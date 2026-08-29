"use client";

import { Loader2 } from "lucide-react";

// 백업/복원, CapCut 패키지 내보내기 등 "단계 이름 + 대략적인 진행률"로 표현되는
// 여러 단계짜리 작업이 공유하는 진행률 모달.
export default function ProgressModal({ phase, percent }: { phase: string; percent: number }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xs rounded-xl bg-white p-5 text-center shadow-xl">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-rose-500" />
        <p className="mt-3 text-sm font-medium text-slate-700">{phase}</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-rose-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{percent}%</p>
      </div>
    </div>
  );
}

"use client";

import { Film } from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { formatCutLabel } from "@/lib/types";
import type { Cut } from "@/lib/types";
import StatusBadge from "./StatusBadge";

function PromptApprovalBadge({ cut }: { cut: Cut }) {
  if (cut.imageUrl) {
    return (
      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
        이미지 완료
      </span>
    );
  }
  if (cut.isPromptApproved) {
    return (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        프롬프트 승인
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
      원고
    </span>
  );
}

export default function CutListSidebar() {
  const { cuts, selectedCutId, setSelectedCutId } = useCuts();

  if (cuts.length === 0) {
    return (
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Film className="h-4 w-4" />
          컷 리스트
        </div>
        <p className="mt-6 text-sm text-slate-400">
          아직 분할된 컷이 없습니다.
          <br />
          원고를 붙여넣고 분할을 실행해보세요.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500">
        <Film className="h-4 w-4" />
        컷 리스트 ({cuts.length})
      </div>
      <ul className="flex flex-col gap-1">
        {cuts.map((cut, index) => {
          const isNewScene = cut.sceneNumber !== cuts[index - 1]?.sceneNumber;

          return (
            <li key={cut.id}>
              {isNewScene && (
                <div className="mt-3 mb-1 flex items-center gap-2 px-2 first:mt-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Scene {cut.sceneNumber}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <button
                onClick={() => setSelectedCutId(cut.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  cut.id === selectedCutId
                    ? "border-rose-300 bg-rose-50"
                    : "border-transparent hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {cut.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cut.imageUrl}
                      alt=""
                      className="h-10 w-7 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-700">
                      {formatCutLabel(cut.cutNumber)}
                    </span>
                    <p className="line-clamp-2 text-xs text-slate-500">
                      {cut.dialogue || cut.directionNote || cut.scriptText}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <StatusBadge status={cut.status} />
                  <PromptApprovalBadge cut={cut} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

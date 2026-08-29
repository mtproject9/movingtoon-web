"use client";

import { Inbox, X } from "lucide-react";

export interface StagedAsset {
  id: string;
  file: File;
  previewUrl: string;
}

// 파일명으로 컷 번호를 못 찾은 이미지를 임시로 보관한다. 각 카드는 draggable이라
// CutStudioRow의 이미지 슬롯으로 드래그하면 그 컷에 배정된다(서버 업로드는 그때 발생).
export default function UnassignedAssetTray({
  items,
  onDiscard,
}: {
  items: StagedAsset[];
  onDiscard: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Inbox className="h-3.5 w-3.5" />
        미할당 에셋 트레이 ({items.length}장) · 컷 슬롯으로 드래그해 배정하세요
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            title={item.file.name}
            className="group relative h-20 w-20 shrink-0 cursor-grab overflow-hidden rounded-lg border border-slate-200 bg-white active:cursor-grabbing"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={item.file.name}
              className="h-full w-full object-cover"
            />
            <button
              onClick={() => onDiscard(item.id)}
              title="트레이에서 제거"
              className="absolute right-1 top-1 hidden rounded-full bg-white/90 p-1 text-slate-500 hover:text-red-500 group-hover:block"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

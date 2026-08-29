"use client";

import { useState } from "react";
import { Inbox, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { useTrash } from "@/context/TrashContext";
import { useSeries } from "@/context/SeriesContext";
import type { TrashEntry, TrashItemType } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

const TYPE_LABEL: Record<TrashItemType, string> = {
  series: "시리즈",
  episode: "회차",
  character: "캐릭터",
  cut: "컷",
  cutAsset: "에셋 파일",
  galleryImage: "참조 이미지",
};

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

type ConfirmAction = "deleteSelected" | "emptyAll" | null;

export default function TrashModal({ onClose }: { onClose: () => void }) {
  const { entries, restoreEntries, permanentlyDeleteEntries, emptyTrash } = useTrash();
  const { reloadFromStorage } = useSeries();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === entries.length ? new Set() : new Set(entries.map((entry) => entry.id))
    );
  }

  async function handleRestore(ids: string[]) {
    setIsBusy(true);
    try {
      await restoreEntries(ids);
      reloadFromStorage();
      setSelectedIds(new Set());
    } finally {
      setIsBusy(false);
    }
  }

  function requestDelete(ids: string[]) {
    setSelectedIds(new Set(ids));
    setConfirmAction("deleteSelected");
  }

  async function handleConfirmedDelete() {
    setIsBusy(true);
    try {
      if (confirmAction === "emptyAll") {
        await emptyTrash();
      } else if (confirmAction === "deleteSelected") {
        await permanentlyDeleteEntries(Array.from(selectedIds));
      }
      setSelectedIds(new Set());
    } finally {
      setIsBusy(false);
      setConfirmAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-800">휴지통</h2>
            <span className="text-xs text-slate-400">({entries.length}개)</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={entries.length > 0 && selectedIds.size === entries.length}
              onChange={toggleSelectAll}
              className="h-3.5 w-3.5"
            />
            전체 선택
          </label>

          <button
            onClick={() => void handleRestore(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || isBusy}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            선택 항목 복원 ({selectedIds.size})
          </button>

          <button
            onClick={() => requestDelete(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || isBusy}
            className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            선택 항목 영구 삭제
          </button>

          <button
            onClick={() => setConfirmAction("emptyAll")}
            disabled={entries.length === 0 || isBusy}
            className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            휴지통 비우기
          </button>

          {isBusy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
              <Inbox className="h-8 w-8 text-slate-200" />
              휴지통이 비어 있습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <TrashRow
                  key={entry.id}
                  entry={entry}
                  isSelected={selectedIds.has(entry.id)}
                  onToggle={() => toggleSelect(entry.id)}
                  onRestore={() => void handleRestore([entry.id])}
                  onDeletePermanently={() => requestDelete([entry.id])}
                  disabled={isBusy}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction === "emptyAll" ? "휴지통을 완전히 비울까요?" : "선택한 항목을 영구 삭제할까요?"}
          message={
            confirmAction === "emptyAll"
              ? "휴지통에 있는 모든 항목이 영구적으로 삭제되며 되돌릴 수 없습니다."
              : `선택한 ${selectedIds.size}개 항목이 영구적으로 삭제되며 되돌릴 수 없습니다.`
          }
          confirmLabel="영구 삭제"
          onConfirm={() => void handleConfirmedDelete()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function TrashRow({
  entry,
  isSelected,
  onToggle,
  onRestore,
  onDeletePermanently,
  disabled,
}: {
  entry: TrashEntry;
  isSelected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
  disabled: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        isSelected ? "border-rose-200 bg-rose-50" : "border-slate-100"
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {TYPE_LABEL[entry.itemType]}
          </span>
          <p className="truncate text-sm text-slate-700">{entry.label}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{formatRelativeTime(entry.deletedAt)} 삭제됨</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onRestore}
          disabled={disabled}
          title="복원"
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDeletePermanently}
          disabled={disabled}
          title="영구 삭제"
          className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

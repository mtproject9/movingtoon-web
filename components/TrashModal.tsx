"use client";

import { useEffect, useState } from "react";
import { Folder, Inbox, Loader2, Music, RotateCcw, Image as ImageIcon, Trash2, User, X, Check } from "lucide-react";
import { useTrash } from "@/context/TrashContext";
import { useSeries } from "@/context/SeriesContext";
import type {
  BoardImageTrashPayload,
  CharacterTrashPayload,
  CutAssetTrashPayload,
  GalleryImageTrashPayload,
  TrashEntry,
  TrashItemType,
} from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

const TYPE_LABEL: Record<TrashItemType, string> = {
  series: "시리즈",
  episode: "회차",
  character: "캐릭터",
  cut: "컷",
  cutAsset: "에셋 파일",
  galleryImage: "참조 이미지",
  boardImage: "진행 보드 이미지",
};

// 썸네일이 없는 항목(시리즈/회차/오디오 에셋 등)에 대신 보여줄 아이콘.
const TYPE_ICON: Record<TrashItemType, typeof Folder> = {
  series: Folder,
  episode: Folder,
  character: User,
  cut: ImageIcon,
  cutAsset: Music,
  galleryImage: ImageIcon,
  boardImage: ImageIcon,
};

type ThumbSource = { kind: "url"; url: string } | { kind: "blob"; blob: Blob } | { kind: "icon" };

// 항목 타입별로 실제 저장된 데이터(공개 URL 또는 IndexedDB의 Blob)에서
// 미리보기에 쓸 이미지 소스를 뽑아낸다. 없으면 타입별 대표 아이콘으로 대체.
function getThumbSource(entry: TrashEntry): ThumbSource {
  switch (entry.itemType) {
    case "cutAsset": {
      const { asset } = entry.payload as CutAssetTrashPayload;
      return asset.type === "IMAGE" ? { kind: "url", url: asset.thumbnailUrl || asset.fileUrl } : { kind: "icon" };
    }
    case "boardImage": {
      const { image } = entry.payload as BoardImageTrashPayload;
      return { kind: "url", url: image.thumbnailUrl || image.fileUrl };
    }
    case "galleryImage": {
      const { image } = entry.payload as GalleryImageTrashPayload;
      return { kind: "blob", blob: image.meta.thumbnailBlob };
    }
    case "character": {
      const { character } = entry.payload as CharacterTrashPayload;
      return character.profileImage ? { kind: "url", url: character.profileImage } : { kind: "icon" };
    }
    default:
      return { kind: "icon" };
  }
}

// blob이 null이면 애초에 호출부(TrashThumb)가 반환값을 쓰지 않으므로 리셋은 불필요.
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

function TrashThumb({ entry }: { entry: TrashEntry }) {
  const source = getThumbSource(entry);
  const blobUrl = useObjectUrl(source.kind === "blob" ? source.blob : null);
  const Icon = TYPE_ICON[entry.itemType];

  if (source.kind === "url") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={source.url} alt="" loading="lazy" className="h-full w-full object-cover" />
    );
  }
  if (source.kind === "blob") {
    if (!blobUrl) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={blobUrl} alt="" loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Icon className="h-7 w-7 text-slate-300" />
    </div>
  );
}

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
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {entries.map((entry) => (
                <TrashCard
                  key={entry.id}
                  entry={entry}
                  isSelected={selectedIds.has(entry.id)}
                  onToggle={() => toggleSelect(entry.id)}
                  onRestore={() => void handleRestore([entry.id])}
                  onDeletePermanently={() => requestDelete([entry.id])}
                  disabled={isBusy}
                />
              ))}
            </div>
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

function TrashCard({
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
    <div
      className={`group relative flex flex-col overflow-hidden rounded-lg border ${
        isSelected ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={`${entry.label} 선택`}
        className="relative aspect-square w-full overflow-hidden bg-slate-100"
      >
        <TrashThumb entry={entry} />
        <span
          className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
            isSelected
              ? "border-rose-400 bg-rose-500 text-white opacity-100"
              : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
        <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white">
          {TYPE_LABEL[entry.itemType]}
        </span>
      </button>
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <p className="break-all text-xs text-slate-700">{entry.label}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">{formatRelativeTime(entry.deletedAt)}</span>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={onRestore}
              disabled={disabled}
              title="복원"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              onClick={onDeletePermanently}
              disabled={disabled}
              title="영구 삭제"
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

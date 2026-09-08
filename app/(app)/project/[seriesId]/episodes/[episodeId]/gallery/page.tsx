"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BookmarkPlus,
  Check,
  Download,
  Images,
  Loader2,
  Music,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { useAssets } from "@/context/AssetsContext";
import { useTrash } from "@/context/TrashContext";
import { formatCutLabel } from "@/lib/types";
import type { CutAsset } from "@/lib/types";
import { downloadBlob } from "@/lib/downloadFile";
import { addImageToBoard, fetchBoardData } from "@/lib/boardData";
import { isAudioFile, uploadAudioAsset } from "@/lib/assetUpload";
import CutAssetLightbox from "@/components/CutAssetLightbox";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";

type MediaTab = "image" | "audio";

function groupByDate(assets: CutAsset[]): { dateKey: string; items: CutAsset[] }[] {
  const byDate = new Map<string, CutAsset[]>();
  for (const asset of assets) {
    const d = new Date(asset.uploadedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const list = byDate.get(key) ?? [];
    list.push(asset);
    byDate.set(key, list);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, items]) => ({
      dateKey,
      items: items
        .slice()
        .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true })),
    }));
}

export default function GalleryPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { cuts, updateCut } = useCuts();
  const { assets, addAsset, removeAsset, toggleAssetLock } = useAssets();
  const { captureCutAsset } = useTrash();

  const [activeTab, setActiveTab] = useState<MediaTab>("image");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CutAsset[] | null>(null);
  const [pendingBoardAdd, setPendingBoardAdd] = useState<{
    targets: CutAsset[];
    duplicateCount: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  const cutById = useMemo(() => new Map(cuts.map((c) => [c.id, c])), [cuts]);

  function dateLabelOf(dateKey: string): string {
    const [y, m, d] = dateKey.split("-").map(Number);
    return `${y}년 ${m}월 ${d}일`;
  }

  function handleTabChange(tab: MediaTab) {
    setActiveTab(tab);
    setSelectedIds(new Set());
  }

  // 날짜별로 묶고(최근 날짜가 위로), 같은 날짜 안에서는 파일명 순(자연 정렬)으로 보여준다.
  const groups = useMemo(
    () => groupByDate(assets.filter((a) => a.type === "IMAGE")),
    [assets]
  );
  const audioGroups = useMemo(
    () => groupByDate(assets.filter((a) => a.type === "AUDIO")),
    [assets]
  );

  // 라이트박스는 화면에 그려지는 순서(날짜 그룹 → 파일명 순)를 그대로 따라야
  // 이전/다음 탐색이 실제로 보이는 순서와 어긋나지 않는다.
  const images = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const audioList = useMemo(() => audioGroups.flatMap((g) => g.items), [audioGroups]);
  const currentList = activeTab === "image" ? images : audioList;
  const selectedAssets = currentList.filter((item) => selectedIds.has(item.id));
  const deletableSelectedAssets = selectedAssets.filter((item) => !item.locked);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 잠그는 순간 선택 체크박스 자체가 사라지므로, 잠그기 직전에 선택돼 있었다면
  // 화면에 안 보이는 채로 선택 상태만 남는 것을 막기 위해 선택도 함께 해제한다.
  function handleToggleLock(asset: CutAsset) {
    toggleAssetLock(asset.id);
    if (!asset.locked) {
      setSelectedIds((prev) => {
        if (!prev.has(asset.id)) return prev;
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  }

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("episodeId", episodeId);
        form.append("file", file);
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });
        const body = (await res.json().catch(() => null)) as
          | { fileUrl?: string; thumbnailUrl?: string; fileName?: string; error?: string }
          | null;
        if (!res.ok || !body?.fileUrl) {
          setToast({ type: "error", message: body?.error ?? "업로드에 실패했습니다." });
          continue;
        }
        // 컷에 종속되지 않는 이미지(배경, 외부에서 수정해 온 이미지 등)라 cutId 없이 추가한다.
        addAsset(undefined, "IMAGE", body.fileUrl, body.fileName ?? file.name, body.thumbnailUrl);
      }
      setToast({ type: "success", message: "이미지를 추가했습니다." });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUploadAudio(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter(isAudioFile);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        try {
          const uploaded = await uploadAudioAsset(episodeId, file);
          // 컷에 종속시키지 않고 회차 단위 오디오 보관함에만 추가한다.
          addAsset(undefined, "AUDIO", uploaded.fileUrl, uploaded.fileName);
        } catch (err) {
          setToast({
            type: "error",
            message: err instanceof Error ? err.message : "업로드에 실패했습니다.",
          });
        }
      }
      setToast({ type: "success", message: "오디오를 추가했습니다." });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(asset: CutAsset) {
    try {
      const res = await fetch(asset.fileUrl);
      const blob = await res.blob();
      downloadBlob(blob, asset.fileName);
    } catch {
      setToast({ type: "error", message: "다운로드에 실패했습니다." });
    }
  }

  async function handleBulkDownload(targets: CutAsset[]) {
    if (targets.length === 0) return;
    setIsDownloading(true);
    try {
      for (const asset of targets) {
        await handleDownload(asset);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  async function addToBoard(targets: CutAsset[]) {
    if (targets.length === 0) return;
    let failCount = 0;
    for (const asset of targets) {
      const result = await addImageToBoard(episodeId, {
        fileUrl: asset.fileUrl,
        thumbnailUrl: asset.thumbnailUrl,
        fileName: asset.fileName,
        sourceCutId: asset.cutId,
      });
      if (!result.ok) failCount += 1;
    }
    if (failCount === 0) {
      setToast({
        type: "success",
        message: targets.length > 1 ? `${targets.length}장을 진행 보드에 추가했습니다.` : "진행 보드에 추가했습니다.",
      });
    } else {
      setToast({ type: "error", message: `${failCount}장은 추가하지 못했습니다.` });
    }
  }

  // 이미 진행 보드에 있는 이미지(같은 fileUrl)를 또 보내려는 경우, 모르고 중복
  // 추가하는 걸 막기 위해 먼저 확인을 받는다 — 중복이 하나도 없으면 바로 추가.
  async function requestAddToBoard(targets: CutAsset[]) {
    if (targets.length === 0) return;
    const board = await fetchBoardData(episodeId);
    const boardUrls = new Set(board.board.map((img) => img.fileUrl));
    const duplicateCount = targets.filter((asset) => boardUrls.has(asset.fileUrl)).length;
    if (duplicateCount === 0) {
      await addToBoard(targets);
      return;
    }
    setPendingBoardAdd({ targets, duplicateCount });
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const targets = pendingDelete;

    // 확인창을 즉시 닫고 화면에서도 바로 지운다(낙관적 업데이트) — 응답을 기다리는
    // 동안 "안 눌린 줄" 알고 다시 누르는 걸 원천 차단하고, 체감 속도도 빨라진다.
    // 실제 휴지통 이동은 뒤에서 진행된다.
    setPendingDelete(null);
    setLightboxIndex(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      targets.forEach((a) => next.delete(a.id));
      return next;
    });
    targets.forEach((asset) => removeAsset(asset.id));

    // 이미지를 지워서 그 컷에 남은 이미지가 하나도 없어지면, "작화완료" 상태가
    // 더 이상 사실이 아니므로 "원고 완료"로 되돌린다.
    const deletedIds = new Set(targets.map((asset) => asset.id));
    const affectedCutIds = new Set(
      targets
        .filter((asset) => asset.type === "IMAGE" && asset.cutId)
        .map((asset) => asset.cutId!)
    );
    for (const cutId of affectedCutIds) {
      const remaining = assets.filter(
        (asset) => asset.cutId === cutId && asset.type === "IMAGE" && !deletedIds.has(asset.id)
      );
      if (remaining.length > 0) continue;
      const cut = cutById.get(cutId);
      if (cut && cut.status === "DRAWING") {
        updateCut(cut.id, { status: "SCRIPT_DONE" });
      }
    }

    for (const asset of targets) {
      await captureCutAsset(episodeId, asset);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-lg font-semibold text-slate-800">
            {activeTab === "image" ? (
              <Images className="h-4.5 w-4.5 text-slate-400" />
            ) : (
              <Music className="h-4.5 w-4.5 text-slate-400" />
            )}
            {activeTab === "image" ? "이미지 갤러리" : "오디오 보관함"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeTab === "image"
              ? `컷 이미지뿐 아니라 배경·수정본처럼 직접 올린 이미지도 여기 모여요. (${images.length}장)`
              : `이 회차의 오디오 파일을 컷과 무관하게 모아두는 공간이에요. (${audioList.length}개)`}
          </p>
        </div>
        {activeTab === "image" ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">
            <Upload className="h-3.5 w-3.5" />
            이미지 업로드
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">
            <Upload className="h-3.5 w-3.5" />
            오디오 업로드
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleUploadAudio(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 px-6 pt-2">
        <button
          onClick={() => handleTabChange("image")}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "image"
              ? "border-b-2 border-rose-500 text-rose-600"
              : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Images className="h-3.5 w-3.5" />
          이미지
        </button>
        <button
          onClick={() => handleTabChange("audio")}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "audio"
              ? "border-b-2 border-rose-500 text-rose-600"
              : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Music className="h-3.5 w-3.5" />
          오디오
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-2.5">
        {activeTab === "image" && (
          <button
            onClick={() => void requestAddToBoard(selectedAssets)}
            disabled={selectedAssets.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 active:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            진행 보드에 추가 ({selectedAssets.length})
          </button>
        )}
        <button
          onClick={() => void handleBulkDownload(selectedAssets)}
          disabled={selectedAssets.length === 0 || isDownloading}
          className="flex items-center gap-1.5 rounded-full border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-50 active:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download className="h-3.5 w-3.5" />
          선택 다운로드 ({selectedAssets.length})
        </button>
        <button
          onClick={() => setPendingDelete(deletableSelectedAssets)}
          disabled={deletableSelectedAssets.length === 0}
          title={
            selectedAssets.length > deletableSelectedAssets.length
              ? "잠긴 이미지는 선택 삭제에서 제외됩니다"
              : undefined
          }
          className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Trash2 className="h-3.5 w-3.5" />
          선택 삭제 ({deletableSelectedAssets.length})
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200"
          >
            <X className="h-3.5 w-3.5" />
            선택 해제
          </button>
        )}
        {(isUploading || isDownloading) && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isUploading ? "업로드 중..." : "다운로드 중..."}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {activeTab === "audio" ? (
          audioList.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
              <Music className="h-8 w-8 text-slate-200" />
              아직 업로드된 오디오가 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {audioGroups.map((group) => (
                <section key={group.dateKey}>
                  <h2 className="mb-2 text-xs font-semibold text-slate-400">
                    {dateLabelOf(group.dateKey)} · {group.items.length}개
                  </h2>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((asset) => {
                      const isSelected = selectedIds.has(asset.id);
                      return (
                        <li
                          key={asset.id}
                          className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                            isSelected ? "border-rose-200 bg-rose-50" : "border-slate-200"
                          }`}
                        >
                          <button
                            onClick={() => toggleSelect(asset.id)}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                              isSelected
                                ? "border-rose-400 bg-rose-500 text-white"
                                : "border-slate-300 text-transparent hover:border-slate-400"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-0 flex-1 break-all text-sm text-slate-700">
                            {asset.fileName}
                          </span>
                          <audio controls src={asset.fileUrl} className="h-8 w-64 shrink-0" />
                          <button
                            onClick={() => void handleDownload(asset)}
                            title="다운로드"
                            className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDelete([asset])}
                            title="삭제"
                            className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : images.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
            <Images className="h-8 w-8 text-slate-200" />
            아직 생성되거나 업로드된 이미지가 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.dateKey}>
                <h2 className="mb-2 text-xs font-semibold text-slate-400">
                  {dateLabelOf(group.dateKey)} · {group.items.length}장
                </h2>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {group.items.map((asset) => {
                    const cut = asset.cutId ? cutById.get(asset.cutId) : null;
                    const isSelected = selectedIds.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                      >
                        <button
                          onClick={() =>
                            setLightboxIndex(images.findIndex((img) => img.id === asset.id))
                          }
                          aria-label={`${asset.fileName} 확대 보기`}
                          className="absolute inset-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.thumbnailUrl || asset.fileUrl}
                            alt={asset.fileName}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </button>
                        {!asset.locked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(asset.id);
                            }}
                            className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
                              isSelected
                                ? "border-rose-400 bg-rose-500 text-white opacity-100"
                                : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                          <span className="truncate text-[10px] font-medium text-white">
                            {cut ? `${formatCutLabel(cut.cutNumber)} · v${asset.version}` : "직접 추가"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLock(asset);
                          }}
                          title={asset.locked ? "삭제 잠금 해제" : "삭제 잠금 (실수로 지우는 것 방지)"}
                          className={`pointer-events-auto absolute right-1.5 top-1.5 z-10 rounded-full bg-white/90 p-1 transition-colors ${
                            asset.locked ? "text-rose-500" : "text-slate-300 hover:text-rose-400"
                          }`}
                        >
                          <Star className="h-3 w-3" fill={asset.locked ? "currentColor" : "none"} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {lightboxIndex !== null && images.length > 0 && (
        <CutAssetLightbox
          assets={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={(asset) => void handleDownload(asset)}
          onDelete={(asset) => setPendingDelete([asset])}
          onAddToBoard={(asset) => void requestAddToBoard([asset])}
          onToggleLock={(asset) => handleToggleLock(asset)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={
            pendingDelete.length > 1
              ? `${pendingDelete[0].type === "AUDIO" ? "오디오" : "이미지"} ${pendingDelete.length}${pendingDelete[0].type === "AUDIO" ? "개" : "장"}를 삭제할까요?`
              : `${pendingDelete[0].type === "AUDIO" ? "오디오" : "이미지"}를 삭제할까요?`
          }
          message="휴지통으로 이동하며, 휴지통에서 다시 복원할 수 있습니다."
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingBoardAdd && (
        <ConfirmDialog
          title="이미 진행 보드에 있는 이미지입니다"
          message={
            pendingBoardAdd.targets.length === 1
              ? "선택한 이미지는 이미 진행 보드에 있어요. 그래도 다시 추가할까요?"
              : `선택한 ${pendingBoardAdd.targets.length}장 중 ${pendingBoardAdd.duplicateCount}장은 이미 진행 보드에 있어요. 그래도 모두 추가할까요?`
          }
          confirmLabel="추가"
          danger={false}
          onConfirm={() => {
            const targets = pendingBoardAdd.targets;
            setPendingBoardAdd(null);
            void addToBoard(targets);
          }}
          onCancel={() => setPendingBoardAdd(null)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </div>
  );
}

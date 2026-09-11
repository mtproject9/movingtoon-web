"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import JSZip from "jszip";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FolderArchive,
  GripVertical,
  ImagePlus,
  Images,
  LayoutDashboard,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useAssets } from "@/context/AssetsContext";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import { fetchBoardData, makeBoardImageId, saveBoardData } from "@/lib/boardData";
import { formatEpisodeLabel, type BoardImage } from "@/lib/types";
import { downloadBlob } from "@/lib/downloadFile";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";

export default function BoardPage() {
  const { seriesId, episodeId } = useParams<{ seriesId: string; episodeId: string }>();
  const { captureBoardImage } = useTrash();
  const { addAsset, removeAsset } = useAssets();
  const { getSeries, getEpisode } = useSeries();

  const [images, setImages] = useState<BoardImage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BoardImage | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // "이 인덱스 앞에 끼워넣는다"는 뜻 — images.length면 맨 끝. 이미지 사이사이에
  // 빨간 삽입선을 그리는 기준이 된다.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const boardUpdatedAtRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await fetchBoardData(episodeId);
    const sorted = data.board.slice().sort((a, b) => a.order - b.order);
    setImages(sorted);
    boardUpdatedAtRef.current = data.boardUpdatedAt;
    setSelectedId((prev) => (prev && sorted.some((img) => img.id === prev) ? prev : sorted[0]?.id ?? null));
    setHydrated(true);
  }, [episodeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function persist(next: BoardImage[]) {
    // 순서 변경처럼 눈에 바로 보여야 하는 조작은 저장 응답을 기다리지 않고 화면부터
    // 즉시 갱신한다(낙관적 업데이트) — 저장은 뒤에서 진행되고, 실패했을 때만
    // 서버의 실제 상태로 되돌린다.
    setImages(next);
    setIsSaving(true);
    const result = await saveBoardData(episodeId, next, boardUpdatedAtRef.current);
    setIsSaving(false);
    if (!result.ok) {
      setToast({ type: "error", message: result.error ?? "저장하지 못했습니다." });
      // 버전 충돌 등으로 실패했으면 서버의 실제 최신 상태로 다시 맞춘다.
      await load();
      return false;
    }
    if (typeof result.boardUpdatedAt === "number") {
      boardUpdatedAtRef.current = result.boardUpdatedAt;
    }
    return true;
  }

  function moveImage(id: string, direction: -1 | 1) {
    const index = images.findIndex((img) => img.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= images.length) return;

    const reordered = images.slice();
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const renumbered = reordered.map((img, i) => ({ ...img, order: i }));
    void persist(renumbered);
  }

  function handleDragStart(id: string) {
    setDraggedId(id);
  }

  // 마우스가 이 항목의 위쪽 절반이면 그 항목 "앞"에, 아래쪽 절반이면 "뒤"에
  // 끼워넣을 위치로 인식해 삽입선을 그 경계에 그린다.
  function handleDragOverItem(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY < rect.top + rect.height / 2;
    const next = isTopHalf ? index : index + 1;
    if (next !== dropIndex) setDropIndex(next);
  }

  function handleDragOverEnd(e: React.DragEvent) {
    e.preventDefault();
    if (dropIndex !== images.length) setDropIndex(images.length);
  }

  function commitDrop() {
    const sourceId = draggedId;
    const targetIndex = dropIndex;
    setDraggedId(null);
    setDropIndex(null);
    if (!sourceId || targetIndex === null) return;

    const fromIndex = images.findIndex((img) => img.id === sourceId);
    if (fromIndex === -1) return;
    // 자기 자신의 바로 앞/뒤 자리로 "이동"하는 건 사실상 순서가 안 바뀌므로 건너뛴다.
    if (targetIndex === fromIndex || targetIndex === fromIndex + 1) return;

    const reordered = images.slice();
    const [moved] = reordered.splice(fromIndex, 1);
    const adjustedIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    reordered.splice(adjustedIndex, 0, moved);
    const renumbered = reordered.map((img, i) => ({ ...img, order: i }));
    void persist(renumbered);
  }

  function handleDropOnItem(e: React.DragEvent) {
    e.preventDefault();
    commitDrop();
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropIndex(null);
  }

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const nextImages = images.slice();
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
        nextImages.push({
          id: makeBoardImageId(),
          fileUrl: body.fileUrl,
          thumbnailUrl: body.thumbnailUrl,
          fileName: body.fileName ?? file.name,
          order: nextImages.length,
          addedAt: Date.now(),
        });
      }
      const ok = await persist(nextImages);
      if (ok) setToast({ type: "success", message: "이미지를 추가했습니다." });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(image: BoardImage) {
    try {
      const res = await fetch(image.fileUrl);
      if (!res.ok) throw new Error(`파일을 가져오지 못했습니다 (${res.status}).`);
      const blob = await res.blob();
      downloadBlob(blob, image.fileName);
    } catch {
      setToast({ type: "error", message: "다운로드에 실패했습니다." });
    }
  }

  // 캡컷에 그대로 가져다 붙일 수 있도록, 여기서 직접 정렬한 최종 순서를 파일명
  // 맨 앞자리 번호로 못박아 압축한다 — 탐색기/캡컷에서 이름순 정렬해도 이 순서가
  // 그대로 유지된다.
  async function handleExportCapCut() {
    if (images.length === 0) return;
    setIsExporting(true);
    try {
      const padWidth = Math.max(2, String(images.length).length);
      const zip = new JSZip();
      let skipped = 0;
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const res = await fetch(image.fileUrl);
        if (!res.ok) {
          skipped += 1;
          continue;
        }
        const blob = await res.blob();
        const tag = String(i + 1).padStart(padWidth, "0");
        zip.file(`${tag}_${image.fileName}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const series = getSeries(seriesId);
      const episode = getEpisode(episodeId);
      const episodeLabel = episode ? formatEpisodeLabel(episode) : episodeId;
      const zipName = `${series?.title || "시리즈"}_${episodeLabel}_CapCut.zip`.replace(
        /[\\/:*?"<>|]/g,
        "_"
      );
      downloadBlob(content, zipName);
      // 일부 이미지를 못 가져와 건너뛴 경우, 성공 토스트만 보고 전체가 다 들어간 줄
      // 오해하지 않도록 몇 장이 빠졌는지 함께 알린다.
      setToast(
        skipped > 0
          ? {
              type: "error",
              message: `이미지 ${images.length - skipped}장만 내보냈습니다 (${skipped}장은 파일을 가져오지 못해 제외됨).`,
            }
          : { type: "success", message: `이미지 ${images.length}장을 캡컷용으로 내보냈습니다.` }
      );
    } catch {
      setToast({ type: "error", message: "캡컷 패키지를 만드는 중 오류가 발생했습니다." });
    } finally {
      setIsExporting(false);
    }
  }

  // "보내기"이므로 복사가 아니라 실제 이동 — 갤러리에 추가하는 동시에 보드 목록에서는
  // 뺀다. 토스트가 뜨는 시점엔 이미 화면에도(목록에서 사라짐 + 갤러리에 반영) 반영돼
  // 있어야 하므로 순서상 가장 먼저, 동기적으로 처리한다. 실제 서버 저장(persist)은
  // 뒤에서 진행되는데, 만약 이게 실패하면(버전 충돌 등) persist가 서버 최신 상태로
  // 되돌리면서 이미지가 보드에 다시 나타난다 — 그때 갤러리 쪽 사본을 롤백하지 않으면
  // 같은 이미지가 보드와 갤러리 양쪽에 남는다. 그래서 persist 결과를 기다렸다가
  // 실패 시 방금 만든 갤러리 자산을 지운다.
  async function handleSendToGallery(image: BoardImage) {
    const created = addAsset(undefined, "IMAGE", image.fileUrl, image.fileName, image.thumbnailUrl);
    const remaining = images
      .filter((img) => img.id !== image.id)
      .map((img, i) => ({ ...img, order: i }));
    setSelectedId((prev) => (prev === image.id ? remaining[0]?.id ?? null : prev));
    setToast({ type: "success", message: "이미지 갤러리로 보냈습니다." });

    const ok = await persist(remaining);
    if (!ok) {
      removeAsset(created.id);
      setToast({ type: "error", message: "저장에 실패해 갤러리로 보내기가 취소됐습니다." });
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;

    // 확인창을 즉시 닫고 화면에서도 바로 지운다(낙관적 업데이트) — 응답을 기다리는
    // 동안 다시 눌러서 중복으로 휴지통에 쌓이는 걸 막고, 체감 속도도 빨라진다.
    setPendingDelete(null);
    const remaining = images
      .filter((img) => img.id !== target.id)
      .map((img, i) => ({ ...img, order: i }));
    setImages(remaining);
    setSelectedId((prev) => (prev === target.id ? remaining[0]?.id ?? null : prev));

    await captureBoardImage(episodeId, target);
    // 휴지통 이동은 이미 서버 board 컬럼에서도 제거된 상태이므로, 최신 버전만 다시 읽어온다.
    const data = await fetchBoardData(episodeId);
    boardUpdatedAtRef.current = data.boardUpdatedAt;
  }

  const selected = images.find((img) => img.id === selectedId) ?? null;

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-lg font-semibold text-slate-800">
            <LayoutDashboard className="h-4.5 w-4.5 text-slate-400" />
            진행 보드 · 최종 이미지 모음
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            실제로 쓰기로 확정한 이미지만 모아서 순서를 정리하는 공간이에요. 컷 이미지 옆의
            <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              최종 이미지 모음에 추가
            </span>
            버튼으로 여기에 담을 수 있어요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
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
          <button
            onClick={() => void handleExportCapCut()}
            disabled={isExporting || images.length === 0}
            title="현재 나열된 순서 그대로 이미지를 압축해 내려받습니다"
            className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderArchive className="h-3.5 w-3.5" />
            )}
            캡컷 패키지 (.zip)
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-3 lg:border-b-0 lg:border-r">
          {isUploading && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              업로드 중...
            </div>
          )}

          {images.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
              <ImagePlus className="h-7 w-7 text-slate-200" />
              아직 모아둔 이미지가 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col" onDragEnd={handleDragEnd}>
              {images.map((image, index) => (
                <li key={image.id}>
                  <div
                    className={`transition-all ${
                      dropIndex === index ? "h-1 rounded-full bg-rose-500" : "h-1"
                    }`}
                  />
                  <div
                    draggable
                    onDragStart={() => handleDragStart(image.id)}
                    onDragOver={(e) => handleDragOverItem(e, index)}
                    onDrop={handleDropOnItem}
                    className={`group flex items-start gap-1 rounded-lg border p-1.5 transition-colors ${
                      draggedId === image.id
                        ? "opacity-40"
                        : selectedId === image.id
                          ? "border-rose-300 bg-rose-50"
                          : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="shrink-0 cursor-grab pt-2.5 text-slate-300 hover:text-slate-400 active:cursor-grabbing"
                      title="드래그해서 순서 바꾸기"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <button
                      onClick={() => setSelectedId(image.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span className="w-5 shrink-0 pt-2.5 text-center text-[11px] font-semibold text-slate-400">
                        {index + 1}
                      </span>
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.thumbnailUrl || image.fileUrl}
                          alt={image.fileName}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="min-w-0 flex-1 py-0.5 text-xs break-all text-slate-600">
                        {image.fileName}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => moveImage(image.id, -1)}
                        disabled={index === 0}
                        title="위로 이동"
                        className="rounded p-0.5 text-slate-400 hover:text-rose-500 disabled:opacity-20"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveImage(image.id, 1)}
                        disabled={index === images.length - 1}
                        title="아래로 이동"
                        className="rounded p-0.5 text-slate-400 hover:text-rose-500 disabled:opacity-20"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              <li
                onDragOver={handleDragOverEnd}
                onDrop={handleDropOnItem}
                className="min-h-[6px]"
              >
                <div
                  className={`transition-all ${
                    dropIndex === images.length ? "h-1 rounded-full bg-rose-500" : "h-1"
                  }`}
                />
              </li>
            </ul>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
          {selected ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.fileUrl}
                alt={selected.fileName}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-sm"
              />
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">{selected.fileName}</p>
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSendToGallery(selected)}
                  className="flex items-center gap-1.5 rounded-full border border-indigo-200 px-3.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  <Images className="h-3.5 w-3.5" />
                  이미지 갤러리로 보내기
                </button>
                <button
                  onClick={() => void handleDownload(selected)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  다운로드
                </button>
                <button
                  onClick={() => setPendingDelete(selected)}
                  className="flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">왼쪽 목록에서 이미지를 선택하면 여기에 표시됩니다.</p>
          )}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="이미지를 삭제할까요?"
          message="휴지통으로 이동하며, 휴지통에서 다시 복원할 수 있습니다."
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Check,
  Download,
  FolderArchive,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Character, GalleryImageMeta } from "@/lib/types";
import {
  MAX_GALLERY_IMAGES,
  addGalleryImages,
  getOriginalImageBlob,
  listGalleryImages,
} from "@/lib/galleryDb";
import { useTrash } from "@/context/TrashContext";
import { downloadBlob } from "@/lib/downloadFile";
import { readFileAsDataUrl } from "@/lib/files";
import LazyThumbnail from "./LazyThumbnail";
import LightboxModal from "./LightboxModal";
import ConfirmDialog from "./ConfirmDialog";

function uniqueFileName(usedNames: Set<string>, fileName: string): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (usedNames.has(candidate)) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

export default function CharacterGalleryModal({
  character,
  onClose,
  onSetProfileImage,
}: {
  character: Character;
  onClose: () => void;
  onSetProfileImage: (dataUrl: string) => void;
}) {
  const [images, setImages] = useState<GalleryImageMeta[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imagesPendingDelete, setImagesPendingDelete] = useState<GalleryImageMeta[] | null>(null);

  const { captureGalleryImages } = useTrash();
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // 캐릭터가 바뀔 때마다 IndexedDB에서 새로 읽어와야 하므로 로딩 상태를 즉시 표시한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingList(true);
    listGalleryImages(character.id).then((list) => {
      if (cancelled) return;
      setImages(list);
      setIsLoadingList(false);
    });
    return () => {
      cancelled = true;
    };
  }, [character.id]);

  async function handleFiles(fileList: File[]) {
    const imageFiles = fileList.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const room = MAX_GALLERY_IMAGES - images.length;
    if (room <= 0) {
      setMessage(`이미지는 캐릭터당 최대 ${MAX_GALLERY_IMAGES}장까지 저장할 수 있습니다.`);
      return;
    }

    const accepted = imageFiles.slice(0, room);
    const skipped = imageFiles.length - accepted.length;

    setIsUploading(true);
    try {
      const created = await addGalleryImages(character.id, accepted);
      setImages((prev) => [...prev, ...created].sort((a, b) => a.order - b.order));
      setMessage(
        skipped > 0
          ? `최대 ${MAX_GALLERY_IMAGES}장 제한으로 ${skipped}장은 업로드되지 않았습니다.`
          : null
      );
    } catch {
      setMessage("이미지를 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragActive(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSetProfile(image: GalleryImageMeta) {
    const dataUrl = await readFileAsDataUrl(image.thumbnailBlob);
    onSetProfileImage(dataUrl);
  }

  async function handleConfirmDeleteImages() {
    if (!imagesPendingDelete) return;
    await captureGalleryImages(imagesPendingDelete);
    const idsToRemove = new Set(imagesPendingDelete.map((image) => image.id));
    setImages((prev) => prev.filter((item) => !idsToRemove.has(item.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      idsToRemove.forEach((id) => next.delete(id));
      return next;
    });
    setImagesPendingDelete(null);
  }

  async function handleDownloadOne(image: GalleryImageMeta) {
    const blob = await getOriginalImageBlob(image.id);
    if (blob) downloadBlob(blob, image.fileName);
  }

  async function handleDownloadZip(targets: GalleryImageMeta[]) {
    if (targets.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const image of targets) {
        const blob = await getOriginalImageBlob(image.id);
        if (!blob) continue;
        zip.file(uniqueFileName(usedNames, image.fileName), blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(content, `${character.name || "character"}_gallery.zip`);
    } catch {
      setMessage("ZIP 파일을 만드는 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsZipping(false);
    }
  }

  const selectedImages = images.filter((image) => selectedIds.has(image.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {character.name || "캐릭터"} · 참조 이미지 갤러리
            </h2>
            <p className="text-xs text-slate-400">
              {images.length} / {MAX_GALLERY_IMAGES}장
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">
            <Upload className="h-3.5 w-3.5" />
            이미지 업로드
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleInputChange}
              className="hidden"
            />
          </label>

          <button
            onClick={() => void handleDownloadZip(images)}
            disabled={images.length === 0 || isZipping}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FolderArchive className="h-3.5 w-3.5" />
            전체 다운로드 (ZIP)
          </button>

          <button
            onClick={() => void handleDownloadZip(selectedImages)}
            disabled={selectedImages.length === 0 || isZipping}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            선택 다운로드 ({selectedImages.length})
          </button>

          <button
            onClick={() => setImagesPendingDelete(selectedImages)}
            disabled={selectedImages.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            선택 삭제 ({selectedImages.length})
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              선택 해제
            </button>
          )}

          {(isUploading || isZipping) && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isUploading ? "업로드 중..." : "압축 중..."}
            </span>
          )}
        </div>

        {message && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-700">
            {message}
          </div>
        )}

        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative min-h-0 flex-1 overflow-y-auto p-5"
        >
          {isDragActive && (
            <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/90">
              <p className="text-sm font-medium text-rose-500">여기에 이미지를 놓아 업로드</p>
            </div>
          )}

          {isLoadingList ? (
            <div className="flex h-full items-center justify-center text-slate-300">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-400">
              <ImagePlus className="h-8 w-8 text-slate-200" />
              아직 등록된 참조 이미지가 없습니다.
              <br />
              이미지를 드래그하거나 &quot;이미지 업로드&quot;로 최대 {MAX_GALLERY_IMAGES}장까지
              추가해보세요.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {images.map((image, index) => (
                <GalleryGridItem
                  key={image.id}
                  image={image}
                  isSelected={selectedIds.has(image.id)}
                  onToggleSelect={() => toggleSelect(image.id)}
                  onOpen={() => setLightboxIndex(index)}
                  onSetProfile={() => void handleSetProfile(image)}
                  onDownload={() => void handleDownloadOne(image)}
                  onDelete={() => setImagesPendingDelete([image])}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <LightboxModal
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={(image) => void handleDownloadOne(image)}
          onSetProfile={(image) => void handleSetProfile(image)}
          onDelete={(image) => setImagesPendingDelete([image])}
        />
      )}

      {imagesPendingDelete && (
        <ConfirmDialog
          title={
            imagesPendingDelete.length > 1
              ? `이미지 ${imagesPendingDelete.length}장을 삭제할까요?`
              : "이미지를 삭제할까요?"
          }
          message="휴지통으로 이동하며, 휴지통에서 다시 복원할 수 있습니다."
          onConfirm={() => void handleConfirmDeleteImages()}
          onCancel={() => setImagesPendingDelete(null)}
        />
      )}
    </div>
  );
}

function GalleryGridItem({
  image,
  isSelected,
  onToggleSelect,
  onOpen,
  onSetProfile,
  onDownload,
  onDelete,
}: {
  image: GalleryImageMeta;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onSetProfile: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <LazyThumbnail blob={image.thumbnailBlob} alt={image.fileName} className="h-full w-full" />

      <button
        onClick={onOpen}
        aria-label={`${image.fileName} 확대 보기`}
        className="absolute inset-0"
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
          isSelected
            ? "border-rose-400 bg-rose-500 text-white opacity-100"
            : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetProfile();
          }}
          title="대표 프로필 이미지로 지정"
          className="rounded-full bg-white/90 p-1 text-slate-600 hover:text-amber-500"
        >
          <Star className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          title="다운로드"
          className="rounded-full bg-white/90 p-1 text-slate-600 hover:text-rose-500"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="삭제"
          className="rounded-full bg-white/90 p-1 text-slate-600 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

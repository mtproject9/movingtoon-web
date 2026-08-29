"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Wand2,
  ZoomIn,
} from "lucide-react";
import type { Cut, CutAsset } from "@/lib/types";
import { formatCutLabel } from "@/lib/types";
import {
  buildMidjourneyPrompt,
  buildTagStylePrompt,
  extractSpeakerName,
  resolveCutPrompt,
  type CharacterAppearance,
} from "@/lib/promptRules";
import { GeminiApiKeyMissingError } from "@/lib/geminiGenerate";
import StatusBadge from "./StatusBadge";
import CutAudioSlot from "./CutAudioSlot";

function FieldCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 막힌 환경에서는 조용히 무시
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
      }`}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

export default function CutStudioRow({
  cut,
  presetId,
  characters,
  images,
  audioAssets,
  isUploading,
  onChangeCut,
  onUploadFiles,
  onUploadAudioFiles,
  onOpenLightbox,
  onDeleteAsset,
  onDropTrayItem,
  onGenerateWithGemini,
}: {
  cut: Cut;
  presetId: string;
  characters: CharacterAppearance[];
  images: CutAsset[];
  audioAssets: CutAsset[];
  isUploading: boolean;
  onChangeCut: (patch: Partial<Cut>) => void;
  onUploadFiles: (cut: Cut, files: FileList | File[]) => void;
  onUploadAudioFiles: (cut: Cut, files: FileList | File[]) => void;
  onOpenLightbox: (cutId: string, index: number) => void;
  onDeleteAsset: (asset: CutAsset) => void;
  onDropTrayItem: (cut: Cut, trayId: string) => void;
  onGenerateWithGemini: (cut: Cut) => Promise<void>;
}) {
  const [isSlotDragActive, setIsSlotDragActive] = useState(false);
  const [midjourneyCopied, setMidjourneyCopied] = useState(false);
  const [tagCopied, setTagCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const speaker = extractSpeakerName(cut.dialogue);
  const matchedCharacter = useMemo(
    () =>
      speaker ? characters.find((c) => c.name.trim() === speaker.trim()) ?? null : null,
    [characters, speaker]
  );

  const resolved = useMemo(
    () => resolveCutPrompt(cut, presetId, characters),
    [cut, presetId, characters]
  );
  const isCustomized = cut.promptEn !== undefined || cut.promptKo !== undefined;

  async function handleCopyMidjourney() {
    try {
      await navigator.clipboard.writeText(buildMidjourneyPrompt(resolved.promptEn));
      setMidjourneyCopied(true);
      setTimeout(() => setMidjourneyCopied(false), 1500);
    } catch {
      // 클립보드 접근이 막힌 환경에서는 조용히 무시
    }
  }

  async function handleCopyTagStyle() {
    try {
      await navigator.clipboard.writeText(buildTagStylePrompt(cut, matchedCharacter ?? undefined));
      setTagCopied(true);
      setTimeout(() => setTagCopied(false), 1500);
    } catch {
      // 클립보드 접근이 막힌 환경에서는 조용히 무시
    }
  }

  async function handleGenerateClick() {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      await onGenerateWithGemini(cut);
    } catch (err) {
      if (err instanceof GeminiApiKeyMissingError) {
        // 전역 안내 모달이 이미 뜨므로 행 단위로 다시 에러를 보여주지 않는다.
      } else {
        setGenerateError(err instanceof Error ? err.message : "생성에 실패했습니다.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsSlotDragActive(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsSlotDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsSlotDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      onUploadFiles(cut, e.dataTransfer.files);
      return;
    }
    const trayId = e.dataTransfer.getData("text/plain");
    if (trayId) onDropTrayItem(cut, trayId);
  }

  const latest = images[images.length - 1] ?? null;

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {formatCutLabel(cut.cutNumber)}
            </h3>
            <p className="text-xs text-slate-400">Scene {cut.sceneNumber}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={cut.status} />
            {isCustomized && (
              <button
                onClick={() => onChangeCut({ promptEn: undefined, promptKo: undefined })}
                title="스타일 프리셋 기준으로 다시 생성"
                className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                <RotateCcw className="h-3 w-3" />
                재생성
              </button>
            )}
          </div>
        </div>

        {(cut.dialogue || cut.directionNote) && (
          <p className="line-clamp-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
            {cut.dialogue || cut.directionNote}
          </p>
        )}

        {speaker && (
          <div
            className={`flex items-center gap-1.5 text-[11px] ${
              matchedCharacter ? "text-emerald-600" : "text-slate-400"
            }`}
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            {matchedCharacter
              ? `"${matchedCharacter.name}" 외형 태그 적용됨`
              : `"${speaker}" 캐릭터가 시트에 없어 기본 문구로 대체됨`}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">영문 프롬프트</span>
            <FieldCopyButton text={resolved.promptEn} />
          </div>
          <textarea
            value={resolved.promptEn}
            onChange={(e) => onChangeCut({ promptEn: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 p-2 font-mono text-[11px] leading-relaxed text-slate-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <p className="line-clamp-1 text-[11px] text-slate-500">한글: {resolved.promptKo}</p>
          <FieldCopyButton text={resolved.promptKo} />
        </div>

        <div className="mt-auto flex items-center gap-1.5">
          <button
            onClick={() => void handleCopyMidjourney()}
            title="캐릭터 외형 태그 + 씬 프롬프트 + --ar 16:9 조합 복사"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white transition-colors ${
              midjourneyCopied ? "bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
            }`}
          >
            {midjourneyCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {midjourneyCopied ? "복사됨!" : "미드저니용"}
          </button>
          <button
            onClick={() => void handleCopyTagStyle()}
            title="캐릭터 핵심 키워드 + 씬 묘사를 쉼표로 구분한 태그형 복사"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white transition-colors ${
              tagCopied ? "bg-emerald-600" : "bg-indigo-500 hover:bg-indigo-600"
            }`}
          >
            {tagCopied ? <Check className="h-3.5 w-3.5" /> : <Tags className="h-3.5 w-3.5" />}
            {tagCopied ? "복사됨!" : "나노바나나/태그형"}
          </button>
        </div>

        <button
          onClick={() => void handleGenerateClick()}
          disabled={isGenerating}
          className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
            isGenerating
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
          }`}
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? "생성 중..." : "Gemini 즉시 생성"}
        </button>

        {generateError && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
            <span className="line-clamp-1">{generateError}</span>
            <button
              onClick={() => void handleGenerateClick()}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              재시도
            </button>
          </div>
        )}

        <CutAudioSlot
          cut={cut}
          assets={audioAssets}
          isUploading={isUploading}
          onUploadFiles={onUploadAudioFiles}
          onDeleteAsset={onDeleteAsset}
        />
      </div>

      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex aspect-video items-center justify-center border-t border-slate-200 bg-slate-50 md:aspect-auto md:border-l md:border-t-0 ${
          isSlotDragActive ? "ring-2 ring-inset ring-rose-300" : ""
        }`}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : latest ? (
          <>
            <button
              onClick={() => onOpenLightbox(cut.id, images.length - 1)}
              aria-label={`${latest.fileName} 4K 원본 보기`}
              className="absolute inset-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latest.thumbnailUrl || latest.fileUrl}
                alt={latest.fileName}
                className="h-full w-full object-cover"
              />
            </button>
            {images.length > 1 && (
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-white">
                v{latest.version} · {images.length}장
              </span>
            )}
            <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
              <button
                onClick={() => onOpenLightbox(cut.id, images.length - 1)}
                title="원본 4K 확대"
                className="rounded-full bg-white/90 p-1 text-slate-500 hover:text-rose-500"
              >
                <ZoomIn className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDeleteAsset(latest)}
                title="해제"
                className="rounded-full bg-white/90 p-1 text-slate-500 hover:text-red-500"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <ImagePlus className="h-6 w-6" />
            <p className="text-[11px]">4K 이미지를 여기로 드래그하세요</p>
          </div>
        )}

        <label className="absolute right-1.5 top-1.5 flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-white">
          <Upload className="h-3 w-3" />
          업로드
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onUploadFiles(cut, e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

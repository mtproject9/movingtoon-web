"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkPlus,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  UserCircle2,
  ZoomIn,
} from "lucide-react";
import type { Cut, CutAsset, StylePreset } from "@/lib/types";
import { formatCutLabel } from "@/lib/types";
import {
  extractSpeakerName,
  resolveCutPrompt,
  type CharacterAppearance,
} from "@/lib/promptRules";
import { GeminiApiKeyMissingError, translatePrompt } from "@/lib/geminiGenerate";
import { DEFAULT_IMAGE_PROVIDER_ID, IMAGE_PROVIDERS } from "@/lib/imageProviders";
import StatusBadge from "./StatusBadge";

function FieldCopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // 클립보드 권한이 막힌 환경에서도 "실패했다"는 것 자체는 보여줘야 한다 —
      // 조용히 무시하면 버튼이 눌린 건지 안 눌린 건지 알 수 없다.
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        state === "copied"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : state === "failed"
            ? "border-red-200 bg-red-50 text-red-500"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
      }`}
    >
      {state === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {state === "copied" ? "복사됨" : state === "failed" ? "복사 실패" : "복사"}
    </button>
  );
}

export default function CutStudioRow({
  cut,
  presetId,
  customPresets,
  characters,
  images,
  isUploading,
  onChangeCut,
  onUploadFiles,
  onOpenLightbox,
  onDeleteAsset,
  onGenerateWithGemini,
  onAddToBoard,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: {
  cut: Cut;
  presetId: string;
  customPresets: StylePreset[];
  characters: CharacterAppearance[];
  images: CutAsset[];
  isUploading: boolean;
  onChangeCut: (patch: Partial<Cut>) => void;
  onUploadFiles: (cut: Cut, files: FileList | File[]) => void;
  onOpenLightbox: (cutId: string, index: number) => void;
  onDeleteAsset: (asset: CutAsset) => void;
  onGenerateWithGemini: (cut: Cut) => Promise<void>;
  onAddToBoard: (asset: CutAsset) => void;
  // 여러 컷을 한 번에 골라 진행 보드로 보내는 선택 모드 — 이미지가 있는 컷만
  // 선택 가능하다(보낼 게 없으면 고를 이유가 없다).
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (cutId: string) => void;
}) {
  const [isSlotDragActive, setIsSlotDragActive] = useState(false);
  const [providerId, setProviderId] = useState(DEFAULT_IMAGE_PROVIDER_ID);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // 영문/한글 프롬프트 중 하나를 수정하고 필드에서 포커스를 빼면(blur) 반대쪽을
  // 자동 번역해 반영한다. 포커스가 들어올 때의 값을 저장해 두고, 뺄 때 실제로
  // 바뀌었을 때만 번역을 호출한다(그냥 클릭만 하고 나가는 경우까지 매번 호출하지
  // 않도록).
  const [translatingField, setTranslatingField] = useState<"en" | "ko" | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // 포커스 시점 값을 blur 시점 값과 비교하는 방식은, 그 사이 백그라운드 자동 번역
  // (연출 메모 → directionNoteEn)이 끝나 resolved.promptEn/Ko가 재계산되면 사용자가
  // 아무것도 안 쳤는데도 "값이 바뀐 것"으로 오인해 컷을 수정 상태로 굳혀버렸다.
  // 그래서 값 비교 대신, onChange가 실제로 한 번이라도 일어났는지만 본다.
  const promptEnDirtyRef = useRef(false);
  const promptKoDirtyRef = useRef(false);

  const speaker = extractSpeakerName(cut.dialogue);
  const matchedCharacter = useMemo(
    () =>
      speaker ? characters.find((c) => c.name.trim() === speaker.trim()) ?? null : null,
    [characters, speaker]
  );

  const resolved = useMemo(
    () => resolveCutPrompt(cut, presetId, characters, customPresets),
    [cut, presetId, characters, customPresets]
  );
  const isCustomized = cut.promptEn !== undefined || cut.promptKo !== undefined;

  // 연출 메모(한글)가 있는데 아직 영문 번역 캐시가 없는 컷이면(원고 분할에서 막
  // 새로 쓴 컷, 또는 이 번역 캐시 기능이 생기기 전부터 있던 컷), 이 화면에 보이는
  // 즉시 백그라운드로 번역해 채워 넣는다 — "생성" 버튼을 누르기 전까지는 영문
  // 프롬프트에서 연출 메모가 통째로 빠져 있어 한글 쪽과 안 맞아 보이는 걸 막는다.
  const directionNoteTranslateAttemptedRef = useRef(false);
  useEffect(() => {
    directionNoteTranslateAttemptedRef.current = false;
  }, [cut.id]);
  useEffect(() => {
    const note = cut.directionNote.trim();
    if (!note || cut.directionNoteEn !== undefined || directionNoteTranslateAttemptedRef.current) {
      return;
    }
    directionNoteTranslateAttemptedRef.current = true;

    let cancelled = false;
    // 컷이 많은 회차를 열면 수십 개 행이 한꺼번에 마운트되므로, 그대로 두면 번역
    // API가 순간적으로 몰려 호출된다 — 살짝 흩어서(0~3초 사이 무작위 지연) 부담을 준다.
    const delay = Math.random() * 3000;
    const timer = setTimeout(() => {
      translatePrompt(note, "ko-to-en")
        .then((translated) => {
          if (!cancelled) onChangeCut({ directionNoteEn: translated });
        })
        .catch(() => {
          // 실패하면 다음에 이 컷이 다시 보일 때 재시도할 수 있게 플래그를 풀어준다.
          if (!cancelled) directionNoteTranslateAttemptedRef.current = false;
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut.directionNote, cut.directionNoteEn]);

  async function handleEnBlur() {
    const wasDirty = promptEnDirtyRef.current;
    promptEnDirtyRef.current = false;
    const current = resolved.promptEn.trim();
    if (!wasDirty || !current) return;

    setTranslateError(null);
    setTranslatingField("en");
    try {
      const translatedKo = await translatePrompt(current, "en-to-ko");
      onChangeCut({ promptKo: translatedKo });
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : "한글 번역에 실패했습니다.");
    } finally {
      setTranslatingField(null);
    }
  }

  async function handleKoBlur() {
    const wasDirty = promptKoDirtyRef.current;
    promptKoDirtyRef.current = false;
    const current = resolved.promptKo.trim();
    if (!wasDirty || !current) return;

    setTranslateError(null);
    setTranslatingField("ko");
    try {
      const translatedEn = await translatePrompt(current, "ko-to-en");
      onChangeCut({ promptEn: translatedEn });
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : "영문 번역에 실패했습니다.");
    } finally {
      setTranslatingField(null);
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
    }
  }

  const latest = images[images.length - 1] ?? null;
  const canSelect = selectMode && !!latest && !!onToggleSelect;

  return (
    <div
      className={`grid grid-cols-1 overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors md:grid-cols-[minmax(0,1fr)_420px] ${
        isSelected ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-200"
      }`}
    >
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
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              영문 프롬프트
              {translatingField === "ko" && <Loader2 className="h-3 w-3 animate-spin text-rose-400" />}
            </span>
            <FieldCopyButton text={resolved.promptEn} />
          </div>
          <textarea
            value={resolved.promptEn}
            onChange={(e) => {
              promptEnDirtyRef.current = true;
              onChangeCut({ promptEn: e.target.value });
            }}
            onFocus={() => {
              promptEnDirtyRef.current = false;
            }}
            onBlur={() => void handleEnBlur()}
            // disabled를 쓰면, 번역 중 이 칸에 포커스가 가 있을 때 브라우저가 강제로
            // blur를 발생시켜 의도치 않게 handleEnBlur가 다시 호출되고 포커스가
            // 끊기는 문제가 있었다 — readOnly는 입력만 막고 포커스는 그대로 둔다.
            readOnly={translatingField !== null}
            rows={2}
            className={`w-full resize-none rounded-lg border border-slate-200 p-2 font-mono text-[11px] leading-relaxed focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 ${
              translatingField !== null ? "bg-slate-50 text-slate-400" : "text-slate-800"
            }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              한글 프롬프트
              {translatingField === "en" && <Loader2 className="h-3 w-3 animate-spin text-rose-400" />}
            </span>
            <FieldCopyButton text={resolved.promptKo} />
          </div>
          <textarea
            value={resolved.promptKo}
            onChange={(e) => {
              promptKoDirtyRef.current = true;
              onChangeCut({ promptKo: e.target.value });
            }}
            onFocus={() => {
              promptKoDirtyRef.current = false;
            }}
            onBlur={() => void handleKoBlur()}
            readOnly={translatingField !== null}
            rows={2}
            className={`w-full resize-none rounded-lg border border-slate-200 p-2 text-[11px] leading-relaxed focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 ${
              translatingField !== null ? "bg-slate-50 text-slate-400" : "text-slate-800"
            }`}
          />
        </div>

        {translateError && (
          <p className="text-[11px] text-red-500">{translateError}</p>
        )}

        <div className="mt-auto flex items-center justify-end">
          <div className="flex items-center overflow-hidden rounded-full border border-rose-500">
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="border-r border-rose-200 bg-white py-2 pl-3 pr-1.5 text-xs font-medium text-slate-600 focus:outline-none"
            >
              {IMAGE_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                  {provider.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void handleGenerateClick()}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white transition-colors ${
                isGenerating ? "cursor-not-allowed bg-slate-300" : "bg-rose-500 hover:bg-rose-600"
              }`}
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isGenerating ? "생성 중..." : "생성"}
            </button>
          </div>
        </div>

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
      </div>

      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex aspect-video shrink-0 items-center justify-center self-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 m-4 md:ml-0 ${
          isSlotDragActive ? "ring-2 ring-inset ring-rose-300" : ""
        }`}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : latest ? (
          <>
            <button
              onClick={() =>
                canSelect ? onToggleSelect!(cut.id) : onOpenLightbox(cut.id, images.length - 1)
              }
              aria-label={
                canSelect ? `${formatCutLabel(cut.cutNumber)} 선택` : `${latest.fileName} 원본 보기`
              }
              className="absolute inset-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latest.thumbnailUrl || latest.fileUrl}
                alt={latest.fileName}
                className={`h-full w-full object-contain ${selectMode && !isSelected ? "opacity-70" : ""}`}
              />
            </button>
            {images.length > 1 && (
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-white">
                v{latest.version} · {images.length}장
              </span>
            )}
            {selectMode ? (
              <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-white/90 p-0.5">
                {isSelected ? (
                  <CheckCircle2 className="h-4 w-4 text-rose-500" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300" />
                )}
              </div>
            ) : (
              <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                <button
                  onClick={() => onOpenLightbox(cut.id, images.length - 1)}
                  title="원본 확대"
                  className="rounded-full bg-white/90 p-1 text-slate-500 hover:text-rose-500"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onAddToBoard(latest)}
                  title="최종 이미지 모음(진행 보드)에 추가"
                  className="rounded-full bg-white/90 p-1 text-slate-500 hover:text-indigo-500"
                >
                  <BookmarkPlus className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDeleteAsset(latest)}
                  title="해제"
                  className="rounded-full bg-white/90 p-1 text-slate-500 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <ImagePlus className="h-6 w-6" />
            <p className="text-[11px]">이미지를 여기로 드래그하세요</p>
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

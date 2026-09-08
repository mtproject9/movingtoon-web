"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import JSZip from "jszip";
import {
  Braces,
  CheckSquare,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { useAssets } from "@/context/AssetsContext";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import {
  DEFAULT_NEGATIVE_PROMPT,
  STYLE_PRESETS,
  buildMidjourneyPrompt,
  matchCutCharacters,
  resolveCutPrompt,
  type CharacterAppearance,
} from "@/lib/promptRules";
import { formatCutLabel, formatEpisodeLabel } from "@/lib/types";
import type { Cut, CutAsset, CutStatus, StylePreset } from "@/lib/types";
import { downloadBlob } from "@/lib/downloadFile";
import { base64ToFile, compressDataUrlForReference, createThumbnailBlob } from "@/lib/images";
import { uploadCutAsset } from "@/lib/assetUpload";
import {
  GeminiApiKeyMissingError,
  generateCutImage,
  translatePrompt,
} from "@/lib/geminiGenerate";
import { addImageToBoard } from "@/lib/boardData";
import { DEFAULT_IMAGE_PROVIDER_ID, IMAGE_PROVIDERS } from "@/lib/imageProviders";
import CutStudioRow from "@/components/CutStudioRow";
import CutAssetLightbox from "@/components/CutAssetLightbox";
import BulkPromptCopyModal from "@/components/BulkPromptCopyModal";
import GeminiAutoGenerateModal, {
  type GeminiGenerationStatus,
} from "@/components/GeminiAutoGenerateModal";
import GeminiApiKeyMissingModal from "@/components/GeminiApiKeyMissingModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ComingSoon from "@/components/ComingSoon";

const STATUS_RANK: Record<CutStatus, number> = {
  SCRIPT_DONE: 0,
  DRAWING: 1,
  FINAL_DONE: 2,
};

function makeCustomPresetId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface LightboxState {
  cutId: string;
  index: number;
}

// "하이브리드 에셋 스튜디오": 컷별 프롬프트 생성과 4K 컷 이미지 업로드를 한 화면에서
// 처리한다. 이전에는 프롬프트 생성(prompts)과 이미지 에셋(assets) 화면이 분리돼 있었지만,
// 실제 작업 흐름(프롬프트 복사 → 외부 AI로 생성 → 결과 이미지 업로드)이 컷 단위로
// 왔다갔다하는 형태라 하나의 리스트에서 좌: 프롬프트, 우: 이미지 슬롯으로 묶었다.
export default function PromptsPage() {
  const { seriesId, episodeId } = useParams<{ seriesId: string; episodeId: string }>();
  const { cuts, updateCut, stylePresetId, setStylePresetId } = useCuts();
  const { getAssetsForCut, addAsset, removeAsset } = useAssets();
  const { getSeries, updateSeries, getEpisode, getCharactersForSeries } = useSeries();
  const { captureCutAsset } = useTrash();

  const series = getSeries(seriesId);
  const customPresets = useMemo(() => series?.customStylePresets ?? [], [series]);
  const allPresetIds = useMemo(
    () => [...STYLE_PRESETS, ...customPresets].map((preset) => preset.id),
    [customPresets]
  );
  const presetId =
    stylePresetId && allPresetIds.includes(stylePresetId) ? stylePresetId : STYLE_PRESETS[0].id;
  const [isBulkCopyOpen, setIsBulkCopyOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [bulkProviderId, setBulkProviderId] = useState(DEFAULT_IMAGE_PROVIDER_ID);
  const [isApiKeyMissingModalOpen, setIsApiKeyMissingModalOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [uploadingCutId, setUploadingCutId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<CutAsset | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedCutIds, setSelectedCutIds] = useState<Set<string>>(new Set());
  const [isBulkSendingToBoard, setIsBulkSendingToBoard] = useState(false);
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [presetDraft, setPresetDraft] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<GeminiGenerationStatus>({
    isRunning: false,
    current: 0,
    total: 0,
    results: [],
  });
  const geminiCancelRef = useRef(false);

  const episode = getEpisode(episodeId);

  function handleSelectPreset(id: string) {
    setStylePresetId(id);
  }

  // 직접 입력한 스타일 설명(한글 또는 영어 아무거나)을 저장해두고 언제든 다시 골라
  // 쓸 수 있게 시리즈에 붙여둔다 — 다른 언어 필드는 기존 EN/KO 프롬프트 동기화와
  // 같은 번역 API로 자동으로 채운다.
  async function handleAddCustomPreset() {
    const text = presetDraft.trim();
    if (!text || isSavingPreset) return;
    setIsSavingPreset(true);
    try {
      const isKorean = /[가-힣]/.test(text);
      const descriptionKo = isKorean ? text : await translatePrompt(text, "en-to-ko");
      const styleTagsEn = isKorean ? await translatePrompt(text, "ko-to-en") : text;
      const newPreset: StylePreset = {
        id: makeCustomPresetId(),
        label: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        descriptionKo,
        styleTagsEn,
      };
      updateSeries(seriesId, { customStylePresets: [...customPresets, newPreset] });
      setStylePresetId(newPreset.id);
      setPresetDraft("");
      setIsAddingPreset(false);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "스타일 프리셋 추가에 실패했습니다.");
    } finally {
      setIsSavingPreset(false);
    }
  }

  function handleDeleteCustomPreset(id: string) {
    updateSeries(seriesId, { customStylePresets: customPresets.filter((p) => p.id !== id) });
    if (presetId === id) setStylePresetId(STYLE_PRESETS[0].id);
  }

  const characters: CharacterAppearance[] = useMemo(
    () =>
      getCharactersForSeries(seriesId).map((character) => ({
        name: character.name,
        hairTag: character.hairTag,
        eyeTag: character.eyeTag,
        outfitTag: character.outfitTag,
        profileImage: character.profileImage,
      })),
    [getCharactersForSeries, seriesId]
  );

  function exportFileBaseName() {
    const label = episode ? formatEpisodeLabel(episode) : episodeId;
    return label.replace(/[\\/:*?"<>|]/g, "_");
  }

  function buildExportRows() {
    return cuts.map((cut) => {
      const prompt = resolveCutPrompt(cut, presetId, characters, customPresets);
      return { cutLabel: formatCutLabel(cut.cutNumber), sceneNumber: cut.sceneNumber, ...prompt };
    });
  }

  function buildMidjourneyRows() {
    return buildExportRows().map((row) => ({
      cutLabel: row.cutLabel,
      sceneNumber: row.sceneNumber,
      prompt: buildMidjourneyPrompt(row.promptEn),
    }));
  }

  function handleExportTxt() {
    const text = buildExportRows()
      .map(
        (row) =>
          `${row.cutLabel} (Scene ${row.sceneNumber})\n[EN] ${row.promptEn}\n[KO] ${row.promptKo}\n[Negative] ${row.negativePrompt}`
      )
      .join("\n\n");
    downloadBlob(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      `${exportFileBaseName()}_prompts.txt`
    );
    setStatusMessage("TXT 파일을 다운로드했습니다.");
  }

  function handleExportJson() {
    const json = JSON.stringify(buildExportRows(), null, 2);
    downloadBlob(
      new Blob([json], { type: "application/json;charset=utf-8" }),
      `${exportFileBaseName()}_prompts.json`
    );
    setStatusMessage("JSON 파일을 다운로드했습니다.");
  }

  function maybeAdvanceStatus(cut: Cut) {
    if (STATUS_RANK[cut.status] < STATUS_RANK.DRAWING) {
      updateCut(cut.id, { status: "DRAWING" });
    }
  }

  // 이미지를 지워서 그 컷에 남은 이미지가 하나도 없어지면, "작화완료"였던 상태가
  // 더 이상 사실이 아니므로 "원고 완료"로 되돌린다 — maybeAdvanceStatus의 반대.
  function maybeRevertStatus(cutId: string, excludeAssetId: string) {
    const remaining = getAssetsForCut(cutId, "IMAGE").filter((a) => a.id !== excludeAssetId);
    if (remaining.length > 0) return;
    const cut = cuts.find((c) => c.id === cutId);
    if (cut && cut.status === "DRAWING") {
      updateCut(cut.id, { status: "SCRIPT_DONE" });
    }
  }

  // 에러를 그대로 던진다 — Gemini 자동생성처럼 컷별 성공/실패를 정확히 보고해야 하는
  // 호출부는 이 함수를 직접 쓰고, 그 외(수동 업로드)는 아래 uploadAndAssign이 감싸서
  // 실패를 조용히 배너 메시지로만 보여준다.
  async function performUploadAndAssign(cut: Cut, file: File) {
    setUploadingCutId(cut.id);
    try {
      const thumbnailBlob = await createThumbnailBlob(file).catch(() => undefined);
      const uploaded = await uploadCutAsset(episodeId, file, thumbnailBlob);
      addAsset(
        cut.id,
        "IMAGE",
        uploaded.fileUrl,
        uploaded.fileName,
        uploaded.thumbnailUrl,
        formatCutLabel(cut.cutNumber)
      );
      maybeAdvanceStatus(cut);
    } finally {
      setUploadingCutId(null);
    }
  }

  async function uploadAndAssign(cut: Cut, file: File) {
    try {
      await performUploadAndAssign(cut, file);
    } catch {
      setStatusMessage(`"${file.name}" 업로드에 실패했습니다.`);
    }
  }

  async function handleUploadFiles(cut: Cut, files: FileList | File[]) {
    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    for (const file of list) {
      await uploadAndAssign(cut, file);
    }
  }

  async function handleConfirmDeleteAsset() {
    if (!assetPendingDelete) return;
    const target = assetPendingDelete;
    // 확인창을 즉시 닫고 화면에서도 바로 지운다 — 응답을 기다리는 동안 다시 눌러서
    // 같은 항목이 휴지통에 중복으로 쌓이는 걸 막는다.
    setAssetPendingDelete(null);
    removeAsset(target.id);
    if (target.type === "IMAGE" && target.cutId) {
      maybeRevertStatus(target.cutId, target.id);
    }
    await captureCutAsset(episodeId, target);
  }

  async function handleAddToBoard(asset: CutAsset) {
    const result = await addImageToBoard(episodeId, {
      fileUrl: asset.fileUrl,
      thumbnailUrl: asset.thumbnailUrl,
      fileName: asset.fileName,
      sourceCutId: asset.cutId,
    });
    setStatusMessage(result.ok ? "진행 보드에 추가했습니다." : result.error ?? "추가하지 못했습니다.");
  }

  function handleToggleSelectMode() {
    setIsSelectMode((prev) => !prev);
    setSelectedCutIds(new Set());
  }

  function handleToggleCutSelect(cutId: string) {
    setSelectedCutIds((prev) => {
      const next = new Set(prev);
      if (next.has(cutId)) next.delete(cutId);
      else next.add(cutId);
      return next;
    });
  }

  const selectableCutIds = useMemo(
    () => cuts.filter((cut) => getAssetsForCut(cut.id, "IMAGE").length > 0).map((cut) => cut.id),
    [cuts, getAssetsForCut]
  );

  function handleSelectAll() {
    setSelectedCutIds(new Set(selectableCutIds));
  }

  function handleClearSelection() {
    setSelectedCutIds(new Set());
  }

  // 선택한 컷들의 최신 이미지를 한 번에 진행 보드로 보낸다 — 컷마다 일일이
  // "진행 보드에 추가"를 누르지 않아도 되게 하기 위함.
  async function handleBulkSendToBoard() {
    const targets = cuts.filter((cut) => selectedCutIds.has(cut.id));
    if (targets.length === 0) return;

    setIsBulkSendingToBoard(true);
    let successCount = 0;
    try {
      for (const cut of targets) {
        const images = getAssetsForCut(cut.id, "IMAGE");
        const latest = images[images.length - 1];
        if (!latest) continue;
        const result = await addImageToBoard(episodeId, {
          fileUrl: latest.fileUrl,
          thumbnailUrl: latest.thumbnailUrl,
          fileName: latest.fileName,
          sourceCutId: latest.cutId,
        });
        if (result.ok) successCount += 1;
      }
      setStatusMessage(
        successCount === targets.length
          ? `${successCount}개 컷을 진행 보드로 보냈습니다.`
          : `${successCount}/${targets.length}개만 진행 보드로 보냈습니다.`
      );
      setIsSelectMode(false);
      setSelectedCutIds(new Set());
    } finally {
      setIsBulkSendingToBoard(false);
    }
  }

  async function handleBulkDownload() {
    const entries = cuts.flatMap((cut) =>
      getAssetsForCut(cut.id, "IMAGE").map((asset) => ({ cut, asset }))
    );
    if (entries.length === 0) {
      setStatusMessage("다운로드할 이미지가 없습니다.");
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const { cut, asset } of entries) {
        const res = await fetch(asset.fileUrl);
        const blob = await res.blob();
        zip.file(`${formatCutLabel(cut.cutNumber)}_v${asset.version}_${asset.fileName}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      downloadBlob(content, `${exportFileBaseName()}_에셋.zip`);
      setStatusMessage(`이미지 ${entries.length}장을 ZIP으로 다운로드했습니다.`);
    } catch {
      setStatusMessage("ZIP 파일을 만드는 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  }

  async function handleDownloadAsset(asset: CutAsset) {
    try {
      const res = await fetch(asset.fileUrl);
      const blob = await res.blob();
      downloadBlob(blob, asset.fileName);
    } catch {
      // 파일이 이미 지워졌거나 네트워크 오류인 경우 조용히 무시
    }
  }

  async function handleCopyNegative() {
    try {
      await navigator.clipboard.writeText(DEFAULT_NEGATIVE_PROMPT);
      setStatusMessage("네거티브 프롬프트를 복사했습니다.");
    } catch {
      // 클립보드 권한이 막힌 환경(브라우저 설정 등)에서는 실패했다는 것 자체를
      // 알려줘야 한다 — 조용히 무시하면 "눌렀는데 아무 반응이 없다"로 보인다.
      setStatusMessage("클립보드 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해주세요.");
    }
  }

  // 컷 하나에 대해 프롬프트 + 캐릭터 참조 이미지를 Gemini에 보내 이미지를 받고, 성공하면
  // 바로 그 컷 슬롯에 업로드한다. 단일 컷 버튼과 전체 배치 생성이 이 함수를 공유한다.
  async function generateAndAssignForCut(cut: Cut) {
    const cutLabel = formatCutLabel(cut.cutNumber);

    // 연출 메모(한글)가 아직 영문으로 번역돼 캐싱된 적 없는 컷이면(이 번역 캐시
    // 기능이 생기기 전에 이미 존재하던 컷 등) 실제 생성 직전에 한 번 번역해서
    // 저장해둔다 — 그래야 영문 프롬프트에 한글 원문이 그대로 섞여 들어가지 않는다.
    let effectiveCut = cut;
    if (cut.directionNote.trim() && !cut.directionNoteEn) {
      try {
        const translated = await translatePrompt(cut.directionNote.trim(), "ko-to-en");
        updateCut(cut.id, { directionNoteEn: translated });
        effectiveCut = { ...cut, directionNoteEn: translated };
      } catch {
        // 번역에 실패해도 이미지 생성 자체는 계속 진행한다 — 이번엔 연출 메모 없이.
      }
    }

    // 등록된 캐릭터 전부가 아니라, 이 컷의 대사·연출 메모에 실제로 등장하는
    // 인물만 참조 이미지로 보낸다 — 안 그러면 관계없는 캐릭터 외형이 섞여 들어온다.
    const matchedCharacters = matchCutCharacters(effectiveCut, characters);
    const referenceImages = (
      await Promise.all(
        matchedCharacters.map((character) =>
          character.profileImage ? compressDataUrlForReference(character.profileImage) : null
        )
      )
    ).filter((img): img is string => img !== null);
    // Gemini 이미지 생성은 Stable Diffusion류의 별도 negative_prompt 파라미터가
    // 없어서, 프롬프트 문장 끝에 "피해야 할 요소"로 자연스럽게 이어붙인다.
    const prompt = `${resolveCutPrompt(effectiveCut, presetId, characters, customPresets).promptEn}. Avoid: ${DEFAULT_NEGATIVE_PROMPT}.`;

    const result = await generateCutImage({
      prompt,
      characterReferenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      aspectRatio: "16:9",
    });

    const file = base64ToFile(result.imageBase64, result.mimeType, `${cutLabel}_gemini.png`);
    await performUploadAndAssign(cut, file);
  }

  async function handleGenerateOneCut(cut: Cut) {
    try {
      await generateAndAssignForCut(cut);
    } catch (err) {
      if (err instanceof GeminiApiKeyMissingError) {
        setIsApiKeyMissingModalOpen(true);
      }
      throw err;
    }
  }

  async function handleGeminiGenerateAll() {
    geminiCancelRef.current = false;
    setGeminiStatus({ isRunning: true, current: 0, total: cuts.length, results: [] });

    for (let i = 0; i < cuts.length; i++) {
      if (geminiCancelRef.current) break;
      const cut = cuts[i];
      setGeminiStatus((prev) => ({ ...prev, current: i + 1 }));
      const cutLabel = formatCutLabel(cut.cutNumber);

      try {
        await generateAndAssignForCut(cut);
        setGeminiStatus((prev) => ({
          ...prev,
          results: [...prev.results, { cutLabel, ok: true }],
        }));
      } catch (err) {
        if (err instanceof GeminiApiKeyMissingError) {
          setIsApiKeyMissingModalOpen(true);
          break;
        }
        setGeminiStatus((prev) => ({
          ...prev,
          results: [
            ...prev.results,
            { cutLabel, ok: false, error: err instanceof Error ? err.message : "생성 실패" },
          ],
        }));
      }
    }

    setGeminiStatus((prev) => ({ ...prev, isRunning: false }));
  }

  function handleGeminiCancel() {
    geminiCancelRef.current = true;
  }

  const lightboxAssets = lightbox ? getAssetsForCut(lightbox.cutId, "IMAGE") : [];

  if (cuts.length === 0) {
    return (
      <ComingSoon
        icon={Sparkles}
        title="에셋 스튜디오"
        description="먼저 '원고 분할' 화면에서 원고를 컷으로 분할하면, 이 화면에서 컷마다 프롬프트와 이미지를 함께 관리할 수 있습니다."
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 bg-slate-50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            {episode ? formatEpisodeLabel(episode) : episodeId} · 에셋 스튜디오
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            프롬프트 생성부터 컷 이미지 업로드까지 한 화면에서 처리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setIsBulkCopyOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            전체 프롬프트 복사
          </button>
          <div className="flex items-center overflow-hidden rounded-full border border-rose-500">
            <select
              value={bulkProviderId}
              onChange={(e) => setBulkProviderId(e.target.value)}
              className="border-r border-rose-200 bg-white py-1.5 pl-3 pr-1.5 text-xs font-medium text-slate-600 focus:outline-none"
            >
              {IMAGE_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                  {provider.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setIsGeminiModalOpen(true)}
              className="flex items-center gap-1.5 bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-600"
            >
              <Sparkles className="h-3.5 w-3.5" />
              전체 이미지 생성
            </button>
          </div>
          <button
            onClick={handleToggleSelectMode}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isSelectMode
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            컷 선택해서 보드로 보내기
          </button>
        </div>
      </div>

      {isSelectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <span className="text-xs font-semibold text-rose-600">
            {selectedCutIds.size}개 선택됨 (이미지 있는 컷 {selectableCutIds.length}개 중)
          </span>
          <button
            onClick={handleSelectAll}
            className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
          >
            전체 선택
          </button>
          <button
            onClick={handleClearSelection}
            className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
          >
            선택 해제
          </button>
          <button
            onClick={() => void handleBulkSendToBoard()}
            disabled={selectedCutIds.size === 0 || isBulkSendingToBoard}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBulkSendingToBoard ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckSquare className="h-3.5 w-3.5" />
            )}
            선택한 컷 진행 보드로 보내기
          </button>
          <button
            onClick={handleToggleSelectMode}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-rose-500 hover:bg-rose-100"
          >
            취소
          </button>
        </div>
      )}

      {/* 자주 쓰는 위 두 버튼과 달리, 아래는 어쩌다 한 번 쓰는 내보내기 도구들이라
          하나의 옅은 회색 띠로 묶어 시각적 무게를 낮췄다. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <span className="mr-0.5 text-xs font-semibold text-slate-400">내보내기</span>
        <button
          onClick={() => void handleBulkDownload()}
          disabled={isZipping}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isZipping ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          에셋 일괄 다운로드
        </button>
        <button
          onClick={handleExportTxt}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          <FileText className="h-3.5 w-3.5" />
          TXT
        </button>
        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          <Braces className="h-3.5 w-3.5" />
          JSON
        </button>
        <button
          onClick={() => void handleCopyNegative()}
          title={DEFAULT_NEGATIVE_PROMPT}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          네거티브 복사
        </button>
      </div>

      {statusMessage && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{statusMessage}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">스타일 프리셋</span>
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelectPreset(preset.id)}
            title={preset.descriptionKo}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              presetId === preset.id
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            {preset.label}
          </button>
        ))}
        {customPresets.map((preset) => (
          <span key={preset.id} className="group relative inline-flex">
            <button
              onClick={() => handleSelectPreset(preset.id)}
              title={preset.descriptionKo}
              className={`rounded-full border py-1.5 pl-3 pr-6 text-xs font-medium transition-colors ${
                presetId === preset.id
                  ? "border-rose-300 bg-rose-50 text-rose-600"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
              }`}
            >
              {preset.label}
            </button>
            <button
              onClick={() => handleDeleteCustomPreset(preset.id)}
              title="이 프리셋 삭제"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {isAddingPreset ? (
          <span className="flex items-center gap-1">
            <input
              value={presetDraft}
              onChange={(e) => setPresetDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddCustomPreset();
                if (e.key === "Escape") {
                  setIsAddingPreset(false);
                  setPresetDraft("");
                }
              }}
              placeholder="원하는 스타일을 설명해주세요 (한글/영어 모두 가능)"
              autoFocus
              disabled={isSavingPreset}
              className="w-64 rounded-full border border-slate-200 px-3 py-1.5 text-xs focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:opacity-50"
            />
            <button
              onClick={() => void handleAddCustomPreset()}
              disabled={isSavingPreset || !presetDraft.trim()}
              className="flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingPreset ? <Loader2 className="h-3 w-3 animate-spin" /> : "추가"}
            </button>
            <button
              onClick={() => {
                setIsAddingPreset(false);
                setPresetDraft("");
              }}
              disabled={isSavingPreset}
              className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              취소
            </button>
          </span>
        ) : (
          <button
            onClick={() => setIsAddingPreset(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-300 hover:text-rose-500"
          >
            <Plus className="h-3.5 w-3.5" />
            직접 입력
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {cuts.map((cut) => (
          <CutStudioRow
            key={cut.id}
            cut={cut}
            presetId={presetId}
            customPresets={customPresets}
            characters={characters}
            images={getAssetsForCut(cut.id, "IMAGE")}
            isUploading={uploadingCutId === cut.id}
            onChangeCut={(patch) => updateCut(cut.id, patch)}
            onUploadFiles={(targetCut, files) => void handleUploadFiles(targetCut, files)}
            onOpenLightbox={(cutId, index) => setLightbox({ cutId, index })}
            onDeleteAsset={(asset) => setAssetPendingDelete(asset)}
            onGenerateWithGemini={handleGenerateOneCut}
            onAddToBoard={(asset) => void handleAddToBoard(asset)}
            selectMode={isSelectMode}
            isSelected={selectedCutIds.has(cut.id)}
            onToggleSelect={handleToggleCutSelect}
          />
        ))}
      </div>

      {lightbox && lightboxAssets.length > 0 && (
        <CutAssetLightbox
          assets={lightboxAssets}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onDownload={(asset) => void handleDownloadAsset(asset)}
          onDelete={(asset) => setAssetPendingDelete(asset)}
        />
      )}

      {assetPendingDelete && (
        <ConfirmDialog
          title="에셋 파일을 삭제할까요?"
          message={`"${assetPendingDelete.fileName}" 파일이 휴지통으로 이동합니다. 휴지통에서 다시 복원할 수 있습니다.`}
          onConfirm={() => void handleConfirmDeleteAsset()}
          onCancel={() => setAssetPendingDelete(null)}
        />
      )}

      {isBulkCopyOpen && (
        <BulkPromptCopyModal rows={buildMidjourneyRows()} onClose={() => setIsBulkCopyOpen(false)} />
      )}

      {isGeminiModalOpen && (
        <GeminiAutoGenerateModal
          status={geminiStatus}
          onStart={() => void handleGeminiGenerateAll()}
          onCancel={handleGeminiCancel}
          onClose={() => setIsGeminiModalOpen(false)}
        />
      )}

      {isApiKeyMissingModalOpen && (
        <GeminiApiKeyMissingModal onClose={() => setIsApiKeyMissingModalOpen(false)} />
      )}
    </div>
  );
}

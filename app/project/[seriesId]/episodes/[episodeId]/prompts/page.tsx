"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import JSZip from "jszip";
import {
  Braces,
  ClipboardCopy,
  Download,
  FileText,
  FolderArchive,
  FolderInput,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { useAssets } from "@/context/AssetsContext";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import {
  DEFAULT_NEGATIVE_PROMPT,
  STYLE_PRESETS,
  buildMidjourneyPrompt,
  matchSpeakerCharacter,
  resolveCutPrompt,
  type CharacterAppearance,
} from "@/lib/promptRules";
import { formatCutLabel, formatEpisodeLabel } from "@/lib/types";
import type { AssetType, Cut, CutAsset, CutStatus } from "@/lib/types";
import { downloadBlob } from "@/lib/downloadFile";
import { base64ToFile, compressDataUrlForReference, createThumbnailBlob } from "@/lib/images";
import {
  extractCutNumber,
  isAudioFile,
  uploadAudioAsset,
  uploadCutAsset,
} from "@/lib/assetUpload";
import { GeminiApiKeyMissingError, generateCutImage } from "@/lib/geminiGenerate";
import CutStudioRow from "@/components/CutStudioRow";
import UnassignedAssetTray, { type StagedAsset } from "@/components/UnassignedAssetTray";
import CutAssetLightbox from "@/components/CutAssetLightbox";
import BulkPromptCopyModal from "@/components/BulkPromptCopyModal";
import GeminiAutoGenerateModal, {
  type GeminiGenerationStatus,
} from "@/components/GeminiAutoGenerateModal";
import GeminiApiKeyMissingModal from "@/components/GeminiApiKeyMissingModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ComingSoon from "@/components/ComingSoon";
import ProgressModal from "@/components/ProgressModal";

function presetStorageKey(episodeId: string) {
  return `movingtoon:${episodeId}:stylePreset`;
}

const STATUS_RANK: Record<CutStatus, number> = {
  SCRIPT_DONE: 0,
  DRAWING: 1,
  VOICE_DONE: 2,
  FINAL_DONE: 3,
};

function makeStagedId() {
  return `staged-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  const { cuts, updateCut } = useCuts();
  const { getAssetsForCut, addAsset, removeAsset } = useAssets();
  const { getSeries, getEpisode, getCharactersForSeries } = useSeries();
  const { captureCutAsset } = useTrash();

  const [presetId, setPresetId] = useState(STYLE_PRESETS[0].id);
  const [isBulkCopyOpen, setIsBulkCopyOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [isApiKeyMissingModalOpen, setIsApiKeyMissingModalOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ phase: string; percent: number } | null>(
    null
  );
  const [uploadingCutId, setUploadingCutId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<CutAsset | null>(null);
  const [stagedAssets, setStagedAssets] = useState<StagedAsset[]>([]);
  const [isTopDragActive, setIsTopDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiGenerationStatus>({
    isRunning: false,
    current: 0,
    total: 0,
    results: [],
  });
  const dragCounterRef = useRef(0);
  const geminiCancelRef = useRef(false);

  const episode = getEpisode(episodeId);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(presetStorageKey(episodeId));
      if (saved && STYLE_PRESETS.some((preset) => preset.id === saved)) {
        // localStorage는 첫 렌더 이후에만 읽을 수 있어 이 초기 동기화는 effect 안에서 해야 한다.
        setPresetId(saved);
      }
    } catch {
      // 저장된 값이 없으면 기본 프리셋 유지
    }
  }, [episodeId]);

  useEffect(() => {
    // 언마운트 시 남아있는 미할당 트레이 항목의 object URL을 정리한다.
    return () => {
      stagedAssets.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectPreset(id: string) {
    setPresetId(id);
    try {
      window.localStorage.setItem(presetStorageKey(episodeId), id);
    } catch {
      // 저장 실패해도 화면 동작에는 영향 없음
    }
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
      const prompt = resolveCutPrompt(cut, presetId, characters);
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
  }

  function handleExportJson() {
    const json = JSON.stringify(buildExportRows(), null, 2);
    downloadBlob(
      new Blob([json], { type: "application/json;charset=utf-8" }),
      `${exportFileBaseName()}_prompts.json`
    );
  }

  const NEXT_STATUS_FOR_TYPE: Record<AssetType, CutStatus> = {
    IMAGE: "DRAWING",
    AUDIO: "VOICE_DONE",
  };

  function maybeAdvanceStatus(cut: Cut, type: AssetType) {
    const next = NEXT_STATUS_FOR_TYPE[type];
    if (STATUS_RANK[cut.status] < STATUS_RANK[next]) {
      updateCut(cut.id, { status: next });
    }
  }

  // 에러를 그대로 던진다 — Gemini 자동생성처럼 컷별 성공/실패를 정확히 보고해야 하는
  // 호출부는 이 함수를 직접 쓰고, 그 외(수동/드롭 업로드)는 아래 uploadAndAssign이
  // 감싸서 실패를 조용히 배너 메시지로만 보여준다.
  async function performUploadAndAssign(cut: Cut, file: File, type: AssetType = "IMAGE") {
    setUploadingCutId(cut.id);
    try {
      if (type === "IMAGE") {
        const thumbnailBlob = await createThumbnailBlob(file).catch(() => undefined);
        const uploaded = await uploadCutAsset(episodeId, file, thumbnailBlob);
        addAsset(cut.id, "IMAGE", uploaded.fileUrl, uploaded.fileName, uploaded.thumbnailUrl);
      } else {
        const uploaded = await uploadAudioAsset(episodeId, file);
        addAsset(cut.id, "AUDIO", uploaded.fileUrl, uploaded.fileName);
      }
      maybeAdvanceStatus(cut, type);
    } finally {
      setUploadingCutId(null);
    }
  }

  async function uploadAndAssign(cut: Cut, file: File, type: AssetType = "IMAGE") {
    try {
      await performUploadAndAssign(cut, file, type);
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

  async function handleUploadAudioFiles(cut: Cut, files: FileList | File[]) {
    const list = Array.from(files).filter(isAudioFile);
    for (const file of list) {
      await uploadAndAssign(cut, file, "AUDIO");
    }
  }

  function stageFiles(files: File[]) {
    const staged = files.map((file) => ({
      id: makeStagedId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setStagedAssets((prev) => [...prev, ...staged]);
  }

  async function handleTopDropFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const audioFiles = files.filter(isAudioFile);
    if (imageFiles.length === 0 && audioFiles.length === 0) return;

    const unmatchedImages: File[] = [];
    let matchedImages = 0;

    for (const file of imageFiles) {
      const cutNumber = extractCutNumber(file.name);
      const cut = cutNumber != null ? cuts.find((c) => c.cutNumber === cutNumber) : undefined;
      if (!cut) {
        unmatchedImages.push(file);
        continue;
      }
      await uploadAndAssign(cut, file);
      matchedImages += 1;
    }
    if (unmatchedImages.length > 0) stageFiles(unmatchedImages);

    // 오디오는 이미지용 트레이(썸네일 드래그 UI)와 시각적으로 어울리지 않아 별도
    // 보관 없이 매칭 결과만 배너로 알린다 — 못 찾은 파일은 파일명을 고쳐 다시 드롭하면 된다.
    const unmatchedAudioNames: string[] = [];
    let matchedAudio = 0;

    for (const file of audioFiles) {
      const cutNumber = extractCutNumber(file.name);
      const cut = cutNumber != null ? cuts.find((c) => c.cutNumber === cutNumber) : undefined;
      if (!cut) {
        unmatchedAudioNames.push(file.name);
        continue;
      }
      await uploadAndAssign(cut, file, "AUDIO");
      matchedAudio += 1;
    }

    const parts: string[] = [];
    if (imageFiles.length > 0) {
      parts.push(
        unmatchedImages.length === 0
          ? `이미지 ${matchedImages}장 매핑 완료`
          : `이미지 ${matchedImages}장 매핑 완료 · 번호를 찾지 못한 ${unmatchedImages.length}장은 트레이에 보관`
      );
    }
    if (audioFiles.length > 0) {
      parts.push(
        unmatchedAudioNames.length === 0
          ? `오디오 ${matchedAudio}개 매핑 완료`
          : `오디오 ${matchedAudio}개 매핑 완료 · 컷을 찾지 못해 건너뜀: ${unmatchedAudioNames.join(", ")}`
      );
    }
    setStatusMessage(parts.join(" / "));
  }

  async function handleDropTrayItem(cut: Cut, trayId: string) {
    const staged = stagedAssets.find((item) => item.id === trayId);
    if (!staged) return;
    setStagedAssets((prev) => prev.filter((item) => item.id !== trayId));
    URL.revokeObjectURL(staged.previewUrl);
    await uploadAndAssign(cut, staged.file);
  }

  function handleDiscardStaged(id: string) {
    setStagedAssets((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function handleTopDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsTopDragActive(true);
  }
  function handleTopDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsTopDragActive(false);
    }
  }
  function handleTopDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleTopDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsTopDragActive(false);
    void handleTopDropFiles(Array.from(e.dataTransfer.files));
  }

  async function handleConfirmDeleteAsset() {
    if (!assetPendingDelete) return;
    await captureCutAsset(episodeId, assetPendingDelete);
    removeAsset(assetPendingDelete.id);
    setAssetPendingDelete(null);
  }

  async function handleBulkDownload() {
    const entries = cuts.flatMap((cut) =>
      getAssetsForCut(cut.id, "IMAGE").map((asset) => ({ cut, asset }))
    );
    if (entries.length === 0) {
      setStatusMessage("다운로드할 4K 이미지가 없습니다.");
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
      downloadBlob(content, `${exportFileBaseName()}_4K에셋.zip`);
    } catch {
      setStatusMessage("ZIP 파일을 만드는 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  }

  // CapCut용 패키지 ZIP은 /api/export/capcut-package가 서버에서 직접 만든다 — 컷
  // 순서·대사·연출 메모와 각 컷의 최신 이미지/오디오 경로만 보내면, 서버가 그 경로의
  // 실제 파일을 디스크에서 읽어 압축해 응답으로 돌려준다.
  async function handleExportCapCutPackage() {
    const series = getSeries(seriesId);
    const episodeLabel = episode ? formatEpisodeLabel(episode) : episodeId;
    const zipName = `${series?.title || "시리즈"}_${episodeLabel}_CapCut_Package.zip`.replace(
      /[\\/:*?"<>|]/g,
      "_"
    );

    setExportProgress({ phase: "회차 데이터 정리 중", percent: 10 });
    try {
      const payloadCuts = cuts.map((cut) => {
        const latestImage = getAssetsForCut(cut.id, "IMAGE").at(-1) ?? null;
        const latestAudio = getAssetsForCut(cut.id, "AUDIO").at(-1) ?? null;
        return {
          cutNumber: cut.cutNumber,
          sceneNumber: cut.sceneNumber,
          dialogue: cut.dialogue,
          directionNote: cut.directionNote,
          cameraAngle: cut.cameraAngle,
          emotionTag: cut.emotionTag,
          expression: cut.expression,
          status: cut.status,
          imagePath: latestImage?.fileUrl ?? null,
          audioPath: latestAudio?.fileUrl ?? null,
        };
      });

      setExportProgress({ phase: "서버에서 패키징 중", percent: 50 });
      const res = await fetch("/api/export/capcut-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesTitle: series?.title ?? "",
          episodeTitle: episodeLabel,
          cuts: payloadCuts,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "패키지 생성에 실패했습니다.");
      }

      setExportProgress({ phase: "다운로드 준비 중", percent: 90 });
      const blob = await res.blob();
      downloadBlob(blob, zipName);
      setExportProgress({ phase: "완료", percent: 100 });
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "CapCut 패키지를 만드는 중 오류가 발생했습니다."
      );
    } finally {
      setTimeout(() => setExportProgress(null), 400);
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
      // 클립보드 접근이 막힌 환경에서는 조용히 무시
    }
  }

  // 컷 하나에 대해 프롬프트 + 캐릭터 참조 이미지를 Gemini에 보내 이미지를 받고, 성공하면
  // 바로 그 컷 슬롯에 업로드한다. 단일 컷 버튼과 전체 배치 생성이 이 함수를 공유한다.
  async function generateAndAssignForCut(cut: Cut) {
    const cutLabel = formatCutLabel(cut.cutNumber);
    const matchedCharacter = matchSpeakerCharacter(cut.dialogue, characters);
    const referenceImage = matchedCharacter?.profileImage
      ? await compressDataUrlForReference(matchedCharacter.profileImage)
      : null;
    const prompt = resolveCutPrompt(cut, presetId, characters).promptEn;

    const result = await generateCutImage({
      prompt,
      characterReferenceImages: referenceImage ? [referenceImage] : undefined,
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
        description="먼저 '원고 분할' 화면에서 원고를 컷으로 분할하면, 이 화면에서 컷마다 프롬프트와 4K 이미지를 함께 관리할 수 있습니다."
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
            프롬프트 생성부터 4K 컷 이미지 업로드까지 한 화면에서 처리합니다.
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
          <button
            onClick={() => setIsGeminiModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Gemini 전체 컷 자동생성
          </button>
          <button
            onClick={() => void handleBulkDownload()}
            disabled={isZipping}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isZipping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            에셋 일괄 다운로드
          </button>
          <button
            onClick={() => void handleExportCapCutPackage()}
            disabled={exportProgress !== null}
            title="01_images(4K 이미지)·02_audio(보이스)·03_scripts(대사/연출 텍스트)·metadata.json으로 묶어 내보냅니다"
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportProgress ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderArchive className="h-3.5 w-3.5" />
            )}
            캡컷 패키지 내보내기 (.zip)
          </button>
        </div>
      </div>

      <div
        onDragEnter={handleTopDragEnter}
        onDragLeave={handleTopDragLeave}
        onDragOver={handleTopDragOver}
        onDrop={handleTopDrop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
          isTopDragActive ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
        }`}
      >
        <FolderInput className="h-6 w-6 text-slate-400" />
        <p className="text-xs font-medium text-slate-500">
          4K 이미지와 대사 오디오 파일을 여기로 한 번에 드래그하세요
        </p>
        <p className="text-[11px] text-slate-400">
          파일명 속 숫자(1.png, cut_01_voice.wav)로 컷을 자동 인식합니다 · 번호를 못 찾은
          이미지는 아래 트레이에, 오디오는 매핑 결과만 안내됩니다
        </p>
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

        <span className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => void handleCopyNegative()}
            title={DEFAULT_NEGATIVE_PROMPT}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            네거티브 복사
          </button>
          <button
            onClick={handleExportTxt}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <FileText className="h-3.5 w-3.5" />
            TXT
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <Braces className="h-3.5 w-3.5" />
            JSON
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {cuts.map((cut) => (
          <CutStudioRow
            key={cut.id}
            cut={cut}
            presetId={presetId}
            characters={characters}
            images={getAssetsForCut(cut.id, "IMAGE")}
            audioAssets={getAssetsForCut(cut.id, "AUDIO")}
            isUploading={uploadingCutId === cut.id}
            onChangeCut={(patch) => updateCut(cut.id, patch)}
            onUploadFiles={(targetCut, files) => void handleUploadFiles(targetCut, files)}
            onUploadAudioFiles={(targetCut, files) => void handleUploadAudioFiles(targetCut, files)}
            onOpenLightbox={(cutId, index) => setLightbox({ cutId, index })}
            onDeleteAsset={(asset) => setAssetPendingDelete(asset)}
            onDropTrayItem={(targetCut, trayId) => void handleDropTrayItem(targetCut, trayId)}
            onGenerateWithGemini={handleGenerateOneCut}
          />
        ))}
      </div>

      <UnassignedAssetTray items={stagedAssets} onDiscard={handleDiscardStaged} />

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

      {exportProgress && (
        <ProgressModal phase={exportProgress.phase} percent={exportProgress.percent} />
      )}
    </div>
  );
}

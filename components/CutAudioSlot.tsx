"use client";

import { useRef, useState } from "react";
import { Check, Copy, Loader2, Mic, Pause, Play, Trash2, Upload, Volume2 } from "lucide-react";
import type { Cut, CutAsset } from "@/lib/types";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// 네이티브 <audio controls>는 OS/브라우저 기본 스타일이라 앱 톤(비비드 로즈)에 맞출 수
// 없어서, 재생/일시정지·탐색바·시간·볼륨만 담은 컴팩트 커스텀 플레이어를 직접 만든다.
function CompactAudioPlayer({ asset, onDelete }: { asset: CutAsset; onDelete: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else void audio.play();
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <audio
        ref={audioRef}
        src={asset.fileUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        className="hidden"
      />
      <button
        onClick={togglePlay}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={(e) => {
          const audio = audioRef.current;
          if (audio) audio.currentTime = Number(e.target.value);
        }}
        className="h-1 min-w-0 flex-1 accent-rose-500"
      />
      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          if (audioRef.current) audioRef.current.volume = v;
        }}
        className="h-1 w-12 shrink-0 accent-rose-500"
      />
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
        v{asset.version}
      </span>
      <button
        onClick={onDelete}
        title="삭제"
        className="shrink-0 text-slate-400 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function CutAudioSlot({
  cut,
  assets,
  isUploading,
  onUploadFiles,
  onDeleteAsset,
}: {
  cut: Cut;
  assets: CutAsset[];
  isUploading: boolean;
  onUploadFiles: (cut: Cut, files: FileList | File[]) => void;
  onDeleteAsset: (asset: CutAsset) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const dialogueText = cut.dialogue || cut.directionNote;

  async function handleCopyDialogue() {
    if (!dialogueText) return;
    try {
      await navigator.clipboard.writeText(dialogueText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 막힌 환경에서는 조용히 무시
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragActive(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragActive(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files.length > 0) onUploadFiles(cut, e.dataTransfer.files);
  }

  const latest = assets[assets.length - 1] ?? null;
  const olderVersions = assets.slice(0, -1);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`flex flex-col gap-2 rounded-xl border border-dashed p-3 transition-colors ${
        isDragActive ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <Mic className="h-3.5 w-3.5" />
          대사 오디오 슬롯
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void handleCopyDialogue()}
            disabled={!dialogueText}
            title="타입캐스트/클로바더빙 입력창에 붙여넣기용"
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              copied
                ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "복사됨" : "대사 텍스트 복사"}
          </button>
          <label className="flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50">
            <Upload className="h-3 w-3" />
            업로드
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
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

      {isUploading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      ) : latest ? (
        <>
          <CompactAudioPlayer asset={latest} onDelete={() => onDeleteAsset(latest)} />
          {olderVersions.length > 0 && (
            <>
              <button
                onClick={() => setIsExpanded((v) => !v)}
                className="self-start text-[11px] font-medium text-slate-400 hover:text-slate-600"
              >
                이전 버전 {olderVersions.length}개 {isExpanded ? "숨기기" : "보기"}
              </button>
              {isExpanded && (
                <div className="flex flex-col gap-1.5">
                  {olderVersions
                    .slice()
                    .reverse()
                    .map((asset) => (
                      <CompactAudioPlayer
                        key={asset.id}
                        asset={asset}
                        onDelete={() => onDeleteAsset(asset)}
                      />
                    ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <p className="py-1 text-center text-[11px] text-slate-400">
          오디오 파일을 여기로 드래그하거나 업로드 버튼을 눌러주세요
        </p>
      )}
    </div>
  );
}

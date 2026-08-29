"use client";

import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import type JSZip from "jszip";
import { useSeries } from "@/context/SeriesContext";
import {
  type BackupData,
  type ImportMode,
  backupFileName,
  exportBackup,
  importBackup,
  readBackupFile,
} from "@/lib/backup";
import { downloadBlob } from "@/lib/downloadFile";
import ProgressModal from "./ProgressModal";
import Toast, { type ToastState } from "./Toast";

interface ProgressState {
  phase: string;
  percent: number;
}

interface PendingImport {
  fileName: string;
  data: BackupData;
  zip: JSZip;
}

export default function BackupRestoreControls() {
  const { reloadFromStorage } = useSeries();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);
  const [includeTrash, setIncludeTrash] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const busy = progress !== null;

  async function handleExport(withTrash: boolean) {
    setIsExportOptionsOpen(false);
    setProgress({ phase: "데이터 수집 중", percent: 0 });
    try {
      const blob = await exportBackup(
        (phase, percent) => setProgress({ phase, percent }),
        withTrash
      );
      downloadBlob(blob, backupFileName());
      setToast({ type: "success", message: "백업 파일을 다운로드했습니다." });
    } catch {
      setToast({ type: "error", message: "백업 파일을 만드는 중 오류가 발생했습니다." });
    } finally {
      setProgress(null);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setProgress({ phase: "백업 파일 확인 중", percent: 0 });
    const result = await readBackupFile(file);
    setProgress(null);

    if (!result.valid || !result.data || !result.zip) {
      setToast({ type: "error", message: result.error ?? "백업 파일을 읽을 수 없습니다." });
      return;
    }

    setPendingImport({ fileName: file.name, data: result.data, zip: result.zip });
  }

  async function handleConfirmImport(mode: ImportMode) {
    if (!pendingImport) return;
    const { data, zip } = pendingImport;
    setPendingImport(null);
    setProgress({ phase: "복원 준비 중", percent: 0 });
    try {
      await importBackup(data, zip, mode, (phase, percent) => setProgress({ phase, percent }));
      reloadFromStorage();
      setToast({ type: "success", message: "백업을 복원했습니다." });
    } catch {
      setToast({ type: "error", message: "복원 중 오류가 발생했습니다. 다시 시도해주세요." });
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIsExportOptionsOpen(true)}
          disabled={busy}
          title="전체 데이터를 zip 파일로 내보냅니다"
          className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          데이터 백업
        </button>

        <label
          className={`flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 ${
            busy ? "cursor-not-allowed opacity-40" : "cursor-pointer"
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          데이터 복원
          <input
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />
        </label>
      </div>

      {isExportOptionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">백업 내보내기</h2>
            <p className="mt-2 text-sm text-slate-500">
              모든 시리즈·회차·컷·캐릭터·참조 이미지를 zip 파일로 내보냅니다.
            </p>

            <label className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeTrash}
                onChange={(e) => setIncludeTrash(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              휴지통에 있는 삭제된 항목도 포함
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsExportOptionsOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={() => void handleExport(includeTrash)}
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
              >
                내보내기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">백업 복원 방식 선택</h2>
            <p className="mt-2 text-sm text-slate-500">
              &quot;{pendingImport.fileName}&quot; 파일에 시리즈 {pendingImport.data.series.length}개,
              캐릭터 {pendingImport.data.characters.length}개가 들어 있습니다.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => void handleConfirmImport("merge")}
                className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
              >
                기존 데이터에 추가 (병합)
              </button>
              <button
                onClick={() => void handleConfirmImport("overwrite")}
                className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                기존 데이터를 모두 지우고 복원 (덮어쓰기)
              </button>
              <button
                onClick={() => setPendingImport(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {progress && <ProgressModal phase={progress.phase} percent={progress.percent} />}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </>
  );
}

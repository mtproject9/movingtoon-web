"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Download, FolderOpen, Upload, UploadCloud, X } from "lucide-react";
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
import { getBackupFolderUrl, requestDriveAccess, uploadBackupToDrive } from "@/lib/googleDrive";
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

const LAST_BACKUP_AT_KEY = "movingtoon_last_backup_at";
// 세션(탭) 안에서 "나중에"로 넘기면, 페이지를 옮겨다닐 때마다(=이 컴포넌트가
// 헤더와 함께 다시 마운트될 때마다) 또 뜨는 걸 막는다 — 브라우저 탭을 새로
// 열거나 다음 날 다시 오면 sessionStorage가 비어 있으니 다시 확인한다.
const REMINDER_DISMISSED_KEY = "movingtoon_backup_reminder_dismissed";
// 이 시간 이상 백업이 없었으면 알려준다 — 완전 자동(무음) 백업은 구글 인증 팝업이
// 사용자 클릭 없이는 열리지 않아 불가능하므로, 대신 때가 되면 앱이 먼저 알려주고
// 버튼 한 번만 누르면 되는 "리마인더" 방식으로 자동화한다.
const BACKUP_REMINDER_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function getLastBackupAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(LAST_BACKUP_AT_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function markBackedUpNow() {
  localStorage.setItem(LAST_BACKUP_AT_KEY, String(Date.now()));
}

function dismissReminderForSession() {
  sessionStorage.setItem(REMINDER_DISMISSED_KEY, "1");
}

export default function BackupRestoreControls() {
  const { seriesList, reloadFromStorage } = useSeries();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);
  const [includeTrash, setIncludeTrash] = useState(false);
  const [isOpeningDriveFolder, setIsOpeningDriveFolder] = useState(false);
  const [isReminderVisible, setIsReminderVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 지울 데이터가 있고("시리즈가 하나라도 있음") 마지막 백업이 오래됐으면 알려준다.
  // 세션마다 한 번만 확인하면 충분하므로 마운트 시 한 번 체크한다 — 헤더는 앱을 쓰는
  // 내내 계속 떠 있으므로 사실상 "앱을 열어둔 동안 때가 되면" 알려주는 효과를 낸다.
  useEffect(() => {
    if (seriesList.length === 0) return;
    if (sessionStorage.getItem(REMINDER_DISMISSED_KEY)) return;
    const lastBackupAt = getLastBackupAt();
    if (Date.now() - lastBackupAt > BACKUP_REMINDER_THRESHOLD_MS) {
      setIsReminderVisible(true);
    }
  }, [seriesList.length]);

  const busy = progress !== null;

  async function handleExport(withTrash: boolean, destination: "local" | "drive") {
    setIsExportOptionsOpen(false);
    setProgress({ phase: destination === "drive" ? "구글 계정 인증 중" : "데이터 수집 중", percent: 0 });
    try {
      // 팝업 인증창은 클릭과 동기적으로 이어져 있어야 브라우저가 막지 않으므로,
      // 오래 걸리는 exportBackup보다 먼저 인증부터 끝내둔다.
      if (destination === "drive") {
        await requestDriveAccess();
      }
      setProgress({ phase: "데이터 수집 중", percent: 0 });
      const blob = await exportBackup(
        (phase, percent) => setProgress({ phase, percent }),
        withTrash
      );
      const fileName = backupFileName();
      if (destination === "local") {
        downloadBlob(blob, fileName);
        setToast({ type: "success", message: "백업 파일을 다운로드했습니다." });
      } else {
        await uploadBackupToDrive(blob, fileName, (phase, percent) => setProgress({ phase, percent }));
        setToast({ type: "success", message: "구글 드라이브에 백업했습니다." });
      }
      markBackedUpNow();
      setIsReminderVisible(false);
    } catch {
      setToast({
        type: "error",
        message:
          destination === "local"
            ? "백업 파일을 만드는 중 오류가 발생했습니다."
            : "구글 드라이브 백업에 실패했습니다.",
      });
    } finally {
      setProgress(null);
    }
  }

  async function handleOpenDriveFolder() {
    setIsOpeningDriveFolder(true);
    try {
      const url = await getBackupFolderUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setToast({ type: "error", message: "구글 드라이브 폴더를 열지 못했습니다." });
    } finally {
      setIsOpeningDriveFolder(false);
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

        <button
          onClick={() => void handleOpenDriveFolder()}
          disabled={busy || isOpeningDriveFolder}
          title="구글 드라이브의 백업 폴더를 새 탭으로 엽니다"
          className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          드라이브 폴더 열기
        </button>
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

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => void handleExport(includeTrash, "drive")}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
              >
                <UploadCloud className="h-4 w-4" />
                구글 드라이브에 저장
              </button>
              <button
                onClick={() => void handleExport(includeTrash, "local")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                내 PC에 다운로드
              </button>
              <button
                onClick={() => setIsExportOptionsOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                취소
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

      {isReminderVisible && !busy && (
        <div className="fixed bottom-5 right-5 z-40 flex w-72 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-lg">
          <CloudUpload className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-700">백업한 지 오래됐어요</p>
            <p className="mt-0.5 text-xs text-slate-500">
              구글 드라이브에 지금 백업해두는 걸 추천해요.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => void handleExport(false, "drive")}
                className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600"
              >
                지금 백업
              </button>
              <button
                onClick={() => {
                  dismissReminderForSession();
                  setIsReminderVisible(false);
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                나중에
              </button>
            </div>
          </div>
          <button
            onClick={() => {
              dismissReminderForSession();
              setIsReminderVisible(false);
            }}
            className="shrink-0 rounded-full p-0.5 text-slate-300 hover:text-slate-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {progress && <ProgressModal phase={progress.phase} percent={progress.percent} />}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </>
  );
}

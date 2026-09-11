"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Wand2, AlertCircle, Check } from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { useTrash } from "@/context/TrashContext";
import { formatCutLabel } from "@/lib/types";
import type { Cut } from "@/lib/types";
import { translatePrompt } from "@/lib/geminiGenerate";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";

// lib/promptRules.ts의 EMOTION_KEYWORDS가 감정에 따라 자동으로 지정하는
// "close-up on face"/"close-up on eyes"도 포함해야 한다 — 안 그러면 원고 분할
// 직후 그 감정이 감지된 컷은 드롭다운에 없는 값이라 선택 표시가 어긋나 보인다.
const CAMERA_ANGLE_OPTIONS = [
  "close-up",
  "close-up on face",
  "close-up on eyes",
  "bust shot",
  "wide shot",
  "medium shot",
];

export default function SplitPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { cuts, setCuts, selectedCut, updateCut, removeCut, addCut, scriptText, setScriptText } =
    useCuts();
  const { captureCut, captureCutsSnapshot } = useTrash();
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cutPendingDelete, setCutPendingDelete] = useState<Cut | null>(null);
  const [pendingOverwriteConfirm, setPendingOverwriteConfirm] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, type: ToastState["type"] = "error") {
    setToast({ type, message });
  }

  function handleSplitClick() {
    if (!scriptText.trim()) {
      setError("원고 내용을 먼저 붙여넣어 주세요.");
      return;
    }
    setError(null);

    if (cuts.length > 0) {
      setPendingOverwriteConfirm(true);
      return;
    }

    void performSplit();
  }

  async function performSplit() {
    setIsSplitting(true);
    setError(null);

    try {
      const res = await fetch("/api/cuts/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptText }),
      });

      const body = (await res.json().catch(() => null)) as { cuts?: Cut[]; error?: string } | null;

      if (!res.ok || !body?.cuts) {
        throw new Error(body?.error ?? "원고를 분할하지 못했습니다.");
      }

      // 새로 파싱된 결과로 기존 컷 목록을 완전히 대체하기 전에, 되돌릴 수 있도록
      // 지금 있던 컷들을 휴지통에 스냅샷으로 남겨둔다 — 실수로 재분할을 확정했을
      // 때도 휴지통에서 복원할 수 있게 하기 위함.
      if (cuts.length > 0) {
        await captureCutsSnapshot(episodeId, cuts);
      }

      // 새로 파싱된 결과로 기존 컷 목록을 완전히 대체한다(append/merge가 아님) —
      // CutsContext.setCuts는 이전 상태를 전부 덮어쓰고, selectedCutId도 첫 컷으로
      // 맞춰 오른쪽 상세 패널이 곧바로 1번 컷 내용으로 갱신되게 한다.
      setCuts(body.cuts);

      notify(`총 ${body.cuts.length}개 컷으로 분할되었습니다.`, "success");
    } catch (err) {
      console.error("[SplitPage] 컷 분할 실패:", err);
      const message = err instanceof Error ? err.message : "다시 시도해주세요.";
      setError(message);
      notify(message);
    } finally {
      setIsSplitting(false);
    }
  }

  async function handleConfirmDeleteCut() {
    if (!cutPendingDelete) return;
    const target = cutPendingDelete;
    // 확인창을 즉시 닫고 화면에서도 바로 지운다 — 응답을 기다리는 동안 다시 눌러서
    // 같은 컷이 휴지통에 중복으로 쌓이는 걸 막는다.
    setCutPendingDelete(null);
    removeCut(target.id);
    await captureCut(episodeId, target);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">원고 자동 분할</h1>
            <p className="mt-1 text-sm text-slate-500">
              원고 텍스트를 붙여넣으면 씬당 3~5컷 기준으로 자동 분할됩니다.
            </p>
          </div>

          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="여기에 원고를 붙여넣어 주세요..."
            className="min-h-[300px] flex-1 resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSplitClick}
            disabled={isSplitting}
            className="flex items-center justify-center gap-2 self-start rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {isSplitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {isSplitting ? "분할하는 중..." : "컷으로 분할하기"}
          </button>

          {cuts.length > 0 && (
            <p className="text-xs text-slate-400">
              총 {cuts.length}개 컷으로 분할되었습니다. 왼쪽 목록에서 컷을 선택하면
              오른쪽에서 상세 내용을 수정할 수 있습니다.
            </p>
          )}
        </section>

        <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedCut ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
              <Wand2 className="h-8 w-8 text-slate-200" />
              원고를 분할하거나 좌측에서 컷을 선택하면
              <br />
              상세 편집 패널이 여기에 표시됩니다.
            </div>
          ) : (
            <CutDetailForm
              key={selectedCut.id}
              cut={selectedCut}
              onChange={(patch) => updateCut(selectedCut.id, patch)}
              onDelete={() => setCutPendingDelete(selectedCut)}
              onAddBefore={() => addCut(selectedCut.id, "before")}
              onAddAfter={() => addCut(selectedCut.id, "after")}
            />
          )}
        </section>
      </div>

      {pendingOverwriteConfirm && (
        <ConfirmDialog
          title="원고를 다시 분할할까요?"
          message="기존 작업 데이터가 덮어씌워집니다. 계속 진행하시겠습니까?"
          confirmLabel="진행"
          danger={false}
          onConfirm={() => {
            setPendingOverwriteConfirm(false);
            void performSplit();
          }}
          onCancel={() => setPendingOverwriteConfirm(false)}
        />
      )}

      {cutPendingDelete && (
        <ConfirmDialog
          title="컷을 삭제할까요?"
          message={`${formatCutLabel(cutPendingDelete.cutNumber)}이(가) 휴지통으로 이동합니다. 휴지통에서 다시 복원할 수 있습니다.`}
          onConfirm={() => void handleConfirmDeleteCut()}
          onCancel={() => setCutPendingDelete(null)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </div>
  );
}

function CutDetailForm({
  cut,
  onChange,
  onDelete,
  onAddBefore,
  onAddAfter,
}: {
  cut: Cut;
  onChange: (patch: Partial<Cut>) => void;
  onDelete: () => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
}) {
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 연출 메모(한글)를 고친 뒤 포커스를 빼면(blur) 영문 프롬프트용 번역 캐시를
  // 새로 만든다 — 대사/표정과 달리 자유 서술이라 키워드 치환으로 대응 못 하고,
  // 실제 번역 API가 필요해 비동기로 처리한다.
  const [isTranslatingDirectionNote, setIsTranslatingDirectionNote] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const directionNoteFocusValueRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function handleFieldChange(patch: Partial<Cut>) {
    onChange(patch);
    setJustSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setJustSaved(false), 1200);
  }

  async function handleDirectionNoteBlur() {
    const focusValue = directionNoteFocusValueRef.current;
    directionNoteFocusValueRef.current = null;
    const current = cut.directionNote.trim();
    if (focusValue === null || focusValue === current) return;

    if (!current) {
      // 지워서 비웠으면 번역 캐시도 함께 비운다 — 그대로 두면 영문 프롬프트에
      // 지워진 예전 문장이 계속 남는다.
      onChange({ directionNoteEn: undefined });
      return;
    }

    setTranslateError(null);
    setIsTranslatingDirectionNote(true);
    try {
      const translated = await translatePrompt(current, "ko-to-en");
      onChange({ directionNoteEn: translated });
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : "연출 메모 번역에 실패했습니다."
      );
    } finally {
      setIsTranslatingDirectionNote(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {formatCutLabel(cut.cutNumber)}
          </h2>
          <p className="text-xs text-slate-400">Scene {cut.sceneNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 text-xs font-medium text-emerald-600 transition-opacity duration-300 ${
              justSaved ? "opacity-100" : "opacity-0"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            저장됨
          </span>
          <StatusBadge status={cut.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAddAfter}
          className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-600"
        >
          ➕ 뒤에 컷 추가
        </button>
        <button
          onClick={onAddBefore}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          ➕ 앞에 컷 추가
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"
        >
          🗑️ 컷 삭제
        </button>
      </div>

      <Field label="대사 (dialogue)">
        <textarea
          value={cut.dialogue}
          onChange={(e) => handleFieldChange({ dialogue: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          placeholder="예: 저... 그게 아니라..."
        />
      </Field>

      <Field label="감정선 지문 (emotionTag)">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">[</span>
          <input
            value={cut.emotionTag}
            onChange={(e) => handleFieldChange({ emotionTag: e.target.value })}
            className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            placeholder="설레며"
          />
          <span className="text-sm text-slate-400">]</span>
        </div>
      </Field>

      <Field label="표정 (expression)">
        <textarea
          value={cut.expression}
          onChange={(e) => handleFieldChange({ expression: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          placeholder="예: 놀라며 눈이 커지는 표정"
        />
      </Field>

      <Field label="카메라 앵글 (cameraAngle)">
        <select
          value={cut.cameraAngle}
          onChange={(e) => handleFieldChange({ cameraAngle: e.target.value })}
          className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
        >
          {CAMERA_ANGLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="연출 메모 (directionNote)"
        hint={
          isTranslatingDirectionNote ? (
            <span className="flex items-center gap-1 text-rose-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              영문 프롬프트용 번역 중...
            </span>
          ) : undefined
        }
      >
        <textarea
          value={cut.directionNote}
          onChange={(e) => handleFieldChange({ directionNote: e.target.value })}
          onFocus={(e) => {
            directionNoteFocusValueRef.current = e.target.value;
          }}
          onBlur={() => void handleDirectionNoteBlur()}
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          placeholder="자유 연출 메모"
        />
        {translateError && <p className="mt-1 text-xs text-red-500">{translateError}</p>}
      </Field>

      <Field label="원문 (scriptText)">
        <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-500">
          {cut.scriptText}
        </p>
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

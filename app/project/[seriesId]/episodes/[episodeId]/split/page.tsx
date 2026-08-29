"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Wand2, AlertCircle, KeyRound } from "lucide-react";
import { useCuts } from "@/context/CutsContext";
import { useTrash } from "@/context/TrashContext";
import { formatCutLabel } from "@/lib/types";
import type { Cut } from "@/lib/types";
import { buildSplitImagePrompt } from "@/lib/promptRules";
import { getGeminiApiKey } from "@/lib/geminiApiKey";
import { generateCutImage, refineCutPromptWithGemini } from "@/lib/geminiGenerate";
import { downloadBlob } from "@/lib/downloadFile";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastState } from "@/components/Toast";
import GeminiApiKeySettingsModal from "@/components/GeminiApiKeySettingsModal";

const CAMERA_ANGLE_OPTIONS = ["close-up", "bust shot", "wide shot", "medium shot"];

export default function SplitPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { cuts, setCuts, selectedCut, updateCut, removeCut, addCut, scriptText, setScriptText } =
    useCuts();
  const { captureCut } = useTrash();
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cutPendingDelete, setCutPendingDelete] = useState<Cut | null>(null);
  const [pendingOverwriteConfirm, setPendingOverwriteConfirm] = useState(false);
  const [geminiApiKey, setGeminiApiKeyState] = useState("");
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  useEffect(() => {
    // localStorage는 첫 렌더 이후에만 읽을 수 있어 effect 안에서 동기화한다.
    setGeminiApiKeyState(getGeminiApiKey());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
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
    console.log("[Parser Triggered]", { episodeId, scriptLength: scriptText.length });

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

      // 각 컷이 상세 패널을 한 번도 열지 않아도 처음부터 완성된 imagePrompt를 갖도록
      // 분할 직후 전체 컷에 대해 즉시 로컬 템플릿으로 프롬프트를 조립해 채운다.
      const cutsWithPrompts = body.cuts.map((cut) => ({
        ...cut,
        imagePrompt: cut.imagePrompt || buildSplitImagePrompt(cut),
      }));

      // 새로 파싱된 결과로 기존 컷 목록을 완전히 대체한다(append/merge가 아님) —
      // CutsContext.setCuts는 이전 상태를 전부 덮어쓰고, selectedCutId도 첫 컷으로
      // 맞춰 오른쪽 상세 패널이 곧바로 1번 컷 내용으로 갱신되게 한다.
      setCuts(cutsWithPrompts);

      console.log("[Parsed Cuts Count]", body.cuts.length);
      console.log("[First Cut Dialogue]", body.cuts[0]?.dialogue ?? "(없음)");

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
    await captureCut(episodeId, cutPendingDelete);
    removeCut(cutPendingDelete.id);
    setCutPendingDelete(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end px-6 pt-4">
        <button
          onClick={() => setIsApiKeyModalOpen(true)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            geminiApiKey
              ? "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" />
          {geminiApiKey ? "Gemini API 연결됨" : "🔑 Gemini API 설정"}
        </button>
      </div>

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
              apiKey={geminiApiKey}
              onChange={(patch) => updateCut(selectedCut.id, patch)}
              onDelete={() => setCutPendingDelete(selectedCut)}
              onAddBefore={() => addCut(selectedCut.id, "before")}
              onAddAfter={() => addCut(selectedCut.id, "after")}
              onNotify={notify}
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

      {isApiKeyModalOpen && (
        <GeminiApiKeySettingsModal
          currentKey={geminiApiKey}
          onClose={() => setIsApiKeyModalOpen(false)}
          onSaved={(key) => setGeminiApiKeyState(key)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} />}
    </div>
  );
}

function CutDetailForm({
  cut,
  apiKey,
  onChange,
  onDelete,
  onAddBefore,
  onAddAfter,
  onNotify,
}: {
  cut: Cut;
  apiKey: string;
  onChange: (patch: Partial<Cut>) => void;
  onDelete: () => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  onNotify: (message: string, type?: ToastState["type"]) => void;
}) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 새 프롬프트를 반영한 직후 textarea에 포커스를 주고 전체 선택해, 값이 바뀌었다는
  // 사실이 화면에서 곧바로 눈에 띄도록 한다 (controlled input이라 리렌더는 이미
  // onChange만으로 보장되지만, 포커스/스크롤 이동까지 강제해 "즉각 반응"을 체감시킨다).
  function applyPrompt(newPrompt: string) {
    onChange({ imagePrompt: newPrompt });
    requestAnimationFrame(() => {
      const el = promptTextareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }

  // 이 폼은 부모에서 key={cut.id}로 렌더링되어 컷을 바꿀 때마다 새로 마운트되므로,
  // 마운트 시 1회만 확인하는 것으로 "컷 전환 시 자동 채움"이 보장된다. (분할/컷 추가
  // 시점에 이미 채워지지만, 그 이전에 저장된 컷을 위한 방어적 보완이다.)
  useEffect(() => {
    if (!cut.imagePrompt) {
      onChange({ imagePrompt: buildSplitImagePrompt(cut) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRegeneratePrompt() {
    if (cut.isPromptApproved) {
      // disabled 대신 클릭을 계속 받아 "왜 안 되는지"를 바로 알려준다 —
      // 그냥 비활성화만 해두면 사용자에게는 버튼이 고장난 것처럼 보인다.
      onNotify("승인 해제 후 다시 생성할 수 있습니다. 잠금(✅ 승인 완료)을 다시 눌러 해제해주세요.");
      return;
    }

    // 로컬 템플릿은 항상 즉시(동기) 계산 가능하고, 호출할 때마다 조명/화풍/분위기
    // 수식어를 무작위로 바꿔 매번 다른 문장을 낸다 — 버튼 클릭에 즉시 반응하도록
    // 먼저 확정해 두고, 키가 있으면 Gemini 결과로 다시 덮어쓴다. 기존 텍스트가
    // 무엇이었든 상관없이 항상 무조건 덮어쓴다.
    const localPrompt = buildSplitImagePrompt(cut);

    if (!apiKey) {
      applyPrompt(localPrompt);
      return;
    }

    setIsRegenerating(true);
    try {
      const refined = await refineCutPromptWithGemini({
        apiKey,
        dialogue: cut.dialogue,
        emotionTag: cut.emotionTag,
        expression: cut.expression,
        cameraAngle: cut.cameraAngle,
        directionNote: cut.directionNote,
      });
      applyPrompt(refined);
    } catch (err) {
      applyPrompt(localPrompt);
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      onNotify(`Gemini 프롬프트 생성에 실패해 로컬 템플릿으로 대체했습니다. (${message})`);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleGenerateImage() {
    if (!apiKey) {
      onNotify("Gemini API 키를 먼저 설정해주세요 (상단 🔑 Gemini API 설정).");
      return;
    }
    const prompt = (cut.imagePrompt || buildSplitImagePrompt(cut)).trim();
    if (!prompt) return;

    setIsGeneratingImage(true);
    try {
      const result = await generateCutImage({ prompt, aspectRatio: "9:16", apiKey });
      onChange({ imageUrl: `data:${result.mimeType};base64,${result.imageBase64}` });
      onNotify("이미지 생성이 완료되었습니다.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "이미지 생성에 실패했습니다.";
      onNotify(message);
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleDownloadImage() {
    if (!cut.imageUrl) return;
    try {
      const blob = await fetch(cut.imageUrl).then((res) => res.blob());
      downloadBlob(blob, `${formatCutLabel(cut.cutNumber)}.png`);
    } catch {
      onNotify("이미지 다운로드에 실패했습니다.");
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
        <StatusBadge status={cut.status} />
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
          onChange={(e) => onChange({ dialogue: e.target.value })}
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
            onChange={(e) => onChange({ emotionTag: e.target.value })}
            className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            placeholder="설레며"
          />
          <span className="text-sm text-slate-400">]</span>
        </div>
      </Field>

      <Field label="표정 (expression)">
        <textarea
          value={cut.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          placeholder="예: 놀라며 눈이 커지는 표정"
        />
      </Field>

      <Field label="카메라 앵글 (cameraAngle)">
        <select
          value={cut.cameraAngle}
          onChange={(e) => onChange({ cameraAngle: e.target.value })}
          className="w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
        >
          {CAMERA_ANGLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field label="AI 이미지 프롬프트 (imagePrompt)">
        <div className="flex flex-col gap-2">
          <textarea
            ref={promptTextareaRef}
            value={cut.imagePrompt ?? ""}
            onChange={(e) => onChange({ imagePrompt: e.target.value })}
            readOnly={cut.isPromptApproved}
            rows={4}
            className={`w-full resize-none rounded-lg border p-2.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 ${
              cut.isPromptApproved
                ? "cursor-not-allowed border-emerald-200 bg-emerald-50/60 text-slate-500"
                : "border-slate-200 text-slate-700 focus:border-rose-300 focus:ring-rose-100"
            }`}
            placeholder="자동 생성된 이미지 프롬프트가 여기에 표시됩니다."
          />

          {isRegenerating && (
            <p className="flex items-center gap-1.5 text-xs text-indigo-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              제미나이가 프롬프트를 작성 중입니다...
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleRegeneratePrompt()}
              aria-disabled={cut.isPromptApproved || isRegenerating}
              title={
                cut.isPromptApproved
                  ? "승인 해제 후 다시 생성할 수 있습니다"
                  : "현재 대사/지문/앵글로 프롬프트를 다시 만듭니다"
              }
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                cut.isPromptApproved || isRegenerating
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "⚡"} 프롬프트
              자동 재생성
            </button>
            <button
              onClick={() => onChange({ isPromptApproved: !cut.isPromptApproved })}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                cut.isPromptApproved
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
              }`}
            >
              {cut.isPromptApproved ? "✅ 승인 완료 (Locked)" : "프롬프트 승인하기"}
            </button>
          </div>

          <button
            onClick={() => void handleGenerateImage()}
            disabled={isGeneratingImage}
            className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isGeneratingImage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "🎨"
            )}
            {isGeneratingImage ? "이미지 생성 중..." : "Gemini로 이미지 생성"}
          </button>

          {cut.imageUrl && (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cut.imageUrl}
                alt={`${formatCutLabel(cut.cutNumber)} 미리보기`}
                className="max-h-80 w-auto rounded-lg border border-slate-200 object-contain"
              />
              <button
                onClick={() => void handleDownloadImage()}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                💾 이미지 다운로드
              </button>
            </div>
          )}
        </div>
      </Field>

      <Field label="연출 메모 (directionNote)">
        <textarea
          value={cut.directionNote}
          onChange={(e) => onChange({ directionNote: e.target.value })}
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
          placeholder="자유 연출 메모"
        />
      </Field>

      <Field label="원문 (scriptText)">
        <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-500">
          {cut.scriptText}
        </p>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

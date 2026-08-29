"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

export interface BulkPromptRow {
  cutLabel: string;
  sceneNumber: number;
  prompt: string;
}

export default function BulkPromptCopyModal({
  rows,
  onClose,
}: {
  rows: BulkPromptRow[];
  onClose: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopyAll() {
    const ok = await copyText(rows.map((row) => row.prompt).join("\n\n"));
    if (!ok) return;
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  async function handleCopyOne(index: number) {
    const ok = await copyText(rows[index].prompt);
    if (!ok) return;
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">전체 프롬프트 일괄 복사</h2>
            <p className="text-xs text-slate-500">컷 {rows.length}개 · 미드저니용 프롬프트</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-5 py-3">
          <button
            onClick={() => void handleCopyAll()}
            disabled={rows.length === 0}
            className={`flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              copiedAll ? "bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
            }`}
          >
            {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedAll ? "전체 복사됨!" : `전체 ${rows.length}개 프롬프트 한 번에 복사`}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">복사할 컷이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">
                      {row.cutLabel} · Scene {row.sceneNumber}
                    </p>
                    <p className="mt-1 line-clamp-2 font-mono text-xs text-slate-600">
                      {row.prompt}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleCopyOne(index)}
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      copiedIndex === index
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedIndex === index ? "복사됨" : "복사"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

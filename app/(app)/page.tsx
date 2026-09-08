"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, Pencil, Plus, Trash2 } from "lucide-react";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import type { Series } from "@/lib/types";
import SeriesModal, { type SeriesFormValues } from "@/components/SeriesModal";
import BackupRestoreControls from "@/components/BackupRestoreControls";
import TrashButton from "@/components/TrashButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import StudioLogo from "@/components/StudioLogo";

export default function HomePage() {
  const router = useRouter();
  const {
    hydrated,
    seriesList,
    getEpisodesForSeries,
    getCharactersForSeries,
    addSeries,
    updateSeries,
    removeSeries,
  } = useSeries();
  const { captureSeries } = useTrash();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [seriesPendingEdit, setSeriesPendingEdit] = useState<Series | null>(null);
  const [seriesPendingDelete, setSeriesPendingDelete] = useState<Series | null>(null);

  function handleCreate(values: SeriesFormValues) {
    const series = addSeries(values);
    setIsModalOpen(false);
    router.push(`/project/${series.id}`);
  }

  function handleUpdate(values: SeriesFormValues) {
    if (!seriesPendingEdit) return;
    updateSeries(seriesPendingEdit.id, values);
    setSeriesPendingEdit(null);
  }

  async function handleConfirmDeleteSeries() {
    if (!seriesPendingDelete) return;
    const episodes = getEpisodesForSeries(seriesPendingDelete.id);
    const characters = getCharactersForSeries(seriesPendingDelete.id);
    await captureSeries(seriesPendingDelete, episodes, characters);
    removeSeries(seriesPendingDelete.id);
    setSeriesPendingDelete(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <StudioLogo size="lg" />
        <div className="flex items-center gap-2">
          <TrashButton />
          <BackupRestoreControls />
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            <Plus className="h-4 w-4" />
            새 시리즈 만들기
          </button>
        </div>
      </header>

      {!hydrated ? null : seriesList.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white py-24 text-center">
          <Clapperboard className="h-10 w-10 text-slate-200" />
          <p className="text-sm text-slate-500">
            아직 만든 시리즈가 없습니다.
            <br />
            첫 무빙툰 시리즈를 만들어보세요.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            <Plus className="h-4 w-4" />
            새 시리즈 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seriesList.map((series) => {
            const episodeCount = getEpisodesForSeries(series.id).length;

            return (
              <div key={series.id} className="group relative">
                <Link
                  href={`/project/${series.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {series.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={series.thumbnail}
                        alt={series.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Clapperboard className="h-9 w-9 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <h2 className="truncate text-sm font-semibold text-slate-800">
                      {series.title}
                    </h2>
                    {series.logline && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{series.logline}</p>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between text-[11px] text-slate-400">
                    <span>{episodeCount}개 회차</span>
                    <span>{new Date(series.createdAt).toLocaleDateString("ko-KR")}</span>
                  </div>
                </Link>
                <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSeriesPendingEdit(series);
                    }}
                    title="시리즈 수정"
                    className="rounded-full bg-white/90 p-1.5 text-slate-400 shadow-sm hover:text-rose-500"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSeriesPendingDelete(series);
                    }}
                    title="시리즈 삭제"
                    className="rounded-full bg-white/90 p-1.5 text-slate-400 shadow-sm hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <SeriesModal
          initial={null}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {seriesPendingEdit && (
        <SeriesModal
          initial={seriesPendingEdit}
          onClose={() => setSeriesPendingEdit(null)}
          onSubmit={handleUpdate}
        />
      )}

      {seriesPendingDelete && (
        <ConfirmDialog
          title="시리즈를 삭제할까요?"
          message={`"${seriesPendingDelete.title}"의 모든 회차·컷·캐릭터·참조 이미지가 함께 휴지통으로 이동합니다. 휴지통에서 다시 복원할 수 있습니다.`}
          onConfirm={() => void handleConfirmDeleteSeries()}
          onCancel={() => setSeriesPendingDelete(null)}
        />
      )}
    </div>
  );
}

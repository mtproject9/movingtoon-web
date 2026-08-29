"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Plus, Trash2, UserRound } from "lucide-react";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import { formatEpisodeLabel, type Episode } from "@/lib/types";
import CharacterSheetPanel from "@/components/CharacterSheetPanel";
import EpisodeModal from "@/components/EpisodeModal";
import ConfirmDialog from "@/components/ConfirmDialog";

const TABS = [
  { id: "episodes", label: "회차 목록", icon: Film },
  { id: "characters", label: "캐릭터 시트", icon: UserRound },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SeriesDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const router = useRouter();
  const { hydrated, getSeries, getEpisodesForSeries, addEpisode, removeEpisode } = useSeries();
  const { captureEpisode } = useTrash();
  const [activeTab, setActiveTab] = useState<TabId>("episodes");
  const [isEpisodeModalOpen, setIsEpisodeModalOpen] = useState(false);
  const [episodePendingDelete, setEpisodePendingDelete] = useState<Episode | null>(null);

  const series = getSeries(seriesId);
  const episodes = getEpisodesForSeries(seriesId);

  if (!hydrated) return null;

  if (!series) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-500">시리즈를 찾을 수 없습니다.</p>
        <Link href="/" className="text-sm font-medium text-rose-500 hover:underline">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  function handleAddEpisode(title: string) {
    const episode = addEpisode(seriesId, title);
    setIsEpisodeModalOpen(false);
    router.push(`/project/${seriesId}/episodes/${episode.id}/split`);
  }

  async function handleConfirmDeleteEpisode() {
    if (!episodePendingDelete) return;
    await captureEpisode(episodePendingDelete);
    removeEpisode(episodePendingDelete.id);
    setEpisodePendingDelete(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{series.title}</h1>
        {series.logline && <p className="mt-1 text-sm text-slate-500">{series.logline}</p>}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-rose-400 text-rose-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "episodes" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              회차를 선택하면 해당 회차의 원고 분할부터 진행 보드까지 이어서 작업할 수 있습니다.
            </p>
            <button
              onClick={() => setIsEpisodeModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
            >
              <Plus className="h-4 w-4" />
              회차 추가
            </button>
          </div>

          {episodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              <Film className="h-8 w-8 text-slate-200" />
              아직 만든 회차가 없습니다.
              <br />
              &quot;회차 추가&quot;로 첫 회차를 만들어보세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((episode) => (
                <div key={episode.id} className="group relative">
                  <Link
                    href={`/project/${seriesId}/episodes/${episode.id}/split`}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                        <Film className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {formatEpisodeLabel(episode)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(episode.createdAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => setEpisodePendingDelete(episode)}
                    title="회차 삭제"
                    className="absolute right-2 top-2 hidden rounded-full bg-white/90 p-1.5 text-slate-400 shadow-sm hover:text-red-500 group-hover:block"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <CharacterSheetPanel seriesId={seriesId} />
      )}

      {isEpisodeModalOpen && (
        <EpisodeModal
          defaultTitle={`${episodes.length + 1}화`}
          onClose={() => setIsEpisodeModalOpen(false)}
          onSubmit={handleAddEpisode}
        />
      )}

      {episodePendingDelete && (
        <ConfirmDialog
          title="회차를 삭제할까요?"
          message={`${formatEpisodeLabel(episodePendingDelete)}의 모든 컷과 에셋이 함께 휴지통으로 이동합니다. 휴지통에서 다시 복원할 수 있습니다.`}
          onConfirm={() => void handleConfirmDeleteEpisode()}
          onCancel={() => setEpisodePendingDelete(null)}
        />
      )}
    </div>
  );
}

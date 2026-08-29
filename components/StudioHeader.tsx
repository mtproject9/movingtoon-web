"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronRight, FileText, LayoutDashboard, Sparkles } from "lucide-react";
import { useSeries } from "@/context/SeriesContext";
import { formatEpisodeLabel } from "@/lib/types";
import BackupRestoreControls from "./BackupRestoreControls";
import TrashButton from "./TrashButton";
import StudioLogo from "./StudioLogo";

// 이미지·오디오 에셋 관리가 모두 "에셋 스튜디오"(prompts) 화면 안 컷 카드로 들어가
// 있어서, 별도 "에셋" 탭은 더 이상 없다.
const STUDIO_TABS = [
  { segment: "split", label: "원고 분할", icon: FileText },
  { segment: "prompts", label: "에셋 스튜디오", icon: Sparkles },
  { segment: "board", label: "진행 보드", icon: LayoutDashboard },
] as const;

export default function StudioHeader() {
  const params = useParams<{ seriesId: string; episodeId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { seriesList, getEpisodesForSeries } = useSeries();

  const seriesId = params.seriesId;
  const episodeId = params.episodeId;
  const episodesInSeries = seriesId ? getEpisodesForSeries(seriesId) : [];

  const activeSegment =
    STUDIO_TABS.find((tab) => pathname?.includes(`/${tab.segment}`))?.segment ?? "split";

  function handleSeriesChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/project/${e.target.value}`);
  }

  function handleEpisodeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/project/${seriesId}/episodes/${e.target.value}/${activeSegment}`);
  }

  return (
    <header className="flex shrink-0 flex-col border-b border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2 px-5">
        <StudioLogo href="/" size="md" />

        {seriesId && (
          <>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            <select
              value={seriesId}
              onChange={handleSeriesChange}
              title="시리즈 선택"
              className="max-w-[180px] truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            >
              {seriesList.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title}
                </option>
              ))}
            </select>
          </>
        )}

        {episodeId && (
          <>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            <select
              value={episodeId}
              onChange={handleEpisodeChange}
              title="회차 선택"
              className="max-w-[140px] truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            >
              {episodesInSeries.map((episode) => (
                <option key={episode.id} value={episode.id}>
                  {formatEpisodeLabel(episode)}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <TrashButton />
          <BackupRestoreControls />
        </div>
      </div>

      {episodeId && seriesId && (
        <nav className="flex items-center gap-1 px-5 pb-2">
          {STUDIO_TABS.map((tab) => {
            const href = `/project/${seriesId}/episodes/${episodeId}/${tab.segment}`;
            const isActive = activeSegment === tab.segment;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.segment}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-rose-50 text-rose-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

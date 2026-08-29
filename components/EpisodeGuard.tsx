"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSeries } from "@/context/SeriesContext";

export default function EpisodeGuard({ children }: { children: React.ReactNode }) {
  const { seriesId, episodeId } = useParams<{ seriesId: string; episodeId: string }>();
  const { hydrated, getEpisode } = useSeries();

  if (!hydrated) return null;

  const episode = getEpisode(episodeId);
  if (!episode || episode.seriesId !== seriesId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-500">회차를 찾을 수 없습니다.</p>
        <Link
          href={`/project/${seriesId}`}
          className="text-sm font-medium text-rose-500 hover:underline"
        >
          시리즈로 돌아가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

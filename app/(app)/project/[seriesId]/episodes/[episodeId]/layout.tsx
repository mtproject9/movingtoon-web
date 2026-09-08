import { CutsProvider } from "@/context/CutsContext";
import { AssetsProvider } from "@/context/AssetsContext";
import CutListSidebar from "@/components/CutListSidebar";
import EpisodeGuard from "@/components/EpisodeGuard";

export default async function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ seriesId: string; episodeId: string }>;
}) {
  const { episodeId } = await params;

  return (
    <CutsProvider episodeId={episodeId}>
      <AssetsProvider episodeId={episodeId}>
        <EpisodeGuard>
          <div className="flex min-h-0 flex-1">
            <CutListSidebar />
            <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50">{children}</main>
          </div>
        </EpisodeGuard>
      </AssetsProvider>
    </CutsProvider>
  );
}

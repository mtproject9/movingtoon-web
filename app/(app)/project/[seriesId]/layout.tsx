import StudioHeader from "@/components/StudioHeader";

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <StudioHeader />
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}

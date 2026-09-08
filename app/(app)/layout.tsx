import { SeriesProvider } from "@/context/SeriesContext";
import { TrashProvider } from "@/context/TrashContext";

// 실제 앱 화면(/, /project/...)에서만 필요한 데이터 프로바이더 — /login은 이
// 그룹 밖에 있어서 로그인 화면에서는 불필요한 bootstrap 요청이 안 나간다.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SeriesProvider>
      <TrashProvider>{children}</TrashProvider>
    </SeriesProvider>
  );
}

import { LayoutDashboard } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";

export default function BoardPage() {
  return (
    <ComingSoon
      icon={LayoutDashboard}
      title="제작 진행 상태 대시보드"
      description="컷별 상태를 4단계 칸반 보드로 추적하는 화면입니다. 다음 단계에서 구현됩니다."
    />
  );
}

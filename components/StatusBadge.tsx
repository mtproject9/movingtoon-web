import { CheckCircle2, PenLine, Trophy } from "lucide-react";
import type { CutStatus } from "@/lib/types";
import { CUT_STATUS_LABEL, CUT_STATUS_DESCRIPTION } from "@/lib/types";

const STATUS_STYLE: Record<CutStatus, { className: string; icon: typeof CheckCircle2 }> = {
  SCRIPT_DONE: {
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: CheckCircle2,
  },
  DRAWING: {
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: PenLine,
  },
  FINAL_DONE: {
    className: "bg-rose-50 text-rose-700 border-rose-200",
    icon: Trophy,
  },
};

export default function StatusBadge({ status }: { status: CutStatus }) {
  const { className, icon: Icon } = STATUS_STYLE[status];

  return (
    <span
      title={CUT_STATUS_DESCRIPTION[status]}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" />
      {CUT_STATUS_LABEL[status]}
    </span>
  );
}

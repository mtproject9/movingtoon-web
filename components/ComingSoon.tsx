import type { LucideIcon } from "lucide-react";

export default function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <Icon className="h-7 w-7 text-rose-400" />
      </div>
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
      <span className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
        준비 중
      </span>
    </div>
  );
}

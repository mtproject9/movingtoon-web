"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTrash } from "@/context/TrashContext";
import TrashModal from "./TrashModal";

export default function TrashButton() {
  const { entries } = useTrash();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="휴지통"
        className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        휴지통
        {entries.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {entries.length > 99 ? "99+" : entries.length}
          </span>
        )}
      </button>

      {isOpen && <TrashModal onClose={() => setIsOpen(false)} />}
    </>
  );
}

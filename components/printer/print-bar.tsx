"use client";

import type { QueueItem } from "@/lib/catalog";

function PrinterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" />
    </svg>
  );
}

/** Sticky bottom bar with error display and the connect/print action. */
export function PrintBar({
  queue,
  isPrinting,
  connected,
  error,
  onPrint,
}: {
  queue: QueueItem[];
  isPrinting: boolean;
  connected: boolean;
  error: string | null;
  onPrint: () => void;
}) {
  const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0);
  const disabled = totalLabels === 0 || isPrinting;

  const label = isPrinting
    ? "Printing..."
    : !connected
      ? "Connect & Print"
      : `Print ${totalLabels} Label${totalLabels !== 1 ? "s" : ""}`;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-20 flex flex-col gap-2">
      {error && <p className="text-red-500 text-xs font-bold text-center mb-1">{error}</p>}
      <button
        onClick={onPrint}
        disabled={disabled}
        className="w-full bg-blue-600 disabled:bg-slate-300 text-white font-bold text-lg rounded-xl py-4 shadow-md hover:bg-blue-700 disabled:hover:bg-slate-300 active:scale-[0.98] disabled:active:scale-100 transition-all flex items-center justify-center gap-3"
      >
        <PrinterIcon />
        {label}
      </button>
    </div>
  );
}

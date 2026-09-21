"use client";

import { useState } from "react";

import { formatWeight } from "@/lib/format";
import type { QueueItem } from "@/lib/catalog";

/** Digits-only editable quantity used by each queue row. */
function QuantityInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (quantity: number) => void;
}) {
  // Local draft while typing; null means "display the committed value".
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label="Quantity"
      className="w-14 h-10 text-center bg-white rounded-md shadow-sm text-slate-800 font-bold text-lg outline-none border border-transparent focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // Keep digits only (numeric keypad on mobile), strip leading zeros.
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        setDraft(digits);
        if (digits) onChange(Math.max(1, parseInt(digits, 10)));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/**
 * The list of queued labels with quantity steppers and remove actions.
 */
export function QueueList({
  queue,
  onSetQuantity,
  onUpdateQuantity,
  onRemove,
}: {
  queue: QueueItem[];
  onSetQuantity: (id: string, quantity: number) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  if (queue.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400 mt-10 font-medium">Queue is empty</p>
    );
  }

  return (
    <div className="space-y-4">
      {queue.map((item) => (
        <div
          key={item.id}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-slate-800 leading-tight text-lg">{item.name}</h3>
              <p className="text-sm text-slate-500 mt-1">
                {formatWeight(item.weight)} • MRP: ₹{item.mrp}
              </p>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.name}`}
              className="text-red-400 p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Quantity
            </span>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                onClick={() => onUpdateQuantity(item.id, -1)}
                className="w-10 h-10 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-700 hover:bg-slate-50 font-bold text-xl active:scale-95 transition-transform"
              >
                -
              </button>
              <QuantityInput
                value={item.quantity}
                onChange={(quantity) => onSetQuantity(item.id, quantity)}
              />
              <button
                onClick={() => onUpdateQuantity(item.id, 1)}
                className="w-10 h-10 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-700 hover:bg-slate-50 font-bold text-xl active:scale-95 transition-transform"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { StoreItem } from "@/lib/catalog";
import { formatWeight } from "@/lib/format";

const subscribeNoop = () => () => {};

/**
 * Centered modal for permanently editing an item's price.
 * Placed cleanly across mobile and desktop via createPortal, keeping the item's
 * name, weight, and shelf life intact while allowing edits to the price only.
 */
export function EditItemModal({
  item,
  onSave,
  onClose,
}: {
  item: StoreItem;
  onSave: (item: StoreItem) => void;
  onClose: () => void;
}) {
  const isMounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [price, setPrice] = useState(String(item.mrp));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const numPrice = parseInt(price, 10);
  const isValid = !isNaN(numPrice) && numPrice > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;

    onSave({
      ...item,
      mrp: numPrice,
    });
  };

  if (!isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 my-auto animate-in fade-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-price-title"
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 id="edit-price-title" className="text-xl font-bold text-slate-800">
              Edit price
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Saved for every device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Read-only item details */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Item
          </div>
          <div className="font-bold text-slate-800 text-base leading-snug">
            {item.name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-medium">
            {formatWeight(item.weight)}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="edit-item-price"
              className="block text-xs font-bold text-slate-600 uppercase mb-1.5"
            >
              Price / MRP (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg pointer-events-none select-none">
                ₹
              </span>
              <input
                id="edit-item-price"
                ref={inputRef}
                required
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter price"
                className="w-full h-12 pl-8 pr-4 border border-slate-300 rounded-xl bg-slate-50 text-slate-900 font-bold text-lg outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="flex-1 h-12 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl active:scale-95 disabled:active:scale-100 transition-all text-sm shadow-sm"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

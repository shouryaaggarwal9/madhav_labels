"use client";

import { useState } from "react";

import type { StoreItem } from "@/lib/catalog";

const SHELF_LIFE_OPTIONS = [
  { value: 1, label: "1 Month" },
  { value: 2, label: "2 Months" },
  { value: 3, label: "3 Months" },
  { value: 6, label: "6 Months" },
  { value: 12, label: "1 Year" },
] as const;

/**
 * Bottom-sheet form for permanently changing an item. This is the replacement
 * for editing `lib/catalog.ts` and redeploying: the change is written to Atlas
 * and every device picks it up.
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
  const [name, setName] = useState(item.name);
  const [weight, setWeight] = useState(String(item.weight));
  const [mrp, setMrp] = useState(String(item.mrp));
  const [shelfLife, setShelfLife] = useState(String(item.shelfLife));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !weight || !mrp) return;

    onSave({
      ...item,
      name: name.trim().toUpperCase(),
      weight: parseInt(weight, 10),
      mrp: parseInt(mrp, 10),
      shelfLife: parseInt(shelfLife, 10),
    });
  };

  return (
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 mb-4 animate-in slide-in-from-bottom-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit item</h2>
            <p className="text-xs text-slate-500 mt-1">Saved for every device.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Item Name
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-slate-50 uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Weight (grams)
              </label>
              <input
                required
                type="number"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                MRP (₹)
              </label>
              <input
                required
                type="number"
                min="1"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Shelf Life (Months)
            </label>
            <select
              value={shelfLife}
              onChange={(e) => setShelfLife(e.target.value)}
              className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-slate-50 font-medium text-slate-700"
            >
              {SHELF_LIFE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-slate-900 text-white font-bold h-12 rounded-lg mt-2 active:scale-95 transition-transform"
          >
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import { EditItemModal } from "@/components/printer/edit-item-modal";
import { useCatalog } from "@/hooks/use-catalog";
import type { StoreItem } from "@/lib/catalog";
import { formatWeight } from "@/lib/format";
import { searchCatalog } from "@/lib/search";

/**
 * Search field with the POS-style fuzzy matcher. Selecting a result calls
 * `onSelect` and clears the query; the pencil opens the permanent price editor.
 */
export function ItemSearch({ onSelect }: { onSelect: (item: StoreItem) => void }) {
  const { catalog, updateItem } = useCatalog();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<StoreItem | null>(null);

  const results = useMemo(() => searchCatalog(query, catalog), [query, catalog]);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        placeholder="Search items (e.g. DAL 500)..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-12 bg-slate-50 rounded-lg border border-slate-300 w-full px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-slate-800 font-medium"
      />
      {results.length > 0 && (
        <div className="absolute top-14 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-40">
          {results.map((item) => (
            <div
              key={item.id}
              className="flex items-stretch border-b border-slate-100 last:border-0"
            >
              <button
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                }}
                className="flex-1 text-left px-4 py-3 hover:bg-slate-50 flex justify-between items-center"
              >
                <div>
                  <div className="font-bold text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatWeight(item.weight)} • ₹{item.mrp}
                  </div>
                </div>
                <div className="text-blue-600 bg-blue-50 px-3 py-1 rounded text-sm font-bold">
                  Add
                </div>
              </button>
              <button
                onClick={() => setEditing(item)}
                aria-label={`Edit price for ${item.name} ${formatWeight(item.weight)}`}
                className="px-3 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditItemModal
          item={editing}
          onSave={(item) => {
            void updateItem(item);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import { catalog, type StoreItem } from "@/lib/catalog";
import { formatWeight } from "@/lib/format";
import { searchCatalog } from "@/lib/search";

/**
 * Search field with the POS-style fuzzy matcher. Selecting a result calls
 * `onSelect` and clears the query.
 */
export function ItemSearch({ onSelect }: { onSelect: (item: StoreItem) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCatalog(query, catalog), [query]);

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
            <button
              key={item.id}
              onClick={() => {
                onSelect(item);
                setQuery("");
              }}
              className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center last:border-0"
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
          ))}
        </div>
      )}
    </div>
  );
}

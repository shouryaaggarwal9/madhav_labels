"use client";

import { useEffect, useMemo, useState } from "react";

import { AddLabelModal } from "@/components/printer/add-label-modal";
import { ItemSearch } from "@/components/printer/item-search";
import { PrintBar } from "@/components/printer/print-bar";
import { QueueList } from "@/components/printer/queue-list";
import { SyncBanner } from "@/components/sync/sync-banner";
import { connectCatalogSync, useCatalog } from "@/hooks/use-catalog";
import { connectQueueSync, useLabelQueue } from "@/hooks/use-label-queue";
import { useWebUsb } from "@/hooks/use-web-usb";
import type { StoreItem } from "@/lib/catalog";
import { generateTSPL } from "@/lib/printer";

/**
 * The main printing screen: search the catalog (or create a custom label),
 * build a queue, edit quantities, and print over WebUSB.
 */
export function LabelPrinter() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { queue, add, updateQuantity, setQuantity, remove, clear } = useLabelQueue();
  const { catalog } = useCatalog();
  const { device, isPrinting, error, connect, print, setError } = useWebUsb();

  // Both syncs are progressive enhancements: they render local data first and
  // only upgrade it. Neither is allowed to gate search, the queue, or printing.
  useEffect(() => connectCatalogSync(), []);
  useEffect(() => connectQueueSync(), []);

  /**
   * Labels always print the latest catalog price. A queued item keeps the
   * price it was added with, which would otherwise print an old MRP when the
   * store fixes a price after the warehouse built the list. Unknown ids (custom
   * labels) keep their own values.
   */
  const pricedQueue = useMemo(() => {
    const byId = new Map(catalog.map((item) => [item.id, item]));
    let changed = false;
    const next = queue.map((queued) => {
      const fresh = byId.get(queued.id);
      if (!fresh || fresh.mrp === queued.mrp) return queued;
      changed = true;
      return { ...fresh, quantity: queued.quantity };
    });
    return changed ? next : queue;
  }, [queue, catalog]);

  const handlePrint = async () => {
    if (!device) {
      await connect();
      return;
    }
    try {
      await print(generateTSPL(pricedQueue));
    } catch (err) {
      console.error("Label generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate labels");
    }
  };

  const handleAddCustom = (item: StoreItem) => {
    add(item);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Search bar & custom-label button */}
      <div className="p-4 shrink-0 bg-white z-30 relative shadow-sm">
        <div className="flex gap-2">
          <ItemSearch onSelect={add} />
          <button
            onClick={() => setIsModalOpen(true)}
            aria-label="Add custom label"
            className="w-12 h-12 bg-slate-900 text-white rounded-lg flex items-center justify-center shrink-0 hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 min-h-0 bg-slate-50 p-4 pb-32 overflow-y-auto">
        <QueueList
          queue={pricedQueue}
          onSetQuantity={setQuantity}
          onUpdateQuantity={updateQuantity}
          onRemove={remove}
          onClear={clear}
        />
      </div>

      {/* Print action */}
      <PrintBar
        queue={pricedQueue}
        isPrinting={isPrinting}
        connected={Boolean(device)}
        error={error}
        onPrint={handlePrint}
      />

      {/* Sync state: hidden when healthy, a strip when locked or offline */}
      <SyncBanner />

      {isModalOpen && (
        <AddLabelModal onAdd={handleAddCustom} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

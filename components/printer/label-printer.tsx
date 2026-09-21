"use client";

import { useState } from "react";

import { AddLabelModal } from "@/components/printer/add-label-modal";
import { ItemSearch } from "@/components/printer/item-search";
import { PrintBar } from "@/components/printer/print-bar";
import { QueueList } from "@/components/printer/queue-list";
import { useLabelQueue } from "@/hooks/use-label-queue";
import { useWebUsb } from "@/hooks/use-web-usb";
import type { StoreItem } from "@/lib/catalog";
import { generateTSPL } from "@/lib/printer";

/**
 * The main printing screen: search the catalog (or create a custom label),
 * build a queue, edit quantities, and print over WebUSB.
 */
export function LabelPrinter() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { queue, add, updateQuantity, setQuantity, remove } = useLabelQueue();
  const { device, isPrinting, error, connect, print } = useWebUsb();

  const handlePrint = async () => {
    if (!device) {
      await connect();
      return;
    }
    await print(generateTSPL(queue));
  };

  const handleAddCustom = (item: StoreItem) => {
    add(item);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col min-h-full relative">
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
      <div className="flex-1 bg-slate-50 p-4 pb-32 overflow-y-auto">
        <QueueList
          queue={queue}
          onSetQuantity={setQuantity}
          onUpdateQuantity={updateQuantity}
          onRemove={remove}
        />
      </div>

      {/* Print action */}
      <PrintBar
        queue={queue}
        isPrinting={isPrinting}
        connected={Boolean(device)}
        error={error}
        onPrint={handlePrint}
      />

      {isModalOpen && (
        <AddLabelModal onAdd={handleAddCustom} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

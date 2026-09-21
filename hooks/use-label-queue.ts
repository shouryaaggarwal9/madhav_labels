"use client";

import { useCallback, useState } from "react";

import type { QueueItem, StoreItem } from "@/lib/catalog";

/** State + actions for the label queue being prepared for printing. */
export function useLabelQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  /** Adds an item, or bumps its quantity if it is already queued. */
  const add = useCallback((item: StoreItem) => {
    setQueue((prev) => {
      const existing = prev.find((queued) => queued.id === item.id);
      if (existing) {
        return prev.map((queued) =>
          queued.id === item.id ? { ...queued, quantity: queued.quantity + 1 } : queued,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  /** Adjusts quantity by a delta, clamped to a minimum of 1. */
  const updateQuantity = useCallback((id: string, delta: number) => {
    setQueue((prev) =>
      prev.map((queued) =>
        queued.id === id
          ? { ...queued, quantity: Math.max(1, queued.quantity + delta) }
          : queued,
      ),
    );
  }, []);

  /** Sets the quantity directly, clamped to a minimum of 1. */
  const setQuantity = useCallback((id: string, quantity: number) => {
    setQueue((prev) =>
      prev.map((queued) =>
        queued.id === id ? { ...queued, quantity: Math.max(1, quantity) } : queued,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((queued) => queued.id !== id));
  }, []);

  const clear = useCallback(() => setQueue([]), []);

  return { queue, add, updateQuantity, setQuantity, remove, clear } as const;
}

import type { QueueItem, StoreItem } from "@/lib/catalog";

/**
 * Shape checks shared by the browser and the API routes. Server input is
 * untrusted, so every write is validated against these before it reaches
 * MongoDB; the same guards keep a corrupt cache from breaking a render.
 */
export function isStoreItem(value: unknown): value is StoreItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    typeof item.weight === "number" &&
    Number.isFinite(item.weight) &&
    typeof item.mrp === "number" &&
    Number.isFinite(item.mrp) &&
    typeof item.shelfLife === "number" &&
    Number.isFinite(item.shelfLife)
  );
}

export function isQueueItem(value: unknown): value is QueueItem {
  if (!isStoreItem(value)) {
    return false;
  }
  const quantity = (value as { quantity?: unknown }).quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1;
}

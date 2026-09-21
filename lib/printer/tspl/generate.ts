import type { QueueItem } from "@/lib/catalog";

import { LABEL, TSPL_SETUP } from "./constants";
import { drawLabel } from "./draw-label";
import { canvasToMonoBitmap } from "./label-bitmap";

function concat(chunks: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Builds the raw TSPL command stream for a print job.
 *
 * Per label: CLS → render artwork on an offscreen canvas → emit the bitmap
 * followed by `PRINT <quantity>`. Browser-only (uses canvas + TextEncoder).
 */
export function generateTSPL(queue: QueueItem[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [encoder.encode(TSPL_SETUP)];

  const canvas = document.createElement("canvas");
  canvas.width = LABEL.width;
  canvas.height = LABEL.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array();

  const packDate = new Date();

  for (const item of queue) {
    chunks.push(encoder.encode("CLS\r\n"));
    drawLabel(ctx, item, packDate);
    chunks.push(encoder.encode(`BITMAP 0,0,${Math.ceil(LABEL.width / 8)},${LABEL.height},0,`));
    chunks.push(canvasToMonoBitmap(ctx.getImageData(0, 0, LABEL.width, LABEL.height)));
    chunks.push(encoder.encode(`\r\nPRINT ${item.quantity},1\r\n`));
  }

  return concat(chunks);
}

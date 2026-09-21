import type { StoreItem } from "@/lib/catalog";
import { formatWeight } from "@/lib/format";

import { LABEL, STORE, TSPL_FONTS } from "./constants";
import { calculateBestBefore, formatDate } from "./date";

/**
 * Renders one product label onto the canvas. The vertical cursor `y` advances
 * through a small layout API (left / centered / two-columns) that mirrors the
 * original Python implementation's text flow.
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  item: StoreItem,
  packDate: Date,
): void {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, LABEL.width, LABEL.height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top";

  let y = LABEL.topMargin;

  // Uses actual text metrics (mirrors Python's textbbox); the text must be
  // measured with the same font it will be drawn in.
  const textHeight = (text: string, font: string): number => {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const measured = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const fallback = parseInt(font.match(/(\d+)px/)![1], 10);
    return Math.max(measured, fallback);
  };

  const left = (text: string, font: string, spacing = 4) => {
    ctx.font = font;
    ctx.fillText(text, LABEL.leftMargin, y);
    y += textHeight(text, font) + spacing;
  };

  const centered = (text: string, font: string, spacing = 4) => {
    ctx.font = font;
    ctx.fillText(text, Math.floor((LABEL.width - ctx.measureText(text).width) / 2), y);
    y += textHeight(text, font) + spacing;
  };

  const twoColumns = (leftText: string, rightText: string, font: string, spacing = 4) => {
    ctx.font = font;
    ctx.fillText(leftText, LABEL.leftMargin, y);
    ctx.fillText(
      rightText,
      LABEL.width - LABEL.rightMargin - ctx.measureText(rightText).width,
      y,
    );
    y += textHeight(leftText, font) + spacing;
  };

  const packedOn = formatDate(packDate);
  const useBy = formatDate(calculateBestBefore(packDate, item.shelfLife));
  const pricePerGram = (item.mrp / item.weight).toFixed(2);

  left(`PACKER REGN. NO. - ${STORE.packersRegn}`, TSPL_FONTS.medium, 2);
  left("PACKED BY:", TSPL_FONTS.medium, 10);
  centered(STORE.name, TSPL_FONTS.title, 12);
  centered(STORE.address1, TSPL_FONTS.medium, 3);
  centered(STORE.address2, TSPL_FONTS.medium, 3);
  centered(`CUSTOMER CARE NO- ${STORE.customerCareNo}`, TSPL_FONTS.medium, 3);
  centered(`CUSTOMER CARE EMAIL- ${STORE.customerCareEmail}`, TSPL_FONTS.email, 12);
  twoColumns(`ITEM: ${item.name}`, `PKD: ${packedOn}`, TSPL_FONTS.bold, 12);
  twoColumns(
    `NET WEIGHT: ${formatWeight(item.weight)}`,
    `USE BY: ${useBy}`,
    TSPL_FONTS.bold,
    12,
  );
  left(`MRP: ₹ ${item.mrp}.00 (Rs. ${pricePerGram} per g)`, TSPL_FONTS.bold, 4);
  left("(INCL. OF ALL TAXES)", TSPL_FONTS.small, 0);
}

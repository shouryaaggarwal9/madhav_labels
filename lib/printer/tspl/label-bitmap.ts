/**
 * Converts rendered canvas pixels into the 1-bit monochrome bitmap TSPL's
 * BITMAP command expects: rows padded to byte boundaries, MSB first,
 * 0 = black, 1 = white.
 */
export function canvasToMonoBitmap(imageData: ImageData): Uint8Array<ArrayBuffer> {
  const { data, width, height } = imageData;
  const widthBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(widthBytes * height).fill(255);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      if (data[idx] < 128 && data[idx + 3] > 128) {
        const byteIndex = py * widthBytes + (px >> 3);
        bitmap[byteIndex] &= ~(0x80 >> (px % 8));
      }
    }
  }

  return bitmap;
}

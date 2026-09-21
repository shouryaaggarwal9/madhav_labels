/**
 * Returns the best-before date: `months` ahead of the pack date, clamped to
 * the previous day (matching the Python reference implementation).
 */
export function calculateBestBefore(packDate: Date, months: number): Date {
  const targetMonth = packDate.getMonth() + months;
  const year = packDate.getFullYear() + Math.floor(targetMonth / 12);
  const month = targetMonth % 12;

  // Day 0 of the following month = last day of `month`.
  const daysInTargetMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, packDate.getDate() - 1), daysInTargetMonth);

  return new Date(year, month, day);
}

/** Formats a date as DD/MM/YYYY. */
export function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

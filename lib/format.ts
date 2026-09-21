/** Formats a pack weight for display: grams below 1 kg, else kilograms. */
export function formatWeight(weight: number): string {
  return weight >= 1000 ? `${weight / 1000}Kg` : `${weight}g`;
}

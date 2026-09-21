import type { StoreItem } from "@/lib/catalog";

/**
 * POS-style fuzzy matcher over the store catalog.
 *
 * Query normalization: whitespace is stripped and case is folded, so
 * "ard 5" -> "ard5". Scoring (higher wins, ties resolved by sort order):
 *   100 - acronym prefix:      "ad500"   -> ARHAR DAL 500g
 *    80 - acronym substring:   "d500"    -> ARHAR DAL 500g
 *    75 - contiguous substring: "dal500" -> ARHAR DAL 500g
 *  10-50 - ordered subsequence: "ard5"   -> A(rhar) D(al) 5(00)
 *
 * Returns the top `limit` items ordered best-first.
 */
export function searchCatalog(
  query: string,
  items: readonly StoreItem[],
  limit = 5,
): StoreItem[] {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return [];

  return items
    .map((item) => ({ item, score: scoreItem(item, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item)
    .slice(0, limit);
}

function scoreItem(item: StoreItem, q: string): number {
  const name = item.name.toLowerCase();
  const weight = String(item.weight);
  const weightKg = item.weight >= 1000 ? String(item.weight / 1000) : "";

  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("");

  const exact = name.replace(/\s+/g, "") + weight;
  const exactKg = weightKg ? name.replace(/\s+/g, "") + weightKg : "";
  const acronym = initials + weight;
  const acronymKg = weightKg ? initials + weightKg : "";

  let score = 0;

  // Rule 1: acronym prefix / substring.
  if (acronym.startsWith(q) || (acronymKg && acronymKg.startsWith(q))) {
    score += 100;
  } else if (acronym.includes(q) || (acronymKg && acronymKg.includes(q))) {
    score += 80;
  }

  // Rule 2: contiguous substring across name + weight.
  if (exact.includes(q) || (exactKg && exactKg.includes(q))) {
    score += 75;
  }

  // Rule 3: ordered subsequence (only when nothing stronger matched).
  if (score === 0) {
    let searchIdx = 0;
    let matchScore = 50;

    for (let i = 0; i < exact.length; i++) {
      if (exact[i] === q[searchIdx]) {
        searchIdx++;
      } else {
        matchScore -= 1;
      }
      if (searchIdx === q.length) {
        score += Math.max(10, matchScore);
        break;
      }
    }
  }

  return score;
}

/**
 * BUG1: treat missing/invalid player counts as not-online-capable.
 * Accepts only non-negative integers; rejects "-", empty, null.
 */
export function normalizePlayersOnline(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "" || t === "-") return null;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export function normalizePlayersMax(value: unknown): number | null {
  return normalizePlayersOnline(value);
}

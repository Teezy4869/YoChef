// Display helpers. Unknown values return null so callers omit them (C5: unknown is not 0).

export function totalMinutes(prep: number | null, cook: number | null): number | null {
  return prep !== null && cook !== null ? prep + cook : null;
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} phút`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

/** "45 phút" when both times are known; otherwise whichever is known, labelled; otherwise null. */
export function timeLabel(prep: number | null, cook: number | null): string | null {
  const total = totalMinutes(prep, cook);
  if (total !== null) return formatMinutes(total);
  if (cook !== null) return `Nấu ${formatMinutes(cook)}`;
  if (prep !== null) return `Chuẩn bị ${formatMinutes(prep)}`;
  return null;
}

export function servingsLabel(servings: number | null): string | null {
  return servings !== null ? `${servings} người` : null;
}

/** Joins the parts that exist: ["45 phút", null, "Dễ"] -> "45 phút · Dễ". */
export function joinMeta(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

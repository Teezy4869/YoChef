// Serving scaling. Quantities scale linearly with servings / defaultServings.
// "To taste" and unknown quantities are null and stay null at every serving
// count (C5): scaling never turns "unknown" into a number.
import type { QuantityBasis } from './types';

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 50;

export function clampServings(n: number): number {
  if (!Number.isFinite(n)) return MIN_SERVINGS;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n)));
}

export function scaleQuantity(
  quantity: number | null,
  basis: QuantityBasis,
  defaultServings: number | null,
  servings: number,
): number | null {
  if (quantity === null || basis === 'to_taste') return null;
  if (defaultServings === null || defaultServings <= 0) return quantity; // cannot scale: show the book value
  if (servings === defaultServings) return quantity; // exact book value, no floating-point drift
  return (quantity * servings) / defaultServings;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

function trimDecimals(n: number, digits: number): string {
  const fixed = n.toFixed(digits);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return trimmed.replace('.', ',');
}

/** Cooking-friendly text: 2,5 → "2½"; 0,33 → "⅓"; 12,34 → "12,3"; 250,4 → "250". */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return trimDecimals(n, 1);
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  const match = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.02);
  if (match) return whole > 0 ? `${whole}${match[1]}` : match[1];
  return trimDecimals(n, 2);
}

/** "2½ muỗng canh", "≈ 300 g" for editor estimates, "vừa ăn" for to-taste. */
export function quantityText(
  quantity: number | null,
  unit: string | null,
  basis: QuantityBasis,
  defaultServings: number | null,
  servings: number,
): string {
  if (basis === 'to_taste') return 'vừa ăn';
  const scaled = scaleQuantity(quantity, basis, defaultServings, servings);
  if (scaled === null) return '';
  const q = formatQuantity(scaled);
  if (!q) return '';
  const text = unit ? `${q} ${unit}` : q;
  return basis === 'editor_estimate' ? `≈ ${text}` : text;
}

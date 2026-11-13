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
  if (isBookServings(defaultServings, servings)) return quantity; // exact book value, no floating-point drift
  return (quantity * servings) / (defaultServings as number);
}

/** True when quantities are shown as printed in the book: default servings, or no basis to scale from. */
function isBookServings(defaultServings: number | null, servings: number): boolean {
  return defaultServings === null || defaultServings <= 0 || servings === defaultServings;
}

const FRACTIONS: [number, string][] = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];
const EPS = 1e-9;

function decimals(n: number, digits: number): string {
  return String(Number(n.toFixed(digits))).replace('.', ',');
}

/** "2⅓" when n is within `tolerance` of whole + a kitchen fraction. */
function asFraction(n: number, tolerance: number): string | null {
  const whole = Math.floor(n);
  const hit = FRACTIONS.find(([v]) => Math.abs(n - whole - v) <= tolerance + EPS);
  if (!hit) return null;
  return whole > 0 ? `${whole}${hit[1]}` : hit[1];
}

/**
 * Spec 16 §3 rounding plus kitchen fractions (decision A2, PHASE_2_CHANGES §6).
 * `exact` = the book value at its own servings: never re-rounded.
 * Scaled: >= 10 whole; 1–10 a fraction within 0.02 else 1 decimal; < 1 a fraction within 0.01 else 2 decimals.
 * A positive amount never prints as 0.
 */
export function formatQuantity(n: number, exact = false): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 0.005) return '< 0,01';
  if (exact) return (n < 10 ? asFraction(n, 0.005) : null) ?? decimals(n, 2);
  if (n >= 10) return String(Math.round(n));
  if (n >= 1) return asFraction(n, 0.02) ?? decimals(n, 1);
  return asFraction(n, 0.01) ?? decimals(n, 2);
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
  const q = formatQuantity(scaled, isBookServings(defaultServings, servings));
  if (!q) return '';
  const text = unit ? `${q} ${unit}` : q;
  return basis === 'editor_estimate' ? `≈ ${text}` : text;
}

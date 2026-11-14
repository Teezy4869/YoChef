// Nutrition provider contract (YoChef v2, step 4.3): request validation and USDA normalization
// only. No Deno globals, so admin/src/test runs it with an injected fetch.
// Ported from the v1 reference (50_reference_code_v1); see phase4_08_nutrition_data_contract.md.
//
// Success: { items: CanonicalFood[], source, requestId } or { item: CanonicalFood, source, requestId }
// Failure: { error: { code, message }, requestId } with a matching HTTP status

import {
  ContractError,
  fetchProviderJson,
  isRecord,
  validateQuery,
  type FetchLike,
} from '../_shared/http.ts';

// Open Food Facts is left out on purpose (Phase 4 plan E11: USDA only).
export type Provider = 'usda';

export interface CanonicalNutrients {
  energyKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export interface CanonicalFood {
  provider: Provider;
  externalId: string;
  description: string;
  dataType: string | null;
  foodCategory: string | null;
  brandName: string | null;
  preparationState: string | null;
  /** per_100g only when the source states it. Otherwise null and all nutrients are null. */
  basis: 'per_100g' | null;
  sourceVersion: string | null;
  retrievedAt: string;
  nutrients: CanonicalNutrients;
}

const EMPTY_NUTRIENTS: CanonicalNutrients = {
  energyKcal: null,
  proteinG: null,
  fatG: null,
  carbsG: null,
  saturatedFatG: null,
  fiberG: null,
  sugarG: null,
  sodiumMg: null,
};

export const KJ_PER_KCAL = 4.184;
export const MAX_RESULTS = 10;

/** A real number >= 0, or null. Numeric 0 stays 0, and strings/NaN/negatives are unknown. */
export function toNutrient(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// -----------------------------------------------------------------------------
// USDA FoodData Central
// -----------------------------------------------------------------------------
// USDA documents foodNutrients for these data types as amounts per 100 g. Branded foods are
// excluded because their reporting basis varies and needs a separate reviewed path.
export const USDA_PER_100G_TYPES = new Set(['Foundation', 'SR Legacy', 'Survey (FNDDS)']);

interface UsdaEntry {
  id: number | null;
  number: string | null;
  unit: string | null;
  amount: number | null;
}

// The search endpoint and the /food/{id} endpoint shape nutrient rows differently.
function readUsdaEntries(raw: unknown): UsdaEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((n) => {
    const nested = isRecord(n.nutrient) ? n.nutrient : null;
    const id = nested?.id ?? n.nutrientId;
    const number = nested?.number ?? n.nutrientNumber;
    const unit = nested?.unitName ?? n.unitName;
    return {
      id: typeof id === 'number' ? id : null,
      number: number === undefined || number === null ? null : String(number),
      unit: typeof unit === 'string' ? unit.toUpperCase() : null,
      amount: toNutrient(n.amount ?? n.value),
    };
  });
}

function findUsda(entries: UsdaEntry[], ids: number[], numbers: string[], unit: string): number | null {
  const match = entries.find(
    (e) =>
      ((e.id !== null && ids.includes(e.id)) || (e.number !== null && numbers.includes(e.number))) &&
      e.unit === unit
  );
  return match ? match.amount : null;
}

function usdaEnergyKcal(entries: UsdaEntry[]): number | null {
  // 1008 is Energy in kcal; 2047/2048 are the Atwater kcal figures on Foundation foods.
  const kcal = findUsda(entries, [1008, 2047, 2048], ['208', '957', '958'], 'KCAL');
  if (kcal !== null) return kcal;
  // kJ is converted only when explicitly labelled kJ, and never treated as kcal.
  const kj = findUsda(entries, [1062], ['268'], 'KJ');
  return kj === null ? null : round3(kj / KJ_PER_KCAL);
}

const USDA_RAW_PATTERN = /\braw\b/i;
const USDA_COOKED_PATTERN = /\b(cooked|boiled|roasted|fried|baked|grilled|braised|steamed)\b/i;

export function normalizeUsdaFood(food: unknown, retrievedAt: string): CanonicalFood {
  if (!isRecord(food) || food.fdcId === undefined || food.fdcId === null) {
    throw new ContractError('malformed_provider_response', 'USDA returned a food without an ID.');
  }
  const description = typeof food.description === 'string' ? food.description : '';
  const dataType = typeof food.dataType === 'string' ? food.dataType : null;
  const isPer100g = dataType !== null && USDA_PER_100G_TYPES.has(dataType);
  const entries = readUsdaEntries(food.foodNutrients);

  const nutrients: CanonicalNutrients = isPer100g
    ? {
        energyKcal: usdaEnergyKcal(entries),
        proteinG: findUsda(entries, [1003], ['203'], 'G'),
        fatG: findUsda(entries, [1004], ['204'], 'G'),
        carbsG: findUsda(entries, [1005], ['205'], 'G'),
        saturatedFatG: findUsda(entries, [1258], ['606'], 'G'),
        fiberG: findUsda(entries, [1079], ['291'], 'G'),
        sugarG: findUsda(entries, [2000, 1063], ['269'], 'G'),
        sodiumMg: findUsda(entries, [1093], ['307'], 'MG'),
      }
    : { ...EMPTY_NUTRIENTS };

  const published = food.publicationDate ?? food.publishedDate;
  const category = isRecord(food.foodCategory) ? food.foodCategory.description : food.foodCategory;

  return {
    provider: 'usda',
    externalId: String(food.fdcId),
    description,
    dataType,
    foodCategory: typeof category === 'string' ? category : null,
    brandName:
      typeof food.brandName === 'string'
        ? food.brandName
        : typeof food.brandOwner === 'string'
          ? food.brandOwner
          : null,
    preparationState: USDA_RAW_PATTERN.test(description)
      ? 'raw'
      : USDA_COOKED_PATTERN.test(description)
        ? 'cooked'
        : null,
    basis: isPer100g ? 'per_100g' : null,
    sourceVersion:
      dataType && typeof published === 'string' ? `${dataType} ${published}` : dataType,
    retrievedAt,
    nutrients,
  };
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------
export interface NutritionDeps {
  fetchImpl: FetchLike;
  usdaApiKey: string | undefined;
  now?: () => Date;
}

export type NutritionRequest = {
  action?: unknown;
  query?: unknown;
  fdcId?: unknown;
};

function requireUsdaKey(key: string | undefined): string {
  // There is deliberately no DEMO_KEY fallback.
  if (!key || key.trim().length < 10) {
    throw new ContractError('config_error', 'USDA_API_KEY is not configured on the server.');
  }
  return key;
}

function classifyUsda(status: number, ok: boolean): void {
  if (ok) return;
  if (status === 429) {
    throw new ContractError('quota_exceeded', 'USDA FoodData Central rate limit reached. Try again shortly.');
  }
  if (status === 404) {
    throw new ContractError('not_found', 'USDA has no food with that ID.');
  }
  if (status === 401 || status === 403) {
    throw new ContractError('config_error', 'USDA rejected the configured API key.');
  }
  throw new ContractError('provider_error', 'USDA FoodData Central returned an error.');
}

export async function handleNutritionAction(
  req: NutritionRequest,
  deps: NutritionDeps
): Promise<{ items: CanonicalFood[]; source: Provider } | { item: CanonicalFood; source: Provider }> {
  const retrievedAt = (deps.now ? deps.now() : new Date()).toISOString();

  if (req.action === 'search_usda') {
    const query = validateQuery(req.query);
    const key = requireUsdaKey(deps.usdaApiKey);
    // POST with a JSON body: the GET form of this filter was answered with HTTP 400 about half
    // the time on the live API (measured 2026-11-15), for every query.
    const res = await fetchProviderJson(deps.fetchImpl, 'https://api.nal.usda.gov/fdc/v1/foods/search', {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, pageSize: MAX_RESULTS, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'] }),
    });
    classifyUsda(res.status, res.ok);
    if (!isRecord(res.body) || !Array.isArray(res.body.foods)) {
      throw new ContractError('malformed_provider_response', 'USDA returned an unexpected response shape.');
    }
    return {
      items: res.body.foods.slice(0, MAX_RESULTS).map((f) => normalizeUsdaFood(f, retrievedAt)),
      source: 'usda',
    };
  }

  if (req.action === 'get_usda_food') {
    const fdcId = typeof req.fdcId === 'string' ? req.fdcId.trim() : req.fdcId;
    if ((typeof fdcId !== 'string' && typeof fdcId !== 'number') || !/^\d{1,10}$/.test(String(fdcId))) {
      throw new ContractError('invalid_input', 'FDC ID must be 1-10 digits.');
    }
    const key = requireUsdaKey(deps.usdaApiKey);
    const res = await fetchProviderJson(
      deps.fetchImpl,
      `https://api.nal.usda.gov/fdc/v1/food/${fdcId}`,
      { headers: { 'X-Api-Key': key } }
    );
    classifyUsda(res.status, res.ok);
    if (!isRecord(res.body)) {
      throw new ContractError('malformed_provider_response', 'USDA returned an unexpected response shape.');
    }
    return { item: normalizeUsdaFood(res.body, retrievedAt), source: 'usda' };
  }

  throw new ContractError('invalid_action', 'Unknown or missing action.');
}

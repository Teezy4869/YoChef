// The nutrition-search Edge Function's logic, run here with an injected fetch (E5).
import { requireStaffRole, type UserScopedClient } from '../../../supabase/functions/_shared/auth.ts';
import { ContractError } from '../../../supabase/functions/_shared/http.ts';
import { handleNutritionAction } from '../../../supabase/functions/nutrition-search/contract.ts';

const KEY = 'usda-test-key-123456';
const NOW = () => new Date('2026-11-14T00:00:00Z');
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const searchRow = (over: Record<string, unknown> = {}) => ({
  fdcId: 167812,
  description: 'Pork, fresh, loin, raw',
  dataType: 'SR Legacy',
  publicationDate: '2019-04-01',
  foodNutrients: [
    { nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: 242 },
    { nutrientId: 1003, nutrientNumber: '203', unitName: 'G', value: 27.3 },
    { nutrientId: 1004, nutrientNumber: '204', unitName: 'G', value: 14 },
    { nutrientId: 1005, nutrientNumber: '205', unitName: 'G', value: 0 },
    { nutrientId: 1093, nutrientNumber: '307', unitName: 'MG', value: 62 },
    { nutrientId: 1258, nutrientNumber: '606', unitName: 'G', value: -1 },
  ],
  ...over,
});
const codeOf = async (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof ContractError ? e.code : String(e)));

describe('nutrition-search contract', () => {
  it('searches USDA with the key in a header, the per-100 g data types and at most 10 results', async () => {
    const fetchImpl = reply(200, { foods: Array.from({ length: 12 }, () => searchRow()) });
    const res = await handleNutritionAction({ action: 'search_usda', query: ' pork ' }, { fetchImpl, usdaApiKey: KEY, now: NOW });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'pork', pageSize: 10, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'] });
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe(KEY);
    if (!('items' in res)) throw new Error('expected items');
    expect(res.items).toHaveLength(10);
    expect(res.items[0]).toMatchObject({
      provider: 'usda', externalId: '167812', basis: 'per_100g', preparationState: 'raw', sourceVersion: 'SR Legacy 2019-04-01',
      retrievedAt: '2026-11-14T00:00:00.000Z',
      nutrients: { energyKcal: 242, proteinG: 27.3, fatG: 14, carbsG: 0, sodiumMg: 62, saturatedFatG: null, fiberG: null, sugarG: null },
    });
  });

  it('treats branded foods as unknown, converts labelled kJ only, and reads the detail shape', async () => {
    const branded = reply(200, { foods: [searchRow({ dataType: 'Branded' })] });
    const b = await handleNutritionAction({ action: 'search_usda', query: 'pork' }, { fetchImpl: branded, usdaApiKey: KEY });
    if (!('items' in b)) throw new Error('expected items');
    expect(b.items[0].basis).toBeNull();
    expect(Object.values(b.items[0].nutrients)).toEqual(Array(8).fill(null));

    const detail = reply(200, {
      fdcId: 171077, description: 'Fish sauce, ready-to-serve', dataType: 'Foundation',
      foodNutrients: [
        { nutrient: { id: 1062, number: '268', unitName: 'kJ' }, amount: 418.4 },
        { nutrient: { id: 1093, number: '307', unitName: 'mg' }, amount: 7851 },
      ],
    });
    const d = await handleNutritionAction({ action: 'get_usda_food', fdcId: '171077' }, { fetchImpl: detail, usdaApiKey: KEY });
    if (!('item' in d)) throw new Error('expected item');
    expect(d.item.nutrients.energyKcal).toBe(100);
    expect(d.item.nutrients.sodiumMg).toBe(7851);
  });

  it('maps provider failures and bad input to the contract codes', async () => {
    const deps = (status: number) => ({ fetchImpl: reply(status, {}), usdaApiKey: KEY });
    expect(await codeOf(handleNutritionAction({ action: 'get_usda_food', fdcId: '1' }, deps(404)))).toBe('not_found');
    expect(await codeOf(handleNutritionAction({ action: 'get_usda_food', fdcId: '1' }, deps(429)))).toBe('quota_exceeded');
    expect(await codeOf(handleNutritionAction({ action: 'get_usda_food', fdcId: '1' }, deps(403)))).toBe('config_error');
    expect(await codeOf(handleNutritionAction({ action: 'get_usda_food', fdcId: '1' }, deps(500)))).toBe('provider_error');
    expect(await codeOf(handleNutritionAction({ action: 'search_usda', query: 'x' }, { fetchImpl: reply(200, { foods: 'no' }), usdaApiKey: KEY }))).toBe(
      'malformed_provider_response',
    );
    expect(await codeOf(handleNutritionAction({ action: 'get_usda_food', fdcId: '12345678901' }, deps(200)))).toBe('invalid_input');
    expect(await codeOf(handleNutritionAction({ action: 'search_usda', query: '   ' }, deps(200)))).toBe('invalid_input');
    expect(await codeOf(handleNutritionAction({ action: 'search_usda', query: 'a'.repeat(101) }, deps(200)))).toBe('invalid_input');
    expect(await codeOf(handleNutritionAction({ action: 'search_usda', query: 'pork' }, { fetchImpl: reply(200, {}), usdaApiKey: undefined }))).toBe(
      'config_error',
    );
    expect(await codeOf(handleNutritionAction({ action: 'search_openfoodfacts', query: 'x' }, deps(200)))).toBe('invalid_action');
    expect(await codeOf(handleNutritionAction({}, deps(200)))).toBe('invalid_action');
  });

  it('allows only signed-in editors and super admins, failing closed', async () => {
    const client = (user: { id: string } | null, roles: unknown, rolesError: unknown = null) => () =>
      ({
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from: () => ({ select: () => ({ eq: async () => ({ data: roles, error: rolesError }) }) }),
      }) as unknown as UserScopedClient;
    const check = (header: string | null, make: () => UserScopedClient) =>
      codeOf(requireStaffRole(header, make, ['editor', 'super_admin'], 'no'));
    expect(await check(null, client({ id: 'u' }, [{ role: 'editor' }]))).toBe('unauthorized');
    expect(await check('Bearer t', client(null, []))).toBe('unauthorized');
    expect(await check('Bearer t', client({ id: 'u' }, [{ role: 'moderator' }]))).toBe('forbidden');
    expect(await check('Bearer t', client({ id: 'u' }, [{ role: 'editor' }], { message: 'boom' }))).toBe('forbidden');
    expect(await check('Bearer t', client({ id: 'u' }, [{ role: 'super_admin' }]))).toBe('ok');
  });
});

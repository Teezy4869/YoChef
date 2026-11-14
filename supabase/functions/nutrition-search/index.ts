// =============================================================================
// Edge Function: nutrition-search (YoChef v2, step 4.3)
// Authenticated proxy for USDA FoodData Central: actions search_usda, get_usda_food.
// Only editors and super admins may call it; the role is read with the CALLER's JWT.
// USDA_API_KEY lives in Edge Function secrets and is sent as a header, never in a URL.
// The logic is in ./contract.ts and ../_shared/*.ts (runtime-neutral, tested by Vitest).
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { requireStaffRole, type UserScopedClient } from '../_shared/auth.ts';
import { ContractError, corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import { handleNutritionAction } from './contract.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') throw new ContractError('method_not_allowed', 'Only POST requests are supported.');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) throw new ContractError('config_error', 'The function is missing its Supabase settings.');

    await requireStaffRole(
      req.headers.get('Authorization'),
      (authHeader) =>
        createClient(url, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        }) as unknown as UserScopedClient,
      ['editor', 'super_admin'],
      'Only editors or super admins can search nutrition data.',
    );

    const body = await req.json().catch(() => {
      throw new ContractError('invalid_input', 'The request body must be JSON.');
    });
    const result = await handleNutritionAction(body, { fetchImpl: fetch, usdaApiKey: Deno.env.get('USDA_API_KEY') });
    return jsonResponse({ ...result, requestId });
  } catch (err) {
    return errorResponse(err, requestId);
  }
});

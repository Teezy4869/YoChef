// =============================================================================
// Edge Function: youtube-search (YoChef v2, step 4.4)
// Actions: search (search.list -> candidates, never proof of playability) and verify
// (videos.list -> verified or unavailable). Editors and super admins only, checked with the
// CALLER's JWT. A verify result is written as a receipt with the service role;
// assign_recipe_video() accepts only that receipt (15 minutes, same editor, once).
// YOUTUBE_API_KEY lives in Edge Function secrets and is sent as a header.
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { requireStaffRole, type UserScopedClient } from '../_shared/auth.ts';
import { ContractError, corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import { checkVideos, searchCandidates, validateVideoId } from './contract.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') throw new ContractError('method_not_allowed', 'Only POST requests are supported.');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new ContractError('config_error', 'The function is missing its Supabase settings.');

    const { userId } = await requireStaffRole(
      req.headers.get('Authorization'),
      (authHeader) =>
        createClient(url, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        }) as unknown as UserScopedClient,
      ['editor', 'super_admin'],
      'Only editors or super admins can manage recipe videos.',
    );

    const body = await req.json().catch(() => {
      throw new ContractError('invalid_input', 'The request body must be JSON.');
    });
    const deps = { fetchImpl: fetch, apiKey: Deno.env.get('YOUTUBE_API_KEY') };

    if (body?.action === 'search') {
      return jsonResponse({ items: await searchCandidates(body.query, deps), source: 'youtube', requestId });
    }
    if (body?.action === 'verify') {
      const id = validateVideoId(body.videoId);
      const check = (await checkVideos([id], deps)).get(id)!;
      // A verified result that cannot be recorded is a failure: assignment would have no evidence.
      const db = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { error } = await db.rpc('record_video_verification', {
        p_video_id: id,
        p_actor_id: userId,
        p_status: check.verificationStatus,
        p_title: check.verificationStatus === 'verified' ? check.title : null,
        p_channel_title: check.verificationStatus === 'verified' ? check.channelTitle : null,
        p_unavailable_reason: check.verificationStatus === 'unavailable' ? check.reason : null,
      });
      if (error) throw new ContractError('internal_error', 'Could not record the verification result.');
      return jsonResponse({ item: check, source: 'youtube', requestId });
    }
    throw new ContractError('invalid_action', 'Unknown or missing action.');
  } catch (err) {
    return errorResponse(err, requestId);
  }
});

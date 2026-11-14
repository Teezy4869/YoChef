// =============================================================================
// Edge Function: youtube-refresh (YoChef v2, step 4.4)
// Daily, bounded re-verification of stored YouTube data plus the retention step (E10: rows
// not verified within 30 days are deleted). Called by pg_cron through pg_net with the header
// x-refresh-secret; deployed with --no-verify-jwt. Scheduled execution is NOT VERIFIED until
// the owner runs supabase/scripts/youtube_schedule.sql.
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { checkRefreshSecret } from '../_shared/auth.ts';
import { ContractError, errorResponse, jsonResponse } from '../_shared/http.ts';
import { checkVideos, toRefreshResults, type VideoCheck } from '../youtube-search/contract.ts';

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') throw new ContractError('method_not_allowed', 'Only POST requests are supported.');
    checkRefreshSecret(req.headers.get('x-refresh-secret'), Deno.env.get('YOUTUBE_REFRESH_SECRET'));
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new ContractError('config_error', 'The function is missing its Supabase settings.');
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: claimed, error: claimError } = await db.rpc('claim_videos_for_refresh', { p_limit: 50 });
    if (claimError) throw new ContractError('internal_error', 'Could not claim videos for refresh.');
    const ids = [...new Set(((claimed ?? []) as { youtube_video_id: string }[]).map((r) => r.youtube_video_id))];

    let quotaExhausted = false;
    let applied: unknown = { verified: 0, unavailable: 0, failed: 0 };
    if (ids.length > 0) {
      let checks: Map<string, VideoCheck> | null = null;
      try {
        checks = await checkVideos(ids, { fetchImpl: fetch, apiKey: Deno.env.get('YOUTUBE_API_KEY') });
      } catch (err) {
        // Recorded as failed for each id, never as verified; retention below still runs.
        quotaExhausted = err instanceof ContractError && err.code === 'quota_exceeded';
      }
      const { data, error } = await db.rpc('apply_video_refresh', { p_results: toRefreshResults(ids, checks) });
      if (error) throw new ContractError('internal_error', 'Could not apply refresh results.');
      applied = data;
    }

    const { data: deleted, error: expireError } = await db.rpc('expire_stale_videos');
    if (expireError) throw new ContractError('internal_error', 'Could not run the retention step.');
    return jsonResponse({ claimed: ids.length, applied, deleted, quotaExhausted, requestId });
  } catch (err) {
    return errorResponse(err, requestId);
  }
});

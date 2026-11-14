-- =============================================================================
-- YouTube refresh schedule (step 4.4). NOT a migration: it holds a secret and the
-- project URL. The project owner runs it once in the SQL Editor of YoChef v2
-- (bdhphjwhagygbwtfhhxn), after deploying youtube-refresh with --no-verify-jwt and
-- setting the same secret on the function:
--   npx supabase secrets set YOUTUBE_REFRESH_SECRET=<at least 32 random characters>
--
-- Replace <the same secret> below, run, then never commit the edited file.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives in Vault, not in the job text.
select vault.create_secret('<the same secret>', 'youtube_refresh_secret', 'x-refresh-secret for youtube-refresh');

-- Daily re-verification of up to 50 videos (1 YouTube quota unit) plus retention.
select cron.schedule(
  'yochef-youtube-refresh',
  '17 3 * * *',
  $job$
  select net.http_post(
    url := 'https://bdhphjwhagygbwtfhhxn.supabase.co/functions/v1/youtube-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'youtube_refresh_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- Retention again, inside the database: it still runs if the function or HTTP fails.
select cron.schedule('yochef-expire-videos', '47 3 * * *', $job$ select public.expire_stale_videos(); $job$);

-- Monitoring (run any time):
--   select jobname, schedule, active from cron.job where jobname like 'yochef-%';
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 20;
--   select action, details, created_at from public.admin_audit_logs where action like 'video.%' order by created_at desc limit 20;

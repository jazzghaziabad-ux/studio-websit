-- =============================================================================
-- 0012 SCHEDULED JOBS INSIDE SUPABASE (replaces Vercel cron)
--   * every 2 min  : send queued email      (pg_net → Edge Function send-emails)
--   * every 15 min : release stale download reservations
--   * daily 03:30 UTC (09:00 IST) : payment / event / download reminders
--   * daily 18:45 UTC (00:15 IST) : expire old quotations
--
-- The email job reads two Vault secrets you create once in the SQL Editor:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
-- Nothing secret is stored in this file.
--
-- On plain PostgreSQL (CI tests) pg_cron/pg_net are not installed: the job
-- wrappers are still created (and testable) but nothing is scheduled.
-- =============================================================================

-- Server-side job wrappers: run as service_role so the guarded functions accept them.
create or replace function private.run_as_service(p_job text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  case p_job
    when 'reminders' then v_result := jsonb_build_object('reminders_sent', public.run_reminders());
    when 'expire_quotations' then v_result := jsonb_build_object('expired', public.expire_quotations());
    when 'expire_media' then v_result := public.expire_media_access();
    else raise exception 'Unknown job %', p_job using errcode = '22023';
  end case;
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end $$;
revoke all on function private.run_as_service(text) from public;

-- Calls the send-emails Edge Function; returns the pg_net request id.
create or replace function private.trigger_email_sender()
returns bigint language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    perform app.raise_system_alert('email_cron_not_configured', 'high',
      'Email sending is not configured: create the project_url and cron_secret Vault secrets');
    return null;
  end if;
  execute $q$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb, timeout_milliseconds := 30000)$q$
    into v_id
    using rtrim(v_url, '/') || '/functions/v1/send-emails',
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret);
  perform app.resolve_system_alert('email_cron_not_configured');
  return v_id;
end $fn$;
revoke all on function private.trigger_email_sender() from public;

do $outer$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron / pg_net not available here: jobs not scheduled (expected outside Supabase)';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- (Re)create jobs idempotently.
  perform cron.unschedule(jobname) from cron.job
   where jobname in ('send-emails', 'expire-media', 'daily-reminders', 'expire-quotations');

  perform cron.schedule('send-emails', '*/2 * * * *', 'select private.trigger_email_sender()');
  perform cron.schedule('expire-media', '*/15 * * * *', $$select private.run_as_service('expire_media')$$);
  perform cron.schedule('daily-reminders', '30 3 * * *', $$select private.run_as_service('reminders')$$);
  perform cron.schedule('expire-quotations', '45 18 * * *', $$select private.run_as_service('expire_quotations')$$);
end
$outer$;

# Add these to the private studio-booking-system repository

Upload into the same folders (GitHub → Add file → Upload files keeps the paths
when you drag folders; or create each file with Add file → Create new file):

| File | Purpose |
| --- | --- |
| `supabase/functions/_shared/http.ts` | CORS, JSON and error helpers |
| `supabase/functions/booking-request/*` | Booking form endpoint (captcha, rate limit, creates the booking) |
| `supabase/functions/send-emails/*` | Sends queued emails through Resend |
| `supabase/migrations/20261102000012_scheduled_jobs.sql` | Schedules email, reminders and expiry inside Supabase (pg_cron) |
| `supabase/tests-functions/functions_test.ts` | 14 tests for the functions (run by CI) |
| `.github/workflows/deploy-functions.yml` | Deploys the functions and their secrets |
| `.github/workflows/ci.yml` | Replaces the old one: database tests + function tests (no Vercel build) |

The `web/` folder (Next.js for Vercel) is no longer used. You can leave it or delete it.

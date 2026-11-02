// Website settings. Everything in this file is safe to publish:
// the anon key is public by design — Supabase's security rules decide what
// each visitor may read or change. NEVER put the service_role key here.
export const CONFIG = {
  supabaseUrl: "https://vhuaimovbhlabqsgzbfu.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWFpbW92YmhsYWJxc2d6YmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDU1ODAsImV4cCI6MjEwOTE4MTU4MH0.tZwSh6ZCaB8U2jxoEYDovxYtviBSm3nOJ8tvl_gggno",
  // Cloudflare Turnstile site key for the booking form (Step 5 of the guide).
  turnstileSiteKey: "",
};

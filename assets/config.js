// Website settings. Everything in this file is safe to publish:
// the anon key is public by design — Supabase's security rules decide what
// each visitor may read or change. NEVER put the service_role key here.
export const CONFIG = {
  supabaseUrl: "https://vhuaimovbhlabqsgzbfu.supabase.co",
  supabaseAnonKey: "PASTE-YOUR-ANON-PUBLIC-KEY-HERE",
  // Cloudflare Turnstile site key for the booking form (Step 5 of the guide).
  turnstileSiteKey: "",
};

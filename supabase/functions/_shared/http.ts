// CORS + JSON helpers shared by the Edge Functions.
// ALLOWED_ORIGINS (comma-separated, e.g. "https://yourdomain.com,https://you.github.io")
// limits which websites may call the booking endpoint from a browser.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// Database errors → safe user message (same contract as the website).
const FRIENDLY: Record<string, string> = {
  "23505": "That value is already in use.",
  "23514": "One of the values is outside the allowed range.",
  "22P02": "One of the values is not in a valid format.",
  "22007": "Enter a valid date and time.",
};
const STATUS: Record<string, number> = { "42501": 403, "22023": 400, "22P02": 400, "22007": 400, "23514": 400, "55000": 409, "23505": 409 };
export function dbError(err: { code?: string; message?: string } | null): { status: number; message: string } {
  const status = (err?.code && STATUS[err.code]) || 500;
  if (err?.code && FRIENDLY[err.code]) return { status, message: FRIENDLY[err.code] };
  if (status < 500 && err?.message) return { status, message: err.message };
  return { status: 500, message: "Something went wrong on our side. Try again in a moment." };
}

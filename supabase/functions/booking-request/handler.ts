// POST /functions/v1/booking-request — the public booking form.
// 1. rate limit per IP  2. validation  3. Turnstile captcha
// 4. create_booking_request() with the service role: the database re-validates,
//    recomputes the price from the catalog and links the customer.
// The signed-in customer comes from a verified token, never from the body.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { corsHeaders, dbError, json } from "../_shared/http.ts";
import { validateBooking } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    // Explicit opt-out for testing only. Production must set the secret.
    return Deno.env.get("TURNSTILE_DISABLED") === "true";
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = clientIp(req);

  const { data: allowed, error: rlError } = await admin.rpc("hit_rate_limit", { p_key: `booking:${ip}`, p_window_seconds: 3600, p_max: 5 });
  if (rlError) console.error("rate limit check failed", rlError.message); // fail open: the insert still validates
  else if (allowed !== true) {
    return json(req, { error: "Too many booking requests from your network. Try again in an hour, or call us." }, 429);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request." }, 400); }
  const v = validateBooking(body);
  if (!v.ok) return json(req, { error: v.error, field: v.field }, 400);

  if (!(await verifyTurnstile(v.turnstileToken, ip))) {
    return json(req, { error: "Verification failed. Refresh the page and try again." }, 400);
  }

  // Signed-in customer? Verify the token with Supabase Auth; ignore the anon key.
  let profileId: string | null = null;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token && token !== ANON_KEY) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role === "customer") profileId = user.id;
    }
  }

  const { data, error } = await admin.rpc("create_booking_request", { p: v.value, p_profile_id: profileId });
  if (error) {
    const e = dbError(error);
    if (e.status >= 500) console.error("create_booking_request failed", error);
    return json(req, { error: e.message }, e.status);
  }
  const result = data as { booking_id: string; duplicate: boolean };
  return json(req, { booking_id: result.booking_id, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
}



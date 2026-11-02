// Behaviour tests for the Edge Functions with a fake Supabase / Turnstile / Resend.
// Run: deno test --no-lock --allow-env --allow-net supabase/tests-functions/
const URL_ = "https://proj.supabase.co";
Deno.env.set("SUPABASE_URL", URL_);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("CRON_SECRET", "cron-secret-value");
Deno.env.set("RESEND_API_KEY", "re_test");
Deno.env.set("EMAIL_FROM", "Studio <bookings@example.com>");

const { validateBooking } = await import("../functions/booking-request/validate.ts");
const { handler: bookingHandler } = await import("../functions/booking-request/handler.ts");
const { handler: emailHandler } = await import("../functions/send-emails/handler.ts");
const { renderHtml, staticLinks } = await import("../functions/send-emails/render.ts");

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

// ---- fake backend ----------------------------------------------------------
type Call = { url: string; body: unknown; headers: Headers };
let calls: Call[] = [];
let state: Record<string, unknown> = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = req.url;
  const text = req.method === "GET" ? "" : await req.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* form body */ }
  calls.push({ url, body, headers: req.headers });
  const j = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const wantsObject = (req.headers.get("accept") ?? "").includes("object+json");
  if (url.includes("/rest/v1/rpc/hit_rate_limit")) return j(state.rateAllowed ?? true);
  if (url.includes("/rest/v1/rpc/create_booking_request")) {
    if (state.dbError) return j(state.dbError, 400);
    return j({ booking_id: "PHOTO-VIDEO-2026-00007", id: "b1", duplicate: false });
  }
  if (url.includes("/auth/v1/user")) {
    const tok = req.headers.get("authorization")?.replace("Bearer ", "");
    return tok === "user-token" ? j({ id: "user-123", aud: "authenticated", role: "authenticated", email: "a@b.com" }) : j({ msg: "bad jwt" }, 401);
  }
  if (url.includes("/rest/v1/profiles")) return j(wantsObject ? { role: state.role ?? "customer" } : [{ role: state.role ?? "customer" }]);
  if (url.includes("turnstile/v0/siteverify")) return j({ success: state.turnstileOk ?? true });
  if (url.includes("/rest/v1/email_templates")) return j([
    { key: "quotation_ready", subject: "Quotation for {{booking_id}}\nBcc: x", html_body: "<p>Hi {{customer_name}}, total ₹{{quotation_total}}</p><a href=\"{{booking_link}}\">View</a>", is_active: true },
  ]);
  if (url.includes("/rest/v1/settings")) return j(wantsObject ? { value: "Lumen & Reel" } : [{ value: "Lumen & Reel" }]);
  if (url.includes("/rest/v1/rpc/claim_email_batch")) {
    const q = (state.queue as unknown[]) ?? [];
    state.queue = [];
    return j(q);
  }
  if (url.includes("/rest/v1/rpc/mark_email_result")) return j(null);
  if (url.includes("api.resend.com/emails")) return j({ id: `re_${calls.length}` });
  return realFetch(input, init);
};
const reset = (s: Record<string, unknown> = {}) => { calls = []; state = s; };
const rpcBody = (name: string) => calls.find((c) => c.url.includes(`/rpc/${name}`))?.body as Record<string, unknown> | undefined;

const valid = () => ({
  idempotency_key: crypto.randomUUID(),
  customer: { full_name: "Ananya Gupta", email: "Ananya@Example.COM ", mobile: "98100 12345", whatsapp: "" },
  event: { event_type_id: crypto.randomUUID(), event_date: "2026-12-20", start_time: "16:00", end_time: "23:30", location: "Grand Lawns", city: "Ghaziabad", guest_count: 300 },
  items: [{ package_duration_id: crypto.randomUUID() }],
  addons: [], distance_km: 18,
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${URL_}/functions/v1/booking-request`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "https://studio.example", ...headers } });

// ---- validation --------------------------------------------------------------
Deno.test("validate: normalises email and phone", () => {
  const r = validateBooking(valid());
  assert(r.ok, "should be valid");
  const c = (r as unknown as { value: { customer: { email: string; mobile: string; whatsapp: unknown } } }).value.customer;
  assert(c.email === "ananya@example.com" && c.mobile === "9810012345" && c.whatsapp === null, JSON.stringify(c));
});
Deno.test("validate: rejects bad input with field names", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ ...valid(), customer: { ...valid().customer, email: "nope" } }, "customer.email"],
    [{ ...valid(), customer: { ...valid().customer, mobile: "123" } }, "customer.mobile"],
    [{ ...valid(), items: [] }, "items"],
    [{ ...valid(), items: [{ package_duration_id: "x" }] }, "items"],
    [{ ...valid(), distance_km: -1 }, "distance_km"],
    [{ ...valid(), event: { ...valid().event, event_date: "20-12-2026" } }, "event.event_date"],
  ];
  for (const [body, field] of cases) {
    const r = validateBooking(body);
    assert(!r.ok && (r as { field?: string }).field === field, `expected ${field}, got ${JSON.stringify(r)}`);
  }
});

// ---- booking handler -------------------------------------------------------------
Deno.test("booking: CORS preflight", async () => {
  const res = await bookingHandler(new Request(`${URL_}/x`, { method: "OPTIONS", headers: { origin: "https://studio.example" } }));
  assert(res.status === 200 && res.headers.get("access-control-allow-origin") === "*", "preflight");
});
Deno.test("booking: ALLOWED_ORIGINS restricts CORS", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "https://good.example");
  const res = await bookingHandler(new Request(`${URL_}/x`, { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  Deno.env.delete("ALLOWED_ORIGINS");
  assert(res.headers.get("access-control-allow-origin") === "https://good.example", "should not echo evil origin");
});
Deno.test("booking: rate limited → 429, nothing created", async () => {
  reset({ rateAllowed: false });
  const res = await bookingHandler(post(valid()));
  assert(res.status === 429, `status ${res.status}`);
  assert(!rpcBody("create_booking_request"), "must not create");
});
Deno.test("booking: no captcha secret and not disabled → refused", async () => {
  reset();
  Deno.env.delete("TURNSTILE_SECRET_KEY"); Deno.env.delete("TURNSTILE_DISABLED");
  const res = await bookingHandler(post(valid()));
  assert(res.status === 400 && (await res.json()).error.includes("Verification"), "should refuse");
  assert(!rpcBody("create_booking_request"), "must not create");
});
Deno.test("booking: failed captcha → refused", async () => {
  reset({ turnstileOk: false });
  Deno.env.set("TURNSTILE_SECRET_KEY", "ts-secret");
  const res = await bookingHandler(post({ ...valid(), turnstile_token: "tok" }));
  assert(res.status === 400, `status ${res.status}`);
  Deno.env.delete("TURNSTILE_SECRET_KEY");
});
Deno.test("booking: valid captcha → created; anonymous has no profile id; client price ignored", async () => {
  reset({ turnstileOk: true });
  Deno.env.set("TURNSTILE_SECRET_KEY", "ts-secret");
  const res = await bookingHandler(post({ ...valid(), turnstile_token: "tok", estimated_total: 1, status: "confirmed" }, { authorization: "Bearer anon-key" }));
  Deno.env.delete("TURNSTILE_SECRET_KEY");
  const json = await res.json();
  assert(res.status === 201 && json.booking_id === "PHOTO-VIDEO-2026-00007", JSON.stringify(json));
  const body = rpcBody("create_booking_request")!;
  assert(body.p_profile_id === null, "anonymous → null profile");
  const p = body.p as Record<string, unknown>;
  assert(!("estimated_total" in p) && !("status" in p), "tampered fields must be dropped");
  const ts = calls.find((c) => c.url.includes("siteverify"));
  assert(ts && String(ts.body).includes("secret=ts-secret"), "turnstile verified server-side");
});
Deno.test("booking: signed-in customer is linked via verified token", async () => {
  reset({ role: "customer" });
  Deno.env.set("TURNSTILE_DISABLED", "true");
  await bookingHandler(post(valid(), { authorization: "Bearer user-token" }));
  assert(rpcBody("create_booking_request")!.p_profile_id === "user-123", "should link customer");
  reset({ role: "manager" });
  await bookingHandler(post(valid(), { authorization: "Bearer user-token" }));
  assert(rpcBody("create_booking_request")!.p_profile_id === null, "staff/admin are not linked as customers");
  reset();
  await bookingHandler(post(valid(), { authorization: "Bearer forged-token" }));
  assert(rpcBody("create_booking_request")!.p_profile_id === null, "forged token ignored");
  Deno.env.delete("TURNSTILE_DISABLED");
});
Deno.test("booking: database validation error passes its message; internal errors are masked", async () => {
  Deno.env.set("TURNSTILE_DISABLED", "true");
  reset({ dbError: { code: "22023", message: "Event date must be between today and 3 years ahead" } });
  let res = await bookingHandler(post(valid()));
  assert(res.status === 400 && (await res.json()).error.startsWith("Event date"), "22023 → 400 with message");
  reset({ dbError: { code: "XX000", message: "internal detail: relation foo" } });
  res = await bookingHandler(post(valid()));
  const j = await res.json();
  assert(res.status === 500 && !j.error.includes("relation"), "internal details must not leak");
  Deno.env.delete("TURNSTILE_DISABLED");
});
Deno.test("booking: non-JSON and wrong method", async () => {
  reset();
  let res = await bookingHandler(new Request(`${URL_}/x`, { method: "POST", body: "not json" }));
  assert(res.status === 400, "non-json");
  res = await bookingHandler(new Request(`${URL_}/x`, { method: "GET" }));
  assert(res.status === 405, "GET");
});

// ---- email sender ------------------------------------------------------------
Deno.test("emails: rejects missing or wrong cron secret", async () => {
  reset();
  for (const h of [{} as Record<string, string>, { "x-cron-secret": "wrong" }]) {
    const res = await emailHandler(new Request(`${URL_}/x`, { method: "POST", headers: h }));
    assert(res.status === 401, "unauthorized");
  }
  assert(!calls.some((c) => c.url.includes("claim_email_batch")), "must not touch the queue");
});
Deno.test("emails: sends queue, escapes data, rewrites links, marks results", async () => {
  reset({ queue: [
    { id: "e1", template_key: "quotation_ready", to_email: "a@b.com", variables: { customer_name: "<script>alert(1)</script>", booking_id: "PV-1", quotation_total: 55000, booking_link: "https://studio.example/portal/bookings/PHOTO-VIDEO-2026-00001" } },
    { id: "e2", template_key: "no_such_template", to_email: "c@d.com", variables: {} },
  ] });
  const res = await emailHandler(new Request(`${URL_}/x`, { method: "POST", headers: { "x-cron-secret": "cron-secret-value" } }));
  const j = await res.json();
  assert(res.status === 200 && j.sent === 1 && j.failed === 1, JSON.stringify(j));
  const sent = calls.filter((c) => c.url.includes("api.resend.com")).map((c) => c.body as Record<string, string>);
  assert(sent.length === 1, "one email to Resend");
  assert(sent[0].html.includes("&lt;script&gt;") && !sent[0].html.includes("<script>"), "escaped");
  assert(sent[0].html.includes("₹55,000"), "money formatted");
  assert(sent[0].html.includes("portal-booking.html?code=PHOTO-VIDEO-2026-00001"), "link rewritten for static site");
  assert(!sent[0].subject.includes("\n"), "no header injection");
  const marks = calls.filter((c) => c.url.includes("mark_email_result")).map((c) => c.body as Record<string, unknown>);
  assert(marks.length === 2 && marks.some((m) => m.p_email_id === "e2" && m.p_success === false), "failure recorded");
});
Deno.test("render: staticLinks handles all app link shapes", () => {
  const v = staticLinks({ booking_link: "https://x.in/portal/bookings/AB-2026-00001", gallery_link: "https://x.in/portal/bookings/AB-2026-00001/gallery", login_link: "https://x.in/login" });
  assert(v.booking_link === "https://x.in/portal-booking.html?code=AB-2026-00001", String(v.booking_link));
  assert(v.gallery_link === "https://x.in/portal-booking.html?code=AB-2026-00001", String(v.gallery_link));
  assert(v.login_link === "https://x.in/login.html", String(v.login_link));
  assert(renderHtml("{{a}}", { a: '"><img src=x onerror=1>' }).startsWith("&quot;&gt;&lt;img"), "attribute-safe");
});

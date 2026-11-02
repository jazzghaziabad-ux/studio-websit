// POST /functions/v1/send-emails — drains the email outbox.
// Called every 2 minutes by pg_cron inside Supabase (migration 0012) with the
// shared CRON_SECRET header. Rows are claimed with FOR UPDATE SKIP LOCKED, so
// overlapping runs never send the same email twice; failures retry with
// backoff in the database (5 attempts, then an ACTION REQUIRED alert).
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { safeEqual } from "../_shared/http.ts";
import { htmlToText, renderHtml, renderSubject, staticLinks, wrapEmail } from "./render.ts";

interface Queued { id: string; template_key: string; to_email: string; variables: Record<string, unknown> }
interface Template { key: string; subject: string; html_body: string; is_active: boolean }

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!key || !from) return { ok: false, error: "RESEND_API_KEY or EMAIL_FROM is not configured" };
  try {
    const res = await fetch(Deno.env.get("RESEND_API_URL") ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: `${res.status} ${body.message ?? "send failed"}` };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return respond({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return respond({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: templates }, { data: nameRow }] = await Promise.all([
    admin.from("email_templates").select("key, subject, html_body, is_active"),
    admin.from("settings").select("value").eq("key", "business_name").maybeSingle(),
  ]);
  const byKey = new Map(((templates ?? []) as Template[]).map((t) => [t.key, t]));
  const businessName = typeof nameRow?.value === "string" ? nameRow.value : "Studio";
  const result = { sent: 0, failed: 0, batches: 0 };
  const started = Date.now();

  while (Date.now() - started < 40000) {
    const { data, error } = await admin.rpc("claim_email_batch", { p_limit: 20 });
    if (error) return respond({ error: `claim_email_batch: ${error.message}`, ...result }, 500);
    const batch = (data ?? []) as Queued[];
    if (!batch.length) break;
    result.batches++;
    for (const email of batch) {
      const tpl = byKey.get(email.template_key);
      let subject: string | null = null;
      let outcome: { ok: true; id: string } | { ok: false; error: string };
      if (!tpl || !tpl.is_active) {
        outcome = { ok: false, error: `template "${email.template_key}" missing or inactive` };
      } else {
        const vars = staticLinks({ business_name: businessName, ...email.variables });
        subject = renderSubject(tpl.subject, vars);
        const html = wrapEmail(renderHtml(tpl.html_body, vars), businessName);
        outcome = await sendViaResend(email.to_email, subject, html, htmlToText(html));
      }
      await admin.rpc("mark_email_result", {
        p_email_id: email.id, p_success: outcome.ok, p_subject: subject,
        p_provider_message_id: outcome.ok ? outcome.id : null, p_error: outcome.ok ? null : outcome.error,
      });
      if (outcome.ok) result.sent++; else result.failed++;
    }
  }
  return respond({ ok: true, ...result });
}

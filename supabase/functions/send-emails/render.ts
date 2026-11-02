// Template rendering for transactional email. Every variable is HTML-escaped
// in bodies and stripped of line breaks in subjects (no header injection).
const MONEY_KEYS = new Set(["total_amount", "paid_amount", "balance_amount", "quotation_total", "payment_amount"]);
const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function valueOf(vars: Record<string, unknown>, key: string): string {
  const v = vars[key];
  if (v == null) return "";
  if (MONEY_KEYS.has(key) && (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v))))) return money.format(Number(v));
  return typeof v === "object" ? "" : String(v);
}

const VAR = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Rewrite app-style links (/portal/bookings/X) to the static site's pages. */
export function staticLinks(vars: Record<string, unknown>): Record<string, unknown> {
  const out = { ...vars };
  for (const k of ["booking_link", "gallery_link", "login_link"]) {
    const v = out[k];
    if (typeof v !== "string") continue;
    out[k] = v
      .replace(/\/portal\/bookings\/([A-Za-z0-9-]+)(?:\/[a-z]*)?$/, "/portal-booking.html?code=$1")
      .replace(/\/login$/, "/login.html");
  }
  return out;
}

export function renderSubject(template: string, vars: Record<string, unknown>): string {
  return template.replace(VAR, (_, k: string) => valueOf(vars, k)).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

export function renderHtml(template: string, vars: Record<string, unknown>): string {
  return template.replace(VAR, (_, k: string) => escapeHtml(valueOf(vars, k)));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|h\d|li|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function wrapEmail(bodyHtml: string, businessName: string): string {
  const name = escapeHtml(businessName);
  return `<!doctype html><html><body style="margin:0;background:#ede6d9;font-family:Futura,'Avenir Next',Arial,sans-serif;color:#1f1e1c">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-family:Didot,'Bodoni 72',Georgia,serif;font-size:24px;margin:0 0 24px">${name}</p>
<div style="background:#fff;padding:28px 24px;font-size:16px;line-height:1.6">${bodyHtml}</div>
<p style="font-size:12px;color:#5e584f;margin-top:20px">You are receiving this because you have a booking with ${name}.</p>
</div></body></html>`;
}

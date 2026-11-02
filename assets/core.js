// Core module shared by every page.
// Security model: this site only ever uses the public anon key. Every rule
// (who sees which booking, who may confirm payments…) is enforced inside
// Supabase by Row Level Security and database functions, so nothing here is
// trusted for authorization — it only decides what to show.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { CONFIG } from "./config.js";

export { CONFIG };
export const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
export const FUNCTIONS_URL = `${CONFIG.supabaseUrl}/functions/v1`;

// ---------------------------------------------------------------------------
// Safe HTML templating: every interpolated value is escaped unless wrapped in
// raw() or produced by html``. Use html`` for ALL markup built from data.
// ---------------------------------------------------------------------------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ""));
function renderValue(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join("");
  if (v === false || v === null || v === undefined) return "";
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += renderValue(v) + strings[i + 1]; });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function mount(target, content) {
  const el = typeof target === "string" ? $(target) : target;
  if (el) el.innerHTML = renderValue(content);
  return el;
}
/** Only http(s) or same-site relative URLs may become links or images. */
export function safeUrl(u) {
  if (typeof u !== "string" || !u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z0-9._/?=&#-]+$/i.test(u) && !u.startsWith("//")) return u;
  return "";
}
export const params = () => new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// Formatting (Indian rupees, IST calendar dates)
// ---------------------------------------------------------------------------
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export const inr = (n, exact = false) => (n == null || n === "" ? "—" : (exact ? inr2 : inr0).format(Number(n)));
export function fmtDate(d, opts = { day: "numeric", month: "long", year: "numeric" }) {
  if (!d) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(date);
}
export const fmtDateTime = (d) => fmtDate(d, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export function fmtTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}
export const humanize = (s) => (!s ? "—" : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "));
export const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const BADGE = {
  new_request: "gold", changes_requested: "gold", sent: "gold", confirmed: "black", accepted: "black",
  delivered: "green", fully_paid: "green", cancelled: "grey", rejected: "grey", superseded: "grey", expired: "grey",
};
export const badge = (status) => html`<span class="badge ${BADGE[status] ?? ""}">${humanize(status)}</span>`;

// ---------------------------------------------------------------------------
// Errors from Supabase → message safe to show (mirrors the SQLSTATE contract)
// ---------------------------------------------------------------------------
const FRIENDLY = {
  "23505": "That value is already in use.",
  "23503": "This item is in use elsewhere.",
  "23P01": "That time overlaps an existing confirmed schedule.",
  "23514": "One of the values is outside the allowed range.",
  "22P02": "One of the values is not in a valid format.",
};
export function dbMessage(err) {
  if (!err) return "Something went wrong. Try again.";
  if (err.code && FRIENDLY[err.code]) return FRIENDLY[err.code];
  if (["42501", "22023", "55000", "P0002"].includes(err.code) && err.message) {
    return err.message.startsWith("new row violates") ? "You don't have permission to do that." : err.message;
  }
  if (err.message && /fetch|network/i.test(err.message)) return "Network error. Check your connection and try again.";
  return "Something went wrong on our side. Try again in a moment.";
}

// ---------------------------------------------------------------------------
// Settings & catalog (public reads; RLS returns only active / public rows)
// ---------------------------------------------------------------------------
let settingsPromise;
export function getSettings() {
  settingsPromise ??= sb.from("settings").select("key, value").eq("is_public", true).then(({ data, error }) => {
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  });
  return settingsPromise;
}
export const sText = (s, k, d = "") => (typeof s[k] === "string" ? s[k] : d);
export const sArr = (s, k) => (Array.isArray(s[k]) ? s[k] : []);

async function rows(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data ?? [];
}
export const getServices = () => rows(sb.from("services").select("*").eq("is_active", true).order("category").order("sort_order"));
export const getEventTypes = () => rows(sb.from("event_types").select("*").eq("is_active", true).order("sort_order"));
export const getAddons = () => rows(sb.from("addons").select("*").eq("is_active", true).order("sort_order"));
export const getTravelSlabs = () => rows(sb.from("travel_slabs").select("*").eq("is_active", true).order("min_km"));
export async function getPackages() {
  const data = await rows(sb.from("packages").select("*, package_durations(*)").eq("is_active", true).order("sort_order"));
  return data.map((p) => ({
    ...p,
    package_durations: (p.package_durations ?? []).filter((d) => d.is_active).sort((a, b) => a.sort_order - b.sort_order),
  }));
}
export const getPublicReviews = (limit = 6) =>
  rows(sb.from("v_public_reviews").select("*").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(limit));
export async function getReviewStats() {
  const { data, error } = await sb.rpc("review_stats");
  if (error) throw error;
  return data ?? { average_rating: null, review_count: 0 };
}
/** Lowest bookable price ("from ₹…"), derived from packages — never hardcoded. */
export function startingPrice(service, packages) {
  if (service.starting_price != null) return Number(service.starting_price);
  const prices = packages.filter((p) => p.service_id === service.id)
    .flatMap((p) => (p.package_durations ?? []).filter((d) => !d.is_custom_quote).map((d) => Number(p.base_price) + Number(d.extra_price)));
  return prices.length ? Math.min(...prices) : null;
}

// ---------------------------------------------------------------------------
// Session & role
// ---------------------------------------------------------------------------
let profilePromise;
export function getProfile() {
  profilePromise ??= (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb.from("profiles").select("id, role, full_name, email, is_active").eq("id", session.user.id).maybeSingle();
    return data ?? null;
  })();
  return profilePromise;
}
export function homeFor(role) {
  if (role === "super_admin" || role === "manager") return "admin.html";
  if (role === "photographer" || role === "videographer") return "staff.html";
  return "portal.html";
}
/** Page guard: anonymous → login; wrong role → back to their own area. */
export async function requireRole(roles) {
  const profile = await getProfile();
  if (!profile) {
    location.replace(`login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`);
    return new Promise(() => {}); // stop the page while redirecting
  }
  if (!profile.is_active || !roles.includes(profile.role)) {
    location.replace(homeFor(profile.role));
    return new Promise(() => {});
  }
  return profile;
}
export async function signOut() {
  try { await sb.rpc("record_auth_event", { p_event: "logout" }); } catch { /* best effort */ }
  await sb.auth.signOut();
  location.href = "index.html";
}

/** Notification/email links use app-style paths; map them to this site's pages. */
export function appLink(path) {
  if (!path) return "";
  let m = path.match(/^\/portal\/bookings\/([A-Za-z0-9-]+)/);
  if (m) return `portal-booking.html?code=${encodeURIComponent(m[1])}`;
  m = path.match(/^\/admin\/bookings\/([A-Za-z0-9-]+)/);
  if (m) return `admin.html#booking/${encodeURIComponent(m[1])}`;
  if (path.startsWith("/portal")) return "portal.html";
  if (path.startsWith("/staff")) return "staff.html";
  if (path.startsWith("/admin")) return "admin.html";
  return "";
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------
const NAV = [
  ["services.html?c=photography", "Photography", "photography"],
  ["services.html?c=videography", "Videography", "videography"],
  ["packages.html", "Packages", "packages"],
  ["portfolio.html", "Portfolio", "portfolio"],
  ["availability.html", "Availability", "availability"],
  ["contact.html", "Contact", "contact"],
];

export async function renderShell(active = "") {
  const [s, profile] = await Promise.all([getSettings().catch(() => ({})), getProfile().catch(() => null)]);
  const name = sText(s, "business_name", "Studio");
  const account = profile ? [homeFor(profile.role), "My account"] : ["login.html", "Sign in"];
  const navItems = NAV.map(([href, label, key]) => html`<li><a href="${href}" ${raw(key === active ? 'aria-current="page"' : "")}>${label}</a></li>`);

  mount("#site-header", html`
    <div class="site-header dark">
      <div class="wrap bar">
        <a class="brand" href="index.html">${name}</a>
        <nav aria-label="Main"><ul class="nav">${navItems}</ul></nav>
        <div class="head-actions">
          <a href="${account[0]}">${account[1]}</a>
          <a class="btn btn-gold btn-sm" href="book.html">Book now</a>
        </div>
        <details class="menu">
          <summary>Menu</summary>
          <div class="menu-panel">
            ${NAV.map(([href, label]) => html`<a href="${href}">${label}</a>`)}
            <a href="${account[0]}">${account[1]}</a>
            <a class="btn btn-gold" href="book.html">Book now</a>
          </div>
        </details>
      </div>
    </div>`);

  const phone = sText(s, "business_phone");
  const email = sText(s, "business_email");
  const ig = safeUrl(sText(s, "social_instagram"));
  const yt = safeUrl(sText(s, "social_youtube"));
  mount("#site-footer", html`
    <div class="footer">
      <div class="wrap cols">
        <div>
          <p class="display" style="font-size:1.9rem;color:var(--bone)">${name}</p>
          <p style="margin-top:1rem">${sText(s, "business_address")}</p>
          <p style="margin-top:1rem"><a href="tel:${phone.replace(/\s/g, "")}">${phone}</a><br><a href="mailto:${email}">${email}</a></p>
        </div>
        <nav aria-label="Services"><p style="color:var(--bone)">Services</p><ul>
          <li><a href="services.html?c=photography">Photography</a></li><li><a href="services.html?c=videography">Videography</a></li>
          <li><a href="packages.html">Packages and pricing</a></li><li><a href="testimonials.html">Testimonials</a></li><li><a href="faq.html">Questions</a></li>
        </ul></nav>
        <nav aria-label="Policies"><p style="color:var(--bone)">Policies</p><ul>
          <li><a href="policy.html?p=privacy">Privacy</a></li><li><a href="policy.html?p=terms">Terms and conditions</a></li>
          <li><a href="policy.html?p=cancellation">Cancellation</a></li><li><a href="policy.html?p=delivery">Photo and video delivery</a></li>
        </ul>
        ${ig || yt ? html`<p style="margin-top:1.5rem;display:flex;gap:1rem">${ig ? html`<a href="${ig}" target="_blank" rel="noopener">Instagram</a>` : ""}${yt ? html`<a href="${yt}" target="_blank" rel="noopener">YouTube</a>` : ""}</p>` : ""}
        </nav>
      </div>
      <div class="legal"><p class="wrap">© ${new Date().getFullYear()} ${name}</p></div>
    </div>`);
  return { settings: s, profile };
}

export function setMeta(title, description) {
  if (title) document.title = title;
  if (description) {
    let m = $('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.append(m); }
    m.content = description;
  }
}
export function addJsonLd(obj) {
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.textContent = JSON.stringify(obj);
  document.head.append(el);
}
export function pageError(target, err) {
  console.error(err);
  mount(target, html`<div class="wrap section"><h1>This page could not load</h1>
    <p class="muted" style="margin-top:1rem">We couldn't reach the data it needs. Refresh to try again; if it keeps happening, call us and we'll help directly.</p></div>`);
}

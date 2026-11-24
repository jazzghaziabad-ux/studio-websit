// Admin area (super_admin / manager). One page, sections chosen by the URL hash:
//   #            dashboard            #bookings        #booking/<CODE>
//   #calendar    #pricing/<tab>       #users           #settings
//   #audit       #emails
// Every write goes straight to Supabase as the signed-in admin. The database
// (RLS, guard triggers, workflow functions) decides what is allowed — this page
// only offers the actions and shows the database's answer.
import {
  html, raw, mount, renderShell, sb, requireRole, inr, fmtDate, fmtDateTime, fmtTime, humanize, todayIST,
  badge, setMeta, pageError, dbMessage, signOut, getSettings, sText, $,
} from "../core.js";
import { quotationDoc, timeline } from "../components.js";

let profile;
let isSuper = false;
const BOOKING_STATUSES = ["new_request", "under_review", "quotation_prepared", "quotation_sent", "changes_requested",
  "tentative", "confirmed", "payment_pending", "partial_payment", "payment_confirmed", "photographer_assigned",
  "videographer_assigned", "event_in_progress", "event_completed", "photo_processing", "video_processing",
  "photos_ready", "videos_ready", "media_ready", "delivered", "cancelled", "rejected"];
const METHOD = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };
const ROLES = ["customer", "photographer", "videographer", "manager", "super_admin"];
const SKILLS = ["photographer", "second_photographer", "videographer", "second_videographer", "drone_operator", "editor"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const opt = (value, label, selected) => html`<option value="${value}" ${selected ? html`selected` : ""}>${label}</option>`;
const h2 = (t) => html`<h2 style="font-family:var(--sans);font-size:1.15rem;font-weight:600">${t}</h2>`;
const msg = html`<p class="msg small" role="status" style="margin-top:.5rem"></p>`;
async function rows(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
const val = (form, n) => {
  const el = form.elements.namedItem(n);
  if (!el) return "";
  return el.type === "checkbox" ? el.checked : String(el.value ?? "").trim();
};
const num = (form, n) => {
  const s = val(form, n);
  if (s === "") return null;
  const x = Number(s);
  if (!Number.isFinite(x)) throw new Error(`Enter a number for ${n.replace(/_/g, " ")}.`);
  return x;
};
const fail = (text) => { throw new Error(text); };
async function db(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(dbMessage(error));
  return data;
}
async function rpc(name, args) { return db(sb.rpc(name, args)); }

// ---------------------------------------------------------------------------
// Form actions. Every form has data-action="<name>"; the handler returns a
// success message, throws an Error with a user-facing message to fail.
// After success the current section re-renders with fresh data.
// ---------------------------------------------------------------------------
const ACTIONS = {};

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-action]");
  if (!form) return;
  e.preventDefault();
  if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;
  const out = form.querySelector(".msg");
  const btn = form.querySelector("button[type=submit], button:not([type])");
  if (btn) btn.disabled = true;
  if (out) { out.textContent = "Saving…"; out.className = "msg small muted"; }
  try {
    const text = await ACTIONS[form.dataset.action](form, form.dataset);
    sessionStorage.setItem("flash", text ?? "Saved.");
    await route();
  } catch (err) {
    if (out) { out.textContent = err.message || "Something went wrong."; out.className = "msg small danger"; }
    if (btn) btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const NAV = [
  ["", "Dashboard"], ["bookings", "Bookings"], ["calendar", "Calendar"], ["pricing", "Pricing and services"],
  ["users", "Users and staff"], ["settings", "Settings"], ["emails", "Email log"], ["audit", "Audit log"],
];
function layout(active, title, body) {
  const flash = sessionStorage.getItem("flash");
  sessionStorage.removeItem("flash");
  return html`<div class="wrap section" style="padding-top:2.5rem">
    <nav class="subnav no-print" aria-label="Admin">${NAV.map(([k, l]) => html`<a class="btn btn-sm ${k === active ? "btn-solid" : "btn-line"}" href="#${k}">${l}</a>`)}
      <button class="btn btn-sm btn-line" id="signout" type="button">Sign out</button></nav>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:2rem">
      <h1 style="font-size:2.5rem">${title}</h1><p class="muted small">${profile.email} · ${humanize(profile.role)}</p></div>
    ${flash ? html`<p class="notice ok no-print" role="status" style="margin-bottom:1.5rem">${flash}</p>` : ""}
    ${body}</div>`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function dashboard() {
  const today = todayIST();
  const count = async (q) => (await q).count ?? 0;
  const b = () => sb.from("bookings").select("id", { count: "exact", head: true });
  const [total, newReq, upcoming, todays, unpaid, pendingReviews, openTickets, actions, money] = await Promise.all([
    count(b()), count(b().eq("status", "new_request")),
    count(b().gte("event_date", today).not("active_snapshot_id", "is", null).not("status", "in", "(cancelled,rejected)")),
    count(b().eq("event_date", today).not("status", "in", "(cancelled,rejected)")),
    count(b().not("active_snapshot_id", "is", null).neq("payment_status", "fully_paid").not("status", "in", "(cancelled,rejected)")),
    count(sb.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending_approval")),
    count(sb.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"])),
    rows(sb.from("v_action_required").select("*").order("priority").order("alert_at", { ascending: true }).limit(60)),
    rows(sb.from("bookings").select("estimated_amount, balance_amount, active_snapshot_id").not("status", "in", "(cancelled,rejected)")),
  ]);
  const outstanding = money.filter((r) => r.active_snapshot_id).reduce((s, r) => s + Math.max(0, Number(r.balance_amount)), 0);
  const pipeline = money.filter((r) => !r.active_snapshot_id).reduce((s, r) => s + Number(r.estimated_amount), 0);
  const cards = [["Total bookings", total, "#bookings"], ["New requests", newReq, "#bookings?status=new_request"], ["Upcoming events", upcoming],
    ["Today's events", todays], ["Payment pending", unpaid], ["Pending reviews", pendingReviews], ["Open tickets", openTickets],
    ["Open request value", inr(pipeline)], ["Outstanding balance", inr(outstanding)]];
  const link = (p) => {
    const m = (p ?? "").match(/^\/admin\/bookings\/([A-Za-z0-9-]+)/);
    return m ? `#booking/${m[1]}` : p?.startsWith("/admin/settings") ? "#settings" : "#bookings";
  };
  return layout("", "Dashboard", html`
    <section style="margin-bottom:3rem">${h2(`Action required${actions.length ? ` (${actions.length})` : ""}`)}
      ${!actions.length ? html`<p class="muted" style="margin-top:.5rem">Nothing needs your attention right now.</p>` : html`
      <ul class="rows" style="margin-top:1rem">${actions.map((a) => html`<li style="display:grid;gap:.5rem;grid-template-columns:auto 1fr auto;align-items:center">
        <span class="badge ${a.priority === "high" ? "gold" : ""}">${a.priority === "high" ? "High" : "Medium"}</span>
        <span><span style="font-weight:500">${a.title}</span><span class="muted small" style="display:block">${[a.booking_code, a.customer_name, a.alert_at ? fmtDateTime(a.alert_at) : null].filter(Boolean).join(" · ")}</span></span>
        <a class="btn btn-line btn-sm" href="${link(a.action_path)}">Open</a></li>`)}</ul>`}</section>
    <dl style="display:grid;grid-template-columns:repeat(auto-fill,minmax(12rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line)">
      ${cards.map(([l, v, href]) => html`<div style="background:var(--paper);padding:1rem"><dt class="muted small">${l}</dt>
        <dd class="display num" style="margin:.25rem 0 0;font-size:1.9rem">${href ? html`<a href="${href}" style="text-decoration:none">${v}</a>` : v}</dd></div>`)}</dl>`);
}

// ---------------------------------------------------------------------------
// Bookings list
// ---------------------------------------------------------------------------
async function bookings(params) {
  const status = BOOKING_STATUSES.includes(params.get("status")) ? params.get("status") : "";
  const when = ["upcoming", "past", "all"].includes(params.get("when")) ? params.get("when") : "upcoming";
  const q = (params.get("q") ?? "").replace(/[,()%*\\:]/g, " ").trim().slice(0, 80);
  const today = todayIST();
  let query = sb.from("bookings").select("id, booking_code, event_date, city, status, estimated_amount, total_amount, includes_photography, includes_videography, event_types(name), customers(full_name, phone, email)")
    .order("event_date", { ascending: when !== "past" }).limit(200);
  if (status) query = query.eq("status", status);
  if (when === "upcoming") query = query.gte("event_date", today);
  if (when === "past") query = query.lt("event_date", today);
  let list = await rows(query);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((r) => [r.booking_code, r.customers?.full_name, r.customers?.phone, r.customers?.email].some((x) => String(x ?? "").toLowerCase().includes(s)));
  }
  return layout("bookings", "Bookings", html`
    <form id="bfilter" class="no-print" style="display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));align-items:end;margin-bottom:1.5rem">
      <label class="field"><span>Search</span><input class="input" name="q" value="${q}" placeholder="Booking ID, name, phone or email"></label>
      <label class="field"><span>Status</span><select class="input" name="status">${opt("", "Any status")}${BOOKING_STATUSES.map((s) => opt(s, humanize(s), s === status))}</select></label>
      <label class="field"><span>Event date</span><select class="input" name="when">${opt("upcoming", "Upcoming", when === "upcoming")}${opt("past", "Past", when === "past")}${opt("all", "All", when === "all")}</select></label>
      <button class="btn btn-solid">Filter</button></form>
    ${!list.length ? html`<p class="card muted" style="text-align:center;padding:2.5rem">No bookings match.</p>` : html`
    <div style="overflow-x:auto"><table style="min-width:44rem;font-size:.95rem">
      <thead><tr style="border-bottom:1px solid var(--charcoal);text-align:left" class="small muted"><th style="padding:.5rem 0;font-weight:400">Booking</th><th style="font-weight:400">Customer</th><th style="font-weight:400">Event</th><th style="font-weight:400">Status</th><th style="font-weight:400;text-align:right">Amount</th></tr></thead>
      <tbody>${list.map((r) => html`<tr style="border-bottom:1px solid var(--line)">
        <td style="padding:.75rem 0"><a class="link" style="font-weight:500" href="#booking/${r.booking_code}">${r.booking_code}</a>
          <span class="muted small" style="display:block">${[r.includes_photography && "Photo", r.includes_videography && "Video"].filter(Boolean).join(" + ")}</span></td>
        <td>${r.customers?.full_name}<span class="muted small" style="display:block">${r.customers?.phone}</span></td>
        <td>${fmtDate(r.event_date, { day: "numeric", month: "short", year: "numeric" })}<span class="muted small" style="display:block">${r.event_types?.name}, ${r.city}</span></td>
        <td>${badge(r.status)}</td>
        <td class="num" style="text-align:right">${Number(r.total_amount) > 0 ? inr(r.total_amount) : html`<span class="muted">est. ${inr(r.estimated_amount)}</span>`}</td></tr>`)}</tbody></table></div>
    <p class="muted small" style="margin-top:.75rem">${list.length} booking${list.length === 1 ? "" : "s"}${list.length === 200 ? " (first 200 — narrow the filter)" : ""}</p>`}`);
}
document.addEventListener("submit", (e) => {
  if (e.target.id !== "bfilter") return;
  e.preventDefault();
  const p = new URLSearchParams(new FormData(e.target));
  location.hash = `bookings?${p}`;
});

// ---------------------------------------------------------------------------
// Booking detail: everything about one booking on one page
// ---------------------------------------------------------------------------
async function booking(code) {
  const b = await db(sb.from("bookings").select("*, customers(full_name, email, phone, whatsapp, profile_id), event_types(name)").eq("booking_code", code).maybeSingle());
  if (!b) return layout("bookings", "Booking not found", html`<p><a class="link" href="#bookings">All bookings</a></p>`);
  const [items, addons, notes, milestones, versions, payments, assignments, staff, s] = await Promise.all([
    rows(sb.from("booking_items").select("id, estimated_price, custom_hours, services(name), packages(name), package_durations(label)").eq("booking_id", b.id)),
    rows(sb.from("booking_addons").select("id, quantity, estimated_total, addons(name)").eq("booking_id", b.id)),
    rows(sb.from("booking_notes").select("id, note, created_at, profiles(full_name)").eq("booking_id", b.id).order("created_at", { ascending: false })),
    rows(sb.from("booking_milestones").select("id, milestone, occurred_at").eq("booking_id", b.id).order("occurred_at")),
    rows(sb.from("quotation_versions").select("*, quotation_items(*), quotations(quotation_number, current_version)").eq("booking_id", b.id).order("version", { ascending: false })),
    rows(sb.from("manual_payments").select("*").eq("booking_id", b.id).order("payment_date")),
    rows(sb.from("booking_assignments").select("*, profiles(full_name, email)").eq("booking_id", b.id).neq("status", "cancelled")),
    rows(sb.from("staff_profiles").select("profile_id, skills, is_active, profiles(full_name, is_active)").eq("is_active", true)),
    getSettings(),
  ]);
  const label = b.event_name || b.event_types?.name || "Event";
  const inactive = ["cancelled", "rejected"].includes(b.status);
  const draft = versions.find((v) => v.status === "draft");
  const latestSent = versions.find((v) => v.status !== "draft");
  const number = versions[0]?.quotations?.quotation_number ?? "";
  const business = { name: sText(s, "business_name", "Studio"), phone: sText(s, "business_phone"), email: sText(s, "business_email"), address: sText(s, "business_address") };
  const docFor = (v) => quotationDoc({ version: v, number, business, customer: b.customers,
    booking: { booking_code: b.booking_code, event_label: label, event_date: b.event_date, location: `${b.location}, ${b.city}` } });
  const est = b.estimate ?? {};
  const assignable = staff.filter((x) => x.profiles?.is_active);

  const itemFields = (it) => html`
    <label class="field span2"><span>Description</span><input class="input" name="description" required maxlength="300" value="${it?.description ?? ""}"></label>
    <label class="field"><span>Type</span><select class="input" name="item_type">${[["package", "Package"], ["addon", "Add-on"], ["travel", "Travel"], ["custom", "Other"]].map(([k, l]) => opt(k, l, (it?.item_type ?? "custom") === k))}</select></label>
    <label class="field"><span>For</span><select class="input" name="category">${opt("", "General", !it?.category)}${opt("photography", "Photography", it?.category === "photography")}${opt("videography", "Videography", it?.category === "videography")}</select></label>
    <label class="field"><span>Quantity</span><input class="input" name="quantity" type="number" min="0.01" step="0.01" required value="${it?.quantity ?? 1}"></label>
    <label class="field"><span>Rate (₹)</span><input class="input" name="unit_price" type="number" min="0" step="0.01" required value="${it?.unit_price ?? ""}"></label>
    <label class="field"><span>Order</span><input class="input" name="sort_order" type="number" value="${it?.sort_order ?? 99}"></label>`;

  const quotationSection = html`<section id="quotation">${h2("Quotation")}
    ${latestSent?.status === "changes_requested" && latestSent.customer_change_request ? html`<div class="notice" style="margin-top:1rem">
      <p style="font-weight:500">${b.customers.full_name} asked for changes to V${latestSent.version}</p><p class="prose">${latestSent.customer_change_request}</p>
      <p class="muted small">${fmtDateTime(latestSent.responded_at)}</p></div>` : ""}
    ${versions.length ? html`<table style="margin-top:1rem;font-size:.95rem"><tbody>${versions.map((v) => html`<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:.5rem 0">${number} V${v.version}</td><td>${badge(v.status)}</td><td class="muted small">${v.sent_at ? `sent ${fmtDate(v.sent_at, { day: "numeric", month: "short" })}` : ""}</td>
      <td class="muted small">valid until ${fmtDate(v.valid_until, { day: "numeric", month: "short", year: "numeric" })}</td><td class="num" style="text-align:right">${inr(v.total)}</td></tr>`)}</tbody></table>`
      : html`<p class="muted" style="margin-top:.5rem">No quotation yet. The customer is waiting for one.</p>`}
    ${!draft && !inactive ? html`<form data-action="createQuotation" data-booking="${b.id}" style="margin-top:1rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center">
      ${versions.length ? html`<label class="check small"><input type="checkbox" name="copy_previous" checked> Start from V${versions[0].version}</label>` : ""}
      <button class="btn btn-solid">${versions.length ? `Create V${versions[0].version + 1}` : "Create quotation from the customer's estimate"}</button>${msg}</form>` : ""}
    ${draft ? html`<div style="margin-top:1.5rem;border:1px solid var(--gold);padding:1.25rem">
      <p style="font-weight:600">Editing draft V${draft.version} <span class="muted small" style="font-weight:400">— the customer cannot see drafts</span></p>
      <ul class="rows" style="margin-top:1rem">${[...(draft.quotation_items ?? [])].sort((x, y) => x.sort_order - y.sort_order).map((it) => html`<li>
        <details><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:1rem"><span>${it.description}${Number(it.quantity) !== 1 ? ` × ${Number(it.quantity)}` : ""}</span><span class="num">${inr(it.amount)}</span></summary>
          <form data-action="saveItem" data-version="${draft.id}" data-item="${it.id}" class="form-grid two" style="margin-top:1rem">${itemFields(it)}
            <div class="span2 btn-row"><button class="btn btn-solid btn-sm">Save line</button></div>${msg}</form>
          <form data-action="deleteItem" data-item="${it.id}" data-confirm="Remove this line?" style="margin-top:.5rem"><button class="btn btn-sm" style="color:var(--danger);padding-left:0">Remove line</button>${msg}</form>
        </details></li>`)}</ul>
      <details style="margin-top:1rem"><summary class="btn btn-line btn-sm" style="cursor:pointer">Add a line</summary>
        <form data-action="saveItem" data-version="${draft.id}" class="form-grid two" style="margin-top:1rem">${itemFields(null)}<div class="span2"><button class="btn btn-solid btn-sm">Add line</button></div>${msg}</form></details>
      <form data-action="saveDraft" data-version="${draft.id}" class="form-grid two" style="margin-top:1.5rem">
        <label class="field"><span>Discount (₹)</span><input class="input" name="discount_amount" type="number" min="0" step="1" value="${draft.discount_amount}"></label>
        <label class="field"><span>Discount label</span><input class="input" name="discount_note" maxlength="200" value="${draft.discount_note ?? ""}" placeholder="e.g. Photo + video combo"></label>
        <label class="field"><span>GST rate (%)</span><input class="input" name="tax_rate" type="number" min="0" max="100" step="0.01" value="${draft.tax_rate}"></label>
        <label class="field"><span>Valid until</span><input class="input" name="valid_until" type="date" min="${todayIST()}" required value="${draft.valid_until}"></label>
        <label class="field span2"><span>Notes for the customer <small>(optional)</small></span><textarea class="input" name="notes" maxlength="4000">${draft.notes ?? ""}</textarea></label>
        <label class="field span2"><span>Terms</span><textarea class="input" name="terms" maxlength="10000">${draft.terms ?? ""}</textarea></label>
        <div class="span2"><button class="btn btn-solid btn-sm">Save draft</button></div>${msg}</form>
      <div class="btn-row" style="margin-top:1.5rem;border-top:1px solid var(--charcoal);padding-top:1.25rem">
        <form data-action="sendQuotation" data-version="${draft.id}" data-confirm="${`Send V${draft.version} for ${inr(draft.total)} to ${b.customers.email}? Sent versions cannot be edited.`}">
          <button class="btn btn-gold">Send V${draft.version} to customer</button>${msg}</form>
        <form data-action="discardDraft" data-version="${draft.id}" data-confirm="Discard this draft?"><button class="btn btn-line">Discard draft</button>${msg}</form></div>
      <div style="margin-top:1.5rem">${docFor(draft)}</div></div>` : ""}
    ${latestSent?.status === "sent" && !draft ? html`<form data-action="acceptOnBehalf" data-version="${latestSent.id}" class="card" style="margin-top:1.5rem">
      <p style="font-weight:500">Customer accepted by phone or in person?</p>
      <p class="muted small">Records acceptance of V${latestSent.version} (${inr(latestSent.total)}) on their behalf. This is written to the audit log.</p>
      <label class="check small" style="margin-top:.75rem"><input type="checkbox" name="confirm"> The customer confirmed acceptance</label>
      <button class="btn btn-solid btn-sm" style="margin-top:.75rem">Record acceptance</button>${msg}</form>` : ""}
    ${latestSent && !draft ? html`<details style="margin-top:1rem"><summary class="link small" style="cursor:pointer">Show V${latestSent.version} as the customer sees it</summary>
      <div style="margin-top:1rem">${docFor(latestSent)}</div><button type="button" class="btn btn-line btn-sm no-print" style="margin-top:.75rem" id="printq">Print or save as PDF</button></details>` : ""}
  </section>`;

  const paymentsSection = html`<section id="payments">${h2("Payments")}
    <dl class="money" style="margin-top:.75rem"><div><dt>Total</dt><dd class="num">${inr(b.total_amount)}</dd></div><div><dt>Confirmed paid</dt><dd class="num">${inr(b.paid_amount)}</dd></div><div><dt>Balance</dt><dd class="num">${inr(b.balance_amount)}</dd></div></dl>
    <p style="margin-top:.5rem">${badge(b.payment_status)} <span class="muted small">Only confirmed payments count toward the balance.</span></p>
    ${payments.length ? html`<ul class="rows" style="margin-top:1rem">${payments.map((p) => html`<li>
      <p style="${p.status === "voided" ? "text-decoration:line-through;color:var(--smoke)" : ""}"><b class="num" style="font-weight:500">${inr(p.amount, true)}</b> · ${METHOD[p.payment_method]}${p.payment_reference ? ` · ref ${p.payment_reference}` : ""}</p>
      <p class="muted small">Paid ${fmtDate(p.payment_date)} · ${p.status === "confirmed" ? `confirmed ${fmtDateTime(p.confirmed_at)}` : p.status === "voided" ? `voided: ${p.void_reason}` : "awaiting confirmation"}</p>
      ${p.notes ? html`<p class="small">${p.notes}</p>` : ""}
      <div class="btn-row" style="margin-top:.5rem">
        ${p.status === "recorded" ? html`<form data-action="confirmPayment" data-payment="${p.id}" data-confirm="${`Confirm ${inr(p.amount)} was received? It will count toward the balance and the customer is notified.`}"><button class="btn btn-gold btn-sm">Confirm payment</button>${msg}</form>` : ""}
        ${p.status === "recorded" || (p.status === "confirmed" && isSuper) ? html`<details><summary class="btn btn-line btn-sm" style="cursor:pointer">Void</summary>
          <form data-action="voidPayment" data-payment="${p.id}" style="margin-top:.5rem;display:grid;gap:.5rem;max-width:20rem">
            <input class="input" name="reason" required minlength="5" placeholder="Reason (required)"><button class="btn btn-sm" style="background:var(--danger);color:#fff">Void payment</button>${msg}</form></details>` : ""}
      </div></li>`)}</ul>` : ""}
    ${!inactive ? html`<details style="margin-top:1rem"><summary class="btn btn-line btn-sm" style="cursor:pointer">Record a payment</summary>
      <form data-action="recordPayment" data-booking="${b.id}" class="form-grid two card" style="margin-top:1rem">
        <label class="field"><span>Amount received (₹)</span><input class="input" name="amount" type="number" min="1" step="0.01" required></label>
        <label class="field"><span>Method</span><select class="input" name="payment_method">${Object.entries(METHOD).map(([k, l]) => opt(k, l))}</select></label>
        <label class="field"><span>Date received</span><input class="input" name="payment_date" type="date" max="${todayIST()}" value="${todayIST()}" required></label>
        <label class="field"><span>Reference <small>(UTR, cheque no.)</small></span><input class="input" name="payment_reference" maxlength="100"></label>
        <label class="field span2"><span>Notes <small>(optional)</small></span><input class="input" name="notes" maxlength="1000"></label>
        <div class="span2"><button class="btn btn-solid btn-sm">Record payment</button>
          <p class="muted small" style="margin-top:.5rem">Recording does not count it yet — confirm it after you verify the money arrived.</p></div>${msg}</form></details>` : ""}
  </section>`;

  const staffSection = html`<section id="staff">${h2("Team for this event")}
    ${!assignments.length ? html`<p class="muted" style="margin-top:.5rem">Nobody assigned yet.</p>` : html`<ul class="rows" style="margin-top:.75rem">${assignments.map((a) => html`<li style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem">
      <span>${a.profiles?.full_name || a.profiles?.email} <span class="muted small">· ${humanize(a.assignment_role)}</span>${a.notes ? html`<span class="prose muted small" style="display:block">${a.notes}</span>` : ""}</span>
      <form data-action="cancelAssignment" data-assignment="${a.id}" data-confirm="Remove from this event?"><button class="btn btn-sm" style="color:var(--danger)">Remove</button>${msg}</form></li>`)}</ul>`}
    ${inactive ? "" : !assignable.length ? html`<p class="muted small" style="margin-top:.75rem">No assignable team members. Give someone skills in <a class="link" href="#users">Users and staff</a>.</p>` : html`
    <form data-action="assignStaff" data-booking="${b.id}" style="margin-top:1rem;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));align-items:end">
      <label class="field"><span>Team member</span><select class="input" name="staff_id" required>${opt("", "Choose…")}${assignable.map((x) => opt(x.profile_id, `${x.profiles?.full_name || "Unnamed"} (${x.skills.map(humanize).join(", ")})`))}</select></label>
      <label class="field"><span>Role</span><select class="input" name="assignment_role">${SKILLS.map((r) => opt(r, humanize(r)))}</select></label>
      <button class="btn btn-solid">Assign</button>${msg}</form>
    <p class="muted small" style="margin-top:.5rem">Double-booking is blocked automatically, including a travel buffer around each event.</p>`}
  </section>`;

  return layout("bookings", b.booking_code, html`
    <p class="no-print small" style="margin:-1rem 0 1.5rem">${badge(b.status)} ${badge(b.payment_status)} · <a class="link" href="#bookings">All bookings</a></p>
    <div class="grid2 grid-aside" style="align-items:start">
      <div style="display:grid;gap:3rem">
        <section class="grid2" style="gap:1.5rem">
          <div>${h2("Customer")}<p style="margin-top:.5rem;font-size:1.1rem">${b.customers.full_name}</p>
            <p class="small"><a class="link" href="tel:${b.customers.phone}">${b.customers.phone}</a><br>
            ${b.customers.whatsapp ? html`<a class="link" target="_blank" rel="noopener" href="https://wa.me/${b.customers.whatsapp.replace(/[^0-9]/g, "")}">WhatsApp ${b.customers.whatsapp}</a><br>` : ""}
            <a class="link" href="mailto:${b.customers.email}">${b.customers.email}</a></p>
            <p class="muted small" style="margin-top:.25rem">${b.customers.profile_id ? "Has an account" : "No account yet"}</p></div>
          <div>${h2("Event")}<p style="margin-top:.5rem;font-size:1.1rem">${label}</p>
            <p class="small">${fmtDate(b.event_date)}, ${fmtTime(b.start_time)} to ${fmtTime(b.end_time)}<br>${b.location}, ${b.city}
            ${b.distance_km != null ? html`<br>${b.distance_km} km away` : ""}${b.guest_count ? html`<br>About ${b.guest_count} guests` : ""}</p></div>
        </section>
        <section>${h2("Requested")}
          <table style="margin-top:.75rem;font-size:.95rem"><tbody>
            ${items.map((i) => html`<tr style="border-bottom:1px solid var(--line)"><td style="padding:.4rem 0">${i.services?.name} — ${i.packages?.name} (${i.package_durations?.label}${i.custom_hours ? `, ${i.custom_hours} h` : ""})</td><td class="num" style="text-align:right">${inr(i.estimated_price)}</td></tr>`)}
            ${addons.map((a) => html`<tr style="border-bottom:1px solid var(--line)"><td style="padding:.4rem 0">${a.addons?.name}${Number(a.quantity) > 1 ? ` × ${a.quantity}` : ""}</td><td class="num" style="text-align:right">${inr(a.estimated_total)}</td></tr>`)}
            ${Number(est.travel_charge) ? html`<tr style="border-bottom:1px solid var(--line)"><td style="padding:.4rem 0">Travel</td><td class="num" style="text-align:right">${inr(est.travel_charge)}</td></tr>` : ""}
            ${Number(est.discount) ? html`<tr style="border-bottom:1px solid var(--line)"><td style="padding:.4rem 0">${est.discount_label ?? "Discount"}</td><td class="num" style="text-align:right">−${inr(est.discount)}</td></tr>` : ""}
            <tr><td style="padding:.4rem 0;font-weight:500">Estimate at request time</td><td class="num" style="text-align:right;font-weight:500">${inr(b.estimated_amount)}</td></tr></tbody></table>
          ${est.requires_custom_quote ? html`<p class="small" style="color:var(--gold-deep);margin-top:.5rem">Needs a custom quote (custom duration or outstation travel).</p>` : ""}
          ${b.special_requirements ? html`<p class="prose small" style="margin-top:1rem"><b style="font-weight:500">Requirements:</b> ${b.special_requirements}</p>` : ""}
          ${b.message ? html`<p class="prose small" style="margin-top:.5rem"><b style="font-weight:500">Message:</b> ${b.message}</p>` : ""}
          ${b.referral_source ? html`<p class="muted small" style="margin-top:.5rem">Heard about us via ${b.referral_source}</p>` : ""}
        </section>
        ${quotationSection}
        ${paymentsSection}
        ${staffSection}
        <section>${h2("Internal notes")}<p class="muted small">Visible to administrators only.</p>
          <form data-action="addNote" data-booking="${b.id}" style="margin-top:.75rem;display:grid;gap:.5rem">
            <textarea class="input" name="note" required maxlength="4000" placeholder="Add a note" aria-label="New note"></textarea><div><button class="btn btn-solid btn-sm">Add note</button></div>${msg}</form>
          <ul style="list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:1rem">${notes.map((n) => html`<li style="border-left:2px solid var(--line);padding-left:.75rem">
            <p class="prose">${n.note}</p><p class="muted small">${n.profiles?.full_name || "Admin"}, ${fmtDateTime(n.created_at)}</p></li>`)}</ul></section>
      </div>
      <aside class="no-print" style="display:grid;gap:2rem">
        <form data-action="setStatus" data-booking="${b.id}" class="card" style="display:grid;gap:.75rem">${h2("Booking status")}
          <label class="field"><span>Status</span><select class="input" name="status">${BOOKING_STATUSES.map((st) => opt(st, humanize(st), st === b.status))}</select></label>
          <label class="field"><span>Reason <small>(required to cancel or reject)</small></span><textarea class="input" name="reason" maxlength="1000">${b.cancellation_reason ?? ""}</textarea></label>
          <div><button class="btn btn-solid btn-sm">Update status</button></div>${msg}
          <p class="muted small">Payment status is calculated from confirmed payments.</p></form>
        <form data-action="setDelivery" data-booking="${b.id}" class="card" style="display:grid;gap:.75rem">${h2("Delivery and gallery")}
          ${b.includes_photography ? html`<label class="field"><span>Expected photo delivery</span><input class="input" type="date" name="photo_expected_delivery" value="${b.photo_expected_delivery ?? ""}"></label>` : ""}
          ${b.includes_videography ? html`<label class="field"><span>Expected video delivery</span><input class="input" type="date" name="video_expected_delivery" value="${b.video_expected_delivery ?? ""}"></label>` : ""}
          <label class="field"><span>Gallery access until <small>(optional)</small></span><input class="input" type="date" name="gallery_expiry_date" value="${b.gallery_expiry_date ?? ""}"></label>
          <div><button class="btn btn-solid btn-sm">Save dates</button></div>${msg}
          <p class="muted small">The customer is notified when a delivery date changes.</p></form>
        <div>${h2("Timeline")}<div style="margin-top:1rem">${timeline(milestones)}</div></div>
      </aside></div>`);
}

const UUID = /^[0-9a-f-]{36}$/i;
Object.assign(ACTIONS, {
  async createQuotation(f, d) {
    await rpc("create_quotation_version", { p_booking_id: d.booking, p_copy_previous: val(f, "copy_previous") === true });
    return "Draft created. Review the lines, then send it.";
  },
  async saveItem(f, d) {
    const row = {
      quotation_version_id: d.version, item_type: val(f, "item_type"), category: val(f, "category") || null,
      description: val(f, "description") || fail("Describe the line item."),
      quantity: num(f, "quantity") ?? fail("Enter a quantity."), unit_price: num(f, "unit_price") ?? fail("Enter a rate."),
      sort_order: num(f, "sort_order") ?? 99,
    };
    if (row.quantity <= 0) fail("Quantity must be more than 0.");
    if (row.unit_price < 0) fail("Rate cannot be negative.");
    if (d.item) await db(sb.from("quotation_items").update(row).eq("id", d.item));
    else await db(sb.from("quotation_items").insert(row));
    return d.item ? "Line saved." : "Line added.";
  },
  async deleteItem(_f, d) { await db(sb.from("quotation_items").delete().eq("id", d.item)); return "Line removed."; },
  async saveDraft(f, d) {
    const discount = num(f, "discount_amount") ?? 0;
    const tax = num(f, "tax_rate") ?? 0;
    if (discount < 0) fail("Discount cannot be negative.");
    if (tax < 0 || tax > 100) fail("GST rate must be between 0 and 100.");
    const data = await db(sb.from("quotation_versions").update({
      discount_amount: discount, discount_note: val(f, "discount_note") || null, tax_rate: tax,
      valid_until: val(f, "valid_until") || fail("Set a valid-until date."),
      notes: val(f, "notes") || null, terms: val(f, "terms") || null,
    }).eq("id", d.version).eq("status", "draft").select("id"));
    if (!data?.length) fail("Only draft quotations can be edited.");
    return "Draft saved.";
  },
  async sendQuotation(_f, d) { await rpc("send_quotation_version", { p_version_id: d.version }); return "Quotation sent. The customer will get an email within a few minutes."; },
  async discardDraft(_f, d) {
    const data = await db(sb.from("quotation_versions").delete().eq("id", d.version).eq("status", "draft").select("id"));
    if (!data?.length) fail("Only drafts can be discarded.");
    return "Draft discarded.";
  },
  async acceptOnBehalf(f, d) {
    if (val(f, "confirm") !== true) fail("Tick the box to confirm the customer accepted.");
    await rpc("accept_quotation", { p_version_id: d.version });
    return "Recorded as accepted. The booking is confirmed and the price is locked.";
  },
  async recordPayment(f, d) {
    const amount = num(f, "amount");
    if (!amount || amount <= 0) fail("Enter the amount received.");
    await db(sb.from("manual_payments").insert({
      booking_id: d.booking, amount, payment_method: val(f, "payment_method"),
      payment_date: val(f, "payment_date") || fail("Enter the payment date."),
      payment_reference: val(f, "payment_reference") || null, notes: val(f, "notes") || null,
    }));
    return "Payment recorded. Confirm it once you have verified it was received.";
  },
  async confirmPayment(_f, d) { await rpc("confirm_payment", { p_payment_id: d.payment }); return "Payment confirmed. The customer has been notified."; },
  async voidPayment(f, d) {
    const reason = val(f, "reason");
    if (reason.length < 5) fail("Give a reason of at least 5 characters.");
    await rpc("void_payment", { p_payment_id: d.payment, p_reason: reason });
    return "Payment voided.";
  },
  async assignStaff(f, d) {
    const staffId = val(f, "staff_id");
    const role = val(f, "assignment_role");
    if (!UUID.test(staffId)) fail("Choose a team member.");
    const existing = await db(sb.from("booking_assignments").select("id").eq("booking_id", d.booking).eq("staff_id", staffId).eq("assignment_role", role).maybeSingle());
    const { error } = existing
      ? await sb.from("booking_assignments").update({ status: "confirmed" }).eq("id", existing.id)
      : await sb.from("booking_assignments").insert({ booking_id: d.booking, staff_id: staffId, assignment_role: role, status: "confirmed" });
    if (error) fail(error.code === "23P01" ? "This person is already confirmed on an overlapping event (including travel buffer). Choose someone else or change the times." : dbMessage(error));
    return "Assigned. They have been notified.";
  },
  async cancelAssignment(_f, d) { await db(sb.from("booking_assignments").update({ status: "cancelled" }).eq("id", d.assignment)); return "Removed from this event."; },
  async addNote(f, d) {
    const note = val(f, "note");
    if (!note) fail("Write a note.");
    await db(sb.from("booking_notes").insert({ booking_id: d.booking, note, author_id: profile.id }));
    return "Note added.";
  },
  async setStatus(f, d) {
    const status = val(f, "status");
    const reason = val(f, "reason");
    if (!BOOKING_STATUSES.includes(status)) fail("Choose a status.");
    const patch = { status };
    if (status === "cancelled" || status === "rejected") {
      if (reason.length < 5) fail("Give a reason (at least 5 characters) when cancelling or rejecting.");
      patch.cancellation_reason = reason;
    }
    const data = await db(sb.from("bookings").update(patch).eq("id", d.booking).select("id"));
    if (!data?.length) fail("Booking not found or you don't have permission.");
    return "Status updated. The customer is notified where relevant.";
  },
  async setDelivery(f, d) {
    const date = (n) => (/^\d{4}-\d{2}-\d{2}$/.test(val(f, n)) ? val(f, n) : null);
    const patch = { gallery_expiry_date: date("gallery_expiry_date") };
    if (f.elements.namedItem("photo_expected_delivery")) patch.photo_expected_delivery = date("photo_expected_delivery");
    if (f.elements.namedItem("video_expected_delivery")) patch.video_expected_delivery = date("video_expected_delivery");
    await db(sb.from("bookings").update(patch).eq("id", d.booking));
    return "Dates saved.";
  },
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
async function calendar(params) {
  const today = todayIST();
  const m = /^\d{4}-\d{2}$/.test(params.get("m") ?? "") ? params.get("m") : today.slice(0, 7);
  const first = new Date(`${m}-01T00:00:00Z`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const iso = (x) => x.toISOString().slice(0, 10);
  const shift = (n) => iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1))).slice(0, 7);
  const events = await rows(sb.from("v_admin_calendar").select("*").gte("event_date", iso(first)).lte("event_date", iso(last)).order("start_time"));
  const byDay = {};
  events.forEach((e) => { (byDay[e.event_date] ??= []).push(e); });
  const cells = Array((first.getUTCDay() + 6) % 7).fill(null);
  for (let d = 1; d <= last.getUTCDate(); d++) cells.push(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d))));
  const tone = (st) => ["cancelled", "rejected"].includes(st) ? "background:var(--paper);color:var(--smoke);text-decoration:line-through"
    : ["new_request", "under_review", "quotation_prepared", "quotation_sent", "changes_requested", "tentative"].includes(st) ? "background:var(--bone);border-left:3px solid var(--gold)"
      : "background:var(--ink);color:var(--bone)";
  const title = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return layout("calendar", "Calendar", html`
    <div class="btn-row" style="align-items:center;margin-bottom:1rem"><a class="btn btn-line btn-sm" href="#calendar?m=${shift(-1)}">Previous</a>
      <h2 style="font-size:1.75rem;margin:0 1rem">${title}</h2><a class="btn btn-line btn-sm" href="#calendar?m=${shift(1)}">Next</a></div>
    <p class="small muted" style="margin-bottom:1rem">Gold edge: request or quotation · Black: confirmed · Struck through: cancelled</p>
    <div style="overflow-x:auto"><div style="display:grid;grid-template-columns:repeat(7,minmax(7.5rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line)">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => html`<div class="small muted" style="background:var(--bone);padding:.25rem .5rem">${x}</div>`)}
      ${cells.map((day) => html`<div style="background:var(--paper);min-height:6.5rem;padding:.35rem;${day === today ? "outline:2px solid var(--gold-deep);outline-offset:-2px" : ""}">
        ${day ? html`<p class="small muted">${Number(day.slice(8))}</p>` : ""}
        ${(day ? byDay[day] ?? [] : []).map((e) => html`<a href="#booking/${e.booking_code}" style="display:block;text-decoration:none;font-size:.75rem;line-height:1.3;padding:.3rem;margin-top:.25rem;${tone(e.status)}">
          <b style="font-weight:600">${fmtTime(e.start_time)} ${e.customer_name}</b><br>${e.event_name || e.event_type}, ${e.city}<br>${humanize(e.status)}
          ${e.photographers || e.videographers ? html`<br>${[e.photographers, e.videographers].filter(Boolean).join(" · ")}` : ""}</a>`)}</div>`)}
    </div></div>`);
}

// ---------------------------------------------------------------------------
// Pricing and services (generic editor; only the listed columns are written)
// ---------------------------------------------------------------------------
const ACTIVE = { name: "is_active", label: "Active (visible to customers)", type: "checkbox" };
const SORT = { name: "sort_order", label: "Sort order", type: "number", hint: "Lower numbers appear first" };
const CATS = [["photography", "Photography"], ["videography", "Videography"]];
const ENTITIES = {
  services: { table: "services", label: "Service", summary: ["name", "category", "starting_price", "is_active"], order: "sort_order", fields: [
    { name: "name", label: "Name", type: "text", required: true }, { name: "slug", label: "Page address (slug)", type: "slug", required: true, hint: "e.g. wedding-photography" },
    { name: "category", label: "Category", type: "select", options: CATS }, { name: "short_description", label: "Short description", type: "textarea" },
    { name: "description", label: "Full description", type: "textarea" }, { name: "image_url", label: "Image URL", type: "url", hint: "https link to a wide image" },
    { name: "starting_price", label: "Starting price override (₹)", type: "money", hint: "Leave empty to calculate from packages" },
    { name: "seo_title", label: "SEO title", type: "text" }, { name: "seo_description", label: "SEO description", type: "textarea" }, SORT, ACTIVE] },
  packages: { table: "packages", label: "Package", summary: ["name", "base_price", "is_featured", "is_active"], order: "sort_order", fields: [
    { name: "service_id", label: "Service", type: "ref" }, { name: "name", label: "Name", type: "text", required: true },
    { name: "slug", label: "Slug", type: "slug", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "inclusions", label: "Inclusions (one per line)", type: "lines" }, { name: "base_price", label: "Base price (₹)", type: "money", required: true, hint: "Added to every duration's price" },
    { name: "is_featured", label: "Feature on homepage", type: "checkbox" }, SORT, ACTIVE] },
  package_durations: { table: "package_durations", label: "Duration", summary: ["label", "hours", "extra_price", "is_active"], order: "sort_order", fields: [
    { name: "package_id", label: "Package", type: "hidden" }, { name: "label", label: "Label", type: "text", required: true, hint: "e.g. 8 Hours, Full day" },
    { name: "hours", label: "Hours", type: "number", hint: "Leave empty for a custom duration" }, { name: "extra_price", label: "Price on top of base (₹)", type: "money", required: true },
    { name: "is_custom_quote", label: "Custom quote (no automatic price)", type: "checkbox" }, SORT, ACTIVE] },
  addons: { table: "addons", label: "Add-on", summary: ["name", "category", "price", "is_active"], order: "sort_order", fields: [
    { name: "name", label: "Name", type: "text", required: true }, { name: "category", label: "Applies to", type: "select", options: [["", "Any service"], ...CATS], nullable: true },
    { name: "description", label: "Description", type: "textarea" }, { name: "price", label: "Price (₹)", type: "money", required: true },
    { name: "pricing_unit", label: "Charged", type: "select", options: [["flat", "Once (flat)"], ["per_hour", "Per hour"], ["per_unit", "Per unit"]] },
    { name: "max_quantity", label: "Maximum quantity / hours", type: "number", required: true }, SORT, ACTIVE] },
  travel_slabs: { table: "travel_slabs", label: "Travel slab", summary: ["label", "min_km", "max_km", "charge"], order: "min_km", fields: [
    { name: "label", label: "Label", type: "text", required: true, hint: "e.g. 10–25 km" }, { name: "min_km", label: "From km", type: "number", required: true },
    { name: "max_km", label: "Up to km", type: "number", hint: "Leave empty for no upper limit" }, { name: "charge", label: "Charge (₹)", type: "money", required: true },
    { name: "is_custom_quote", label: "Custom quote (e.g. outstation)", type: "checkbox" }, SORT, ACTIVE] },
  combo_discounts: { table: "combo_discounts", label: "Photo + video discount", summary: ["name", "discount_type", "value", "is_active"], order: "created_at", fields: [
    { name: "name", label: "Name", type: "text", required: true }, { name: "discount_type", label: "Type", type: "select", options: [["flat", "Fixed amount (₹)"], ["percent", "Percentage (%)"]] },
    { name: "value", label: "Value", type: "money", required: true }, { name: "min_subtotal", label: "Minimum subtotal (₹)", type: "money", required: true },
    { name: "valid_from", label: "Valid from", type: "date" }, { name: "valid_to", label: "Valid until", type: "date" }, ACTIVE] },
  event_types: { table: "event_types", label: "Event type", summary: ["name", "sort_order", "is_active"], order: "sort_order", fields: [
    { name: "name", label: "Name", type: "text", required: true }, { name: "slug", label: "Slug", type: "slug", required: true }, SORT, ACTIVE] },
};

function fieldHtml(f, value, refs) {
  if (f.type === "hidden") return "";
  if (f.type === "checkbox") return html`<label class="check small span2"><input type="checkbox" name="${f.name}" ${(value ?? f.name === "is_active") ? html`checked` : ""}> ${f.label}</label>`;
  let control;
  if (f.type === "textarea" || f.type === "lines") control = html`<textarea class="input" name="${f.name}">${Array.isArray(value) ? value.join("\n") : value ?? ""}</textarea>`;
  else if (f.type === "select" || f.type === "ref") {
    const options = f.type === "ref" ? refs : f.options;
    control = html`<select class="input" name="${f.name}">${f.type === "ref" ? opt("", "Choose…") : ""}${options.map(([k, l]) => opt(k, l, String(value ?? (f.type === "ref" ? "" : options[0][0])) === k))}</select>`;
  } else {
    const type = f.type === "number" || f.type === "money" ? "number" : f.type === "date" ? "date" : "text";
    control = html`<input class="input" type="${type}" name="${f.name}" ${type === "number" ? html`step="any"` : ""} ${f.required ? html`required` : ""} value="${value ?? ""}">`;
  }
  const wide = f.type === "textarea" || f.type === "lines";
  return html`<label class="field ${wide ? "span2" : ""}"><span>${f.label}${f.required ? "" : html` <small>(optional)</small>`}</span>${control}${f.hint ? html`<small>${f.hint}</small>` : ""}</label>`;
}

function entityForm(key, row, refs, fixed) {
  const def = ENTITIES[key];
  return html`<form data-action="saveEntity" data-entity="${key}" ${row ? html`data-id="${row.id}"` : ""} ${fixed ? html`data-fixed="${JSON.stringify(fixed)}"` : ""} class="form-grid two" style="margin-top:1rem">
    ${def.fields.map((f) => fieldHtml(f, row?.[f.name], refs))}
    <div class="span2"><button class="btn btn-solid btn-sm">${row ? `Save ${def.label.toLowerCase()}` : `Add ${def.label.toLowerCase()}`}</button></div>${msg}</form>`;
}

function show(field, v) {
  if (typeof v === "boolean") return field === "is_active" ? (v ? "Active" : "Hidden") : v ? "Yes" : "No";
  if (v == null || v === "") return "—";
  if (/price|charge|value|subtotal/.test(field) && typeof v === "number") return inr(v);
  return typeof v === "string" ? humanize(v) : String(v);
}

function entityList(key, list, refs, fixed, addLabel) {
  const def = ENTITIES[key];
  return html`${!list.length ? html`<p class="muted small" style="padding:.5rem 0">No ${def.label.toLowerCase()}s yet.</p>` : ""}
    <ul class="rows">${list.map((row) => html`<li><details>
      <summary style="cursor:pointer;display:grid;grid-template-columns:2fr repeat(3,1fr);gap:.75rem">${def.summary.map((c, i) => html`<span class="${i ? "muted small num" : ""}" style="${i ? "" : "font-weight:500"}">${show(c, row[c])}</span>`)}</summary>
      ${isSuper ? html`${entityForm(key, row, refs, fixed)}
        <form data-action="deleteEntity" data-entity="${key}" data-id="${row.id}" data-confirm="${`Delete this ${def.label.toLowerCase()}? Items used in bookings cannot be deleted — hide them instead.`}" style="margin-top:.5rem">
          <button class="btn btn-sm" style="color:var(--danger);padding-left:0">Delete</button>${msg}</form>` : html`<p class="muted small" style="margin-top:.75rem">Only a super administrator can edit this.</p>`}
    </details></li>`)}</ul>
    ${isSuper ? html`<details style="margin-top:.75rem"><summary class="btn btn-line btn-sm" style="cursor:pointer">${addLabel ?? `Add ${def.label.toLowerCase()}`}</summary>
      <div class="card" style="margin-top:.75rem">${entityForm(key, null, refs, fixed)}</div></details>` : ""}`;
}

const PRICING_TABS = [["packages", "Packages and durations"], ["services", "Services"], ["addons", "Add-ons"], ["travel_slabs", "Travel"], ["combo_discounts", "Photo + video discount"], ["event_types", "Event types"]];
async function pricing(tab) {
  if (!PRICING_TABS.some(([k]) => k === tab)) tab = "packages";
  const services = await rows(sb.from("services").select("*").order("category").order("sort_order"));
  const refs = services.map((x) => [x.id, `${x.name}${x.is_active ? "" : " (hidden)"}`]);
  let body;
  if (tab === "packages") {
    const pkgs = await rows(sb.from("packages").select("*, package_durations(*)").order("sort_order"));
    body = html`${h2("Packages")}<p class="muted small" style="margin:.25rem 0 1rem">Customer price for a duration = the package's base price + that duration's price.</p>
      ${entityList("packages", pkgs, refs)}
      ${pkgs.length ? html`<div style="margin-top:3rem">${h2("Durations and prices")}${services.map((sv) => {
        const own = pkgs.filter((p) => p.service_id === sv.id);
        return own.length ? html`<h3 style="margin-top:2rem;font-size:1.5rem">${sv.name}</h3>${own.map((p) => html`<div style="margin-top:1rem;border-left:2px solid var(--gold);padding-left:1rem">
          <p style="font-weight:500">${p.name} <span class="muted small" style="font-weight:400">base ${inr(p.base_price)}</span></p>
          ${entityList("package_durations", [...(p.package_durations ?? [])].sort((x, y) => x.sort_order - y.sort_order), [], { package_id: p.id }, `Add duration to ${p.name}`)}</div>`)}` : "";
      })}</div>` : ""}`;
  } else {
    const def = ENTITIES[tab];
    const list = tab === "services" ? services : await rows(sb.from(def.table).select("*").order(def.order));
    body = entityList(tab, list, refs);
  }
  return layout("pricing", "Pricing and services", html`
    ${!isSuper ? html`<p class="notice small" style="margin-bottom:1.5rem">You can view pricing. Only a super administrator can change it.</p>` : ""}
    <nav class="btn-row" style="margin-bottom:2rem">${PRICING_TABS.map(([k, l]) => html`<a class="btn btn-sm ${k === tab ? "btn-solid" : "btn-line"}" href="#pricing/${k}">${l}</a>`)}</nav>
    ${body}`);
}

ACTIONS.saveEntity = async (f, d) => {
  const def = ENTITIES[d.entity] ?? fail("Unknown item type.");
  const values = d.fixed ? JSON.parse(d.fixed) : {};
  for (const fd of def.fields) {
    if (fd.type === "hidden") continue;
    const v = val(f, fd.name);
    switch (fd.type) {
      case "checkbox": values[fd.name] = v === true; break;
      case "number": case "money": {
        const n = num(f, fd.name);
        if (n == null && fd.required) fail(`${fd.label} is required.`);
        if (fd.type === "money" && n != null && n < 0) fail(`${fd.label} cannot be negative.`);
        values[fd.name] = n; break;
      }
      case "lines": values[fd.name] = String(v).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 50); break;
      case "slug": if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) fail(`${fd.label}: use lowercase letters, numbers and single hyphens.`); values[fd.name] = v; break;
      case "url": if (v && !/^https:\/\/\S+$/.test(v)) fail(`${fd.label} must start with https://`); values[fd.name] = v || null; break;
      case "ref": if (!UUID.test(v)) fail(`Choose a ${fd.label.toLowerCase()}.`); values[fd.name] = v; break;
      case "select": values[fd.name] = v === "" && fd.nullable ? null : v; break;
      default: if (!v && fd.required) fail(`${fd.label} is required.`); values[fd.name] = v || null;
    }
  }
  if (d.id) {
    const data = await db(sb.from(def.table).update(values).eq("id", d.id).select("id"));
    if (!data?.length) fail("Not saved — you may not have permission to change this.");
  } else {
    await db(sb.from(def.table).insert(values));
  }
  return d.id ? `${def.label} saved.` : `${def.label} added.`;
};
ACTIONS.deleteEntity = async (_f, d) => {
  const def = ENTITIES[d.entity] ?? fail("Unknown item type.");
  const data = await db(sb.from(def.table).delete().eq("id", d.id).select("id"));
  if (!data?.length) fail("Not deleted — you may not have permission.");
  return `${def.label} deleted.`;
};

// ---------------------------------------------------------------------------
// Users and staff
// ---------------------------------------------------------------------------
async function users(params) {
  const filter = ROLES.includes(params.get("role")) ? params.get("role") : "";
  let q = sb.from("profiles").select("id, role, full_name, email, is_active").order("role").order("full_name").limit(500);
  q = filter ? q.eq("role", filter) : q.neq("role", "customer");
  const [list, staff] = await Promise.all([rows(q), rows(sb.from("staff_profiles").select("profile_id, skills"))]);
  const skillsOf = Object.fromEntries(staff.map((x) => [x.profile_id, x.skills]));
  return layout("users", "Users and staff", html`
    <p class="measure muted" style="margin-bottom:1.5rem">To add a team member, ask them to sign in once on the website, then find them under Customer and set their role here.
      Skills decide which events someone can be assigned to — an owner who shoots can be a super administrator with photographer skills.</p>
    <nav class="btn-row" style="margin-bottom:1.5rem"><a class="btn btn-sm ${!filter ? "btn-solid" : "btn-line"}" href="#users">Team</a>
      ${ROLES.map((r) => html`<a class="btn btn-sm ${filter === r ? "btn-solid" : "btn-line"}" href="#users?role=${r}">${humanize(r)}</a>`)}</nav>
    <ul class="rows">${list.map((p) => html`<li><details>
      <summary style="cursor:pointer;display:grid;grid-template-columns:2fr 2fr 1fr 1fr;gap:.75rem"><span style="font-weight:500">${p.full_name || "—"}</span><span class="muted small">${p.email}</span>
        <span class="small">${humanize(p.role)}</span><span class="muted small">${!p.is_active ? "Deactivated" : skillsOf[p.id]?.length ? "Assignable" : ""}</span></summary>
      ${isSuper ? html`<div class="grid2" style="margin-top:1rem;gap:1.5rem">
        <form data-action="setRole" data-profile="${p.id}" style="display:grid;gap:.75rem;align-content:start">
          <label class="field"><span>Role</span><select class="input" name="role">${ROLES.map((r) => opt(r, humanize(r), r === p.role))}</select></label>
          <label class="check small"><input type="checkbox" name="is_active" ${p.is_active ? html`checked` : ""}> Active</label>
          <div><button class="btn btn-solid btn-sm">Save role</button></div>${msg}</form>
        <form data-action="setSkills" data-profile="${p.id}" style="display:grid;gap:.4rem;align-content:start"><p class="small" style="font-weight:500">Can be assigned as</p>
          ${SKILLS.map((sk) => html`<label class="check small"><input type="checkbox" name="skill_${sk}" ${skillsOf[p.id]?.includes(sk) ? html`checked` : ""}> ${humanize(sk)}</label>`)}
          <div style="margin-top:.5rem"><button class="btn btn-solid btn-sm">Save skills</button></div>${msg}</form></div>`
        : html`<p class="muted small" style="margin-top:.75rem">Only a super administrator can change roles and skills.</p>`}
    </details></li>`)}</ul>`);
}
ACTIONS.setRole = async (f, d) => {
  const role = val(f, "role");
  if (!ROLES.includes(role)) fail("Choose a role.");
  await rpc("admin_set_user_role", { p_profile_id: d.profile, p_role: role, p_active: val(f, "is_active") === true });
  return "Role updated.";
};
ACTIONS.setSkills = async (f, d) => {
  const skills = SKILLS.filter((sk) => val(f, `skill_${sk}`) === true);
  await db(sb.from("staff_profiles").upsert({ profile_id: d.profile, skills, is_active: skills.length > 0 }));
  return skills.length ? "Skills saved. This person can now be assigned to events." : "Removed from assignable staff.";
};

// ---------------------------------------------------------------------------
// Settings (super admin)
// ---------------------------------------------------------------------------
const SETTING_GROUPS = [
  ["Business and website", (k) => k.startsWith("business_") || k.startsWith("social_") || ["site_url", "admin_notification_email"].includes(k)],
  ["Homepage content", (k) => ["hero_heading", "hero_subheading", "hero_image_url", "about_heading", "about_text", "why_choose_us", "faq", "portfolio_images", "featured_videos"].includes(k)],
  ["Policies", (k) => k.startsWith("policy_")],
  ["Downloads and media", (k) => k.startsWith("download_") || k.includes("mime") || k.startsWith("max_") || k.includes("albums") || ["preview_before_payment", "originals_require", "repeat_download_counts"].includes(k)],
  ["Bookings, quotations and tax", () => true],
];
async function settings() {
  if (!isSuper) return layout("settings", "Settings", html`<p class="notice">Only a super administrator can change settings.</p>`);
  const list = await rows(sb.from("settings").select("key, value, description, is_public, updated_at").order("key"));
  const used = new Set();
  return layout("settings", "Settings", html`
    <p class="measure muted" style="margin-bottom:2rem">Values are JSON: text in double quotes (<code>"My Studio"</code>), numbers plain (<code>5</code>), switches <code>true</code> / <code>false</code>.
      Lists such as <code>faq</code> use <code>[{"q":"Question?","a":"Answer."}]</code>. Settings marked public appear on the website.</p>
    ${SETTING_GROUPS.map(([title, match]) => {
      const items = list.filter((r) => !used.has(r.key) && match(r.key));
      items.forEach((r) => used.add(r.key));
      return items.length ? html`<section style="margin-bottom:2.5rem">${h2(title)}<ul class="rows" style="margin-top:.75rem">${items.map((r) => html`<li><details>
        <summary style="cursor:pointer;display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem"><span style="font-weight:500">${r.key}${r.is_public ? html` <span class="small" style="color:var(--gold-deep)">public</span>` : ""}</span>
          <span class="muted small" style="max-width:28rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${JSON.stringify(r.value)}</span></summary>
        <form data-action="saveSetting" data-key="${r.key}" style="display:grid;gap:.5rem;margin-top:.75rem">${r.description ? html`<p class="muted small">${r.description}</p>` : ""}
          <textarea class="input" name="value" style="min-height:7rem;font-family:ui-monospace,monospace;font-size:.85rem" aria-label="${`Value for ${r.key}`}">${JSON.stringify(r.value, null, 2)}</textarea>
          <div class="btn-row" style="align-items:center"><button class="btn btn-solid btn-sm">Save</button><span class="muted small">Last changed ${fmtDateTime(r.updated_at)}</span></div>${msg}</form>
      </details></li>`)}</ul></section>` : "";
    })}`);
}
ACTIONS.saveSetting = async (f, d) => {
  let value;
  try { value = JSON.parse(val(f, "value")); } catch { fail('Not valid JSON. Text needs double quotes, e.g. "My Studio".'); }
  const data = await db(sb.from("settings").update({ value, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("key", d.key).select("key"));
  if (!data?.length) fail("Not saved — only a super administrator can change settings.");
  return `Saved ${d.key}.`;
};

// ---------------------------------------------------------------------------
// Email log & audit log
// ---------------------------------------------------------------------------
async function emails(params) {
  const st = ["queued", "sending", "sent", "failed"].includes(params.get("status")) ? params.get("status") : "";
  let q = sb.from("email_logs").select("id, template_key, to_email, subject, status, attempts, last_error, sent_at, created_at, bookings(booking_code)").order("created_at", { ascending: false }).limit(200);
  if (st) q = q.eq("status", st);
  const list = await rows(q);
  return layout("emails", "Email log", html`
    <nav class="btn-row" style="margin-bottom:1.5rem">${["", "queued", "sent", "failed"].map((x) => html`<a class="btn btn-sm ${st === x ? "btn-solid" : "btn-line"}" href="#emails${x ? `?status=${x}` : ""}">${x ? humanize(x) : "All"}</a>`)}</nav>
    <p class="muted small" style="margin-bottom:1rem">Queued emails are sent every 2 minutes. If they stay queued, check Step 5 of the setup guide.</p>
    ${!list.length ? html`<p class="muted">No emails.</p>` : html`<ul class="rows">${list.map((r) => html`<li style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem">
      <span><span style="font-weight:500">${r.subject ?? humanize(r.template_key)}</span>
        <span class="muted small" style="display:block">To ${r.to_email}${r.bookings ? ` · ${r.bookings.booking_code}` : ""} · ${fmtDateTime(r.sent_at ?? r.created_at)}${r.attempts > 1 ? ` · ${r.attempts} attempts` : ""}</span>
        ${r.last_error ? html`<span class="small danger" style="display:block">${r.last_error}</span>` : ""}</span>${badge(r.status)}</li>`)}</ul>`}`);
}

const MODULES = ["bookings", "quotations", "payments", "staff_assignment", "pricing", "catalog", "customers", "users", "settings", "media", "reviews", "support", "auth", "system"];
async function audit(params) {
  const mod = MODULES.includes(params.get("module")) ? params.get("module") : "";
  let q = sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(150);
  if (mod) q = q.eq("module", mod);
  const list = await rows(q);
  const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))];
  const actors = ids.length ? await rows(sb.from("profiles").select("id, full_name, email").in("id", ids)) : [];
  const who = Object.fromEntries(actors.map((a) => [a.id, a.full_name || a.email]));
  const short = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80));
  return layout("audit", "Audit log", html`
    <p class="measure muted small" style="margin-bottom:1rem">Every change to bookings, prices, quotations, payments, staff and settings is recorded and cannot be edited or deleted. Latest 150 shown.</p>
    <nav class="btn-row" style="margin-bottom:1.5rem"><a class="btn btn-sm ${!mod ? "btn-solid" : "btn-line"}" href="#audit">All</a>
      ${MODULES.map((m) => html`<a class="btn btn-sm ${mod === m ? "btn-solid" : "btn-line"}" href="#audit?module=${m}">${humanize(m)}</a>`)}</nav>
    <ul class="rows">${list.map((r) => {
      const keys = Object.keys(r.new_value ?? r.old_value ?? {}).filter((k) => k !== "updated_at").slice(0, 10);
      return html`<li style="display:grid;gap:.5rem;grid-template-columns:minmax(9rem,11rem) 1fr">
        <div class="small"><p>${fmtDateTime(r.created_at)}</p><p class="muted">${r.actor_id ? who[r.actor_id] ?? "User" : "System"} · ${humanize(r.actor_role)}</p></div>
        <div><p><b style="font-weight:500">${humanize(r.action)}</b> · ${humanize(r.module)}${r.table_name ? ` · ${r.table_name}` : ""}</p>
          ${r.reason ? html`<p class="small">Reason: ${r.reason}</p>` : ""}
          ${keys.length ? html`<dl class="small" style="display:grid;grid-template-columns:auto 1fr;gap:0 .75rem;margin-top:.25rem">${keys.map((k) => html`<dt class="muted">${k}</dt>
            <dd style="margin:0;word-break:break-all">${r.old_value && r.new_value ? html`<span class="muted" style="text-decoration:line-through">${short(r.old_value[k])}</span> → ${short(r.new_value[k])}` : short((r.new_value ?? r.old_value)[k])}</dd>`)}</dl>` : ""}</div></li>`;
    })}</ul>`);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
async function route() {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const [section, arg] = path.split("/");
  try {
    let content;
    if (section === "bookings") content = await bookings(params);
    else if (section === "booking" && arg) content = await booking(decodeURIComponent(arg));
    else if (section === "calendar") content = await calendar(params);
    else if (section === "pricing") content = await pricing(arg);
    else if (section === "users") content = await users(params);
    else if (section === "settings") content = await settings();
    else if (section === "emails") content = await emails(params);
    else if (section === "audit") content = await audit(params);
    else content = await dashboard();
    mount("#main", content);
    setMeta(`${$("#main h1")?.textContent ?? "Admin"} — Admin`);
    $("#signout")?.addEventListener("click", signOut);
    $("#printq")?.addEventListener("click", () => window.print());
  } catch (err) {
    pageError("#main", err);
  }
}

try {
  profile = await requireRole(["super_admin", "manager"]);
  isSuper = profile.role === "super_admin";
  await renderShell();
  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); route(); });
  await route();
} catch (err) { pageError("#main", err); }
void raw;

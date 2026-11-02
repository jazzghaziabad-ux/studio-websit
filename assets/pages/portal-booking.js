import {
  html, mount, renderShell, sb, requireRole, inr, fmtDate, fmtTime, humanize, todayIST, badge, params,
  setMeta, pageError, getSettings, sText, dbMessage, $,
} from "../core.js";
import { quotationDoc, timeline } from "../components.js";

const METHOD = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

async function load() {
  const code = params().get("code") ?? "";
  // RLS: someone else's booking code simply returns no row.
  const { data: b, error } = await sb.from("bookings").select("*, customers(full_name, email, phone), event_types(name)").eq("booking_code", code).maybeSingle();
  if (error) throw error;
  if (!b) {
    mount("#main", html`<div class="wrap section"><h1>Booking not found</h1><p class="muted" style="margin-top:1rem">Check the link, or sign in with the email you booked with. <a class="link" href="portal.html">My bookings</a></p></div>`);
    return;
  }
  const [versions, milestones, payments, s] = await Promise.all([
    sb.from("quotation_versions").select("*, quotation_items(*), quotations(quotation_number, current_version)").eq("booking_id", b.id).order("version", { ascending: false }),
    sb.from("booking_milestones").select("id, milestone, occurred_at").eq("booking_id", b.id).order("occurred_at"),
    sb.from("manual_payments").select("*").eq("booking_id", b.id).order("payment_date"),
    getSettings(),
  ]);
  const label = b.event_name || b.event_types?.name || "Your booking";
  setMeta(`Booking ${b.booking_code}`);
  const vs = versions.data ?? [];
  const current = vs[0]; // drafts are already hidden by RLS
  const canRespond = current && current.status === "sent" && current.valid_until >= todayIST();
  const confirmed = Boolean(b.active_snapshot_id);
  const business = { name: sText(s, "business_name", "Studio"), phone: sText(s, "business_phone"), email: sText(s, "business_email"), address: sText(s, "business_address") };
  const statusLine = current && ({
    sent: canRespond ? `Please review and respond by ${fmtDate(current.valid_until)}.` : "This quotation has passed its valid-until date. Contact us for an updated one.",
    changes_requested: "Thanks — we received your change request and are preparing a revised quotation.",
    accepted: `You accepted this quotation on ${fmtDate(current.accepted_at)}. The price is locked.`,
    expired: "This quotation has expired. Contact us for an updated one.",
  })[current.status];

  mount("#main", html`<div class="wrap section">
    <p class="small no-print"><a class="link" href="portal.html">My bookings</a></p>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1.25rem;margin:1rem 0 2.5rem">
      <div><h1 style="font-size:2.75rem">${label}</h1><p class="muted small" style="margin-top:.5rem">Booking ID ${b.booking_code}</p></div>${badge(b.status)}</div>
    <div class="grid2 grid-aside" style="align-items:start">
      <div style="display:grid;gap:3rem">
        <section class="no-print"><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Event</h2>
          <p style="margin-top:.5rem">${fmtDate(b.event_date)}, ${fmtTime(b.start_time)} to ${fmtTime(b.end_time)}<br>${b.location}, ${b.city}</p></section>

        <section id="quotation"><h2 class="no-print" style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Quotation</h2>
          ${!current ? html`<p style="margin-top:.5rem">We are preparing your quotation. You will get an email when it is ready.</p>
            <p style="margin-top:.75rem">Your estimate: <b class="num" style="font-weight:500">${inr(b.estimated_amount)}</b></p>
            <p class="muted small">This amount is an estimate. Final pricing is confirmed through the official quotation.</p>` : html`
            ${statusLine ? html`<p class="no-print" style="margin-top:.5rem">${statusLine}</p>` : ""}
            <div style="margin-top:1rem">${quotationDoc({ version: current, number: current.quotations?.quotation_number ?? "", business, customer: b.customers,
              booking: { booking_code: b.booking_code, event_label: label, event_date: b.event_date, location: `${b.location}, ${b.city}` } })}</div>
            <p class="no-print" style="margin-top:.75rem"><button class="btn btn-line btn-sm" type="button" id="print">Download quotation (print or save as PDF)</button></p>
            ${canRespond ? html`<div class="grid2 no-print" style="margin-top:1.5rem;gap:1.5rem">
              <form id="accept" class="form-grid" style="border-top:2px solid var(--ink);padding-top:1rem">
                <p style="font-weight:500">Accept quotation</p>
                <label class="check small"><input type="checkbox" name="agree"> <span>I accept this quotation of ${inr(current.total, true)} and its terms.</span></label>
                <p class="alert" hidden></p><div><button class="btn btn-solid">Accept quotation</button></div></form>
              <form id="changes" class="form-grid" style="border-top:2px solid var(--line);padding-top:1rem">
                <label class="field"><span>Request changes</span><textarea class="input" name="message" minlength="5" maxlength="2000" placeholder="Please describe the changes you require."></textarea></label>
                <p class="alert" hidden></p><div><button class="btn btn-line">Request changes</button></div></form>
            </div>` : ""}
            ${vs.length > 1 ? html`<details class="no-print small" style="margin-top:1.5rem"><summary style="cursor:pointer">Earlier versions</summary>
              <ul>${vs.slice(1).map((v) => html`<li>V${v.version} · ${humanize(v.status)} · ${inr(v.total)}</li>`)}</ul></details>` : ""}`}
        </section>

        ${confirmed ? html`<section class="no-print"><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Payments</h2>
          <dl class="money" style="margin-top:.75rem"><div><dt>Total</dt><dd class="num">${inr(b.total_amount)}</dd></div><div><dt>Paid</dt><dd class="num">${inr(b.paid_amount)}</dd></div><div><dt>Balance</dt><dd class="num">${inr(b.balance_amount)}</dd></div></dl>
          <p style="margin-top:.5rem">${badge(b.payment_status)}</p>
          ${Number(b.balance_amount) > 0 ? html`<p style="margin-top:.75rem">Please contact us for payment instructions. We accept UPI, bank transfer, cheque and cash.</p>` : ""}
          ${(payments.data ?? []).length ? html`<ul class="rows small" style="margin-top:1rem">${payments.data.map((p) => html`<li style="display:flex;justify-content:space-between;gap:1rem">
            <span>${fmtDate(p.payment_date)} · ${METHOD[p.payment_method]}</span><span class="num">${inr(p.amount, true)} <span class="muted">${p.status === "confirmed" ? "confirmed" : "being verified"}</span></span></li>`)}</ul>` : ""}
        </section>` : ""}

        ${confirmed ? html`<section class="no-print grid2" style="gap:1.25rem">
          ${b.includes_photography ? html`<div class="card"><p style="font-weight:600">Photography</p><p>Status: ${humanize(b.photo_status)}</p>
            <p class="muted small">Expected: ${b.photo_expected_delivery ? fmtDate(b.photo_expected_delivery) : "set after your event"}</p></div>` : ""}
          ${b.includes_videography ? html`<div class="card"><p style="font-weight:600">Videography</p><p>Status: ${humanize(b.video_status)}</p>
            <p class="muted small">Expected: ${b.video_expected_delivery ? fmtDate(b.video_expected_delivery) : "set after your event"}</p></div>` : ""}
        </section>` : ""}
      </div>
      <aside class="no-print"><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Progress</h2><div style="margin-top:1rem">${timeline(milestones.data ?? [])}</div></aside>
    </div></div>`);

  $("#print")?.addEventListener("click", () => window.print());
  $("#accept")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = e.target.querySelector(".alert");
    if (!e.target.elements.namedItem("agree").checked) { err.hidden = false; err.textContent = "Tick the box to confirm you accept the quotation and its terms."; return; }
    const btn = e.target.querySelector("button"); btn.disabled = true;
    const { error: rpcError } = await sb.rpc("accept_quotation", { p_version_id: current.id });
    if (rpcError) { err.hidden = false; err.textContent = dbMessage(rpcError); btn.disabled = false; return; }
    await load();
  });
  $("#changes")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = e.target.querySelector(".alert");
    const message = e.target.elements.namedItem("message").value.trim();
    if (message.length < 5) { err.hidden = false; err.textContent = "Please describe the changes you require."; return; }
    const btn = e.target.querySelector("button"); btn.disabled = true;
    const { error: rpcError } = await sb.rpc("request_quotation_changes", { p_version_id: current.id, p_message: message });
    if (rpcError) { err.hidden = false; err.textContent = dbMessage(rpcError); btn.disabled = false; return; }
    await load();
  });
}

try {
  await requireRole(["customer"]);
  await renderShell();
  await load();
} catch (err) { pageError("#main", err); }

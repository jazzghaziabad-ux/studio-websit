import { html, inr, fmtDate, fmtDateTime, humanize, startingPrice, safeUrl } from "./core.js";

export const intro = (title, text) => html`<div class="wrap intro"><h1>${title}</h1>${text ? html`<p>${text}</p>` : ""}</div>`;

/** Editorial service list: name, one line, starting price. */
export function serviceIndex(services, packages) {
  if (!services.length) return html`<p class="muted">Services will appear here once they are published.</p>`;
  return html`<ul class="index">${services.map((s) => {
    const from = startingPrice(s, packages);
    return html`<li><a href="service.html?slug=${encodeURIComponent(s.slug)}">
      <span><span class="name">${s.name}</span>${s.short_description ? html`<span class="muted" style="display:block;margin-top:.25rem">${s.short_description}</span>` : ""}</span>
      <span class="muted num">${from != null ? `from ${inr(from)}` : "Price on request"}</span></a></li>`;
  })}</ul>`;
}

/** Rate sheet: packages as rows, durations as priced lines. */
export function rateSheet(packages, services) {
  const groups = services
    .map((s) => ({ s, pkgs: packages.filter((p) => p.service_id === s.id && (p.package_durations ?? []).length) }))
    .filter((g) => g.pkgs.length);
  if (!groups.length) return html`<p class="muted">Packages are being finalised. Request a quote and we will price your event individually.</p>`;
  return html`<div style="display:grid;gap:3.5rem">${groups.map(({ s, pkgs }) => html`
    <section><h3>${s.name}</h3><div style="display:grid;gap:2rem;margin-top:1.25rem">${pkgs.map((p) => html`
      <article class="pkg">
        <div>
          <p style="font-size:1.25rem;font-weight:500">${p.name}</p>
          ${p.description ? html`<p class="muted" style="margin-top:.5rem">${p.description}</p>` : ""}
          ${(p.inclusions ?? []).length ? html`<ul>${p.inclusions.map((i) => html`<li>${i}</li>`)}</ul>` : ""}
        </div>
        <table class="rates"><caption class="skip">${p.name} prices</caption><tbody>${p.package_durations.map((d) => html`
          <tr><th scope="row">${d.label}</th><td class="num">${d.is_custom_quote ? "Custom quote" : inr(Number(p.base_price) + Number(d.extra_price))}</td></tr>`)}
        </tbody></table>
      </article>`)}</div></section>`)}</div>`;
}

export function addonList(addons) {
  if (!addons.length) return "";
  const unit = (a) => (a.pricing_unit === "per_hour" ? " per hour" : a.pricing_unit === "per_unit" ? " each" : "");
  return html`<table class="rates"><tbody>${addons.map((a) => html`
    <tr><th scope="row">${a.name}${a.description ? html`<span class="muted small" style="display:block">${a.description}</span>` : ""}</th>
    <td class="num">${inr(a.price)}${unit(a)}</td></tr>`)}</tbody></table>`;
}

export function stars(rating) {
  const r = Math.round(Number(rating) || 0);
  return html`<span class="stars" role="img" aria-label="${r} out of 5 stars">${"★".repeat(r)}<span class="off">${"★".repeat(5 - r)}</span></span>`;
}

export function reviewList(reviews) {
  if (!reviews.length) return html`<p class="muted">Reviews from our clients will appear here.</p>`;
  return html`<div class="reviews">${reviews.map((r) => html`
    <figure style="margin:0">${stars(r.rating)}<blockquote>“${r.feedback}”</blockquote>
      <figcaption class="muted small" style="margin-top:.75rem">${r.display_name}${r.event_type_name ? `, ${r.event_type_name}` : ""}
      <span style="color:var(--gold-deep);margin-left:.5rem">Verified customer</span></figcaption></figure>`)}</div>`;
}

export function faqList(items) {
  if (!items.length) return "";
  return html`<div class="faq">${items.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div>`;
}

export function videoEmbed(v) {
  const id = String(v.youtube_id ?? v.vimeo_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) return "";
  const src = v.youtube_id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : `https://player.vimeo.com/video/${id}`;
  return html`<figure style="margin:0"><div class="video"><iframe src="${src}" title="${v.title}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>
    <figcaption class="muted" style="margin-top:.75rem">${v.title}</figcaption></figure>`;
}

export function gallery(images) {
  return html`<div class="gallery">${images.map((p) => {
    const url = safeUrl(p.url);
    return url ? html`<img src="${url}" alt="${p.alt ?? ""}" loading="lazy">` : "";
  })}</div>`;
}

const MILESTONES = {
  booking_request: "Booking request", quotation_prepared: "Quotation prepared", quotation_sent: "Quotation sent",
  quotation_accepted: "Quotation accepted", booking_confirmed: "Booking confirmed", payment_confirmed: "Payment confirmed",
  fully_paid: "Fully paid", photographer_assigned: "Photographer assigned", videographer_assigned: "Videographer assigned",
  event_completed: "Event completed", photos_uploaded: "Photos uploaded", photos_editing: "Photos editing", photos_ready: "Photos ready",
  videos_uploaded: "Videos uploaded", videos_editing: "Videos editing", videos_color_grading: "Videos colour grading",
  videos_ready: "Videos ready", gallery_published: "Gallery published", downloads_available: "Downloads available",
  first_download: "First download", feedback_submitted: "Feedback submitted", downloads_unlocked: "Downloads unlocked",
  album_selection_submitted: "Album selection submitted",
};
export function timeline(milestones) {
  if (!milestones.length) return html`<p class="muted">No updates yet.</p>`;
  return html`<ol class="timeline">${milestones.map((m) => html`
    <li><p style="font-weight:500">${MILESTONES[m.milestone] ?? humanize(m.milestone)}</p><p class="muted small">${fmtDateTime(m.occurred_at)}</p></li>`)}</ol>`;
}

/** Quotation document — same layout for screen and print ("Save as PDF"). */
export function quotationDoc({ version: v, number, business, customer, booking }) {
  const items = [...(v.quotation_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const n = (x) => Number(x || 0);
  return html`<article class="doc">
    <header style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:1.5rem;border-bottom:1px solid var(--charcoal);padding-bottom:1.25rem">
      <div><p class="display" style="font-size:1.9rem">${business.name}</p>
        <p class="muted small" style="margin-top:.25rem">${business.address}<br>${business.phone} · ${business.email}</p></div>
      <div style="text-align:right"><p class="display" style="font-size:1.5rem">Quotation</p>
        <p class="small">${number} · Version ${v.version}</p>
        <p class="muted small">Issued ${fmtDate(v.sent_at ?? v.created_at)}</p>
        <p class="small">Valid until <b style="font-weight:500">${fmtDate(v.valid_until)}</b></p>
        ${v.status !== "sent" ? html`<p class="small" style="font-weight:500;margin-top:.25rem">${humanize(v.status)}</p>` : ""}</div>
    </header>
    <section style="display:grid;gap:1.25rem;padding-block:1.25rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))">
      <div><p class="muted small">Prepared for</p><p style="font-weight:500">${customer.full_name}</p><p class="small">${customer.phone}<br>${customer.email}</p></div>
      <div><p class="muted small">Event</p><p style="font-weight:500">${booking.event_label}</p><p class="small">${fmtDate(booking.event_date)}<br>${booking.location}<br>Booking ${booking.booking_code}</p></div>
    </section>
    <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
      ${items.map((i) => html`<tr><td>${i.description}</td><td class="r num">${n(i.quantity)}</td><td class="r num">${inr(i.unit_price, true)}</td><td class="r num">${inr(i.amount, true)}</td></tr>`)}
    </tbody></table>
    <dl class="totals">
      <dt>Services</dt><dd>${inr(v.subtotal, true)}</dd>
      ${n(v.travel_charge) > 0 ? html`<dt>Travel</dt><dd>${inr(v.travel_charge, true)}</dd>` : ""}
      ${n(v.discount_amount) > 0 ? html`<dt>${v.discount_note || "Discount"}</dt><dd>−${inr(v.discount_amount, true)}</dd>` : ""}
      ${n(v.tax_rate) > 0 ? html`<dt>GST ${n(v.tax_rate)}%</dt><dd>${inr(v.tax_amount, true)}</dd>` : ""}
      <dt class="grand">Total</dt><dd class="grand">${inr(v.total, true)}</dd>
    </dl>
    ${v.notes ? html`<section style="margin-top:2rem"><p class="small" style="font-weight:500">Notes</p><p class="prose small">${v.notes}</p></section>` : ""}
    ${v.terms ? html`<section style="margin-top:1.5rem"><p class="small" style="font-weight:500">Terms</p><p class="prose small muted">${v.terms}</p></section>` : ""}
    <p class="muted small" style="margin-top:2rem">No online payment is taken. On acceptance, payment can be made by UPI, bank transfer, cheque or cash; every payment is confirmed in your account.</p>
  </article>`;
}

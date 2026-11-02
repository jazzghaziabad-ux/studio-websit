import { html, mount, renderShell, sb, requireRole, inr, fmtDate, todayIST, badge, setMeta, pageError, signOut, $ } from "../core.js";

try {
  const profile = await requireRole(["customer"]);
  await renderShell();
  setMeta("My bookings");
  const [{ data, error }, { count: unread }] = await Promise.all([
    sb.from("bookings").select("id, booking_code, event_date, event_name, city, status, estimated_amount, total_amount, event_types(name)").order("event_date", { ascending: false }),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (error) throw error;
  const today = todayIST();
  const row = (r) => html`<li><a class="row" href="portal-booking.html?code=${encodeURIComponent(r.booking_code)}">
    <span><span style="font-weight:500">${r.event_name || r.event_types?.name}</span><span class="muted small" style="display:block">${r.booking_code}</span></span>
    <span>${fmtDate(r.event_date)}, ${r.city}</span>${badge(r.status)}
    <span class="num">${Number(r.total_amount) > 0 ? inr(r.total_amount) : `est. ${inr(r.estimated_amount)}`}</span></a></li>`;
  const upcoming = data.filter((r) => r.event_date >= today);
  const past = data.filter((r) => r.event_date < today);
  mount("#main", html`<div class="wrap section">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1.25rem;margin-bottom:2rem">
      <div><h1 style="font-size:2.75rem">My bookings</h1><p class="muted small" style="margin-top:.5rem">${profile.email}</p></div>
      <div class="btn-row"><a class="btn btn-line btn-sm" href="notifications.html">Notifications${unread ? ` (${unread})` : ""}</a>
        <a class="btn btn-solid btn-sm" href="book.html">New booking</a><button class="btn btn-line btn-sm" id="out" type="button">Sign out</button></div></div>
    ${!data.length ? html`<div class="card" style="text-align:center;padding:3rem"><p style="font-size:1.125rem;font-weight:500">No bookings on this account yet</p>
        <p class="muted" style="margin-top:.5rem">If you booked with a different email address, sign in with that one.</p><a class="btn btn-solid" style="margin-top:1.25rem" href="book.html">Start a booking</a></div>` : ""}
    ${upcoming.length ? html`<h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600;margin-bottom:.75rem">Upcoming</h2><ul class="rows" style="margin-bottom:2.5rem">${upcoming.map(row)}</ul>` : ""}
    ${past.length ? html`<h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600;margin-bottom:.75rem">Completed and past</h2><ul class="rows">${past.map(row)}</ul>` : ""}
  </div>`);
  $("#out").addEventListener("click", signOut);
} catch (err) { pageError("#main", err); }

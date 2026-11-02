import { html, mount, renderShell, sb, todayIST, setMeta, $ } from "../core.js";
import { intro } from "../components.js";

const LABEL = { available: "Available", tentative: "Limited", booked: "Booked", blocked: "Unavailable", unavailable: "Past" };
const iso = (d) => d.toISOString().slice(0, 10);
const today = todayIST();
let month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);

await renderShell("availability");
setMeta("Check availability", "See which dates are open for photography and videography.");
mount("#main", html`${intro("Check availability", "Dates marked available can usually be booked. Your exact time is checked again when you submit a booking request.")}
  <div class="wrap" style="padding-bottom:6rem;max-width:48rem;margin-left:max(1.25rem,calc((100% - 76rem)/2))">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem">
      <button class="btn btn-line btn-sm" id="prev" type="button">Previous month</button>
      <h2 id="title" style="font-size:1.9rem" aria-live="polite"></h2>
      <button class="btn btn-line btn-sm" id="next" type="button">Next month</button></div>
    <div id="cal" class="cal" style="margin-top:1.5rem"></div>
    <p class="muted small" style="margin-top:1rem">“Limited” means another request is pending for that date. Choose an available date to start a booking.</p>
    <p style="margin-top:2.5rem"><a class="btn btn-solid" href="book.html">Book a date</a></p></div>`);

async function draw() {
  const first = new Date(month);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  $("#title").textContent = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  $("#prev").disabled = iso(first).slice(0, 7) === today.slice(0, 7);
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null)];
  for (let d = 1; d <= last.getUTCDate(); d++) cells.push(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d))));
  const head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => html`<div class="dow">${d}</div>`);
  mount("#cal", html`${head}${cells.map((d) => (d ? html`<div class="day"><b>${Number(d.slice(8))}</b><span>&nbsp;</span></div>` : html`<div></div>`))}`);
  const { data, error } = await sb.rpc("availability_calendar", { p_from: iso(first), p_to: iso(last) });
  if (error) { mount("#cal", html`<p class="danger" style="grid-column:1/-1">Availability could not be loaded. Refresh the page, or call us to check a date.</p>`); return; }
  const status = Object.fromEntries((data ?? []).map((r) => [r.day, r.status]));
  mount("#cal", html`${head}${cells.map((d) => {
    if (!d) return html`<div></div>`;
    const st = status[d] ?? (d < today ? "unavailable" : "available");
    const inner = html`<b>${Number(d.slice(8))}</b><span>${LABEL[st]}</span>`;
    return st === "available"
      ? html`<a class="day available" href="book.html?date=${d}" aria-label="${d}, available — book this date">${inner}</a>`
      : html`<div class="day ${st}" aria-label="${d}, ${LABEL[st]}">${inner}</div>`;
  })}`);
}
$("#prev").addEventListener("click", () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)); draw(); });
$("#next").addEventListener("click", () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)); draw(); });
draw();

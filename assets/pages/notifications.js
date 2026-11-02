import { html, mount, renderShell, sb, requireRole, fmtDateTime, appLink, setMeta, pageError, dbMessage, $ } from "../core.js";

async function load() {
  const { data, error } = await sb.from("notifications").select("id, title, message, link_path, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const unread = data.some((n) => !n.read_at);
  mount("#main", html`<div class="wrap section">
    <p class="small"><a class="link" href="portal.html">My bookings</a></p>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1.25rem;margin:1rem 0 2rem">
      <h1 style="font-size:2.75rem">Notifications</h1>${unread ? html`<button class="btn btn-line btn-sm" id="readall" type="button">Mark all as read</button>` : ""}</div>
    <p id="err" class="alert" hidden></p>
    ${!data.length ? html`<p class="muted">Updates about bookings, quotations, payments and deliveries appear here.</p>` : html`<ul class="rows">${data.map((n) => {
      const link = appLink(n.link_path);
      return html`<li class="${n.read_at ? "" : "unread"}"><p style="${n.read_at ? "" : "font-weight:600"}">${n.title}</p>
        <p class="muted small">${n.message}</p><p class="muted small">${fmtDateTime(n.created_at)}${link ? html` · <a class="link" href="${link}">Open</a>` : ""}</p></li>`;
    })}</ul>`}</div>`);
  $("#readall")?.addEventListener("click", async () => {
    const { error: e } = await sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (e) { const el = $("#err"); el.hidden = false; el.textContent = dbMessage(e); return; }
    await load();
  });
}
try {
  await requireRole(["customer"]);
  await renderShell();
  setMeta("Notifications");
  await load();
} catch (err) { pageError("#main", err); }

// GitHub Pages serves 404.html for unknown paths. Turn app-style addresses
// (used in emails and for clean SEO links) into this site's pages.
import { html, mount, renderShell } from "../core.js";

const path = location.pathname.replace(/\/+$/, "");
const rules = [
  [/\/portal\/bookings\/([A-Za-z0-9-]+)/, (m) => `portal-booking.html?code=${encodeURIComponent(m[1])}`],
  [/\/admin\/bookings\/([A-Za-z0-9-]+)/, (m) => `admin.html#booking/${encodeURIComponent(m[1])}`],
  [/\/(portal|admin|staff)$/, (m) => `${m[1]}.html`],
  [/\/login$/, () => "login.html"],
  [/\/book$/, () => "book.html"],
  [/\/([a-z0-9]+(?:-[a-z0-9]+)+)$/, (m) => `service.html?slug=${m[1]}`], // /wedding-photography
];
// 404.html declares <base href="/"> (or "/<repo>/" on a github.io address),
// so relative links below resolve against the site root on any deep path.
const root = document.baseURI;
let target = null;
for (const [re, to] of rules) {
  const m = path.match(re);
  if (m) { target = to(m); break; }
}
if (target) {
  location.replace(new URL(target, root).href);
} else {
  await renderShell();
  mount("#main", html`<section class="dark" style="min-height:70vh;display:grid;place-items:center;padding:3rem 1.5rem">
    <div style="max-width:32rem"><p class="display" style="font-size:6rem;color:var(--gold)">404</p>
    <h1 style="font-size:2.5rem;margin-top:1rem">This page is out of frame</h1>
    <p class="muted" style="margin-top:1rem">The address may be mistyped, or the page has moved.</p>
    <div class="btn-row" style="margin-top:2rem"><a class="btn btn-gold" href="index.html">Go to the homepage</a><a class="btn btn-line" href="login.html">Sign in</a></div></div></section>`);
}

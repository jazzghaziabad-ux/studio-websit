import { html, mount, renderShell, params, setMeta } from "../core.js";

await renderShell();
setMeta("Booking request received");
const id = params().get("id") ?? "";
const code = /^[A-Z-]+-\d{4}-\d{5}$/.test(id) ? id : null;
mount("#main", html`<div class="wrap section" style="max-width:48rem;margin-left:max(1.25rem,calc((100% - 76rem)/2))">
  <h1>Request received</h1>
  ${code ? html`<p style="margin-top:2rem;font-size:1.125rem">Your booking ID is <b class="display" style="font-size:1.9rem;font-weight:500">${code}</b></p>` : ""}
  <p class="measure muted" style="margin-top:1.5rem;font-size:1.125rem">We have emailed you a copy. Next, we review your request and send an itemised quotation. You can accept it or ask for changes from your account.</p>
  <div class="btn-row" style="margin-top:2.5rem"><a class="btn btn-solid" href="login.html">Sign in to track your booking</a><a class="btn btn-line" href="index.html">Back to home</a></div></div>`);

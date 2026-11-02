import { html, mount, renderShell, sText, setMeta, pageError } from "../core.js";
import { intro } from "../components.js";

try {
  const { settings: s } = await renderShell("contact");
  setMeta("Contact", "Phone, WhatsApp, email and studio address.");
  const phone = sText(s, "business_phone");
  const wa = sText(s, "business_whatsapp").replace(/[^0-9]/g, "");
  const email = sText(s, "business_email");
  mount("#main", html`${intro("Contact", "For availability and pricing, the booking page gives you an instant estimate. For anything else, reach us directly.")}
    <div class="wrap grid2" style="padding-bottom:6rem">
      <div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:500">Phone</h2><a class="link" style="font-size:1.25rem" href="tel:${phone.replace(/\s/g, "")}">${phone}</a>
        ${wa ? html`<p style="margin-top:.5rem"><a class="link" href="https://wa.me/${wa}" target="_blank" rel="noopener">Message on WhatsApp</a></p>` : ""}</div>
      <div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:500">Email</h2><a class="link" style="font-size:1.25rem" href="mailto:${email}">${email}</a>
        <h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:500;margin-top:2rem">Studio</h2><p>${sText(s, "business_address")}</p></div>
      <p><a class="btn btn-solid" href="book.html">Start a booking</a></p></div>`);
} catch (err) { pageError("#main", err); }

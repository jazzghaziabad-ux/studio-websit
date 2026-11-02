import { html, mount, renderShell, getServices, getPackages, getAddons, getTravelSlabs, inr, setMeta, pageError } from "../core.js";
import { intro, rateSheet, addonList } from "../components.js";

try {
  const [, services, packages, addons, slabs] = await Promise.all([renderShell("packages"), getServices(), getPackages(), getAddons(), getTravelSlabs()]);
  setMeta("Packages and pricing", "Photography and videography packages, add-ons and travel charges.");
  mount("#main", html`${intro("Packages and pricing", "Every price here is a starting estimate from our current rates. Booking photography and videography together may qualify for a combined discount, shown automatically in your estimate. Your final price is fixed in the quotation you accept.")}
    <div class="wrap" style="padding-bottom:4rem">${rateSheet(packages, services)}</div>
    <div class="wrap grid2" style="padding-bottom:4rem">
      ${addons.length ? html`<section><h2 style="font-size:2rem">Add-ons</h2><div style="margin-top:1.25rem">${addonList(addons)}</div></section>` : ""}
      ${slabs.length ? html`<section><h2 style="font-size:2rem">Travel</h2><table class="rates" style="margin-top:1.25rem"><tbody>${slabs.map((t) => html`
        <tr><th scope="row">${t.label}</th><td class="num">${t.is_custom_quote ? "Custom quote" : Number(t.charge) === 0 ? "Included" : inr(t.charge)}</td></tr>`)}</tbody></table></section>` : ""}
    </div><div class="wrap" style="padding-bottom:6rem"><a class="btn btn-solid" href="book.html">Get your estimate</a></div>`);
} catch (err) { pageError("#main", err); }

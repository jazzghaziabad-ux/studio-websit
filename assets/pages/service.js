import { html, mount, renderShell, getServices, getPackages, getAddons, params, setMeta, addJsonLd, sText, safeUrl, pageError } from "../core.js";
import { intro, rateSheet, addonList } from "../components.js";

try {
  const slug = params().get("slug") ?? "";
  const [{ settings: s }, services, packages, addons] = await Promise.all([renderShell(), getServices(), getPackages(), getAddons()]);
  const service = services.find((x) => x.slug === slug);
  if (!service) {
    mount("#main", html`<div class="wrap section"><h1>Service not found</h1><p class="muted" style="margin-top:1rem">It may have been renamed. <a class="link" href="services.html">See all services</a>.</p></div>`);
  } else {
    const city = sText(s, "business_city");
    setMeta(service.seo_title ?? `${service.name}${city ? ` in ${city}` : ""} | ${sText(s, "business_name")}`, service.seo_description ?? service.short_description ?? "");
    addJsonLd({ "@context": "https://schema.org", "@type": "Service", name: service.name, serviceType: service.name,
      description: service.description ?? service.short_description ?? undefined, areaServed: city || undefined });
    const own = packages.filter((p) => p.service_id === service.id);
    const extras = addons.filter((a) => a.category === null || a.category === service.category);
    const img = safeUrl(service.image_url);
    mount("#main", html`${intro(service.name, service.short_description)}
      ${img ? html`<img src="${img}" alt="${service.name}" style="aspect-ratio:2.39/1;width:100%;object-fit:cover">` : ""}
      <div class="wrap section grid2 grid-aside" style="padding-top:3rem">
        <div>${service.description ? html`<div class="prose measure" style="font-size:1.125rem;margin-bottom:3.5rem">${service.description}</div>` : ""}${rateSheet(own, [service])}</div>
        <aside><a class="btn btn-solid" style="width:100%" href="book.html?service=${encodeURIComponent(service.slug)}">Book ${service.name.toLowerCase()}</a>
          <p class="muted small" style="margin-top:.75rem">See your estimate instantly. Final price comes in a written quotation.</p>
          ${extras.length ? html`<h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:500;margin-top:2.5rem">Add-ons</h2><div style="margin-top:.75rem">${addonList(extras)}</div>` : ""}</aside>
      </div>`);
  }
} catch (err) { pageError("#main", err); }

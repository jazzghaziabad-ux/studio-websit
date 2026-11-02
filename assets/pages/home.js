import { html, mount, renderShell, getServices, getPackages, getPublicReviews, getReviewStats, sText, sArr, safeUrl, setMeta, addJsonLd, pageError, CONFIG } from "../core.js";
import { serviceIndex, rateSheet, reviewList, faqList, videoEmbed, gallery, stars } from "../components.js";

const STEPS = [
  ["Tell us about your event", "Pick services, a package and your date. You see an estimate immediately."],
  ["Receive your quotation", "We send an itemised quotation. Ask for changes or accept it online."],
  ["Confirm and pay offline", "Pay by UPI, bank transfer, cheque or cash. We confirm every payment in your account."],
  ["We shoot", "Your assigned photographer and videographer arrive with the brief you approved."],
  ["Your private gallery", "View, download and choose album photos in a gallery only you can open."],
];

try {
  const [{ settings: s }, services, packages, reviews, stats] = await Promise.all([
    renderShell(), getServices(), getPackages(), getPublicReviews(4), getReviewStats(),
  ]);
  const name = sText(s, "business_name", "Studio");
  const city = sText(s, "business_city");
  setMeta(`${name} — Wedding Photographer & Videographer${city ? ` in ${city}` : ""}`, sText(s, "hero_subheading"));
  addJsonLd({ "@context": "https://schema.org", "@type": "LocalBusiness", name, telephone: sText(s, "business_phone") || undefined,
    email: sText(s, "business_email") || undefined, address: sText(s, "business_address") ? { "@type": "PostalAddress", streetAddress: sText(s, "business_address"), addressCountry: "IN" } : undefined });

  const hero = safeUrl(sText(s, "hero_image_url"));
  const featured = packages.filter((p) => p.is_featured);
  const videos = sArr(s, "featured_videos").slice(0, 2);
  const photos = sArr(s, "portfolio_images").slice(0, 6);
  const why = sArr(s, "why_choose_us");
  const faq = sArr(s, "faq").slice(0, 5);
  const phone = sText(s, "business_phone");

  mount("#main", html`
    <section class="dark">
      <div class="hero-frame"><div class="letterbox">${hero ? html`<img src="${hero}" alt="" fetchpriority="high">` : html`<div class="grain"></div>`}</div></div>
      <div class="wrap" style="padding-bottom:6rem">
        <h1 class="hero-title">${sText(s, "hero_heading")}</h1>
        <p class="measure muted" style="margin-top:1.5rem;font-size:1.125rem">${sText(s, "hero_subheading")}</p>
        <div class="btn-row" style="margin-top:2.25rem">
          <a class="btn btn-gold" href="book.html">Book now</a>
          <a class="btn btn-line" href="availability.html">Check availability</a>
          <a class="btn btn-line" href="portfolio.html">View portfolio</a>
          ${videos.length ? html`<a class="btn btn-line" href="#films">View videos</a>` : ""}
        </div>
      </div>
    </section>

    <section class="wrap section grid2">
      <h2>${sText(s, "about_heading")}</h2>
      <p class="measure" style="font-size:1.125rem">${sText(s, "about_text")}</p>
    </section>

    <section class="wrap grid2" style="padding-bottom:6rem">
      <div><h2>Photography</h2><div style="margin-top:1.5rem">${serviceIndex(services.filter((x) => x.category === "photography").slice(0, 6), packages)}</div>
        <a class="link" style="display:inline-block;margin-top:1.25rem" href="services.html?c=photography">All photography services</a></div>
      <div><h2>Videography</h2><div style="margin-top:1.5rem">${serviceIndex(services.filter((x) => x.category === "videography").slice(0, 6), packages)}</div>
        <a class="link" style="display:inline-block;margin-top:1.25rem" href="services.html?c=videography">All videography services</a></div>
    </section>

    ${featured.length ? html`<section class="paper section"><div class="wrap">
      <h2>Packages</h2><p class="measure muted" style="margin-top:1rem">Prices shown are starting estimates. Your final price is confirmed in a written quotation.</p>
      <div style="margin-top:3rem">${rateSheet(featured, services)}</div>
      <a class="link" style="display:inline-block;margin-top:2.5rem" href="packages.html">See every package and add-on</a></div></section>` : ""}

    ${why.length ? html`<section class="wrap section"><h2>Why couples and families choose us</h2>
      <dl class="defs" style="margin-top:3rem">${why.map((w) => html`<div><dt style="font-size:1.25rem;font-weight:500">${w.title}</dt><dd class="muted" style="margin:.5rem 0 0">${w.text}</dd></div>`)}</dl></section>` : ""}

    ${photos.length ? html`<section class="wrap" style="padding-bottom:6rem"><h2>Recent work</h2><div style="margin-top:2.5rem">${gallery(photos)}</div>
      <a class="link" style="display:inline-block;margin-top:1.5rem" href="portfolio.html">Open the portfolio</a></section>` : ""}

    ${videos.length ? html`<section id="films" class="dark section"><div class="wrap"><h2>Films</h2>
      <div class="grid2" style="margin-top:2.5rem">${videos.map(videoEmbed)}</div></div></section>` : ""}

    <section class="wrap section"><h2>How booking works</h2>
      <ol class="steps" style="margin-top:3rem">${STEPS.map(([t, d], i) => html`<li><span class="n">${i + 1}</span>
        <h3 style="font-family:var(--sans);font-size:1.1rem;font-weight:500;margin-top:.5rem">${t}</h3><p class="muted small" style="margin-top:.5rem">${d}</p></li>`)}</ol></section>

    <section class="paper section"><div class="wrap">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:1.5rem"><h2>What clients say</h2>
        ${stats.review_count > 0 && stats.average_rating != null ? html`<p style="text-align:right"><span class="display" style="font-size:3rem;display:block">${Number(stats.average_rating).toFixed(1)} / 5</span>
          ${stars(stats.average_rating)} <span class="muted small">from ${stats.review_count} verified review${stats.review_count === 1 ? "" : "s"}</span></p>` : ""}</div>
      <div style="margin-top:3rem">${reviewList(reviews)}</div></div></section>

    <section class="wrap section grid2 grid-aside">
      <div><h2>Questions</h2><div style="margin-top:2rem">${faqList(faq)}</div><a class="link" style="display:inline-block;margin-top:1.25rem" href="faq.html">All questions</a></div>
      <div><h2>Talk to us</h2><p style="margin-top:1.5rem;font-size:1.125rem"><a class="link" href="tel:${phone.replace(/\s/g, "")}">${phone}</a><br>
        <a class="link" href="mailto:${sText(s, "business_email")}">${sText(s, "business_email")}</a></p><p class="muted" style="margin-top:1rem">${sText(s, "business_address")}</p></div>
    </section>

    <section class="dark" style="padding-block:6rem"><div class="wrap" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:2rem">
      <h2 style="max-width:16ch;font-size:clamp(2.5rem,5vw,3.75rem)">Tell us the date. We will hold the light.</h2><a class="btn btn-gold" href="book.html">Book now</a></div></section>`);
  if (CONFIG.supabaseAnonKey.startsWith("PASTE")) console.warn("Set supabaseAnonKey in assets/config.js");
} catch (err) { pageError("#main", err); }

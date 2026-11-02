import { html, mount, renderShell, sArr, setMeta, pageError } from "../core.js";
import { intro, gallery, videoEmbed } from "../components.js";

try {
  const { settings: s } = await renderShell("portfolio");
  setMeta("Portfolio", "Recent weddings, celebrations and commissions.");
  const images = sArr(s, "portfolio_images");
  const videos = sArr(s, "featured_videos");
  mount("#main", html`${intro("Portfolio", "A selection of recent weddings, celebrations and commissions.")}
    <section class="wrap" style="padding-bottom:5rem"><h2 style="font-size:2rem">Photos</h2>
      ${images.length ? html`<div style="margin-top:2rem">${gallery(images)}</div>` : html`<p class="muted" style="margin-top:1rem">New work is being added. Ask us for a full gallery from a recent event.</p>`}</section>
    ${videos.length ? html`<section class="dark section"><div class="wrap"><h2 style="font-size:2rem">Videos</h2><div class="grid2" style="margin-top:2.5rem">${videos.map(videoEmbed)}</div></div></section>` : ""}`);
} catch (err) { pageError("#main", err); }

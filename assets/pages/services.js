import { html, mount, renderShell, getServices, getPackages, params, setMeta, pageError } from "../core.js";
import { intro, serviceIndex } from "../components.js";

const c = params().get("c");
const cat = c === "photography" || c === "videography" ? c : null;
const TITLE = { photography: "Photography", videography: "Videography" };
const TEXT = {
  photography: "Weddings, celebrations, portraits and brands. Choose a service to see its packages.",
  videography: "Cinematic films, full event coverage, highlights, reels and drone. Choose a service to see its packages.",
};
try {
  const [, services, packages] = await Promise.all([renderShell(cat ?? ""), getServices(), getPackages()]);
  const list = cat ? services.filter((s) => s.category === cat) : services;
  setMeta(`${cat ? TITLE[cat] : "All services"}`, cat ? TEXT[cat] : "Every photography and videography service we offer.");
  mount("#main", html`${intro(cat ? TITLE[cat] : "Services", cat ? TEXT[cat] : "Every photography and videography service we offer.")}
    <div class="wrap" style="padding-bottom:6rem">${serviceIndex(list, packages)}<p style="margin-top:2.5rem"><a class="btn btn-solid" href="book.html">Book now</a></p></div>`);
} catch (err) { pageError("#main", err); }

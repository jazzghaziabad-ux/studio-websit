import { html, mount, renderShell, sText, params, setMeta, pageError } from "../core.js";
import { intro } from "../components.js";

const POLICIES = {
  privacy: ["policy_privacy", "Privacy policy"], terms: ["policy_terms", "Terms and conditions"],
  cancellation: ["policy_cancellation", "Cancellation policy"], delivery: ["policy_delivery", "Photo and video delivery policy"],
};
try {
  const { settings: s } = await renderShell();
  const p = POLICIES[params().get("p")] ?? POLICIES.privacy;
  setMeta(p[1]);
  // Rendered as escaped text (pre-line), never as HTML.
  mount("#main", html`${intro(p[1])}<div class="wrap" style="padding-bottom:6rem"><div class="prose measure" style="font-size:1.125rem">${sText(s, p[0])}</div></div>`);
} catch (err) { pageError("#main", err); }

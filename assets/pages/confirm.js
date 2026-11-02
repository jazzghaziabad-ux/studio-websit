// Landing page for the emailed sign-in link: /auth/confirm/?token_hash=…&type=email
import { html, mount, sb, homeFor } from "../core.js";

const TYPES = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];
const q = new URLSearchParams(location.search);
const tokenHash = q.get("token_hash");
const type = q.get("type");
const root = new URL("../../", location.href).href;

if (!tokenHash || !TYPES.includes(type)) {
  location.replace(`${root}login.html?error=invalid`);
} else {
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    location.replace(`${root}login.html?error=expired`);
  } else {
    try { await sb.rpc("record_auth_event", { p_event: "login" }); } catch { /* audit is best effort */ }
    const { data: { user } } = await sb.auth.getUser();
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
    mount("#msg", html`<p>Signed in. Taking you to your account…</p>`);
    location.replace(root + homeFor(profile?.role ?? "customer"));
  }
}

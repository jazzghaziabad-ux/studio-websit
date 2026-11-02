import { html, mount, renderShell, sb, getProfile, homeFor, params, setMeta, $ } from "../core.js";

await renderShell();
setMeta("Sign in");
const profile = await getProfile();
if (profile) location.replace(homeFor(profile.role));

const error = params().get("error");
mount("#main", html`<div class="wrap section grid2">
  <div><h1>Sign in</h1><p class="measure muted" style="margin-top:1.5rem;font-size:1.125rem">Track your booking, review quotations, see payments and open your private gallery. No password needed — we email you a secure link.</p></div>
  <div id="box">
    ${error ? html`<p class="alert" role="alert" style="margin-bottom:1.5rem">That sign-in link has expired or was already used. Request a new one.</p>` : ""}
    <form id="f" class="form-grid" style="max-width:28rem">
      <label class="field"><span>Email</span><input class="input" type="email" name="email" required autocomplete="email">
        <small>Use the email address from your booking to see it in your account.</small></label>
      <p id="err" class="alert" role="alert" hidden></p>
      <button class="btn btn-solid" id="b">Email me a sign-in link</button>
    </form>
  </div></div>`);

$("#f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.elements.namedItem("email").value.trim().toLowerCase();
  const b = $("#b"); b.disabled = true; b.textContent = "Sending…";
  // The email template links to auth/confirm/ with a token hash, so the link
  // works even when opened on a different device than the one that asked.
  const redirect = new URL("auth/confirm/", location.href).href;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
  if (error) {
    const el = $("#err"); el.hidden = false;
    el.textContent = error.status === 429 ? "Too many attempts. Wait a minute and try again." : "We could not send the sign-in link. Check the email address and try again.";
    b.disabled = false; b.textContent = "Email me a sign-in link";
    return;
  }
  mount("#box", html`<div class="notice" role="status"><p style="font-size:1.125rem;font-weight:500">Check your email</p>
    <p class="muted" style="margin-top:.5rem">We sent a sign-in link to ${email}. It expires in one hour. You can close this tab.</p></div>`);
});

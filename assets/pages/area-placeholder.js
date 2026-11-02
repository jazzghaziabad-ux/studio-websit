// Admin and staff areas arrive in Part 2. Until then, signed-in admins and
// staff land here with directions instead of a broken page.
import { html, mount, renderShell, requireRole, signOut, $ } from "../core.js";

const isAdmin = location.pathname.endsWith("admin.html");
const profile = await requireRole(isAdmin ? ["super_admin", "manager"] : ["photographer", "videographer"]);
await renderShell();
mount("#main", html`<div class="wrap section" style="max-width:44rem;margin-left:max(1.25rem,calc((100% - 76rem)/2))">
  <h1 style="font-size:2.75rem">${isAdmin ? "Admin" : "Team"} area</h1>
  <p class="muted" style="margin-top:1rem">Signed in as ${profile.email} (${profile.role.replace("_", " ")}).</p>
  <p style="margin-top:1.5rem">The ${isAdmin ? "admin screens (bookings, quotations, payments, staff, pricing, settings)" : "job pages"} for this website are being built and arrive in the next update.
  ${isAdmin ? "Until then, new bookings are visible in Supabase → Table Editor → bookings." : ""}</p>
  <p style="margin-top:2rem"><button class="btn btn-line" id="out" type="button">Sign out</button></p></div>`);
$("#out").addEventListener("click", signOut);

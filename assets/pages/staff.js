// Team area for photographers and videographers.
//   #            upcoming and recent jobs      #job/<CODE>   one job + progress form
// v_staff_jobs returns only this person's own assignments, with no prices.
// Updates go through staff_update_job(), which checks the role in the database.
import { html, mount, renderShell, sb, requireRole, fmtDate, fmtTime, humanize, todayIST, setMeta, pageError, dbMessage, signOut, $ } from "../core.js";

const PHOTO = ["uploading", "uploaded", "processing", "editing", "ready_for_review"];
const VIDEO = ["shoot_completed", "uploading", "uploaded", "editing", "color_grading", "processing", "ready_for_review"];
const PHOTO_ROLES = ["photographer", "second_photographer", "editor"];
const VIDEO_ROLES = ["videographer", "second_videographer", "drone_operator", "editor"];
const DONE = ["event_completed", "photo_processing", "video_processing", "photos_ready", "videos_ready", "media_ready", "delivered"];
let profile;
let currentBookingId = null;

const top = (title) => html`<div class="btn-row" style="margin-bottom:1.5rem"><a class="btn btn-line btn-sm" href="#">My jobs</a>
  <a class="btn btn-line btn-sm" href="notifications.html">Notifications</a><button class="btn btn-line btn-sm" id="signout" type="button">Sign out</button></div>
  <div style="border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:2rem"><h1 style="font-size:2.5rem">${title}</h1>
  <p class="muted small">${profile.email} · ${humanize(profile.role)}</p></div>`;

async function list() {
  const since = new Date(Date.parse(todayIST()) - 60 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("v_staff_jobs").select("*").gte("event_date", since).order("event_date");
  if (error) throw error;
  const seen = new Set();
  const jobs = (data ?? []).filter((j) => (seen.has(j.booking_code) ? false : seen.add(j.booking_code)));
  return html`${top("My jobs")}
    ${!jobs.length ? html`<p class="card muted" style="text-align:center;padding:2.5rem">No current assignments. New ones appear here and in your notifications.</p>` : html`
    <ul style="list-style:none;padding:0;display:grid;gap:1.25rem">${jobs.map((j) => html`<li class="card">
      <p class="muted small">${j.booking_code} · ${humanize(j.assignment_role)}${j.event_date < todayIST() ? " · past" : ""}</p>
      <h2 style="font-family:var(--sans);font-size:1.25rem;font-weight:600;margin-top:.25rem">${j.event_name || j.event_type}</h2>
      <p style="margin-top:.5rem">${fmtDate(j.event_date)}, ${fmtTime(j.start_time)} to ${fmtTime(j.end_time)}<br>${j.location}, ${j.city}</p>
      <a class="btn btn-line btn-sm" style="margin-top:1rem" href="#job/${j.booking_code}">Open job</a></li>`)}</ul>`}`;
}

async function job(code) {
  const { data, error } = await sb.from("v_staff_jobs").select("*").eq("booking_code", code);
  if (error) throw error;
  if (!data?.length) return html`${top("Job not found")}<p class="muted">It may not be assigned to you. <a class="link" href="#">My jobs</a></p>`;
  const j = data[0];
  currentBookingId = j.booking_id;
  const roles = data.map((r) => r.assignment_role);
  const canPhoto = j.includes_photography && roles.some((r) => PHOTO_ROLES.includes(r));
  const canVideo = j.includes_videography && roles.some((r) => VIDEO_ROLES.includes(r));
  const started = new Date(j.event_start) <= new Date();
  const opt = (v, l) => html`<option value="${v}">${l}</option>`;
  const wa = (j.customer_whatsapp ?? "").replace(/[^0-9]/g, "");
  return html`${top(j.event_name || j.event_type || j.booking_code)}
    <p class="muted small" style="margin:-1.25rem 0 2rem">${j.booking_code} · ${roles.map(humanize).join(", ")}</p>
    <div class="grid2 grid-aside" style="align-items:start">
      <section style="display:grid;gap:1.75rem">
        <div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">When and where</h2>
          <p style="margin-top:.5rem">${fmtDate(j.event_date)}, ${fmtTime(j.start_time)} to ${fmtTime(j.end_time)}<br>${j.location}, ${j.city}</p>
          <p><a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${j.location}, ${j.city}`)}">Open in Maps</a></p></div>
        <div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Client</h2>
          <p style="margin-top:.5rem">${j.customer_name} · <a class="link" href="tel:${j.customer_phone}">${j.customer_phone}</a>${wa ? html` · <a class="link" target="_blank" rel="noopener" href="https://wa.me/${wa}">WhatsApp</a>` : ""}</p>
          ${j.guest_count ? html`<p class="muted small">About ${j.guest_count} guests</p>` : ""}</div>
        ${j.special_requirements ? html`<div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Brief</h2><p class="prose" style="margin-top:.5rem">${j.special_requirements}</p></div>` : ""}
        ${j.assignment_notes ? html`<div><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Notes</h2><p class="prose small" style="margin-top:.5rem">${j.assignment_notes}</p></div>` : ""}
        <div class="small">${j.includes_photography ? html`<p>Photos: ${humanize(j.photo_status)}${j.photo_expected_delivery ? `, due ${fmtDate(j.photo_expected_delivery)}` : ""}</p>` : ""}
          ${j.includes_videography ? html`<p>Videos: ${humanize(j.video_status)}${j.video_expected_delivery ? `, due ${fmtDate(j.video_expected_delivery)}` : ""}</p>` : ""}</div>
      </section>
      <form id="update" class="card form-grid"><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:600">Update progress</h2>
        ${canPhoto ? html`<label class="field"><span>Photo status</span><select class="input" name="photo_status">${opt("", `No change (${humanize(j.photo_status)})`)}${PHOTO.map((x) => opt(x, humanize(x)))}</select></label>` : ""}
        ${canVideo ? html`<label class="field"><span>Video status</span><select class="input" name="video_status">${opt("", `No change (${humanize(j.video_status)})`)}${VIDEO.map((x) => opt(x, humanize(x)))}</select></label>` : ""}
        <label class="field"><span>Add a note <small>(visible to admins)</small></span><textarea class="input" name="note" maxlength="2000"></textarea></label>
        ${!DONE.includes(j.booking_status) ? html`<label class="check small"><input type="checkbox" name="mark_completed" ${started ? "" : html`disabled`}> Mark the event as completed${started ? "" : " (available once the event starts)"}</label>` : ""}
        <p class="msg small" role="status"></p>
        <div><button class="btn btn-solid btn-sm">Save update</button></div>
        <p class="muted small">Approval, publishing and delivery are done by the studio admin.</p></form>
    </div>`;
}

async function route() {
  const [section, arg] = location.hash.replace(/^#/, "").split("/");
  try {
    mount("#main", html`<div class="wrap section" style="padding-top:2.5rem">${section === "job" && arg ? await job(decodeURIComponent(arg)) : await list()}</div>`);
    setMeta(`${$("#main h1")?.textContent ?? "My jobs"} — Team`);
    $("#signout")?.addEventListener("click", signOut);
    const form = $("#update");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const out = form.querySelector(".msg");
      const get = (n) => form.elements.namedItem(n);
      const photo = get("photo_status")?.value || null;
      const video = get("video_status")?.value || null;
      const note = get("note").value.trim() || null;
      const complete = get("mark_completed")?.checked === true;
      if (!photo && !video && !note && !complete) { out.textContent = "Nothing to update."; out.className = "msg small danger"; return; }
      form.querySelector("button").disabled = true;
      const { error } = await sb.rpc("staff_update_job", {
        p_booking_id: currentBookingId,
        p_photo_status: photo, p_video_status: video, p_mark_event_completed: complete, p_note: note,
      });
      if (error) { out.textContent = dbMessage(error); out.className = "msg small danger"; form.querySelector("button").disabled = false; return; }
      await route();
      const msg = $("#update .msg");
      if (msg) { msg.textContent = complete ? "Event marked completed. The client and admin have been notified." : "Saved."; msg.className = "msg small ok"; }
    });
  } catch (err) { pageError("#main", err); }
}

try {
  profile = await requireRole(["photographer", "videographer"]);
  await renderShell();
  window.addEventListener("hashchange", route);
  await route();
} catch (err) { pageError("#main", err); }

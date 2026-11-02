import {
  html, mount, renderShell, sb, getServices, getPackages, getAddons, getEventTypes, inr, todayIST, params,
  setMeta, pageError, $, $$, CONFIG, FUNCTIONS_URL,
} from "../core.js";
import { intro } from "../components.js";

const CATS = ["photography", "videography"];
const LABEL = { photography: "Photography", videography: "Videography" };
const AVAIL = {
  available: ["This time looks available.", "ok"],
  tentative: ["Another request is pending for this time. You can still apply.", ""],
  booked: ["We are fully booked at this time. Try another time or date, or submit and we will suggest options.", "danger"],
  blocked: ["We are unavailable on this date.", "danger"],
  unavailable: ["Choose a date from today onwards.", "danger"],
};
const idempotencyKey = crypto.randomUUID();
let turnstileToken = "";

try {
  const [, services, packages, addons, eventTypes] = await Promise.all([
    renderShell(), getServices(), getPackages(), getAddons(), getEventTypes(),
  ]);
  setMeta("Book now", "Choose your services and date and see your estimate instantly.");

  const qs = params();
  const initialService = services.find((s) => s.slug === qs.get("service"));
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(qs.get("date") ?? "") ? qs.get("date") : "";
  const sel = {
    photography: { enabled: !initialService || initialService.category === "photography", serviceId: initialService?.category === "photography" ? initialService.id : "", packageId: "", durationId: "", customHours: "" },
    videography: { enabled: initialService?.category === "videography", serviceId: initialService?.category === "videography" ? initialService.id : "", packageId: "", durationId: "", customHours: "" },
  };
  const addonQty = {};

  const option = (value, label, selected) => html`<option value="${value}" ${selected ? html`selected` : ""}>${label}</option>`;

  mount("#main", html`${intro("Book now", "Tell us what you need. You will see an estimate as you go, and we follow up with an official quotation.")}
  <div class="wrap" style="padding-bottom:6rem">
    <form id="form" novalidate class="grid2 grid-aside" style="align-items:start">
      <div style="display:grid;gap:3.5rem">
        <fieldset id="services"><legend>What would you like?</legend><div id="svc-blocks" style="display:grid;gap:2rem"></div></fieldset>
        <fieldset id="addons-set" hidden><legend>Add-ons</legend><ul class="addons" id="addons"></ul></fieldset>
        <fieldset class="form-grid two"><legend class="span2">Your event</legend>
          <label class="field"><span>Event type</span><select class="input" name="event_type_id" required>
            ${option("", "Choose…")}${eventTypes.map((t) => option(t.id, t.name))}</select></label>
          <label class="field"><span>Event name <small>(optional)</small></span><input class="input" name="event_name" maxlength="200" placeholder="e.g. Ananya & Rohit's wedding"></label>
          <label class="field"><span>Date</span><input class="input" type="date" name="event_date" required min="${todayIST()}" value="${initialDate}"></label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
            <label class="field"><span>Start</span><input class="input" type="time" name="start_time" required></label>
            <label class="field"><span>End</span><input class="input" type="time" name="end_time" required></label></div>
          <p id="avail" class="span2" role="status"></p>
          <label class="field span2"><span>Venue or address</span><input class="input" name="location" required maxlength="500"></label>
          <label class="field"><span>City</span><input class="input" name="city" required maxlength="100"></label>
          <label class="field"><span>Guests <small>(approx.)</small></span><input class="input" type="number" min="1" name="guest_count"></label>
          <label class="field span2"><span>Distance from our studio in km <small>(optional — used to estimate travel)</small></span>
            <input class="input" type="number" min="0" step="1" name="distance_km" style="max-width:14rem"></label>
        </fieldset>
        <fieldset class="form-grid two"><legend class="span2">Your details</legend>
          <label class="field span2"><span>Full name</span><input class="input" name="full_name" required autocomplete="name" maxlength="120"></label>
          <label class="field"><span>Mobile</span><input class="input" type="tel" name="mobile" required autocomplete="tel" inputmode="tel"></label>
          <label class="field"><span>WhatsApp <small>(if different)</small></span><input class="input" type="tel" name="whatsapp" inputmode="tel"></label>
          <label class="field span2"><span>Email</span><input class="input" type="email" name="email" required autocomplete="email">
            <small>Your quotation and updates are sent here. Use the same email to sign in later.</small></label>
          <label class="field span2"><span>Special requirements <small>(optional)</small></span><textarea class="input" name="special_requirements" maxlength="4000"></textarea></label>
          <label class="field span2"><span>Anything else? <small>(optional)</small></span><textarea class="input" name="message" maxlength="4000"></textarea></label>
          <label class="field"><span>How did you hear about us? <small>(optional)</small></span><select class="input" name="referral_source">
            ${option("", "Choose…")}${["Instagram", "Google search", "Friend or family", "Wedding planner", "YouTube", "Returning client", "Other"].map((o) => option(o, o))}</select></label>
        </fieldset>
      </div>
      <aside class="estimate">
        <div class="box"><h2 style="font-family:var(--sans);font-size:1.1rem;font-weight:500">Estimated booking price</h2><div id="est"></div>
          <p class="small" style="margin-top:1.25rem;color:rgba(237,230,217,.7)">This amount is an estimate. Final pricing is confirmed through the official quotation.</p></div>
        <div id="turnstile" style="margin-top:1.25rem"></div>
        <p id="error" class="alert" role="alert" hidden style="margin-top:1.25rem"></p>
        <button class="btn btn-solid" id="submit" type="submit" style="width:100%;margin-top:1.25rem">Send booking request</button>
        <p class="muted small" style="margin-top:.75rem">No payment is taken online. We reply with an itemised quotation.</p>
      </aside>
    </form>
  </div>`);

  const form = $("#form");
  const F = (n) => form.elements.namedItem(n); // standard field lookup
  const durationOf = (s) => packages.find((p) => p.id === s.packageId)?.package_durations?.find((d) => d.id === s.durationId);
  const activeCats = () => CATS.filter((c) => sel[c].enabled && sel[c].durationId);

  // ---- Services block -----------------------------------------------------
  function drawServices() {
    mount("#svc-blocks", CATS.map((c) => {
      const s = sel[c];
      const catServices = services.filter((x) => x.category === c);
      const catPackages = packages.filter((p) => p.service_id === s.serviceId && p.package_durations.length);
      const pkg = catPackages.find((p) => p.id === s.packageId);
      const dur = durationOf(s);
      return html`<div class="svc" data-cat="${c}">
        <label class="check" style="font-size:1.25rem;font-weight:500"><input type="checkbox" data-k="enabled" ${s.enabled ? html`checked` : ""}> ${LABEL[c]}</label>
        ${s.enabled ? html`<div class="grid3">
          <label class="field"><span>Service</span><select class="input" data-k="serviceId">${option("", "Choose…")}${catServices.map((x) => option(x.id, x.name, x.id === s.serviceId))}</select></label>
          <label class="field"><span>Package</span><select class="input" data-k="packageId" ${s.serviceId ? "" : html`disabled`}>
            ${option("", s.serviceId && !catPackages.length ? "No packages yet" : "Choose…")}${catPackages.map((p) => option(p.id, p.name, p.id === s.packageId))}</select></label>
          <label class="field"><span>Duration</span><select class="input" data-k="durationId" ${pkg ? "" : html`disabled`}>
            ${option("", "Choose…")}${(pkg?.package_durations ?? []).map((d) => option(d.id, `${d.label} — ${d.is_custom_quote ? "custom quote" : inr(Number(pkg.base_price) + Number(d.extra_price))}`, d.id === s.durationId))}</select></label>
          ${dur && dur.hours == null ? html`<label class="field"><span>How many hours?</span><input class="input" type="number" min="1" max="24" step="0.5" data-k="customHours" value="${s.customHours}"></label>` : ""}
        </div>` : ""}</div>`;
    }));
  }
  $("#svc-blocks").addEventListener("change", (e) => {
    const el = e.target;
    const cat = el.closest("[data-cat]")?.dataset.cat;
    const k = el.dataset.k;
    if (!cat || !k) return;
    const s = sel[cat];
    if (k === "enabled") Object.assign(s, el.checked ? { enabled: true } : { enabled: false, serviceId: "", packageId: "", durationId: "", customHours: "" });
    if (k === "serviceId") Object.assign(s, { serviceId: el.value, packageId: "", durationId: "" });
    if (k === "packageId") Object.assign(s, { packageId: el.value, durationId: "" });
    if (k === "durationId") s.durationId = el.value;
    if (k === "customHours") s.customHours = el.value;
    if (k !== "customHours") drawServices();
    drawAddons(); refresh();
  });

  // ---- Add-ons ------------------------------------------------------------
  function drawAddons() {
    const cats = activeCats();
    const list = addons.filter((a) => a.category === null || cats.includes(a.category));
    $("#addons-set").hidden = !list.length;
    mount("#addons", list.map((a) => {
      const unit = a.pricing_unit === "per_hour" ? " per hour" : a.pricing_unit === "per_unit" ? " each" : "";
      return html`<li data-addon="${a.id}"><span><span style="font-weight:500">${a.name}</span> <span class="muted num">${inr(a.price)}${unit}</span>
        ${a.description ? html`<span class="muted small" style="display:block">${a.description}</span>` : ""}</span>
        ${a.pricing_unit === "flat"
          ? html`<label class="check"><input type="checkbox" ${(addonQty[a.id] ?? 0) > 0 ? html`checked` : ""}> Add</label>`
          : html`<label class="check"><span class="small">${a.pricing_unit === "per_hour" ? "Hours" : "Quantity"}</span>
              <input class="input" style="width:5rem" type="number" min="0" max="${a.max_quantity}" value="${addonQty[a.id] ?? 0}"></label>`}</li>`;
    }));
  }
  $("#addons").addEventListener("change", (e) => {
    const li = e.target.closest("[data-addon]");
    if (!li) return;
    const a = addons.find((x) => x.id === li.dataset.addon);
    addonQty[a.id] = e.target.type === "checkbox" ? (e.target.checked ? 1 : 0) : Math.max(0, Math.min(a.max_quantity, Number(e.target.value) || 0));
    refresh();
  });

  // ---- Estimate + availability (debounced, same DB functions as the server)
  function request() {
    const cats = activeCats();
    const items = cats.map((c) => {
      const d = durationOf(sel[c]);
      return { package_duration_id: sel[c].durationId, ...(d && d.hours == null && sel[c].customHours ? { custom_hours: Number(sel[c].customHours) } : {}) };
    });
    const chosen = addons.filter((a) => (a.category === null || cats.includes(a.category)) && (addonQty[a.id] ?? 0) > 0)
      .map((a) => ({ addon_id: a.id, ...(a.pricing_unit === "flat" ? {} : { quantity: addonQty[a.id] }) }));
    const dist = F("distance_km").value;
    return { items, addons: chosen, ...(dist !== "" ? { distance_km: Number(dist) } : {}) };
  }
  let estTimer, availTimer, estSeq = 0;
  function refresh() {
    clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      const req = request();
      const seq = ++estSeq;
      if (!req.items.length) { mount("#est", html`<p style="margin-top:1rem;color:rgba(237,230,217,.7)">Choose a package and duration to see your estimate.</p>`); return; }
      const { data, error } = await sb.rpc("calculate_estimate", { p_request: req });
      if (seq !== estSeq) return; // a newer request is on its way
      if (error) { mount("#est", html`<p role="alert" style="margin-top:1rem;color:#f0b4a8">${error.message}</p>`); return; }
      mount("#est", html`<ul>${data.lines.map((l) => html`<li><span style="color:rgba(237,230,217,.85)">${l.description}${l.quantity > 1 ? ` × ${l.quantity}` : ""}</span><span class="num">${inr(l.amount)}</span></li>`)}
        ${data.discount > 0 ? html`<li style="color:var(--gold)"><span>${data.discount_label ?? "Discount"}</span><span class="num">−${inr(data.discount)}</span></li>` : ""}
        ${data.tax_amount > 0 ? html`<li><span>GST ${data.tax_rate}%</span><span class="num">${inr(data.tax_amount)}</span></li>` : ""}</ul>
        <p class="total"><span>Estimate</span><b class="num">${inr(data.estimated_total)}</b></p>
        ${data.requires_custom_quote ? html`<p class="small" style="margin-top:.75rem;color:var(--gold)">Part of this booking needs a custom quote — we will price it in your quotation.</p>` : ""}
        ${data.travel_to_be_confirmed ? html`<p class="small" style="margin-top:.75rem;color:rgba(237,230,217,.7)">Travel charges will be confirmed in your quotation.</p>` : ""}`);
    }, 300);
    clearTimeout(availTimer);
    availTimer = setTimeout(async () => {
      const cats = activeCats();
      const [d, st, en] = [F("event_date").value, F("start_time").value, F("end_time").value];
      if (!d || !st || !en || !cats.length) { $("#avail").textContent = ""; return; }
      const { data, error } = await sb.rpc("check_availability", {
        p_event_date: d, p_start: st, p_end: en, p_photography: cats.includes("photography"), p_videography: cats.includes("videography"),
      });
      const msg = !error && AVAIL[data?.status];
      $("#avail").textContent = msg ? msg[0] : "";
      $("#avail").className = `span2 ${msg ? msg[1] : ""}`;
    }, 300);
  }
  ["event_date", "start_time", "end_time", "distance_km"].forEach((n) => F(n).addEventListener("input", refresh));

  // ---- Turnstile captcha ---------------------------------------------------
  if (CONFIG.turnstileSiteKey) {
    window.onTurnstileLoad = () => window.turnstile.render("#turnstile", {
      sitekey: CONFIG.turnstileSiteKey, theme: "light",
      callback: (t) => { turnstileToken = t; }, "expired-callback": () => { turnstileToken = ""; },
    });
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    sc.async = true;
    document.head.append(sc);
  }

  // ---- Submit -----------------------------------------------------------------
  const showError = (msg) => { const el = $("#error"); el.textContent = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: "center", behavior: "smooth" }); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const req = request();
    if (!req.items.length) return showError("Choose at least one photography or videography package.");
    const f = new Proxy({}, { get: (_, n) => F(n) }); // f.full_name → the field
    const missing = [["event_type_id", "event type"], ["event_date", "event date"], ["start_time", "start time"], ["end_time", "end time"],
      ["location", "venue"], ["city", "city"], ["full_name", "full name"], ["mobile", "mobile number"], ["email", "email"]].find(([n]) => !f[n].value.trim());
    if (missing) { f[missing[0]].focus(); return showError(`Please enter your ${missing[1]}.`); }
    if (CONFIG.turnstileSiteKey && !turnstileToken) return showError("Complete the verification check above the button.");

    const btn = $("#submit");
    btn.disabled = true; btn.textContent = "Sending request…";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${FUNCTIONS_URL}/booking-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${session?.access_token ?? CONFIG.supabaseAnonKey}` },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          turnstile_token: turnstileToken || undefined,
          customer: { full_name: f.full_name.value, mobile: f.mobile.value, whatsapp: f.whatsapp.value, email: f.email.value },
          event: {
            event_type_id: f.event_type_id.value, event_name: f.event_name.value || undefined, event_date: f.event_date.value,
            start_time: f.start_time.value, end_time: f.end_time.value, location: f.location.value, city: f.city.value,
            guest_count: f.guest_count.value ? Number(f.guest_count.value) : undefined,
          },
          ...req,
          special_requirements: f.special_requirements.value || undefined,
          message: f.message.value || undefined,
          referral_source: f.referral_source.value || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.booking_id) {
        showError(json.error ?? "Your request could not be sent. Try again.");
        if (CONFIG.turnstileSiteKey && window.turnstile) { window.turnstile.reset(); turnstileToken = ""; }
        return;
      }
      location.href = `booked.html?id=${encodeURIComponent(json.booking_id)}`;
    } catch {
      showError("Network error. Check your connection and try again — your details are still here.");
    } finally {
      btn.disabled = false; btn.textContent = "Send booking request";
    }
  });

  drawServices(); drawAddons(); refresh();
  void $$;
} catch (err) { pageError("#main", err); }

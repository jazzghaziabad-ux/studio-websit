// Early validation of a booking request. The database validates everything
// again and recomputes the price from the catalog — this only rejects junk.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\+?[0-9]{10,15}$/;

type Obj = Record<string, unknown>;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export type ValidationResult = { ok: true; value: Obj; turnstileToken?: string } | { ok: false; error: string; field?: string };

export function validateBooking(body: unknown): ValidationResult {
  if (!isObj(body)) return { ok: false, error: "Invalid request." };
  const fail = (error: string, field?: string): ValidationResult => ({ ok: false, error, field });

  const key = str(body.idempotency_key, 64);
  if (!UUID.test(key)) return fail("Invalid request.", "idempotency_key");

  const c = isObj(body.customer) ? body.customer : {};
  const fullName = str(c.full_name, 120);
  const email = str(c.email, 254).toLowerCase();
  const mobile = str(c.mobile, 30).replace(/[^0-9+]/g, "");
  const whatsapp = str(c.whatsapp, 30).replace(/[^0-9+]/g, "");
  if (fullName.length < 2) return fail("Enter your full name", "customer.full_name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address", "customer.email");
  if (!PHONE.test(mobile)) return fail("Enter a valid mobile number", "customer.mobile");
  if (whatsapp && !PHONE.test(whatsapp)) return fail("Enter a valid WhatsApp number", "customer.whatsapp");

  const e = isObj(body.event) ? body.event : {};
  const ev = {
    event_type_id: str(e.event_type_id, 64), event_name: str(e.event_name, 200) || undefined,
    event_date: str(e.event_date, 10), start_time: str(e.start_time, 5), end_time: str(e.end_time, 5),
    location: str(e.location, 500), city: str(e.city, 100), guest_count: num(e.guest_count),
  };
  if (!UUID.test(ev.event_type_id)) return fail("Choose an event type", "event.event_type_id");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.event_date)) return fail("Choose an event date", "event.event_date");
  if (!/^\d{2}:\d{2}$/.test(ev.start_time)) return fail("Choose a start time", "event.start_time");
  if (!/^\d{2}:\d{2}$/.test(ev.end_time)) return fail("Choose an end time", "event.end_time");
  if (ev.location.length < 2) return fail("Enter the venue or address", "event.location");
  if (ev.city.length < 2) return fail("Enter the city", "event.city");
  if (ev.guest_count !== undefined && (!Number.isInteger(ev.guest_count) || ev.guest_count < 1 || ev.guest_count > 100000)) return fail("Enter a valid guest count", "event.guest_count");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 2) return fail("Choose at least one package", "items");
  const cleanItems = [];
  for (const it of items) {
    if (!isObj(it) || !UUID.test(str(it.package_duration_id, 64))) return fail("Choose a valid package", "items");
    const hours = num(it.custom_hours);
    if (hours !== undefined && !(hours > 0 && hours <= 24)) return fail("Duration must be between 0 and 24 hours", "items");
    cleanItems.push({ package_duration_id: str(it.package_duration_id, 64), ...(hours !== undefined ? { custom_hours: hours } : {}) });
  }

  const addons = Array.isArray(body.addons) ? body.addons : [];
  if (addons.length > 30) return fail("Too many add-ons", "addons");
  const cleanAddons = [];
  for (const a of addons) {
    if (!isObj(a) || !UUID.test(str(a.addon_id, 64))) return fail("Choose a valid add-on", "addons");
    const q = num(a.quantity);
    if (q !== undefined && !(q > 0 && q <= 100)) return fail("Invalid add-on quantity", "addons");
    cleanAddons.push({ addon_id: str(a.addon_id, 64), ...(q !== undefined ? { quantity: q } : {}) });
  }

  const distance = num(body.distance_km);
  if (distance !== undefined && !(distance >= 0 && distance <= 5000)) return fail("Invalid travel distance", "distance_km");

  return {
    ok: true,
    turnstileToken: str(body.turnstile_token, 2048) || undefined,
    value: {
      idempotency_key: key,
      customer: { full_name: fullName, email, mobile, whatsapp: whatsapp || null },
      event: ev,
      items: cleanItems,
      addons: cleanAddons,
      ...(distance !== undefined ? { distance_km: distance } : {}),
      special_requirements: str(body.special_requirements, 4000) || undefined,
      message: str(body.message, 4000) || undefined,
      referral_source: str(body.referral_source, 100) || undefined,
    },
  };
}

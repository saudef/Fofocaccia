// FoFocaccia · National Address lookup (Supabase Edge Function, Deno).
//
// Turns a Saudi short address (RRRD2929) into a full address and coordinates by calling the government's
// National Address API with the bakery's key, which lives in a Supabase secret and never reaches the browser.
//
//   GET /national-address?code=RRRD2929&lang=en   →  200 {found:true, code, building, additional, street, district, city, postcode, region, lat, lng, text}
//                                                   404 {found:false, code}      400 {error:"invalid code"}      503 {error:"not configured"}
//
// Secrets (Supabase → Edge Functions → Secrets, or `supabase secrets set`):
//   NATIONAL_ADDRESS_API_KEY   the key from https://api.address.gov.sa (subscribe to "National Address By Short Address")
//   NATIONAL_ADDRESS_PATH      optional; the operation path under v3.1 if it differs from the default below
//   NA_ALLOWED_ORIGINS         optional; comma-separated site origins allowed to call this, e.g. https://fofocaccia.sa
//
// Deploy without JWT checks so the public website can call it:  supabase functions deploy national-address --no-verify-jwt

const API_BASE = Deno.env.get("NATIONAL_ADDRESS_BASE") ?? "https://apina.address.gov.sa/NationalAddress/v3.1";
const API_PATH = Deno.env.get("NATIONAL_ADDRESS_PATH") ?? "Address/address-shortaddress";
const API_KEY = Deno.env.get("NATIONAL_ADDRESS_API_KEY") ?? "";
const ORIGINS = (Deno.env.get("NA_ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);

const cors = (origin: string | null) => ({
  "access-control-allow-origin": ORIGINS.includes("*") ? "*" : (origin && ORIGINS.includes(origin) ? origin : ORIGINS[0] ?? ""),
  "access-control-allow-headers": "apikey, authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "vary": "origin",
});
const json = (body: unknown, status = 200, extra: Record<string, string> = {}, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors(origin), ...extra } });

// The API's field names vary by version and language; read them case-insensitively from the first address returned.
function pick(body: unknown): Record<string, unknown> | null {
  const root = body as Record<string, unknown>;
  const list = (root?.Addresses ?? root?.addresses ?? root?.Address ?? root?.data ?? root) as unknown;
  const a = (Array.isArray(list) ? list[0] : list) as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  const lower: Record<string, unknown> = {}; for (const [k, v] of Object.entries(a)) lower[k.toLowerCase()] = v;
  const g = (...keys: string[]) => { for (const k of keys) { const v = lower[k.toLowerCase()]; if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim(); } return ""; };
  const num = (s: string) => (s && !isNaN(Number(s)) ? Number(s) : null);
  const building = g("BuildingNumber", "Building"), additional = g("AdditionalNumber", "Additional"), street = g("Street", "StreetName"), district = g("District", "DistrictName"), city = g("City", "CityName"), postcode = g("PostCode", "ZipCode", "PostalCode"), region = g("RegionName", "Region");
  const lat = num(g("Latitude", "Lat")), lng = num(g("Longitude", "Long", "Lng"));
  if (!building && !street && !district && !city && lat == null) return null;
  const text = [building && `Building ${building}`, street, district, city, postcode && `${postcode}${additional ? "-" + additional : ""}`].filter(Boolean).join(", ");
  return { building, additional, street, district, city, postcode, region, lat, lng, text };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "GET") return json({ error: "method" }, 405, {}, origin);
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{4}$/.test(code)) return json({ error: "invalid code" }, 400, {}, origin);
  if (!API_KEY) return json({ error: "not configured" }, 503, {}, origin);
  const language = url.searchParams.get("lang") === "ar" ? "A" : "E";
  const api = `${API_BASE}/${API_PATH}?shortaddress=${code}&format=json&language=${language}&encode=utf8`;
  let upstream: Response;
  try { upstream = await fetch(api, { headers: { api_key: API_KEY, accept: "application/json" } }); }
  catch (_e) { return json({ error: "upstream unreachable" }, 502, {}, origin); }
  if (!upstream.ok) return json({ error: "upstream", status: upstream.status }, 502, {}, origin);
  let body: unknown; try { body = await upstream.json(); } catch (_e) { return json({ error: "upstream format" }, 502, {}, origin); }
  const a = pick(body);
  if (!a) return json({ found: false, code }, 404, { "cache-control": "public, max-age=3600" }, origin);
  return json({ found: true, code, ...a }, 200, { "cache-control": "public, max-age=86400" }, origin);
});

// ═══════════════════════════════════════════════════════════════════════
//  submit-lead — the only way a row gets into public.leads
//
//  The funnel posts here instead of writing to the database directly, so the
//  database keys never reach the browser and the table cannot be spammed.
//
//  Deploy:
//    supabase functions deploy submit-lead --no-verify-jwt
//
//  --no-verify-jwt matters. Without it the browser would have to send an
//  Authorization header, which turns the request into a CORS preflight and
//  costs an extra round trip on every submission. The function is still safe:
//  it validates everything and only ever inserts.
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",          // lock to your domain if you prefer
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const REVENUE = ["0-20k", "20k-50k", "50k-100k", "100k-250k", "250k+"];
const INDUSTRY = ["b2b-services", "b2c-services", "ecommerce", "other"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v: unknown, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── read the body in whichever shape it arrives ──────────────────────
  // The funnel sends form-encoded (a "simple" CORS request, so no preflight).
  // JSON is accepted too, in case you ever post from somewhere else.
  let data: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      data = await req.json();
    } else {
      data = Object.fromEntries(new URLSearchParams(await req.text()));
    }
  } catch {
    return json({ error: "unreadable_body" }, 400);
  }

  // ── validate ─────────────────────────────────────────────────────────
  const full_name = str(data.full_name, 120);
  const email = str(data.email, 200).toLowerCase();
  const phone = str(data.phone, 40);

  if (full_name.length < 2) return json({ error: "invalid_name" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "invalid_email" }, 400);

  const monthly_revenue = str(data.monthly_revenue, 20);
  const industry = str(data.industry, 20);
  if (monthly_revenue && !REVENUE.includes(monthly_revenue))
    return json({ error: "invalid_revenue" }, 400);
  if (industry && !INDUSTRY.includes(industry))
    return json({ error: "invalid_industry" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── light duplicate guard ────────────────────────────────────────────
  // Someone double-clicking, or a bot hammering the endpoint, should not
  // produce twenty rows. Same email inside 60 seconds is treated as the
  // same submission and quietly accepted without a second insert.
  const { data: recent } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email)
    .gt("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1);

  if (recent && recent.length) return json({ ok: true, duplicate: true });

  // ── build the row ────────────────────────────────────────────────────
  const scoreRaw = Number(data.lead_score);
  const submitted = str(data.submitted_at, 40);

  const row = {
    full_name,
    first_name: str(data.first_name, 80) || full_name.split(/\s+/)[0],
    last_name: str(data.last_name, 80) || full_name.split(/\s+/).slice(1).join(" "),
    email,
    phone,

    monthly_revenue,
    monthly_revenue_label: str(data.monthly_revenue_label, 40),
    industry,
    industry_label: str(data.industry_label, 40),
    qualified: str(data.qualified) === "yes" || data.qualified === true,
    route: str(data.route, 40),
    offer: str(data.offer, 120),
    lead_score: Number.isFinite(scoreRaw) ? Math.trunc(scoreRaw) : null,

    source: str(data.source, 120),
    page_url: str(data.page_url, 2000),
    referrer: str(data.referrer, 2000),
    timezone: str(data.timezone, 60),
    utm_source: str(data.utm_source, 200),
    utm_medium: str(data.utm_medium, 200),
    utm_campaign: str(data.utm_campaign, 200),
    utm_content: str(data.utm_content, 200),
    utm_term: str(data.utm_term, 200),
    fbclid: str(data.fbclid, 400),
    gclid: str(data.gclid, 400),
    ttclid: str(data.ttclid, 400),
    ref: str(data.ref, 200),

    submitted_at: submitted && !isNaN(Date.parse(submitted)) ? submitted : null,
    raw: data,          // keep the original, so a field added later is never lost
  };

  const { error } = await supabase.from("leads").insert(row);

  if (error) {
    console.error("insert failed", error);
    return json({ error: "insert_failed", detail: error.message }, 500);
  }

  return json({ ok: true });
});

-- ═══════════════════════════════════════════════════════════════════════
--  Outwork Social — Paid Video Lead Engine
--  Lead storage for the CRM.
--
--  Run this once: Supabase dashboard → SQL Editor → paste → Run.
--  Safe to re-run; every statement is guarded.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────── the table
create table if not exists public.leads (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),

  -- who they are
  full_name              text not null,
  first_name             text,
  last_name              text,
  email                  text not null,
  phone                  text,

  -- what the quiz told us
  monthly_revenue        text,          -- '0-20k' | '20k-50k' | '50k-100k' | '100k-250k' | '250k+'
  monthly_revenue_label  text,          -- '£50k–£100k'
  industry               text,          -- 'b2b-services' | 'b2c-services' | 'ecommerce' | 'other'
  industry_label         text,          -- 'B2B services'
  qualified              boolean not null default false,
  route                  text,          -- 'main-offer' | 'done-with-you'
  offer                  text,
  lead_score             smallint,      -- 1..5, from the revenue band

  -- where they came from
  source                 text,
  page_url               text,
  referrer               text,
  timezone               text,
  utm_source             text,
  utm_medium             text,
  utm_campaign           text,
  utm_content            text,
  utm_term               text,
  fbclid                 text,
  gclid                  text,
  ttclid                 text,
  ref                    text,

  submitted_at           timestamptz,   -- clock on the visitor's device
  raw                    jsonb          -- the untouched payload, so nothing is ever lost
);

comment on table public.leads is
  'Every submission from the Paid Video Lead Engine funnel, qualified or not.';

-- ─────────────────────────────────────────────────────────────── indexes
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx      on public.leads (lower(email));
create index if not exists leads_qualified_idx  on public.leads (qualified);
create index if not exists leads_route_idx      on public.leads (route);

-- full-text-ish search across the fields the CRM search box covers
create index if not exists leads_search_idx on public.leads
  using gin (to_tsvector('simple',
    coalesce(full_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')));

-- ─────────────────────────────────────────────────────── row level security
--  Nothing is readable or writable by the public.
--  • Inserts happen ONLY through the submit-lead Edge Function, which uses the
--    service-role key and therefore bypasses RLS entirely.
--  • Reads are for signed-in CRM users only.
alter table public.leads enable row level security;

drop policy if exists "CRM users can read leads" on public.leads;
create policy "CRM users can read leads"
  on public.leads for select
  to authenticated
  using (true);

-- Deliberately NO insert/update/delete policy for anon or authenticated.
-- The anon key is public, so leaving it able to write would let anyone
-- fill this table with junk.

-- ────────────────────────────────────────────────── convenience for the CRM
-- Headline numbers, computed in the database so the dashboard stays light.
create or replace view public.lead_stats
with (security_invoker = true) as
select
  count(*)                                                          as total,
  count(*) filter (where qualified)                                 as qualified,
  count(*) filter (where not qualified)                             as non_qualified,
  count(*) filter (where created_at > now() - interval '7 days')    as last_7_days,
  count(*) filter (where created_at > now() - interval '30 days')   as last_30_days,
  round(avg(lead_score)::numeric, 2)                                as avg_lead_score
from public.leads;

comment on view public.lead_stats is
  'Headline counts for the CRM dashboard. security_invoker means it obeys the
   caller''s RLS, so it is only readable by signed-in users.';

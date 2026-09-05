# Outwork Social — Paid Video Lead Engine funnel

Amended build. Upload the whole folder to Netlify (drag and drop) and it works.
Keep the folder structure intact — every path is relative.

```
index.html          landing page
apply.html          the 5-question qualifying quiz
thank-you.html      confirmation + Calendly booking
crm.html            NEW — your leads dashboard (sign-in required)
favicon.ico
SUPABASE-SETUP.md   NEW — 15 minute setup, read this first
supabase/
  migrations/       the leads table + security rules (run once in the SQL editor)
  functions/        submit-lead, the only thing that can write to the table
assets/
  fonts/            NeuePlak-ExtraBlack.woff2 (+ .ttf fallback)
  logos/            outwork-logo.png, 4 client logos, favicon sizes
  videos/           6 client ads, .mp4 (+ optional .webm fallback)
  case-studies/     4 ROAS infographics
```

---

## ⚙️ What you still need to fill in

| Where | Setting | What to put in |
|---|---|---|
| `apply.html` | `LEAD_ENDPOINT` | Your submit-lead Edge Function URL |
| `crm.html` | `SUPABASE_URL` + `SUPABASE_ANON_KEY` | Project Settings → API |

**Leads now go to Supabase, not Zapier.** See `SUPABASE-SETUP.md` for the four
setup steps. There are no Zapier references left anywhere in the site.

Both Calendly events are now connected:

| Route | Event | Where it is set |
|---|---|---|
| Qualified (£20k+) | `outworksocial/leads` — Paid Video Lead Engine, Strategy & Fit Assessment | `CALENDLY_URL` in `thank-you.html` |
| Non-qualified | `outworksocial/30-videos-strategy-fit-assessment-clone` — Done With You Video + Ads Call | `CALENDLY_DWY_URL` in `apply.html` |

Everything else is done. Each setting sits in a commented `CONFIG` block at the
top of its file — nothing is buried in the code.

### Aktiv Grotesk

Kit `mml4jvv` is live on all three pages. It contains:

    aktiv-grotesk        400 normal + italic, 700 normal + italic
    aktiv-grotesk-thin   200 normal + italic

The funnel asks for 400, 600, 700 and 800. CSS font matching resolves 600 and 800
to the **real 700 face** (for a target above 500 the browser looks upward first,
then downward, and only invents a weight when no bold face exists at all), so
nothing is faked.

---

## Lead storage

Leads are stored in **Supabase Postgres** and read back by `crm.html`.

- The form posts to the `submit-lead` Edge Function, which validates and then
  inserts server-side. Your database keys never reach the browser.
- Sent as `application/x-www-form-urlencoded`, deliberately — that is a "simple"
  CORS request, so it needs no preflight and works from any host.
- **Every** submission is stored, qualified or not, so no lead is lost.
- Fields sent: `first_name`, `last_name`, `full_name`, `email`, `phone`,
  `monthly_revenue` (+ readable label), `industry` (+ label), `qualified`,
  `route`, `offer`, `lead_score`, `source`, `submitted_at`, `page_url`,
  `referrer`, `timezone`, and `utm_source / medium / campaign / content / term`,
  plus `fbclid` / `gclid` / `ttclid`.
- There is **no company/business field**, because the quiz never asks for one.
  Say the word and I will add it as a sixth question.
- The untouched original payload also goes into a `raw` jsonb column, so a
  question added later is captured before anyone adds a column for it.

`qualified` (`yes`/`no`) and `route` (`main-offer`/`done-with-you`) let you split
the two groups in the CRM, in SQL, or in any automation you point at the table.

**Submission blocks the redirect.** Nobody reaches the thank-you page until the
row is actually written to Postgres. If the request fails it retries via
`sendBeacon`, and only if that also fails does it show a "that didn't send"
screen with a retry button and your email address.

---

## Meta Pixel

Pixel **718400200187046** is live on the three public pages. It is deliberately
**not** on `crm.html` — that is an internal tool and its traffic would pollute
your audiences.

| Page | Events |
|---|---|
| `index.html` | `PageView` |
| `apply.html` | `PageView`, then `Lead` on a successful submission |
| `thank-you.html` | `PageView`, then `Schedule` when a booking completes |
| `crm.html` | none, by design |

**`Lead` is gated on the database write.** It fires from the same branch that
allows the redirect, so the pixel never reports a conversion for a submission
that did not land. It carries `content_category` (`main-offer` or
`done-with-you`) and `qualified` (`yes`/`no`), so you can build separate custom
audiences and optimise for the qualified half only.

**`Schedule` listens to Calendly.** Rather than assuming a thank-you page view
means a booking, the page listens for Calendly's own `calendly.event_scheduled`
message and checks the origin is really `calendly.com` before firing. So
`Schedule` means someone actually picked a time.

Suggested setup in Events Manager: optimise for **Lead** while volume is low,
then move to **Schedule** once you have enough booking events, since that is the
outcome you actually want. To exclude the small end of the market from
optimisation, build a custom audience on `Lead` where `qualified = yes`.

One caveat worth knowing: if the network drops at the moment of submission, the
form falls back to `navigator.sendBeacon`, and a successfully queued beacon
counts as delivered. That is the right trade in almost every case, but it means
a lead queued against a genuinely unreachable endpoint would show as success.
Keep `LEAD_ENDPOINT` correct and this never comes up.

---

## Calendly prefill — how it works

1. Form submits and the lead is confirmed saved.
2. Only what Calendly needs (name, email, phone, plus the UTMs) is written to
   **`sessionStorage`** — not localStorage, so it dies with the tab and nothing
   personal ever appears in a URL.
3. Redirect to `thank-you.html`.
4. That page reads it back and calls Calendly's supported
   `Calendly.initInlineWidget({ prefill, utm })` API — not a URL hack.

Non-qualified leads get the same treatment on the done-with-you screen: the
button links to the Done With You event with `name`, `email` and the phone
attached as supported Calendly query parameters.

Full name and email prefill on both events with no setup. **The phone number
needs one thing from you:** each event must have a question asking for a phone
number. Calendly names the first custom question on an event `a1`, which is what
the code fills. If your phone question sits second or third on either event,
change `CALENDLY_PHONE_FIELD` in that page's CONFIG block from `"a1"` to `"a2"`
or `"a3"` to match its position.

No `month=` or `date=` parameters are sent, so neither event opens pinned to a
fixed day.

The UTMs are passed through to the qualified event too, so you can see in
Calendly which ad produced each booking. If the Calendly script is ever blocked,
the page falls back to a plain button linking to the booking page with the same
details attached.

---

## Notes on things I had to decide

- **Your Downeys Kia video was HEVC (H.265)**, which Chrome on Windows/Android
  and Firefox cannot play — it would have shown a black card for a lot of your
  traffic. All six are now H.264. Re-encoding also took the set from 8.8 MB to
  2.3 MB, which matters with several playing at once.
- **The infographics are now 2× resolution.** The blur was not compression (my
  encode measured 39.5 dB PSNR, effectively lossless) — the source art is only
  ~1000 px wide, so a retina screen was stretching it across a 548 px card.
  All four are now upscaled and sharpened to ~2048 px, which measures 1.7×
  crisper at the size they actually paint. AB&C uses the newer artwork you sent.
- **The under-£20k route still ends on `apply.html`**, not the thank-you page,
  because it is a different message with a different offer and its own Calendly
  link. The thank-you page is for qualified leads. Easy to change if you'd rather
  both went there.
- **I added a favicon** (cut from your logo mark). It was the only thing throwing
  a console error, since browsers request `/favicon.ico` whether you have one or not.
- **The Campaigns row is client names as text**, not logos. The logo PNGs are
  still in `/assets/logos` — to bring one back, give its entry in the `CLIENTS`
  array in `index.html` a `logo:` path and an `h:` height.
- **The 01–06 badges in "The offer"** are centred and larger. The card text under
  them is still left-aligned; if you want that centred too, add
  `text-align:center` to the `.inc > div` rule.
- **Section kickers.** "Our own results" sits above the £25,078 → £271,685
  section, "Client results" above the four case studies, so it is obvious whose
  numbers are whose. They are `.kicker` in the CSS if you want them resized.
- **The `.webm` files are optional.** Every current browser takes the smaller
  `.mp4`. Delete them if you'd rather not host them; nothing else changes.

---

## Verified before hand-off

Ran in a real browser at 1920 / 1440 / 1024 / 768 / 390 px:

Vimeo 1191513402 loads · Aktiv Grotesk Regular 400 only, live from kit mml4jvv · Neue Plak
loading and rendering at its true weight · logo image everywhere · 6 videos
autoplay, loop, muted, playsinline, no controls · **marquee wrap drift measured
at 0.0000 px with both halves proven identical, at every breakpoint** · all six
client names as text in the Campaigns row · 4
infographics at their exact source aspect ratio · 0 em dashes in visible copy
with `90-day`, `done-with-you`, `high-intent` etc. intact · lead reaches Zapier
with all UTMs · redirect only after successful capture · thank-you page
personalised by first name · Calendly prefilled with name, email, phone and UTMs
· no PII in any URL · `prefers-reduced-motion` stops the marquee and the videos ·
no horizontal overflow anywhere · no console errors · reel resumes correctly
after scrolling away and back, including rapid repeated cycles.

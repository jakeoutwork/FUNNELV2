# Supabase setup — 15 minutes, four steps

The site itself still lives on Netlify. Supabase is the database behind it: it
stores every lead and powers `crm.html`. Nothing about the funnel's design,
questions, qualification logic or Calendly booking changes.

```
apply.html  ──POST──▶  submit-lead (Edge Function)  ──▶  leads table
                                                            │
crm.html  ──sign in──────────────────────────────────────▶ ─┘
```

The form never touches the database directly. It posts to a small function that
validates first, so your database keys never reach the browser and nobody can
write junk straight into the table.

---

## 1. Create the table

Supabase dashboard → **SQL Editor** → New query → paste the whole of
`supabase/migrations/0001_leads.sql` → **Run**.

That creates the `leads` table, its indexes, and the row-level-security rules:

- **Nobody** can insert, update or delete through the public API.
- Only **signed-in users** can read.

Inserts happen exclusively through the Edge Function, which uses the
service-role key and therefore bypasses RLS. That is the whole point of the
design: the public key can never write.

## 2. Deploy the Edge Function

Easiest route is the dashboard: **Edge Functions → Deploy a new function →**
name it `submit-lead`, paste the contents of
`supabase/functions/submit-lead/index.ts`, and turn **"Verify JWT"** OFF.

Or from your machine:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy submit-lead --no-verify-jwt
```

**`--no-verify-jwt` matters.** With JWT verification on, the browser has to send
an `Authorization` header, which turns every submission into a CORS preflight
and adds a wasted round trip. The function is still safe without it: it
validates the name, the email format, and checks the revenue and industry
answers against a fixed list before writing anything.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
you do not set them yourself.

## 3. Point the funnel at it

Supabase → Edge Functions → `submit-lead` shows you the URL. Put it in
**`apply.html`, line 29**:

```js
LEAD_ENDPOINT: "https://YOUR-PROJECT-REF.supabase.co/functions/v1/submit-lead",
```

## 4. Switch the CRM on

**Project Settings → API** gives you two values. Put them at the top of
**`crm.html`**:

```js
SUPABASE_URL:      "https://YOUR-PROJECT-REF.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi..."      // the anon / publishable key
```

Use the **anon** key, never the service_role key. The anon key is designed to be
public — row-level security means it can only read leads after someone signs in,
and it can never write.

Then create yourself a login: **Authentication → Users → Add user**, with
"Auto Confirm User" ticked. That email and password is what you use at
`yoursite.com/crm.html`. Add one user per person who should see the leads.

---

## What the CRM does

- **Headline numbers** — total, qualified, done-with-you, last 7 days, average lead score
- **Live** — a new submission appears without refreshing the page
- **Filter** by qualified / not qualified, and by 7 / 30 / 90 days / all time
- **Search** across name, email and phone
- **Sort** on any column, click the header
- **Click a lead** for the full record: contact details, qualification answers,
  and the whole attribution trail (all five UTMs, Facebook and Google click IDs,
  referrer, landing page, timezone)
- **Export CSV** of whatever is currently filtered on screen, 19 columns
- **Email / call** buttons on each lead

`crm.html` is `noindex, nofollow` and useless without a login, but it is a public
URL. If you would rather it were not guessable, rename the file to something
like `leads-8f2a.html` — nothing else needs changing.

---

## Notes

- **Every submission is stored**, qualified or not, so you have the full picture
  of who is coming through and where the drop-off sits.
- **Nothing is ever lost.** Alongside the named columns, the complete original
  payload goes into a `raw` jsonb column. If you add a question to the quiz
  later, the answer is captured even before anyone adds a column for it.
- **Duplicate guard.** The same email inside 60 seconds is treated as one
  submission, so a double-click or a retry does not create twin rows.
- **The redirect still waits for the database.** Nobody reaches the thank-you
  page until the row is actually written. If the request fails it retries via
  `sendBeacon`, and only if that also fails does the "that didn't send" screen
  appear with a retry button.
- **Zapier is gone**, as you asked. If you want automations back, the cleanest
  route is Supabase → Database → Webhooks, firing on insert into `leads`. That
  keeps the database as the single source of truth and lets Zapier subscribe to
  it rather than the other way round.

### Adding a sales pipeline later

The table has no `status` column, because you asked for a dashboard rather than
pipeline management. Adding one is two lines of SQL plus a dropdown in the CRM:

```sql
alter table public.leads add column status text not null default 'new';
create policy "CRM users can update leads" on public.leads
  for update to authenticated using (true) with check (true);
```

Say the word and I will wire the UI for it.

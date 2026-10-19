# Captain Glow Mini Golf · Marketing Center

Your own marketing app for **Captain Glow Mini Golf**. It keeps your customer list, sends branded emails and text messages on a schedule (a safe amount each day), tracks who opens and clicks, and turns anyone who clicks an offer, like **"Book a party"**, into a sales lead you can follow up.

You use it entirely in your web browser. There's nothing to install on your computer and no commands to run day to day.

---

## Contents

1. [What each page does](#what-each-page-does)
2. [Putting it online with Railway](#putting-it-online-with-railway)
3. [Setting up email (Resend)](#setting-up-email-resend)
4. [Setting up text messages (Twilio)](#setting-up-text-messages-twilio)
5. [Optional: syncing customers from Wave](#optional-syncing-customers-from-wave)
6. [How the daily limit works (and why nobody gets an email twice)](#how-the-daily-limit-works)
7. [Repeating campaigns](#repeating-campaigns)
8. [Customer groups](#customer-groups)
9. [Text blasts](#text-blasts)
10. [The nightly customer sync](#the-nightly-customer-sync)
11. [Test it before your first real campaign (10 steps)](#test-it-before-your-first-real-campaign)
12. [Launch checklist](#launch-checklist)
13. [Lost password](#lost-password)
14. [Running it on your own computer (for developers)](#running-it-on-your-own-computer)
15. [Project layout (for developers)](#project-layout)

---

## What each page does

| Page | What it's for |
|---|---|
| **Dashboard** | Customer count, emails sent, today's progress against your daily limit, open and click rates, running campaigns, and whether everything is healthy (database, scheduler, email provider). |
| **Customers** | Your full list. Search, filter (for example "Has a phone, no texting consent"), sort, edit, disable, delete, bulk actions, **CSV import and export**. Click someone to see every email and text they've ever been sent. |
| **Customer groups** | Saved lists like "Party hosts 2026". Shows how many members can actually be emailed or texted. |
| **Campaigns** | Create a campaign in 8 steps: channel → template → content → customers → schedule → sender → test mode → review. Each campaign page shows the live queue, with pause / resume / cancel. |
| **Email templates** | A drag-free block editor with a live preview: logo, headline, paragraph, image, flyer, button, "Text us" button, divider, spacer, services and party packages. Three starter templates are included. |
| **Schedule** | Today's progress, the next send time, system status, and a **"Send next batch now"** button. |
| **Analytics** | Sent, delivered, opened, clicked, bounced and failed, as charts over time and per campaign. |
| **Leads** | Everyone who clicked an offer button, moved through **New → Contacted → Quoted → Won / Lost**, with notes. |
| **Integrations** | Status and connection tests for email (Resend), texting (Twilio) and your customer source, plus a "Send test email" button. |
| **Settings** | Business details, **mailing address** (required by law), timezone, send time, daily limits, batch size, logo, brand colour, sender addresses, texting options, services, birthday packages, password and the activity log. |
| **Help** | Plain-language answers to the most common questions. |

Behind the scenes there are also public pages your customers see: the **unsubscribe page**, the invisible **open-tracking pixel**, and the **click tracker** that records interest before sending people on to your website.

---

## Putting it online with Railway

Railway hosts the app and its database for a few dollars a month. You'll do this once.

### 1. Create the project
1. Sign in at [railway.com](https://railway.com) (signing in with GitHub is easiest).
2. Click **New Project → Deploy from GitHub repo** and choose **Captainglowmailcampaign**.
3. Railway finds the `Dockerfile` and `railway.json` automatically and starts building. The first build may fail because the variables aren't set yet. That's fine.

### 2. Add the database
1. In the project, click **+ New → Database → Add PostgreSQL**.
2. Open your app service → **Variables** → **+ New Variable** → **Add Reference** → choose `DATABASE_URL` from the Postgres service.

The app creates all of its tables by itself the first time it starts.

### 3. Add storage for your logo and flyers
1. Open your app service → **Settings → Volumes → + New Volume**.
2. Mount path: **`/data`**.
3. Add the variable `UPLOAD_DIR` = `/data/uploads` (see below).

Without the volume, uploaded images would disappear every time the app restarts.

### 4. Add the variables
App service → **Variables**. "How to test it" tells you how to check each one is working.

| Variable | Where it goes / what it expects | How to test it |
|---|---|---|
| `DATABASE_URL` | Reference to the Railway PostgreSQL service (step 2). | `https://your-address/healthz` shows `"database":"ok"`. |
| `SESSION_SECRET` | Any long random text, at least 32 characters. Keeps sign-ins secure. Generate one at [1password.com/password-generator](https://1password.com/password-generator/). | You stay signed in after a redeploy. |
| `APP_URL` | Your public address with no slash at the end: `https://marketing.captainglowsminigolf.com` | Unsubscribe and tracking links in emails start with this address. |
| `ADMIN_EMAIL` | `owner@captainglowsminigolf.com` | `/healthz` shows `"accounts":1`. |
| `ADMIN_PASSWORD` | The password you'll sign in with (10+ characters). Only used to **create** the account the first time, or to reset it (next row). | You can sign in. |
| `ADMIN_PASSWORD_RESET` | `false`. Set to `true` for **one** restart to reset your password to `ADMIN_PASSWORD`, then set it back to `false`. | The log says "Password … was reset". |
| `RESEND_API_KEY` | From Resend (see below). Starts with `re_`. | Integrations → Email → **Test connection**. |
| `RESEND_FROM_EMAIL` | `marketing@captainglowsminigolf.com` | Shown on Integrations; test email arrives from it. |
| `RESEND_FROM_NAME` | `Captain Glow` | Name shown in the inbox. |
| `RESEND_REPLY_TO` | `service@captainglowsminigolf.com` | Reply to a test email; it goes here. |
| `RESEND_WEBHOOK_SECRET` | From Resend → Webhooks (starts with `whsec_`). | Integrations no longer warns that it's missing. |
| `TWILIO_ACCOUNT_SID` | From the Twilio Console (starts with `AC`). | Integrations → Texting → **Test connection**. |
| `TWILIO_AUTH_TOKEN` | From the Twilio Console. | Same test. |
| `TWILIO_FROM_NUMBER` | Your Twilio number, like `+15551234567`. | A test text arrives from it. |
| `SMS_NUMBER` | The number customers can text you at, for the "Text us" button. You can also set it in Settings. | The button shows in the email preview. |
| `WAVE_API_TOKEN` | *Optional.* Only if you use Wave Accounting (see below). | Integrations shows a Wave card. |
| `WAVE_BUSINESS_ID` | *Optional.* Usually chosen on the Integrations page instead. | Shown in full on Integrations. |
| `UPLOAD_DIR` | `/data/uploads` | Upload a logo in Settings, redeploy, and it's still there. |

Railway redeploys automatically after you change variables.

### 5. Connect your web address
1. App service → **Settings → Networking → Custom Domain** → enter `marketing.captainglowsminigolf.com`.
2. Railway shows a **CNAME** record. Add it where your domain's DNS is managed (for example GoDaddy, Squarespace Domains or Cloudflare): type **CNAME**, name **marketing**, value as shown by Railway.
3. Wait a few minutes until Railway shows a green tick. HTTPS is set up for you.

### 6. First sign-in
1. Open `https://marketing.captainglowsminigolf.com/healthz`. You should see `"status":"ok"`, `"database":"ok"` and `"accounts":1`.
2. Open `https://marketing.captainglowsminigolf.com` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Go to **Settings** and fill in your **mailing address**, phone, logo and party packages.

> If the database ever goes down, the app keeps running and tells you so instead of crashing. It reconnects on its own.

---

## Setting up email (Resend)

Resend delivers your emails. The free plan covers 3,000 emails a month, which is plenty at 99 a day.

### 1. Verify your domain
1. Sign up at [resend.com](https://resend.com) → **Domains → Add Domain** → `captainglowsminigolf.com`.
2. Resend shows a few DNS records. Add each one at your DNS provider **exactly** as shown:
   - **DKIM** (a TXT record named something like `resend._domainkey`): proves the emails really come from you.
   - **SPF** (an MX and a TXT record on a `send` subdomain): tells inboxes Resend is allowed to send for you.
   - **DMARC** (recommended): add a TXT record named `_dmarc` with the value `v=DMARC1; p=none; rua=mailto:service@captainglowsminigolf.com`. This makes Gmail and Yahoo trust you more. After a few weeks of clean sending you can change `p=none` to `p=quarantine`.
3. Click **Verify**. It can take from a few minutes to a few hours.

### 2. Create the API key
**API Keys → Create API Key**. "Sending access" is enough. Copy it into `RESEND_API_KEY`.
On the Integrations page, a sending-only key shows as **"Limited"**. That's normal: sending works, it just can't list your domains.

### 3. Add the webhook (bounces and spam complaints)
1. **Webhooks → Add Endpoint**.
2. URL: `https://marketing.captainglowsminigolf.com/webhooks/resend` (also shown on the Integrations page).
3. Tick at least: `email.delivered`, `email.bounced`, `email.complained` (and optionally `email.opened`).
4. Copy the **Signing Secret** into `RESEND_WEBHOOK_SECRET`.

Hard bounces and spam complaints go on the **suppression list** automatically and are never emailed again. Every webhook's signature is checked, so nobody can fake one.

---

## Setting up text messages (Twilio)

1. Sign up at [twilio.com](https://www.twilio.com), buy a local number, and complete **A2P 10DLC registration** (required for business texting in the US; Twilio guides you through it).
2. Copy the **Account SID**, **Auth Token** and number into `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`.
3. In Twilio: **Phone Numbers → your number → Messaging → "A message comes in"** → Webhook → `https://marketing.captainglowsminigolf.com/webhooks/twilio/inbound` (HTTP POST).

Replies of **STOP, UNSUBSCRIBE, CANCEL, QUIT or END** opt the customer out and clear their texting consent. **START** opts them back in. Twilio also sends its standard confirmation reply.

Don't want texting at all? Switch off **Settings → Text messages** and leave the Twilio variables empty.

---

## Optional: syncing customers from Wave

By default customers come from **CSV import** and **adding them by hand**, so you don't need Wave. If you keep customers in Wave Accounting, the app can pull them in every night.

1. Create a Wave developer app at [developer.waveapps.com](https://developer.waveapps.com/hc/en-us/articles/360019762711) and generate a **Full Access token**. Put it in `WAVE_API_TOKEN`.
2. After the redeploy, open **Integrations → Wave → Test connection & list businesses** and click **Use this** next to your business. The full business ID is shown and saved.
   (Developers: this runs the GraphQL query `query { businesses(page: 1, pageSize: 50) { edges { node { id name } } } }` against `https://gql.waveapps.com/graphql/public`.)
3. Click **Sync customers now** to do the first import.

Rules: customers are matched on their **Wave ID**, so there are never duplicates. Only customers with a **valid email** are imported. If a customer's Email field is blank but someone typed an address into the contact's first or last name, that address is used, and it's kept out of the name. Without `WAVE_API_TOKEN`, the Wave card is hidden and the nightly job doesn't run.

---

## How the daily limit works

New sending domains that blast hundreds of emails at once land in spam. So the Marketing Center sends **a little each day**:

1. Every **5 minutes** the scheduler wakes up. Before your **send time** (Settings, in your own timezone) it does nothing.
2. It checks today's counter in the database: **remaining = daily limit − sent today**.
3. It takes running campaigns that have people waiting, **oldest first**.
4. It claims a small **batch** (default 10) in one database transaction, marking them "sending".
5. It sends them **one at a time**, then waits (default **30 seconds**) before the next batch.
6. Each success adds one to today's counter and records a "sent" event.
7. When it reaches the limit it **stops**, and the next day it continues **exactly where it left off**.
8. When nobody is left waiting, the campaign is marked **complete** and you get a notification (or, for a repeating campaign, it moves to its next sending day).
9. Addresses that are rejected **fail immediately**. Network hiccups and rate limits are retried up to **3 times**, then marked failed. Nothing retries forever.
10. Unsubscribed, suppressed and disabled customers are **always left out**.

**Why nobody can get the same email twice:** each person can only appear **once per campaign pass**. That rule lives in the database itself (a unique index on campaign + customer + pass), so even a bug or a crash can't create a second copy. Batches are claimed with `FOR UPDATE SKIP LOCKED` plus a PostgreSQL advisory lock, so even two copies of the app running at once can't grab the same person. If the app restarts while something is "sending", it's put back in the queue on boot. Anything already marked "sent" is never touched again.

Texts have their **own** daily counter and limit.

---

## Repeating campaigns

In step 5 of a campaign you can choose:

- **Once**, on a date
- **Every N days**
- **Chosen weekdays every N weeks** (for example, every 2 weeks on Friday)
- **A day of the month every N months** (for example, the 1st of every month)

…and it runs **until you stop it**, **for a number of sends**, or **until a date**.

- Each repeat is called a **pass**. A customer can get each pass once.
- The audience is **rebuilt fresh on every sending day**, so new customers who match are included and people who unsubscribed are dropped.
- The schedule is always measured from the **first send date**. A "31st of the month" campaign sends on the 31st, uses the last day in shorter months (Feb 28, Apr 30…), and goes back to the 31st when it can.
- The **sending calendar** in the wizard and on the campaign page uses exactly the same maths as the sender, so what you see is what sends.
- To end a repeating campaign, click **Stop** on its page.

---

## Customer groups

Groups are saved lists, for example "Birthday party hosts", "League players" or "School groups".

- Create one on **Customer groups**, then add people from the group page (**Add people**) or from **Customers** (tick people → **Add to group**; use **Select all matching** to add a whole filtered list at once).
- You can also add everyone in a CSV file to a group while importing.
- Each group shows its member count and how many members can **actually** be emailed or texted.
- A group **can't be deleted** while a draft, running or paused campaign still uses it.

---

## Text blasts

- Choose **Text message** in step 1 of a campaign.
- Texts only go to customers who **agreed to texts** (checked when the list is built **and** again right before each text goes out). Find people to ask with the filter **"Has a phone, no texting consent"**.
- Every text starts with your short name (unless you mention it yourself) and ends with **"Reply STOP to opt out."** unless it already says how to stop.
- The wizard shows the character count and how many text segments it will use.
- Texts have their own daily limit (Settings).

Mark consent on a customer's profile, with the bulk action "Texting consent: on", or with an **SMS consent** column (yes/no) in your CSV import. Only do this when the customer actually agreed.

---

## The nightly customer sync

Only applies if Wave is connected.

- Every **15 minutes** a separate job checks: is it past the sync hour (Settings) in your timezone, and has no sync succeeded today? If both are true, it pulls customers from Wave.
- It uses its own lock, so it never runs twice at once.
- A manual **Sync customers now** counts for that day.
- After **3 failures in one day** it waits until tomorrow and tells you in Notifications.
- The last and next sync times are on the Integrations page.

---

## Test it before your first real campaign

1. Open `/healthz` and check `"status":"ok"`.
2. **Settings:** fill in the mailing address, phone, logo, brand colour, sender addresses and party packages, then save.
3. **Integrations → Email → Test connection** shows "Connected" or "Limited".
4. **Integrations → Send test email** to yourself. Check it arrives (look in spam too) and the logo and colours look right.
5. **Customers → Add customer** with **your own** email (and your mobile, with "Agreed to texts" on).
6. **Email templates:** open "Birthday party packages", check the preview, and click **Send test**.
7. **Campaigns → New campaign:** pick the template, audience "All customers", and turn on **Test mode** with your email. Launch it. Only you get it, and the yellow banner says no customers will.
8. In that test email, click **Book a party**. It should appear on **Leads**.
9. Create a real campaign aimed at a **group containing only you**. Launch it, then click **Schedule → Send next batch now**. It arrives, and the campaign page shows it as sent and opened.
10. Click **Unsubscribe** at the bottom of that email. Your customer profile now shows "Unsubscribed". (Switch "Subscribed to emails" back on afterwards.) If texting is set up, text **STOP** to your Twilio number and check that "Agreed to texts" switches off.

## Launch checklist

- [ ] Domain verified in Resend (DKIM and SPF green), DMARC record added
- [ ] `RESEND_WEBHOOK_SECRET` set and the webhook added in Resend
- [ ] Mailing address filled in (Settings), as required by CAN-SPAM
- [ ] `SESSION_SECRET` is long and random; `ADMIN_PASSWORD_RESET` is `false`
- [ ] Volume mounted at `/data` and `UPLOAD_DIR=/data/uploads`
- [ ] Custom domain working over HTTPS, and `APP_URL` matches it exactly
- [ ] Logo uploaded and party packages written with real prices
- [ ] Daily limit set low for the first two weeks (e.g. 50–99), raised slowly later
- [ ] The 10-step test above passed
- [ ] Customers imported; only people who agreed to marketing are on the list
- [ ] Texting: A2P 10DLC approved, inbound webhook set, consent recorded only for people who agreed
- [ ] Password changed from the one in `ADMIN_PASSWORD` (Settings → Change password)

---

## Lost password

Pick whichever is easiest:

- **From Railway (no commands):** set `ADMIN_PASSWORD` to a new password and `ADMIN_PASSWORD_RESET` to `true`. Wait for the redeploy, sign in, then set `ADMIN_PASSWORD_RESET` back to `false`.
- **From the command line:** in Railway, open your app service → the **⋯** menu → **Shell** (or use the Railway CLI with `railway ssh`), then run:
  ```
  cd /app/backend && node dist/scripts/admin.js list
  cd /app/backend && node dist/scripts/admin.js set-password owner@captainglowsminigolf.com 'NewPassword123'
  ```
  Locally the same commands are `npm run admin -- list` and `npm run admin -- set-password <email> <password>`.

Failed sign-ins are written to the server log with the reason (no such account, wrong password, too many attempts). The sign-in screen deliberately stays vague so nobody can probe which emails have accounts.

---

## Running it on your own computer

You need Node.js 20+ and PostgreSQL.

```bash
cp .env.example .env              # then edit DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD…
npm run install:all
set -a; source .env; set +a
npm run dev:backend               # API on http://localhost:3000 (migrates the database on start)
npm run dev:frontend              # website on http://localhost:5173 (talks to the API)
```

Production-style build: `npm run build && npm start`, then open http://localhost:3000.

Without `RESEND_API_KEY`, campaigns wait in the queue and the dashboard says email isn't set up. Nothing is lost.

---

## Project layout

```
├── Dockerfile               3 stages: build website → build server → slim runtime serving both
├── railway.json             Railway build + /healthz health check
├── package.json             root build / start scripts
├── .env.example             every setting, explained
├── backend/
│   ├── migrations/          001_initial.sql … (run automatically on boot, tracked in schema_migrations)
│   └── src/
│       ├── index.ts         server, boot sequence, /healthz, serves the built website
│       ├── lib/             database, auth, settings, recurrence.ts (shared with the website), CSV, helpers
│       ├── services/        engine.ts (sending engine), customers.ts (audiences), sync.ts + wave.ts,
│       │                    resend.ts, twilio.ts
│       ├── email/           blocks, renderer (blocks → email HTML), starter templates
│       ├── routes/          one file per area: customers, groups, campaigns, templates, public (tracking + webhooks)…
│       └── scripts/admin.ts password recovery CLI
└── frontend/
    └── src/
        ├── pages/           one page per screen
        ├── components/      layout, block editor, email preview, sending calendar, UI kit
        └── lib/             API client, formatting, types
```

**Tables:** `users`, `customers`, `customer_groups`, `customer_group_members`, `campaigns`, `campaign_recipients` (unique on campaign + customer + pass), `email_events`, `email_templates`, `unsubscribe_records`, `suppression_list`, `sms_suppression_list`, `leads`, `settings`, `audit_logs`, `notifications`, `daily_send_counts`, `sync_runs`, `schema_migrations`.

Emails are stored trimmed and lower-case; phone numbers are matched on their last 10 digits.

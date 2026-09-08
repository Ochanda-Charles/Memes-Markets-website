# Deployment

Two environments on one Vercel project, driven entirely by which branch you push
to. There is no separate project for staging — a second project would need its
own env vars kept in sync by hand, and they drift.

| | Branch | Vercel environment | URL | Indexed |
|---|---|---|---|---|
| Production | `main` | Production | the custom domain, once set | yes |
| Staging | `staging` | Preview | `<project>-git-staging-<scope>.vercel.app` | **no** |
| PR preview | any other | Preview | per-deployment URL | **no** |

`vercel.json` limits automatic deployments to `main` and `staging`, so pushing a
scratch branch does not spend build minutes.

## First-time setup

1. **Import the repo.** vercel.com → Add New → Project → import
   `benleavitt/Memes-Markets-website`. Framework is detected as Next.js;
   accept every default. The first build publishes Production from `main`.
2. **Confirm the production branch** is `main` under
   Settings → Git → Production Branch.
3. **Add the environment variables** below.
4. **Push `staging` once** to create the staging deployment. The branch already
   exists in the repo.

## Environment variables

Set in Settings → Environment Variables. Nothing here is required for the site to
build and serve — every one of them degrades to a sensible default — so it is
fine to deploy first and add them afterwards.

| Variable | Environments | Why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Production only | The custom domain. **Leave unset until the domain exists.** See below. |
| `TWITCH_CLIENT_ID` | Production, Preview | Live status. Without it the player shows its offline face and the countdown, which is computed locally and still true. |
| `TWITCH_CLIENT_SECRET` | Production, Preview | As above. |
| `TWITCH_USER_LOGIN` | Production, Preview | Defaults to `memesandmarkets`. |
| `FORCE_LIVE` | Preview only | Forces the player live for demos. Never set this in Production. |
| `SUBSTACK_PUBLICATION_URL` | Production, Preview | Only if the newsletter moves off its current custom domain. |
| `YOUTUBE_API_KEY` | Production, Preview | The audience numbers on the landing page. **Without it they never change** — see below. |
| `SHEET_WEBHOOK` | Production, Preview | Apps Script `/exec` URL. One deployment serves partnership enquiries, job applications and the careers listing. Without it `/api/partner` and `/api/careers` answer 503 and point people at email, and `/careers` renders from its committed fallback. |
| `SHEET_SECRET` | Production, Preview | Must match `SHARED_SECRET` in the Apps Script. |
| `PARTNER_SHEET_WEBHOOK` | — | Legacy alias for `SHEET_WEBHOOK`, still read. Existing deployments can leave it; new ones should not set it. See `lib/sheet.ts`. |
| `PARTNER_SHEET_SECRET` | — | Legacy alias for `SHEET_SECRET`, still read. |
| `NEXT_PUBLIC_GA_ID` | Production only | GA4 measurement id. Leave unset on Preview or staging traffic pollutes the numbers. |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Production only | Search Console meta-tag token. Unnecessary if you verify by DNS. |

## Analytics, consent, and Search Console

Google Analytics runs behind **Consent Mode v2, defaulted to denied**. The
bootstrap in `components/Analytics.tsx` is `beforeInteractive` on purpose: the
`consent default` call must execute before `gtag.js`, or Google initialises with
its own defaults — which are granted — and sets a cookie before anyone has been
asked. That ordering is the feature; do not "tidy" it to `afterInteractive`.

The same bootstrap reads the stored choice out of `localStorage` and uses it as
the default. Without that, a returning visitor who had already pressed Accept
came back defaulted to denied and their consent was silently discarded on every
visit after the first. `e2e/player.spec.ts` pins both directions.

`NEXT_PUBLIC_GA_ID` is **Production only**. It is not a secret — every GA site
exposes it in page source — but setting it on Preview means every branch
deployment and every Playwright run reports into the same property.

**Search Console.** Verify by DNS TXT if the domain is yours to edit: it needs no
env var and survives a change of host. Otherwise take the token from the "HTML
tag" method — the `content` value alone, not the whole element — and put it in
`NEXT_PUBLIC_GSC_VERIFICATION`. Then submit `/sitemap.xml`, which already lists
every indexable page and is generated from `app/sitemap.ts`.

Note that `app/robots.ts` returns `Disallow: /` on anything that is not a
Production deployment, so a Preview URL cannot be verified or indexed — verify
against production.

## The audience numbers

`lib/stats.ts` reads `channels?part=statistics` from the YouTube Data API on the
same hourly ISR window as the episodes, and falls back to
`content/channel-stats-fallback.json` when it cannot.

**The fallback is not a rainy-day file — without a key it is the only source**,
so the band shows real but frozen figures until somebody re-commits it. Two
things keep it honest:

- `YOUTUBE_API_KEY` in Vercel makes the live site update hourly.
- The same key as a **GitHub Actions secret** makes `refresh-episodes.yml`
  re-commit the fallback twice a day, so a fresh clone and any deploy without the
  key are still close to the truth.

The key is free and read-only: console.cloud.google.com → enable *YouTube Data
API v3* → Credentials → Create credentials → API key. One call costs 1 unit
against a 10,000/day quota; hourly ISR spends 24.

That step is `continue-on-error` on purpose. The scheduled job's red light means
one thing — the site's parser can no longer read the feed — and a missing stats
key must never be able to trigger it.

**The cost of that choice: a missing key is silent.** The step prints
`YOUTUBE_API_KEY is not set.` and the run stays green, so the fallback can drift
for weeks without anything going red. If the numbers on the live site have pulled
ahead of `content/channel-stats-fallback.json`, this is why — check the secret
before looking anywhere else.

### Adding the key as a GitHub Actions secret

The workflow reads `${{ secrets.YOUTUBE_API_KEY }}`, so it needs a **repository
secret** with exactly that name.

Fastest route, with the `gh` CLI already authenticated:

```bash
gh secret set YOUTUBE_API_KEY --repo benleavitt/Memes-Markets-website
```

It prompts for the value and reads it from stdin, so the key never lands in your
shell history. Do NOT pass it as `--body` on the command line for that reason.

Through the web UI instead:

1. Open
   `https://github.com/benleavitt/Memes-Markets-website/settings/secrets/actions`
   (or: repo → **Settings** → **Secrets and variables** → **Actions**).
2. Click **New repository secret**.
3. **Name:** `YOUTUBE_API_KEY` — exact, case-sensitive.
4. **Secret:** paste the key from Vercel. It is the same value; one key serves
   both.
5. Click **Add secret**.

Three ways this goes wrong, all of which look like "I added it and nothing
happened":

- **The Variables tab.** It sits next to Secrets and looks equivalent.
  `secrets.YOUTUBE_API_KEY` cannot read a variable, so a key added there is
  invisible to the workflow.
- **An environment secret.** The job declares no `environment:`, so a secret
  scoped to one resolves empty. It must be repository-wide.
- **A typo in the name.** There is no error for a secret that does not exist —
  it resolves to an empty string, which is exactly the state you are trying to
  fix.

Verify rather than assume. Secrets are write-only, so the only way to know is to
run the job:

```bash
gh workflow run refresh-episodes.yml
gh run watch "$(gh run list --workflow=refresh-episodes.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Then read the *Refresh channel stats* step. `YOUTUBE_API_KEY is not set.` means it
still is not. Working looks like:

```
live: subscribers: 16,300 -> 16,400 (+100)
      views: 333,318 -> 342,051 (+8,733)
      videos: 102 -> 104 (+2)

wrote content/channel-stats-fallback.json (2026-08-20)
```

and a `chore: refresh episode and channel-stat fallbacks` commit that actually
touches `content/channel-stats-fallback.json`. A commit touching only
`episodes-fallback.json` means the stats half is still skipping.

## The Google Sheet: enquiries, applications and job listings

`scripts/sheet-webhook.gs` carries the Apps Script and its setup, in the repo so
the thing receiving enquiries is version-controlled next to the form that sends
them. Roughly: create a sheet, paste the script, set `SHARED_SECRET`, deploy as
a web app that "Anyone" can reach, then put the `/exec` URL and the same secret
into the two variables above.

"Anyone" is required — Vercel's servers post without a Google login — which is
exactly why the secret exists. Editing the script later creates a *new* `/exec`
URL unless you edit the existing deployment under **Manage deployments**; if
enquiries stop arriving after a change, check that first.

One deployment now does three jobs: partnership enquiries in, job applications
(and their CVs) in, and the careers listings out. `lib/sheet.ts` resolves the URL
and secret for all three, and still reads the older `PARTNER_SHEET_*` names as
fallbacks so an existing deployment keeps working.

## Careers

Two things need doing beyond the sheet setup above, both covered step by step in
the header of `scripts/sheet-webhook.gs`:

1. **A Drive folder for the CVs.** Create it, copy its id out of the URL, and put
   it in `CV_FOLDER_ID` inside the script. Share it with whoever does the hiring
   and leave General access on **Restricted** — the script deliberately never
   calls `setSharing`, so a file inherits the folder's privacy. "Anyone with the
   link" on a folder of CVs is how somebody's home address ends up in a search
   index. The id is not a Vercel variable on purpose: the site never touches
   Drive, and putting it there would imply it does.
2. **Re-authorise after adding Drive.** Run `authoriseMe` from the Apps Script
   editor and accept the consent screen, *then* redeploy. Adding a permission
   invalidates the previous authorisation, and a deployment running unauthorised
   code fails on every write and says nothing.

**Before trusting the CV path, prove Apps Script accepts the body.** Its incoming
payload limit is undocumented, and a 2MB CV arrives base64-encoded at about
2.8MB. Send a real one with curl and confirm the row and the file both appear.

A deploy with no webhook set is a normal state, not a broken one: `/careers`
renders from `content/roles-fallback.json`, which ships empty, so the page
honestly says nothing is open. `/api/careers` answers 503 and points people at
email.

**Publishing a role** is a row on the `Roles` tab — no deploy. Status `Open`
shows it, `Closed` leaves the page up with `noindex` and swaps in a speculative
form, `Draft` hides it entirely and never leaves Google. A status the parser does
not recognise is treated as `Draft`, so a typo hides a listing rather than
publishing an unfinished one. Changes appear within five minutes.

Run `npm run roles:refresh` when a listing goes up or comes down, so a sheet
outage shows the roles rather than a blank page.

## The domain

The site is live on **https://www.memesandmarkets.com**.

Nothing hardcodes that. `lib/site.ts` resolves the site's own URL and everything
needing an absolute one — `metadataBase`, OG images, JSON-LD, the sitemap, the
canonical tags — goes through that single function.

### Outstanding: set `NEXT_PUBLIC_SITE_URL`

**Until this is set, the site is serving on the custom domain while telling
Google its canonical address is the `.vercel.app` one.** `siteUrl()` prefers
`NEXT_PUBLIC_SITE_URL`; with it unset the next fallback is
`VERCEL_PROJECT_PRODUCTION_URL`, which is still the vercel.app host. The result
is a canonical tag, a sitemap and a robots `Sitemap:` line that all point away
from the real domain — so ranking signals consolidate onto the wrong address.

1. Vercel → Settings → Environment Variables.
2. `NEXT_PUBLIC_SITE_URL` = `https://www.memesandmarkets.com`, **Production only**.
3. **Redeploy Production** — `NEXT_PUBLIC_*` is inlined at build time, so the
   running deployment keeps the old value until it is rebuilt.

Verify with:

```
curl -s https://www.memesandmarkets.com/ | grep canonical
curl -s https://www.memesandmarkets.com/sitemap.xml | head
```

Both should say `www.memesandmarkets.com`.

### Outstanding: the Substack still owns this domain

The newsletter took `memesandmarkets.com` first, and the site has now taken it
over. Substack's own API confirms the publication is still configured for it:

```
subdomain              = memesandmarketspod
custom_domain          = www.memesandmarkets.com
custom_domain_optional = False
```

`custom_domain_optional = False` is the part that bites — Substack *enforces* that
domain, and the domain is now this site. The two calls fail differently, which is
worth knowing because the obvious guess is wrong:

- **The feed** (`GET /feed`) 301s to `www.memesandmarkets.com/feed`, which Next
  answers with a 404.
- **The signup** (`POST /api/v1/free`) does **not** redirect. Substack answers
  **403** with its own "Error - Substack" HTML page, whatever headers are sent.

Both were verified against the live publication.

So, today: **newsletter signups do not work, and the posts strip renders
nothing.** Neither failure is loud. The form shows a polite error and the strip
is designed to disappear when the feed is quiet.

The fix is in Substack's settings, not in this repo:

1. Substack → Settings → Domain. Remove `www.memesandmarkets.com`, or repoint the
   publication at a subdomain such as `newsletter.memesandmarkets.com`.
2. Once `memesandmarketspod.substack.com` stops redirecting, the code already
   points at it — `PUBLICATION` in `lib/newsletter.ts` defaults there. Nothing
   needs changing unless you chose a subdomain, in which case set
   `SUBSTACK_PUBLICATION_URL` to it.
3. Verify: `curl -sI https://memesandmarketspod.substack.com/feed` should return
   200 rather than a 301, and the footer signup box should accept an address.

## Why staging is not indexed

`app/robots.ts` returns `Disallow: /` on anything that is not a Production
deployment. This matters more than it looks: staging is a fully working copy of
the site on a crawlable URL, so without it Google indexes staging and serves it
alongside production, splitting the ranking.

It keys off `VERCEL_ENV`, not `NODE_ENV` — a staging build is a *production* Node
build, so `NODE_ENV` is `production` there too and would wave it straight through.

## The scheduled job

`.github/workflows/refresh-episodes.yml` commits to `main`, which triggers a
production deploy. That is intended: the commit only ever changes
`content/episodes-fallback.json`, and the point is for the live cold-start
fallback to be current. It needs no Vercel configuration.

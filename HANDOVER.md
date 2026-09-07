# Handover

Who owns what, what still depends on whom, and what to do first.

Written at the point the repository was transferred from `Ochanda-Charles` to
`benleavitt`. Keep it current — it is the only place some of this is written down.

**Status:** the transfer is complete and the site is live on
**https://www.memesandmarkets.com**. Two things are outstanding and both are
settings changes rather than code — see "Outstanding after the domain move".

## Ownership

| | Owner | Notes |
|---|---|---|
| GitHub repository | **Ben Leavitt** | Charles remains a collaborator with write access |
| Vercel project, domain, billing | **Memes & Markets** | Charles added as a team member |
| Site code and content | **Memes & Markets** | See [`LICENSE`](LICENSE) |
| YouTube API key | Charles (personal Google account) | By agreement — see below |
| Partnership enquiries Sheet + Apps Script | Charles (personal Google account) | By agreement — see below |

### Repository access

The repo now lives on a **personal** GitHub account. GitHub only offers granular
collaborator roles (Admin / Maintain / Write) on **organisation** repositories, so
on a personal repo there is the owner and there are collaborators with write
access — no middle option.

In practice: Charles can push branches, open PRs and merge them, but cannot change
repository settings, manage Actions secrets, alter visibility, or delete the repo.
Those are Ben's alone. If that becomes inconvenient, moving the repo into a
Memes & Markets GitHub organisation restores full role control and takes one
transfer; nothing in the codebase would need to change.

## Accounts

Anything marked **to confirm** was not settled at handover and should be.

| Service | Whose account | What breaks if it goes away |
|---|---|---|
| Vercel | Memes & Markets | The site. Everything. |
| GitHub | Ben Leavitt | Source and CI |
| YouTube Data API key | **Charles** | Audience numbers freeze at `content/channel-stats-fallback.json`. Site keeps working. |
| Google Sheet + Apps Script (enquiries) | **Charles** | Partnership enquiries stop being recorded; `/api/partner` answers 503 and tells people to email instead |
| GA4 property | *to confirm* | Analytics stop; cookie banner disappears (it is gated on `NEXT_PUBLIC_GA_ID`) |
| Google Search Console | *to confirm* | Index coverage and query data |
| Twitch developer app | *to confirm* | Live player never detects a broadcast |
| Substack publication | *to confirm* | Newsletter signups |
| Figma file `qUhg8iR0L0TAOqv3QQ7pAM` | *to confirm* | `npm run tokens` cannot be re-run; design source lost |

Every variable is documented in [`.env.example`](.env.example) and
[`DEPLOY.md`](DEPLOY.md).

## Decisions taken at handover

Recorded so they are visible rather than assumed, and so nobody re-opens them by
accident.

### The YouTube API key stays on Charles's Google account

Agreed. Low consequence: it carries no personal data, and if it stops working
`lib/stats.ts` falls back to the committed stats file, so the audience numbers
freeze rather than the page breaking. Moving it later is a new key and one Vercel
environment variable.

### The enquiries Sheet and Apps Script stay on Charles's Google account

Agreed, and it has a consequence Memes & Markets should be aware of.

[`app/privacy/page.tsx`](app/privacy/page.tsx) currently tells anyone who submits a
partnership enquiry that their details are:

> stored in a private Google Sheet that only the show's hosts can open

that they are "not shared with anyone outside the show", and that the show will
"tell you what we hold, correct it, or delete it" on request.

With the Sheet on Charles's personal account, those statements do not describe the
actual arrangement, and a deletion request cannot be actioned without him. The
options are to move the Sheet to a Memes & Markets Google account and redeploy the
Apps Script (about fifteen minutes — the steps are in
[`scripts/sheet-webhook.gs`](scripts/sheet-webhook.gs), and it produces a new
`PARTNER_SHEET_WEBHOOK` and `PARTNER_SHEET_SECRET`), or to reword the privacy page
so it matches reality. Until one of those happens the page overstates the position.

### The developer credit stays

[`content/credits.ts`](content/credits.ts) puts "Site by Ochanda Charles Otieno" in
the footer, linking to his portfolio. It was there before handover and has been
left in place deliberately rather than removed quietly.

It is a single object in one file — if Memes & Markets would rather it went, delete
the block in `content/credits.ts` and the corresponding row in
`components/Footer.tsx`. No hard feelings either way; better to ask than to find it
later and wonder.

## Standing dependencies on Charles

Things that will need him even after the transfer:

- The **YouTube API key** value, if `YOUTUBE_API_KEY` ever needs rotating — in
  Vercel and in the repo's Actions secrets
- The **enquiries Sheet**, for reading leads, or for any data deletion request
- The **Figma file**, if it turns out to be on his account

## Outstanding after the domain move

Both of these are configuration, not code. The repo is already correct for both.

### 1. `NEXT_PUBLIC_SITE_URL` is not set

The site serves on the custom domain but still declares the `.vercel.app`
address as canonical, in its sitemap, and in its robots `Sitemap:` line — so
search engines consolidate onto the wrong host. Set
`NEXT_PUBLIC_SITE_URL=https://www.memesandmarkets.com` in Vercel, **Production
only**, and redeploy. Full steps in [`DEPLOY.md`](DEPLOY.md).

### 2. The Substack still owns memesandmarkets.com

The publication has `www.memesandmarkets.com` configured as its custom domain
with `custom_domain_optional = False`, so Substack enforces a domain the site now
occupies. The feed 301s here and 404s; the signup endpoint does not redirect at
all — Substack answers 403 with an HTML error page. Both verified live.

**Newsletter signups do not work today, and the recent-posts strip renders
nothing.** Neither is loud: the form shows a polite error and the strip is built
to disappear when the feed is quiet.

Fix it in Substack → Settings → Domain: remove the custom domain, or repoint the
publication at a subdomain like `newsletter.memesandmarkets.com`. The code
already points at `memesandmarketspod.substack.com` and needs no change unless
you pick a subdomain, in which case set `SUBSTACK_PUBLICATION_URL`.

## First things to do after accepting the transfer

1. **Check Vercel still deploys.** The Vercel GitHub App had access to the repo
   under its old owner; after a transfer it usually needs reconnecting. Push
   something to `main` and confirm a production deploy appears. This is the most
   likely thing to be broken on day one.
2. **Decide whether the repo stays public.** It is public today. Only the owner can
   change that.
3. **Confirm the *to confirm* rows above.**
4. **Read [`CLAUDE.md`](CLAUDE.md)** before changing anything — it carries the rules
   that are not derivable from the code, including why the scheduled feed check
   must not be "fixed" by loosening it.

## The scheduled job

`.github/workflows/refresh-episodes.yml` runs twice daily, commits
`content/episodes-fallback.json` to `main`, and that commit triggers a production
deploy. A bot commit followed by a deploy is normal, not a compromise.

A **red run** means the site's own parser can no longer read the YouTube feed —
something nothing else would ever tell you, because the site deliberately swallows
feed errors and keeps serving the last known episodes. A run that ends in a
**warning** is the third state: YouTube throttled the runner's IP, proven by a
control feed failing beside ours. Nothing is wrong. If that warning repeats for
more than a day or so, check by hand.

It needs `YOUTUBE_API_KEY` as a repository Actions secret. Secrets transfer with
the repository, so it should already be there.

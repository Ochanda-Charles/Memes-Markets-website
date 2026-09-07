# TODOS

Ship at the end of every phase. Rationale for the architecture calls lives in the
gstack decision log (`gstack-decision-search`), not here.

## Phase 0 — plumbing
- [x] git init, gstack routing, .gitignore
- [x] Decide framework, doc structure, orbit perf budget (eng review, D2-D5)
- [x] Scaffold: Next.js 15 + TS strict + Tailwind v4 + Biome + Vitest
- [x] `styles/tokens.css` generated from Figma variables (44 props + 18 type styles)
- [x] `lib/orbit.ts` — projection maths + constants, 11 tests green
- [x] `lib/episodes.ts` — RSS fetch, `hqdefault` fallback, committed fallback dataset
- [x] Assets moved into `public/brand/`
- [x] `next build` green locally — static, ISR 1h
- [ ] **BLOCKER: move the repo off a path containing `&`.** `M&M website` breaks every
      `node_modules/.bin` shim on Windows (cmd splits the path at `&`), so `npm test`,
      `npm run dev` and `npm run build` all fail. Verified working via
      `node node_modules/<pkg>/...` directly. Rename to `memes-and-markets`.
- [x] Compress host photos — `npm run photos` downscales the masters in `Assets/`
      into `public/brand/`. 6.0MB of camera originals became 836kB. `public/brand/`
      used to hold byte-identical copies of the masters; it now holds derivatives,
      and the masters stay tracked so the script runs from a fresh clone.
- [ ] Raise or accept the JS budget: empty page is already 103kB First Load

## Phase 1 — static Home (shippable on its own) — DONE, branch `phase-1-static-home`
- [x] Wordmark fitted to viewport width (pure CSS, ratio 10.186), tagline, platform bar, one CTA, footer
- [x] Background: grid via `repeating-linear-gradient`, glow via `radial-gradient`, no `filter: blur()`
- [x] Focus-visible states, skip link, reduced-motion guard
- [x] Fixed small-white-on-red contrast — CTA label is 19px/700 to clear the large-text threshold
- [x] About stub so the footer link is not a 404
- [x] Episode list (pulled forward from Phase 2 — it is the always-works route to the content)
- [x] Cropped the logo to its ink bounds; fixed mobile horizontal overflow
- [ ] Merge to `main` and deploy a preview

## Phase 2 — the orbit — DONE, branch `phase-2-orbit`
- [x] CSS 3D transform belt, 12 cards, `preserve-3d` + one `--spin` var
- [x] Depth via CSS `cos()` in a registered `@property`; **no blur** (D4).
      Verified: front `facing:1 → opacity:1`, side `0.5 → 0.31`, back `0 → 0.08`
- [x] `backface-visibility: hidden` — without it the far cards render mirrored
- [x] Each card is a real `<a>`; no extra tab stop, arrows bubble from the focused card
- [x] Drag with smoothed + clamped momentum, snaps to a card boundary
- [x] Page-scroll rotation while in view, passive, never `preventDefault`
- [x] `prefers-reduced-motion`: no momentum, no scroll-drive
- [x] Plain episode list already shipped in Phase 1
- [ ] Measure on real mid-range Android, not throttled desktop
- [ ] Tighten the gap between the CTA and the belt on mobile (~85px of dead space)

## Phase 3 — live player — DONE, branch `phase-3-live-player`
- [x] `<LivePlayer/>` in the root layout, outside the page slot
- [x] Twitch Helix live status, edge route, schedule-aware TTL (20s in-window, 5min out)
- [x] `FORCE_LIVE` env override so a Twitch outage cannot blank the hero
- [x] Offline state: next-slot countdown computed locally, DST-correct, 10 unit tests
- [x] Muted autoplay, unmute on gesture, dismissal persisted in sessionStorage
- [x] **E2E: player survives Home → About** — stamps the DOM node and checks the
      stamp survives, so a remount cannot pass. 4 specs, green twice in a row.
- [ ] Add real `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (route returns
      `source: "offline"` until then, which is a correct state, not an error)
- [ ] Mobile: the player is `hidden sm:block`. The brief wants it docked to a slim
      bottom bar under 640px — not built yet.

## Phase 4 — About — DONE, branch `phase-4-about`
- [x] About: hero, "Hosted by" cards with the real photos, "as heard on" row
- [x] Host photos wired through `next/image`; first one gets `priority` (it is the LCP)
- [x] Footer + disclaimer inherited from the root layout, so this page cannot lose it
- [ ] **Per-host social handles.** `content/hosts.ts` renders a links row when handles
      exist. Left empty deliberately: the brief only supplied show-level accounts and
      inventing personal ones would put fake links on a real person's bio.
- [ ] **Logo SVG — needs the source file, not a trace.** `public/brand/mm-logo.png` is
      a cropped raster and looks fine at 44px. Hand-tracing it from pixels would be an
      approximation of someone's brand mark. Ask for the original vector.
- [ ] The floating player overlaps the left host card at 1440. It is `fixed bottom-6
      left-6` per the brief. Either accept it (users can dismiss), move it bottom-right,
      or hide it on About.

## Phase 5 — polish — DONE, branch `phase-5-polish`
- [x] **A11y pass.** Audited both pages in-browser: heading order, landmarks, alt
      text, accessible names, contrast on every rendered text style. 0 failures.
- [x] **Contrast bug fixed.** `--mm-text-3` was `#55555E` at **2.67:1** and carried
      real text (episode dates, footer copyright, the "As heard on" heading). Raised
      to `#7C7C85`, the minimum that clears AA 4.5:1 on `--mm-base`. Figma variable
      updated to match. On a near-black canvas there is only room for two legible
      greys, so tertiary is now a small step below secondary, not a big one.
- [x] JSON-LD: `PodcastSeries` + `PodcastEpisode` on Home, `AboutPage` on About.
      `numberOfEpisodes` deliberately omitted — RSS returns 15, we do not know the
      total, and a wrong count in structured data is worse than none.
- [x] OG images via `next/og`, both routes, real Archivo Black fetched at build with
      a graceful fallback to the default face if the font fetch fails.
- [x] Analytics call sites wired: `platform_click`, `cta_watch_live`,
      `orbit_interact` (once per visit), `episode_open`. **No provider** — that is a
      privacy/product decision. `lib/analytics.ts` is the single function to change.
- [ ] Pick an analytics provider (Plausible / Vercel / none). Note `AnalyticsDelegate`
      now ignores clicks the orbit is swallowing — before wiring anything, that is the
      behaviour to sanity-check first, because it is the one that was silently wrong.
- [ ] **Budget: Home is 112 kB, target was 90 kB.** 103 kB is the Next.js floor.
      Wiring analytics turned `PlatformBar` and `LiveCta` into client components,
      costing ~2 kB. Recoverable: one delegated click listener in the layout reading
      `data-analytics` attributes would put both back on the server.
- [ ] Measure LCP/CLS on a real deploy — local numbers are not the budget.

## Phase 6 — newsletter (explicitly lowest priority)
- [ ] Email in → added to the Substack list. Substack has no supported public API,
      so this needs a real decision: forward via an undocumented endpoint (fragile),
      or capture with a provider that has an API and cross-post. Do not start until
      Phases 0-5 are done.

## Audit remediation — DONE except where noted

Full read of the codebase turned up 19 issues nothing in the suite could see.
Fixed, in severity order:

- [x] **Twitch `parent` was hardcoded** to `localhost` + `memesandmarkets.com`, so the
      player rendered its chrome around Twitch's refusal notice on every deployed
      environment. Now read from `window.location.hostname`; e2e pins it.
- [x] **`vercel.json` `no-store` on `/api/(.*)`** sat on top of the live-status
      `s-maxage` and cancelled the edge cache. Headers moved into `next.config.ts`,
      where they also apply to `next dev`.
- [x] **`/api/subscribe` had no rate limit and no origin check.** Now both, plus a
      content-length bound. `lib/rate-limit.ts` is deliberately the only file that
      changes if this ever needs shared state instead of per-isolate counters.
- [x] **Contrast:** `--mm-text-3` on `--mm-surface` is 4.44:1. The episode date and
      the player's viewer count moved to `--mm-text-2`.
- [x] **`lib/orbit.ts` claimed to be a source of truth** for numbers only `globals.css`
      reads. `lib/orbit.test.ts` now checks the two against each other.
- [x] **A cancelled drag ate the next tap.** The swallow clears on the next input
      rather than on a click that never comes.
- [x] **`parseFeed` would render `[object Object]`** if a title ever grew an attribute,
      with the scheduled job staying green throughout. Unwrapped, and the job now
      checks titles.
- [x] **Four mono font weights loaded, two rendered.** Down to 500 and 600.
- [x] Phantom `episode_open` on drag-release; belt spacing hardcoded to 12; the
      `MAX_EMAIL` comment describing a memory guard it was not; no CSP; no Twitter
      card; Playwright specs excluded from typecheck; `/subscribed` with no state
      claiming a failure; Substack's message logged unredacted.

- [ ] **Still open — rename the repo folder.** The `&` blocker at the top of this file
      is the one audit item not fixed here: the folder is this session's working
      directory with a dev server running in it, so renaming it is the user's call.
      Everything else on the list is done.
- [ ] **Review before committing:** `Assets/Kieth&Ben_cover.jpg` was renamed to
      `Assets/keith-ben-cover.jpg` — the old name misspelled Keith and contained the
      `&` this repo already has a blocker about. Git will record it as a rename once
      both halves are staged together.

## Cut

**Meme wall — scrapped.** Never built in code. Removed from the Figma Home frame
and the `meme/card` component deleted. It was written from the brief's topic list
(collectibles, XRP, the petrodollar) and did not reflect the actual show, which is
mostly dating, gambling, education and philosophy. Rewriting copy for a section
nobody asked for was the wrong trade.

## Phase 7 — careers
- [x] `/careers` and `/careers/<slug>`, listings read from the Roles tab of the
      Google Sheet so a host can publish one without a developer
- [x] CV upload (PDF/Word, 2MB) through `/api/careers` into a private Drive folder,
      plus a speculative application that works when nothing is open
- [x] Twelve-month retention promised on the privacy page — **deleted by hand, so it
      is a promise kept by people rather than by software**
- [x] Fixed two live defects in the shared sheet write path while in there: Sheets
      formula injection (a message beginning `=IMPORTRANGE(` executed inside the
      hosts' own spreadsheet) and a missing `LockService` around `appendRow`
- [ ] **NOT YET PROVEN: that Apps Script accepts a ~2.8MB POST body.** Its incoming
      payload limit is undocumented and the whole upload design rests on it. Send a
      real 2MB PDF as base64 with curl before trusting the CV path in production.
      If it fails, the fallbacks are a Drive resumable upload with a service account
      or a signed direct-to-storage upload, and both are considerably more work.
- [ ] Verify the formula-injection fix by hand against a real sheet. A fix nobody
      has watched work is not a fix.
- [ ] Decide whose Google account owns the CV folder — the files land in that
      account's personal 15GB, alongside its Gmail.

## Deferred / not in scope
- YouTube Data API — RSS covers 15 episodes with no key; only needed for view counts
- Market ticker — removed from the design, `ticker/row` component left unused in Figma
- `episode/card` and `sphere/tile` Figma components — superseded, still in the file
- CMS for content — still not warranted, but the premise has moved. Job listings DO
  need non-developer editing, and they get it without a CMS: the Roles tab of the
  show's Google Sheet, read on ISR by `lib/roles.ts`. That is the pattern to reach
  for if anything else ever needs the same — a sheet the hosts already keep, not a
  second system for them to log into.

## Raised and declined (do not re-litigate)
Offered as cuts alongside the meme wall, kept deliberately:
- **Episode list on Home** stays, even though the orbit renders the same 12 as
  server-side links. Home shows them twice by design.
- **Newsletter capture** stays. Substack has no supported public API, so whatever
  ships there will be an undocumented endpoint that can break silently.
- **Mobile bottom-bar player** stays on the roadmap; the player is desktop-only
  (`hidden sm:block`) until it is built.

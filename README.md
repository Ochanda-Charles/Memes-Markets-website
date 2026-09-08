# Memes & Markets

Marketing site for the Memes & Markets podcast — hosted by Keith D and Ben Leavitt,
live Tuesdays & Thursdays.

Six routes: `/`, `/about`, `/partner`, `/careers`, `/privacy`, `/terms`, plus a page per
open job listing at `/careers/<slug>`. There is no nav bar; the wordmark is the header.

(`/subscribed` was in this list and is gone — it existed to catch a form post the
newsletter no longer makes.)

## Quickstart

```bash
npm install
npm run dev
```

Opens on http://localhost:3000. Nothing needs configuring to run it — every
integration degrades to a sensible default, which is why the site works with an
empty `.env`. See [`DEPLOY.md`](DEPLOY.md) for what each variable turns on.

**Node 22.6 or newer.** Several scripts import TypeScript directly and rely on
Node's native type stripping.

## Checks

```bash
npm run typecheck   # tsc, app and e2e projects
npm run lint        # biome
npm test            # vitest, 99 unit tests
npm run e2e         # playwright, 32 specs
```

First Playwright run on a new machine also needs:

```bash
node node_modules/@playwright/test/cli.js install chromium
```

## Two things that will waste your afternoon

**Never run `npm run build` while `npm run dev` is up.** They share `.next`, and the
build clobbers it — leaving a dev server that serves a near-empty stylesheet and
404s its own chunks. It looks exactly like a CSS bug and is not one.

**The e2e suite starts its own dev server.** If you already have one running,
Playwright reuses it — and yours won't have the test-only `NEXT_PUBLIC_GA_ID` that
the cookie-consent specs need, so they fail for a reason that has nothing to do
with your change. Stop your server first.

## Generated files — never hand-edit

Re-run the script instead. Each file says so at the top.

| File | Regenerate with | Source |
|---|---|---|
| `styles/tokens.css` | `npm run tokens` | Figma variables |
| `components/hero/globe-paths.ts` | `npm run globe` | Natural Earth 50m |
| `content/episodes-fallback.json` | `npm run episodes:refresh` | YouTube RSS |
| `content/channel-stats-fallback.json` | `npm run stats:refresh` | YouTube Data API |
| `public/brand/*.jpg` | `npm run photos` | masters in `Assets/` |
| `app/favicon.ico`, `app/icon.png` | `npm run favicon` | `public/brand/mm-logo.png` |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Biome ·
Vitest · Playwright · deployed on Vercel.

Four runtime dependencies in total — `next`, `react`, `react-dom` and
`fast-xml-parser`. No component library, no CSS-in-JS, no state manager. Keep it
that way unless there is a real reason not to.

## Where to read next

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Where everything lives, and the rules that aren't derivable from the code — brand colours, the legal disclaimer, why the feed check must not be loosened |
| [`DEPLOY.md`](DEPLOY.md) | Environments, every environment variable, adding a domain, the scheduled job |
| [`HANDOVER.md`](HANDOVER.md) | Who owns which account, and what still depends on whom |
| [`TODOS.md`](TODOS.md) | Phase checklist and known open items |

## Licence

Proprietary — see [`LICENSE`](LICENSE).

# Memes & Markets — website

Marketing site for the Memes & Markets podcast: Home, About, Partner, Careers and the two
legal pages. Hosts Keith D and Ben Leavitt, live Tuesdays & Thursdays. Structural model
is tbpn.com: no nav bar, the wordmark is the header.

## Where things live

| What | Where | Note |
|---|---|---|
| Design tokens | `styles/tokens.css` | **Generated from Figma. Never hand-edit.** Run `npm run tokens`. |
| Orbit geometry | `lib/orbit.ts` | Single source of truth for the hero sphere maths, shared with the Figma mock. |
| Globe coastlines | `components/hero/globe-paths.ts` | **Generated from Natural Earth. Never hand-edit.** Run `npm run globe`; move the camera via `CENTRE` in `scripts/generate-globe.mjs`. |
| Episode data | `lib/episodes.ts` | YouTube RSS on hourly ISR, no API key. Falls back to `content/episodes-fallback.json`. |
| Feed parsing | `lib/feed.ts` | The URL and `parseFeed`. Imports no JSON on purpose, so plain Node can load it — see the note in the file. |
| Newsletter | `lib/newsletter.ts` | Substack signup, proxied through `/api/subscribe` because the endpoint sends no CORS headers. Endpoint is undocumented; `lib/newsletter.test.ts` pins the response shapes. |
| Job listings | `lib/roles.ts` | Read from the Roles tab of the show's Google Sheet on 5-minute ISR, so a host can publish a role without a developer. Falls back to `content/roles-fallback.json`. |
| Role parsing | `lib/roles-sheet.ts` | The `Role` type, `slugify`, `parseRoles`. Imports nothing at all, so plain Node can load it — same reason as `feed.ts`. An unrecognised status falls back to **Draft**, i.e. invisible; that asymmetry is deliberate. |
| Role fallback | `content/roles-fallback.json` | **Generated. Never hand-edit.** Run `npm run roles:refresh`. Ships empty on purpose: no roles open is the honest page, not a broken one. |
| Applications | `lib/careers.ts` | Pure validator for the CV form. Checks the file's magic bytes rather than its mime type — a `.txt` renamed `.pdf` carries both labels happily. |
| The Google Sheet | `scripts/sheet-webhook.gs` | One Apps Script deployment: enquiries in, applications + CVs in, job listings out. Setup is in the file header. `lib/sheet.ts` resolves the URL and secret. |
| Episode fallback | `content/episodes-fallback.json` | **Generated. Never hand-edit.** Run `npm run episodes:refresh`; a scheduled Action keeps it current. |
| Design file | Figma `qUhg8iR0L0TAOqv3QQ7pAM` | Pages: Foundations, Components, Home, About. |
| Past decisions | `gstack-decision-search` | Architecture calls and their rationale. Query before re-litigating one. |
| Phase checklist | `TODOS.md` | |

## Rules that are not derivable from the code

1. **Red, white and black only.** Brand red is `#FF0000`, sampled losslessly from
   `Assets/Memes & Markets - M Logo v2.png`. An early draft used yellow; it is gone.
2. **White on `--mm-accent` is 4.0:1.** Below WCAG AA for text under ~19px bold.
   Use `--mm-accent-deep` behind small white labels.
3. **Every footer carries this verbatim:** "For education and entertainment only.
   Not financial, legal, tax, or investment advice."
4. **Real episode titles only.** Pull from the feed. Never invent episode numbers.
   The same goes for job listings: they come from the sheet. The one exception in
   the repo is `e2e/fixtures/roles.json`, which never reaches a build.

5. **Candidate data has a promise attached to it.** `app/privacy/page.tsx` says
   applications and CVs are deleted after twelve months, by hand. If that changes,
   the page is wrong until somebody changes it too. CVs live in a private Drive
   folder whose sharing the Apps Script deliberately never touches.

5. **`getEpisodes` never throws and never returns empty.** That is deliberate — a
   hero of real-but-old episodes beats an empty one — but it means a broken feed
   is invisible from the site. `.github/workflows/refresh-episodes.yml` is the
   only thing that will ever tell you, by going red. Do not "fix" a failing run by
   loosening the check; the orbit is frozen whenever it fails. A run that ends in
   a warning is the third state, not a soft failure: YouTube refused the runner's
   IP, proven by a control feed failing beside ours. Nothing is wrong with the
   feed. If that warning repeats for more than a day or so, check it by hand.

## Testing

`npm test` (Vitest, unit) and `npm run e2e` (Playwright). The load-bearing E2E is
"live player survives Home → About" — it is what justifies the framework choice.
First run on a machine needs `node node_modules/@playwright/test/cli.js install chromium`.

**Never run `npm run build` while `npm run dev` is up.** They share `.next` and the
build clobbers it, leaving a dev server that serves a near-empty stylesheet and
404s its own chunks. Symptoms look like a CSS bug and are not one.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

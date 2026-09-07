import fallback from "../content/roles-fallback.json";
import { type Role, parseRoles } from "./roles-sheet";
import { rolesUrl, sheetEndpoint } from "./sheet";

/**
 * Open roles, read from the Roles tab of the show's Google Sheet.
 *
 *   Apps Script doGet?list=roles ──> parseRoles ──┐
 *                                                 ├─> /careers, /careers/[slug], sitemap
 *   content/roles-fallback.json ─────────────────┘
 *
 * WHY A SHEET AND NOT A FILE IN THIS REPO. Everything else the site says about
 * itself is written by whoever is editing the site. A job listing is not: it is
 * written by whoever is doing the hiring, at the moment they decide to hire, and
 * routing that through a pull request means it does not happen. The sheet is the
 * one place the hosts already keep operational things.
 *
 * WHY doGet AND NOT A PUBLISHED CSV. Publishing a tab to the web exposes the
 * whole tab at a guessable URL, so a row marked Draft would be public whatever
 * its status column said. The script filters drafts before answering, which is
 * the only version where staging a listing is actually private. That a job
 * description full of commas and line breaks is also miserable to parse out of
 * CSV is the second reason, not the first.
 *
 * NO WEBHOOK CONFIGURED IS A NORMAL STATE, not an error — the same bargain as
 * YOUTUBE_API_KEY. A fresh clone renders /careers from the fallback below with
 * no configuration at all, and since that fallback ships empty, what it renders
 * is the honest "nothing open right now" page.
 */

/**
 * How long a listing may be reused, in seconds.
 *
 * FIVE MINUTES, AND THE REASON IS THE SAME AS STATS_REVALIDATE'S, one step
 * further. Three routes read this — /careers, /careers/[slug] and sitemap.xml —
 * and Next caches each separately, so whichever is asked for first starts its
 * own window. A long window does not just make them stale, it lets them
 * disagree about which roles exist: an index still listing a role whose own page
 * has already closed.
 *
 * The other reason is human. Somebody edits a listing because they have just
 * spotted a wrong salary, and then they go and look. An hour is a support
 * request; five minutes is a coffee. Next derives a route's revalidate from the
 * shortest fetch inside it, so this one constant sets the window for all three.
 *
 * The cost is Apps Script runtime, which is not close to a constraint: ~288
 * calls a day at about a second each, against a 90-minute daily allowance on a
 * consumer account. Shortening this to seconds is the thing not to do.
 */
export const ROLES_REVALIDATE = 300;

export type { Role, RoleStatus, EmploymentType, RemotePolicy } from "./roles-sheet";
export { findRole, openRoles, slugify } from "./roles-sheet";

export function fallbackRoles(): Role[] {
  return parseRoles(fallback);
}

/**
 * Never throws, never returns nothing. Same contract as getEpisodes and
 * getChannelStats, for a slightly different reason: a careers page that 500s
 * because a spreadsheet was slow is a worse failure than one showing yesterday's
 * listings, and a page that renders no roles is a page that is telling the truth
 * about a show that is not hiring.
 */
export async function getRoles(): Promise<Role[]> {
  // The e2e fixture. getRoles runs on the server, so Playwright cannot intercept
  // it, and the committed fallback is empty because the show is not hiring —
  // which leaves the suite nothing to click on. playwright.config.ts sets this
  // to the contents of e2e/fixtures/roles.json. Same shape as FORCE_LIVE: a
  // deliberate override, read once, never a code path production takes.
  const fixture = process.env.ROLES_FIXTURE;
  if (fixture) {
    try {
      return parseRoles(JSON.parse(fixture));
    } catch {
      console.error("[roles] ROLES_FIXTURE is set but is not JSON — ignoring it.");
    }
  }

  const { url } = sheetEndpoint();
  if (!url) return fallbackRoles();

  try {
    const res = await fetch(rolesUrl(url), {
      next: { revalidate: ROLES_REVALIDATE },
      // Apps Script answers with a 302 to script.googleusercontent.com and the
      // real body is behind it, exactly as it does on a POST.
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(
        `[roles] the sheet answered HTTP ${res.status} — using the fallback.`,
      );
      return fallbackRoles();
    }
    const parsed = parseRoles(await res.json());
    // An empty answer is NOT a failure here, unlike the episode feed. "No roles
    // open" is the show's normal state and has to be renderable; falling back to
    // a stale listing because the sheet was correctly empty would resurrect a
    // role that has been filled.
    return parsed;
  } catch (err) {
    console.error(
      "[roles] could not reach the sheet:",
      err instanceof Error ? err.message : err,
    );
    return fallbackRoles();
  }
}

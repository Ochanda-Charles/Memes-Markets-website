import { validate } from "@/lib/careers";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { findRole, getRoles, openRoles } from "@/lib/roles";
import { sheetEndpoint } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Job applications, forwarded to a Google Sheet and a Drive folder.
 *
 * Same shape as /api/partner: the Apps Script URL is a public write endpoint, so
 * it never reaches the browser, and rotating it is an env var change rather than
 * a redeploy of the client bundle. See lib/careers.ts.
 *
 * WHY THIS ONE IS NOT ON THE EDGE RUNTIME, when /api/partner is. Three reasons
 * that compound, all of them the CV:
 *
 *   1. Size. Edge's memory and CPU budgets are sized for routing decisions, not
 *      for holding a 2.8MB string and a parsed JSON copy of it. Vercel's own
 *      body ceiling is tighter there too. The point of choosing a runtime here
 *      is to not be standing next to a cliff.
 *   2. Time. The upstream call now writes a file to Drive, which is seconds and
 *      variable rather than milliseconds.
 *   3. Headroom. Node has Buffer for whatever check somebody adds later. This
 *      file decodes nothing today — see looksLikeCv — but the next person might.
 *
 * Guards, in the order they run:
 *
 *   1. rate limit    per caller, before anything is read
 *   2. origin check  a page on another domain cannot post here
 *   3. size check    content-length, before the body is buffered
 *   4. honeypot      a field no person can see
 *   5. validation    lib/careers.ts, which is pure and tested
 *
 * NOTHING ABOUT THE CANDIDATE IS EVER LOGGED. The lines below carry a role slug
 * and an HTTP status and nothing else. Vercel's logs are not a place to put
 * somebody's email address, and emphatically not their CV.
 */

/**
 * A 2MB CV, base64-inflated, plus the rest of the form.
 *
 *   2 MiB                              2,097,152 bytes
 *   base64 is 4 * ceil(n / 3)          2,796,204 characters
 *   all ASCII, and none of base64's alphabet needs JSON escaping, so that is
 *   the same number of bytes on the wire
 *   + the other fields and the envelope     ~6 KB
 *                                      ------------------
 *                                            ~2.80 MB
 *
 * The slack above that absorbs a browser that pads differently without going
 * near Vercel's own request-body ceiling — which rejects before a line of this
 * file runs, and therefore before we could say anything useful to the person.
 *
 * This is an early-out on a header the client controls. The check that actually
 * enforces the limit is base64Bytes() inside validate(), against the real size.
 */
const MAX_BODY = 3_200_000;

/** Three, not the partner form's five. A person applies once. */
const take = createRateLimiter({
  limit: process.env.NODE_ENV === "production" ? 3 : 100,
  windowMs: 10 * 60_000,
});

function json(status: number, body: Record<string, unknown>, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/** A missing Origin is allowed through: non-browser clients omit it. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const limit = take(clientKey(request.headers));
  if (!limit.ok) {
    return json(
      429,
      {
        ok: false,
        message: "That is a lot of tries. Give it a few minutes and go again.",
      },
      { "retry-after": String(limit.retryAfter) },
    );
  }

  if (!sameOrigin(request)) {
    return json(403, { ok: false, message: "Wrong origin." });
  }

  // Before the body is buffered, which is the whole point: this is what stops a
  // four-megabyte upload from ever being read into memory.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return json(413, {
      ok: false,
      message: "That file is too big. Send one under 2MB, or send a link instead.",
      field: "cv",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, message: "Could not read that request." });
  }

  // Honeypot, same as the partner form: a cheerful 200 rather than an
  // explanation. A bot that filled every field has just uploaded a file we are
  // about to drop on the floor, which is the correct outcome.
  if (typeof body.company === "string" && body.company.trim()) {
    return json(200, { ok: true });
  }

  // Cached for ROLES_REVALIDATE, so this is usually free. It is also the only
  // way to know whether the role being applied for is still open, and the only
  // source of a title we are willing to write into the sheet.
  const roles = await getRoles();
  const checked = validate(
    body,
    openRoles(roles).map((role) => role.slug),
  );
  if (!checked.ok) {
    return json(400, checked);
  }

  const { application } = checked;
  // Resolved here rather than sent by the client. The Role column is then always
  // one of our own strings, and cannot be poisoned by a crafted request.
  const roleTitle = application.roleSlug
    ? (findRole(roles, application.roleSlug)?.title ?? "")
    : "";

  const { url, secret } = sheetEndpoint();
  if (!url) {
    // Not configured is a deployment mistake, not a candidate's problem. Loud in
    // the logs, and honest on the page — the alternative is a form that thanks
    // people for applications nobody will ever read.
    console.error(
      "[careers] SHEET_WEBHOOK is not set — the application was NOT recorded.",
    );
    return json(503, {
      ok: false,
      message:
        "The form is not accepting applications right now. Please email us instead.",
    });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The secret travels in the body, not a header: Apps Script drops custom
      // request headers across the 302 it answers with, so a header-based check
      // would reject every genuine write. See scripts/sheet-webhook.gs.
      body: JSON.stringify({
        list: "careers",
        ...application,
        roleTitle,
        secret,
        receivedAt: new Date().toISOString(),
      }),
      // Apps Script answers a POST with a 302 to script.googleusercontent.com and
      // the real body is behind it. Without following, every write looks like a
      // failure and the candidate is told to try again on an application that
      // landed — which is how one person ends up in the sheet four times.
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[careers] the sheet webhook answered HTTP ${res.status} for role "${application.roleSlug || "general"}"`,
      );
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    /**
     * THE STATUS CODE IS NOT THE ANSWER. Apps Script replies through
     * ContentService, which has no way to set one — every reply is a 200,
     * including the ones where doPost caught an exception and returned
     * { ok: false }. Checking res.ok alone means a script that refused the
     * write, or threw on the Drive call, is reported to the candidate as
     * "that is with us" while nothing reaches the sheet.
     *
     * That is exactly how the first real application went missing. The body is
     * the only place the truth is.
     */
    let upstream: { ok?: boolean; error?: string };
    try {
      upstream = (await res.json()) as { ok?: boolean; error?: string };
    } catch {
      // Not JSON at all is usually Google's own sign-in or error page, which
      // means the deployment is not reachable as configured.
      console.error(
        "[careers] the sheet webhook answered something that was not JSON — check the deployment's access setting.",
      );
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    if (!upstream.ok) {
      // The script's own reason, verbatim: "unauthorised" means the secret does
      // not match, anything else is the exception it caught.
      console.error(
        `[careers] the sheet refused the write: ${upstream.error ?? "no reason given"}`,
      );
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error(
      "[careers] could not reach the sheet webhook:",
      err instanceof Error ? err.message : err,
    );
    return json(502, {
      ok: false,
      message: "That did not send. Please try again, or email us.",
    });
  }
}

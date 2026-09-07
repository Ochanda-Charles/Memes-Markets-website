import { validate } from "@/lib/partner";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { sheetEndpoint } from "@/lib/sheet";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Partnership and sponsorship enquiries, forwarded to a Google Sheet.
 *
 * The sheet is written by an Apps Script web app whose URL comes from
 * lib/sheet.ts. That URL is a public write endpoint — anyone holding it can
 * append rows — so it never reaches the browser. See lib/partner.ts.
 *
 * ONE DEPLOYMENT, SHARED WITH /api/careers, which is why the body carries a
 * `list`. This route stays on the EDGE runtime and that one does not: the
 * payload here is a few kilobytes of text, so edge is the right shape for it.
 * The careers route carries a CV and explains its own choice in its header.
 *
 * Guards, in the order they run:
 *
 *   1. rate limit    per caller, before anything is read
 *   2. origin check  a page on another domain cannot post here
 *   3. size check    content-length, before the body is buffered
 *   4. honeypot      a field no person can see
 *   5. validation    lib/partner.ts, which is pure and tested
 *
 * A submission here reaches a human, so the limit is tighter than the
 * newsletter's: nobody sends five partnership enquiries in ten minutes.
 */

const MAX_BODY = 8_192;

const take = createRateLimiter({
  limit: process.env.NODE_ENV === "production" ? 5 : 100,
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

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return json(413, { ok: false, message: "That message is too long." });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, message: "Could not read that request." });
  }

  // Honeypot, same as the newsletter: a cheerful 200 rather than an explanation.
  if (typeof body.company === "string" && body.company.trim()) {
    return json(200, { ok: true });
  }

  const checked = validate(body);
  if (!checked.ok || !checked.enquiry) {
    return json(400, checked);
  }

  const { url: webhook, secret } = sheetEndpoint();
  if (!webhook) {
    // Not configured is a deployment mistake, not a visitor's problem. Loud in
    // the logs, and honest on the page — the alternative is a form that thanks
    // people for enquiries nobody will ever read.
    console.error("[partner] SHEET_WEBHOOK is not set — the enquiry was NOT recorded.");
    return json(503, {
      ok: false,
      message: "The form is not accepting messages right now. Please email us instead.",
    });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The secret travels in the body, not a header: Apps Script drops custom
      // request headers across the 302 it answers with, so a header-based check
      // would reject every genuine write. See scripts/sheet-webhook.gs.
      body: JSON.stringify({
        // One deployment now serves this and /api/careers; the list picks the
        // tab. An unknown or missing one falls through to Enquiries, which is
        // what keeps a stale client working.
        list: "enquiries",
        ...checked.enquiry,
        secret,
        receivedAt: new Date().toISOString(),
      }),
      // Apps Script answers a POST with a 302 to script.googleusercontent.com and
      // the real body is behind it. Without following, every write looks like a
      // failure and the visitor is told to try again on a message that landed.
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[partner] the sheet webhook answered HTTP ${res.status}`);
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    // The status code is not the answer: Apps Script replies through
    // ContentService, which cannot set one, so every reply is a 200 — including
    // the ones where doPost caught an exception. This route had the same silent
    // failure as /api/careers, where it was found; see the longer note there.
    let upstream: { ok?: boolean; error?: string };
    try {
      upstream = (await res.json()) as { ok?: boolean; error?: string };
    } catch {
      console.error(
        "[partner] the sheet webhook answered something that was not JSON — check the deployment's access setting.",
      );
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    if (!upstream.ok) {
      console.error(
        `[partner] the sheet refused the write: ${upstream.error ?? "no reason given"}`,
      );
      return json(502, {
        ok: false,
        message: "That did not send. Please try again, or email us.",
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error(
      "[partner] could not reach the sheet webhook:",
      err instanceof Error ? err.message : err,
    );
    return json(502, {
      ok: false,
      message: "That did not send. Please try again, or email us.",
    });
  }
}

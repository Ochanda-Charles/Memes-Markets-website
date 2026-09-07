/**
 * The one Apps Script deployment: where it is, and the secret it checks.
 *
 * One web app now serves three writes and one read — partnership enquiries,
 * job applications, and the roles listing the careers pages render. One /exec
 * URL, one secret, one thing for a non-developer to set up and keep straight.
 * See scripts/sheet-webhook.gs.
 *
 * TWO NAMES FOR ONE VALUE, on purpose. These variables were added when the
 * script was the partnership form's alone, and are already set in Vercel under
 * the PARTNER_ names. Reading both means shipping this does not depend on
 * somebody standing in the dashboard at the same moment; the SHEET_ names are
 * the honest ones and what DEPLOY.md tells a new deployment to use. This
 * function is the only place that knows about the aliasing.
 */
export interface SheetEndpoint {
  /** undefined when nothing is configured, which is a normal state. */
  url: string | undefined;
  secret: string;
}

export function sheetEndpoint(): SheetEndpoint {
  return {
    url: process.env.SHEET_WEBHOOK ?? process.env.PARTNER_SHEET_WEBHOOK,
    secret: process.env.SHEET_SECRET ?? process.env.PARTNER_SHEET_SECRET ?? "",
  };
}

/**
 * The read. No secret: job listings are public the moment they are published,
 * and a secret in a URL the site fetches on every regeneration buys nothing.
 */
export function rolesUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}list=roles`;
}

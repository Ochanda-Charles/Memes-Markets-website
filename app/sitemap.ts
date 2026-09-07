import { getRoles, openRoles } from "@/lib/roles";
import { siteUrl } from "@/lib/site";
import type { MetadataRoute } from "next";

/**
 * Every indexable page.
 *
 * ASYNC, AND THEREFORE ITSELF AN ISR ROUTE, because the job listings are not
 * known at build time — they come from a Google Sheet on the same five-minute
 * window as the pages that render them. See lib/roles.ts.
 *
 * Only OPEN roles are listed. A closed role's page still answers, deliberately,
 * but it carries robots: noindex and Google should be dropping it rather than
 * being pointed at it; a draft has never existed as far as the internet is
 * concerned.
 *
 * Absolute URLs come from siteUrl(), so this follows the custom domain the day
 * one is set rather than needing to be found and edited.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const roles = openRoles(await getRoles());

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    // Above /about on purpose: this is the page the site most wants found by
    // someone searching for a way to sponsor the show.
    { url: `${base}/partner`, changeFrequency: "monthly", priority: 0.8 },
    // Below both and above the legal pages. Careers matters enormously to a very
    // small number of people and not at all to everybody else, which is exactly
    // what a middling priority says.
    { url: `${base}/careers`, changeFrequency: "weekly", priority: 0.5 },
    ...roles.map((role) => ({
      url: `${base}/careers/${role.slug}`,
      // The date on the listing itself, so a role that has been up for months
      // does not keep claiming to be new.
      ...(role.posted && { lastModified: new Date(role.posted) }),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    // Included but ranked last. Search engines expect a site to have these and
    // note their absence; nobody is searching for them, so they should not
    // compete with the pages that matter.
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

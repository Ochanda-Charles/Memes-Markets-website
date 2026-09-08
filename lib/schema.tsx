import { HOSTS, POSITIONING, SCHEDULE } from "@/content/platforms";
import type { Episode } from "@/lib/episodes";
import type { Role } from "@/lib/roles-sheet";
import { siteUrl } from "@/lib/site";

/**
 * JSON-LD. Google has a first-class understanding of PodcastSeries, and this is
 * how the show gets to appear as a podcast rather than as a generic web page.
 *
 * Everything here is derived from real data. `numberOfEpisodes` is deliberately
 * absent rather than guessed: the RSS feed returns the most recent 15, so we
 * genuinely do not know the total from this source, and a wrong count in
 * structured data is worse than no count.
 */

export function podcastSeriesSchema(episodes: Episode[]) {
  return {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    name: "Memes & Markets",
    alternateName: "M&M",
    url: siteUrl(),
    description: `${POSITIONING}. ${SCHEDULE}.`,
    inLanguage: "en",
    webFeed:
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCpDHJbeyWBab2qr6y2d6_yQ",
    author: HOSTS.split(" & ").map((name) => ({ "@type": "Person", name })),
    sameAs: [
      "https://www.youtube.com/@MemesandMarketsPod",
      "https://www.twitch.tv/memesandmarkets",
      "https://x.com/Memesandmkts",
      "https://www.instagram.com/memesandmkts",
      "https://open.spotify.com/show/1GSfFx3sQoG2bYAbIYUocN",
      "https://podcasts.apple.com/us/podcast/memes-and-markets/id1840280923",
      // The profile rather than the publication's custom domain, which is now
      // this site. See the note on PUBLICATION in lib/newsletter.ts.
      "https://substack.com/@memesandmarketspod",
    ],
    hasPart: episodes.map((e) => ({
      "@type": "PodcastEpisode",
      name: e.title,
      url: e.url,
      datePublished: e.published,
      image: e.thumbnail,
      partOfSeries: { "@type": "PodcastSeries", name: "Memes & Markets", url: siteUrl() },
    })),
  };
}

export function aboutSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl()}/about`,
    name: "About Memes & Markets",
    mainEntity: {
      "@type": "PodcastSeries",
      name: "Memes & Markets",
      url: siteUrl(),
      author: HOSTS.split(" & ").map((name) => ({ "@type": "Person", name })),
    },
  };
}

/** schema.org's vocabulary for the employment types the sheet offers. */
const EMPLOYMENT: Record<Role["employment"], string> = {
  "Full-time": "FULL_TIME",
  "Part-time": "PART_TIME",
  Contract: "CONTRACTOR",
  Freelance: "CONTRACTOR",
  Internship: "INTERN",
};

/**
 * A JobPosting, so an open role can appear in Google's job results.
 *
 * ONLY EVER CALLED FOR AN OPEN ROLE — see app/careers/[slug]/page.tsx. Google's
 * job posting policy requires the markup to come off a listing that has stopped
 * accepting applications, and leaving it on is a manual-action risk rather than
 * merely untidy.
 *
 * `baseSalary` IS DELIBERATELY ABSENT, for the same reason numberOfEpisodes is
 * absent above. The Compensation column is free text, because "Day rate,
 * negotiable" is a legitimate thing for this show to be offering, and there is
 * no honest way to turn that into the structured amount Google wants. A wrong
 * salary in structured data is worse than no salary: it is the field candidates
 * filter on, so being wrong there means being filtered out of searches you would
 * have matched. Putting a range in search results is a real feature — Salary
 * min, max, currency and unit columns in the sheet, and a QuantitativeValue
 * here — not a coercion of the column that exists.
 */
export function jobPostingSchema(role: Role) {
  const remote = role.remote === "Remote";

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: role.summary,
    url: `${siteUrl()}/careers/${role.slug}`,
    // Accurate: the form is on the page, not behind a third-party applicant
    // tracking system.
    directApply: true,
    employmentType: EMPLOYMENT[role.employment],
    ...(role.team && { occupationalCategory: role.team }),
    ...(role.posted && { datePosted: role.posted }),
    ...(role.closes && { validThrough: role.closes }),
    ...(remote
      ? {
          jobLocationType: "TELECOMMUTE",
          ...(role.location && {
            applicantLocationRequirements: { "@type": "Country", name: role.location },
          }),
        }
      : role.location && {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: role.location },
          },
        }),
    hiringOrganization: {
      "@type": "Organization",
      name: "Memes & Markets",
      url: siteUrl(),
    },
  };
}

/**
 * Rendered with dangerouslySetInnerHTML because JSON-LD must reach the DOM as a
 * raw script body; JSX would escape the quotes and Google would see nothing.
 *
 * THE PAYLOAD IS NOT ALL OURS ANY MORE, and the escaping below is what makes
 * that safe. This used to carry only typed constants; jobPostingSchema now
 * embeds a role's title, summary, team and location, which come from a Google
 * Sheet that people other than the developer edit. The `<` replacement is
 * therefore load-bearing rather than belt-and-braces: without it a title
 * containing `</script>` closes this block early and whatever follows is parsed
 * as HTML.
 *
 * Verified rather than assumed. A role titled
 * `</script><img src=x onerror=alert(1)>` renders as `</script>...` inside
 * a block that still parses as valid JSON, and injects no elements. Anyone
 * tempted to drop the replace() should reproduce that first.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must reach the DOM as a raw script body; the payload includes sheet-authored role text, which the < escape below neutralises. See the note above.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

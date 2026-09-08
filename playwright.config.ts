import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Job listings for the careers tests.
 *
 * getRoles() runs on the server, so page.route() cannot intercept it, and the
 * committed fallback ships empty because the show is not hiring — which leaves
 * the suite with a correct page and nothing on it to click. ROLES_FIXTURE is
 * read by lib/roles.ts ahead of everything else, the same shape of deliberate
 * override as FORCE_LIVE.
 */
const ROLES_FIXTURE = readFileSync("./e2e/fixtures/roles.json", "utf8");

export default defineConfig({
  testDir: "./e2e",
  // Compiles every route once before any worker starts. See the file for why
  // that is not the same thing as raising the expect timeout.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  /**
   * THREE WORKERS, NOT HALF THE CORES.
   *
   * The bottleneck is `next dev`, which is one process, and the homepage is by
   * far the heaviest route on the site — the orbit sphere, the globe, 137kB of
   * JS. Playwright's default is half the machine's cores, which on a twelve-core
   * box is six workers arriving at "/" together: a real thundering herd, whose
   * symptom is a `page.goto` that simply never finishes.
   *
   * It appeared when the careers tests pushed the suite past fifty, and it
   * landed on a different test each run — always one of the two that navigate
   * repeatedly, the canonical sweep and the footer walk — which is exactly the
   * misleading shape global-setup.ts was written to prevent. At six workers the
   * suite failed one or two tests a run; at three it has not failed, and costs
   * nothing in wall clock, because the server was the constraint all along.
   *
   * Raising the timeout instead was tried first and did NOT work, which is the
   * useful part: the server was saturated, not slow.
   */
  workers: 3,
  /**
   * Headroom for a cold compile, not for the above. Assertions keep their 5s
   * default, so a genuinely broken link still fails in five seconds.
   */
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    /**
     * A throwaway measurement id, so the consent tests have something to consent
     * ABOUT. The banner and the tag are both gated on NEXT_PUBLIC_GA_ID — a site
     * with no analytics shows no cookie notice — so without this the whole
     * "cookie consent" describe block would be testing an empty page.
     *
     * It is deliberately not a real id. The tests stub googletagmanager.com, so
     * nothing is ever sent anywhere; this only has to be non-empty.
     *
     * CAVEAT: `reuseExistingServer` means a dev server already running without
     * this var gets reused, and those tests then fail. That is the right failure
     * — loud rather than silently skipped — but it is worth knowing before
     * debugging it as a code fault.
     */
    env: { NEXT_PUBLIC_GA_ID: "G-E2ETESTONLY", ROLES_FIXTURE },
  },
});

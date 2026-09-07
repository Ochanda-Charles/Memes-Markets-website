import { type Page, expect, test } from "@playwright/test";

/**
 * Put the site on air for a test.
 *
 * The player and the Watch live CTA only exist while the show is broadcasting,
 * so a suite that does not say otherwise sees neither — there are no Twitch
 * credentials in CI and /api/live-status correctly answers "off air".
 *
 * Stubbing the route rather than setting FORCE_LIVE on the dev server keeps each
 * test's intent visible in the test, and keeps it working against whatever
 * server happens to be running (playwright.config reuses an existing one).
 *
 * The Twitch embed is stubbed too. Nothing here is testing Twitch's player, and
 * letting it load makes the suite depend on a third party's CDN being up.
 */
async function goLive(page: Page) {
  await page.route("**/api/live-status", (route) =>
    route.fulfill({
      json: { live: true, title: "Test broadcast", viewers: 1234, source: "forced" },
    }),
  );
  await page.route("https://player.twitch.tv/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>stub</title>",
    }),
  );
}

/**
 * The load-bearing test.
 *
 * The whole reason this project is on the Next.js App Router is that the floating
 * player must keep playing across a Home <-> About navigation. That requirement
 * is what ruled out Astro. If it ever regresses, the framework choice is no
 * longer paying for itself and we should know immediately.
 *
 * Asserting "the player is visible on both pages" would NOT catch a regression:
 * a component that unmounts and remounts also ends up visible on both. So we
 * stamp the live DOM node before navigating and check the stamp survived. React
 * cannot preserve it across an unmount, because a remount builds a new node.
 */
test.describe("floating live player", () => {
  test("survives Home to About without remounting", async ({ page }) => {
    await goLive(page);
    await page.goto("/");

    const player = page.getByTestId("live-player");
    await expect(player).toBeVisible();

    // Stamp the node that exists right now.
    await player.evaluate((el) => {
      (el as HTMLElement).dataset.e2eStamp = "original-instance";
    });

    // Client-side navigation, the way a visitor does it.
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    // The About h1 is the show name, not the word "About" — that is the eyebrow
    // above it. This assertion is only here to prove the new route actually
    // rendered before the stamp is checked.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Memes & Markets",
    );

    // Same node, therefore never unmounted, therefore a stream would still be playing.
    await expect(page.getByTestId("live-player")).toHaveAttribute(
      "data-e2e-stamp",
      "original-instance",
    );

    // And back again.
    await page.goBack();
    await expect(page).toHaveURL(/localhost:3000\/$/);
    await expect(page.getByTestId("live-player")).toHaveAttribute(
      "data-e2e-stamp",
      "original-instance",
    );
  });

  test("dismiss hides it and the choice sticks for the visit", async ({ page }) => {
    await goLive(page);
    await page.goto("/");
    const player = page.getByTestId("live-player");
    await expect(player).toBeVisible();

    await page.getByRole("button", { name: "Dismiss player" }).click();
    await expect(player).toHaveCount(0);

    // Dismissal is per-visit, so it must survive a navigation but not a new session.
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect(page.getByTestId("live-player")).toHaveCount(0);
  });

  /**
   * The other half of "only when live", and the half that actually regressed
   * before: both surfaces used to render unconditionally. Off air is the default
   * state of the site for most of the week, so this is the common case, not the
   * edge case.
   */
  test("neither the player nor the CTA exists off air", async ({ page }) => {
    await page.route("**/api/live-status", (route) =>
      route.fulfill({ json: { live: false, source: "twitch" } }),
    );
    await page.goto("/");

    await expect(page.getByTestId("live-player")).toHaveCount(0);

    // The CTA lives inside the info panel, so the panel has to be open to know.
    await page.getByRole("button", { name: "More info" }).click();
    await expect(page.locator("dialog.mm-panel")).toBeVisible();
    await expect(page.getByTestId("live-cta")).toHaveCount(0);
  });

  /**
   * The embed used to hardcode `parent=localhost&parent=memesandmarkets.com`, and
   * Twitch refuses to render whenever the embedding host is not in that list. The
   * site is on neither: production is a *.vercel.app address until a domain is
   * bought, and memesandmarkets.com serves the Substack. So this card drew its
   * border, title and viewer count around Twitch's refusal notice on every
   * environment that was not a laptop — and nothing caught it, because goLive()
   * above stubs the Twitch player out of the suite on purpose.
   *
   * Asserting on the src rather than on what renders keeps that stub in place: the
   * claim being tested is "we asked for the right thing", which is exactly the
   * part that was wrong.
   */
  test("the embed names the host it is actually embedded on", async ({ page }) => {
    await goLive(page);
    await page.goto("/");

    const embed = page.locator('iframe[title="Memes & Markets live stream"]');
    await expect(embed).toBeVisible();

    const src = new URL((await embed.getAttribute("src")) ?? "");
    expect(src.origin).toBe("https://player.twitch.tv");
    expect(src.searchParams.getAll("parent")).toContain(new URL(page.url()).hostname);
  });

  test("the CTA appears in the panel once the show is on air", async ({ page }) => {
    await goLive(page);
    await page.goto("/");

    await page.getByRole("button", { name: "More info" }).click();
    const cta = page.getByTestId("live-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /youtube\.com\/@MemesandMarketsPod\/live/);
  });
});

test.describe("home", () => {
  test("renders the orbit as real links", async ({ page }) => {
    await page.goto("/");

    // Twelve cards on the belt, each a real link — the accessibility argument for
    // building the sphere out of DOM rather than canvas. Since the plain episode
    // list was removed, this IS the route to the episodes, so it has to hold.
    await expect(page.locator(".mm-orbit-slot")).toHaveCount(12);
    await expect(page.locator(".mm-orbit-slot a").first()).toHaveAttribute(
      "href",
      /youtube/,
    );

    // Exactly one h1, and the disclaimer is present verbatim. Scoped to <footer>:
    // the More info panel carries the same sentence, so an unscoped getByText
    // matches twice and trips strict mode.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(
      page
        .locator("footer")
        .getByText(
          "For education and entertainment only. Not financial, legal, tax, or investment advice.",
        ),
    ).toBeVisible();
  });

  /**
   * The regression this guards against was invisible to every other assertion:
   * the cards were real anchors with correct hrefs and hit-tested correctly, but
   * clicking one did nothing, because the belt captured the pointer on
   * pointerdown and the browser fired `click` on the belt instead of the anchor.
   * "It is a link with an href" is not the same claim as "it opens".
   */
  /**
   * VIEWPORT IS TALLER THAN THE DEFAULT ON PURPOSE, for every test below that
   * drives page.mouse with raw coordinates.
   *
   * Those coordinates do not scroll — unlike locator.click() — and since the
   * audience band moved above the orbit, the first card sits at y=771 on a
   * 720px-tall viewport. Every press then landed outside the window and did
   * nothing.
   *
   * The obvious fix, scrollIntoViewIfNeeded(), is WRONG here and was tried:
   * OrbitSphere turns the belt on page scroll (SCROLL_SENSITIVITY), so scrolling
   * to reveal the card rotates it away from the box that was just measured. It
   * broke a test that had been passing.
   *
   * A viewport that fits the orbit removes the scroll entirely, which is what
   * these tests actually need — none of them is about scrolling.
   */
  test.describe(() => {
    test.use({ viewport: { width: 1280, height: 1100 } });

    /**
     * The bug the test above could not see, because that one disables the drift.
     *
     * Every card on this belt is always moving, so clicking one means aiming at a
     * moving target and the pointer travels a few pixels doing it. The drag
     * threshold was 5px, which is inside the noise of an ordinary click — so a
     * normal click crossed it, turned the belt a little, and had its click
     * swallowed. Reported as "I get to spin the orbit but not go to the video".
     *
     * Deliberately runs with the drift LIVE and asserts on the numbers either side
     * of the threshold, because "does a click work" and "does a drag not open
     * anything" are the same question asked at two distances.
     */
    for (const travel of [0, 6, 10]) {
      test(`a click that wobbles ${travel}px still opens the card`, async ({ page }) => {
        await page.goto("/");
        const card = page.locator(".mm-orbit-slot a").first();
        const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
        const x = box.x + box.width / 2;
        const y = box.y + 40;

        const popupPromise = page.waitForEvent("popup");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(80);
        if (travel) await page.mouse.move(x + travel, y, { steps: 3 });
        await page.mouse.up();

        const popup = await popupPromise;
        expect(popup.url()).toMatch(/youtube\.com/);
        await popup.close();
      });
    }

    /**
     * EVERY CARD OPENS, NOT JUST THE FIRST ONE.
     *
     * This exists because the whole suite used `.first()` — card index 0 — while
     * the slot's onFocus handler called goTo(-i * step). At i = 0 that rotates by
     * nothing, so card 0 was the ONE card in twelve that could not reproduce the
     * bug, and every test reached for it.
     *
     * On any other card, clicking focused the anchor, the belt span to bring that
     * card to the front, the card slid out from under the pointer, and the click
     * never landed: the orbit turned and the video never opened. Reported twice,
     * and it survived a first fix aimed at the drag threshold.
     *
     * Reduced motion freezes the drift so slot index maps to a stable on-screen
     * position: 0, 1, 2, 10 and 11 are the front arc. Slots 3..9 sit at 90-270deg
     * with backface-visibility hidden and are correctly not clickable.
     */
    for (const idx of [1, 2, 11]) {
      test(`orbit card ${idx} opens on click without turning the belt`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/");

        const belt = page.locator(".mm-orbit-belt");
        const nudge = () =>
          belt.evaluate(
            (el) => Number.parseFloat(el.style.getPropertyValue("--nudge")) || 0,
          );
        const before = await nudge();

        const card = page.locator(".mm-orbit-slot").nth(idx).locator("a");
        const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

        const popupPromise = page.waitForEvent("popup");
        await page.mouse.move(box.x + box.width / 2, box.y + 40);
        await page.mouse.down();
        await page.waitForTimeout(80);
        await page.mouse.up();

        const popup = await popupPromise;
        expect(popup.url()).toMatch(/youtube\.com/);
        await popup.close();

        // A rotation here is the bug coming back.
        expect(Math.abs((await nudge()) - before)).toBeLessThan(1);
      });
    }

    /**
     * The other half of that fix: keyboard focus MUST still bring a card round to
     * the front. Gating onFocus on :focus-visible is what separates the two, and
     * losing this would leave tabbing through the orbit landing on cards facing
     * away from the viewer.
     */
    test("keyboard focus still turns the belt to the focused card", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");

      const belt = page.locator(".mm-orbit-belt");
      const nudge = () =>
        belt.evaluate(
          (el) => Number.parseFloat(el.style.getPropertyValue("--nudge")) || 0,
        );
      const slotIndex = () =>
        page.evaluate(() => {
          const slot = document.activeElement?.closest?.(".mm-orbit-slot");
          return slot
            ? [...document.querySelectorAll(".mm-orbit-slot")].indexOf(slot)
            : -1;
        });

      for (let i = 0; i < 40 && (await slotIndex()) < 0; i++) {
        await page.keyboard.press("Tab");
      }
      expect(await slotIndex()).toBeGreaterThanOrEqual(0);

      const before = await nudge();
      await page.keyboard.press("Tab");
      expect(await slotIndex()).toBeGreaterThan(0);

      await expect
        .poll(async () => Math.abs((await nudge()) - before), { timeout: 4000 })
        .toBeGreaterThan(1);
    });

    /**
     * The other side of the same line. Past the threshold it must be a drag: the
     * belt turns and nothing opens. Without this, "make clicking work" could be
     * satisfied by removing the swallow entirely and breaking every drag.
     */
    test("a deliberate drag turns the belt and opens nothing", async ({ page }) => {
      await page.goto("/");
      const card = page.locator(".mm-orbit-slot a").first();
      const belt = page.locator(".mm-orbit-belt");
      const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      const x = box.x + box.width / 2;
      const y = box.y + 40;

      let opened = false;
      page.once("popup", () => {
        opened = true;
      });

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.move(x - 40, y, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(1200);

      expect(opened).toBe(false);
      const nudge = await belt.evaluate((el) => el.style.getPropertyValue("--nudge"));
      expect(Number.parseFloat(nudge)).not.toBe(0);
    });

    /**
     * A touch browser leaves :hover stuck on whatever was tapped, so the
     * hover-to-pause rule used to stop the belt permanently the first time a phone
     * user touched a card. The pause is now behind `@media (hover: hover)`, and
     * touch pauses only for the length of the press.
     */
    test("the belt is frozen while pressed and drifts again after release", async ({
      page,
    }) => {
      await page.goto("/");
      const belt = page.locator(".mm-orbit-belt");
      const card = page.locator(".mm-orbit-slot a").first();
      const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

      await page.mouse.move(box.x + box.width / 2, box.y + 40);
      await page.mouse.down();
      await expect(belt).toHaveAttribute("data-pressing", "true");
      await expect(belt).toHaveCSS("animation-play-state", "paused");

      await page.mouse.up();
      await expect(belt).not.toHaveAttribute("data-pressing", "true");
    });

    test("an orbit card opens on click, but not at the end of a drag", async ({
      page,
    }) => {
      // Freezes the drift, so the card cannot slide out from under the pointer
      // between measuring it and pressing it.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");

      const card = page.locator(".mm-orbit-slot a").first();
      const [popup] = await Promise.all([page.waitForEvent("popup"), card.click()]);
      expect(popup.url()).toMatch(/youtube\.com/);
      await popup.close();

      // Now drag from on top of a card. The belt must turn and nothing must open.
      const belt = page.locator(".mm-orbit-belt");
      const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      const x = box.x + box.width / 2;
      const y = box.y + 60;

      let openedDuringDrag = false;
      page.once("popup", () => {
        openedDuringDrag = true;
      });

      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(x - i * 12, y);
      await page.mouse.up();
      await page.waitForTimeout(500);

      expect(openedDuringDrag).toBe(false);
      await expect(belt).toHaveAttribute("style", /--nudge/);
      const nudge = await belt.evaluate((el) => el.style.getPropertyValue("--nudge"));
      expect(Number.parseFloat(nudge)).not.toBe(0);
    });
  }); // end of the taller-viewport block

  test("more info opens a panel and escape closes it", async ({ page }) => {
    await page.goto("/");

    const panel = page.locator("dialog.mm-panel");
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "More info" }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Hosted by" })).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "Press & appearances" }),
    ).toBeVisible();

    // The page behind must not scroll while the panel is up.
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  });

  /**
   * The newsletter signup.
   *
   * It is a form again, and this time it posts from the visitor's browser rather
   * than through a route of ours. That is not a preference: Substack refuses
   * non-browser clients outright — curl is refused from a residential
   * connection, so no serverless function will ever manage it — while accepting
   * a form-encoded body from a browser with no preflight at all.
   *
   * BOTH ASSERTIONS BELOW GUARD SOMETHING THAT FAILS SILENTLY. The response is
   * opaque by design, so the page cannot tell a delivered signup from a rejected
   * one; if the request stops going out, or goes out as JSON and gets killed by
   * a preflight, everything on screen still says it worked. Only a test that
   * watches the wire can see it.
   *
   * The route interception is not optional either. A real POST from a test run
   * would put a fake address on a real mailing list.
   */
  test("the newsletter box posts the address to Substack", async ({ page }) => {
    await page.goto("/");

    const posts: { url: string; body: string; contentType: string }[] = [];
    await page.route("**/api/v1/free", async (route) => {
      const request = route.request();
      posts.push({
        url: request.url(),
        body: request.postData() ?? "",
        contentType: request.headers()["content-type"] ?? "",
      });
      await route.fulfill({ status: 200, body: "{}" });
    });

    const form = page.locator("footer form");
    await form.scrollIntoViewIfNeeded();
    await form.getByPlaceholder("name@email.com").fill("reader@example.com");
    await form.getByRole("button", { name: /subscribe/i }).click();

    // "Gone over", not "subscribed" — the copy is not allowed to claim more than
    // an opaque response supports.
    await expect(page.getByText(/gone over/i)).toBeVisible();

    expect(posts).toHaveLength(1);
    const post = posts[0];
    // Narrowing, not a second assertion: toHaveLength has already failed the test
    // if this is missing, and tsc cannot see that.
    if (!post) throw new Error("the signup sent nothing at all");
    // A substack.com host, never the custom domain the site now occupies: that
    // would post the signup straight back to this page.
    expect(post.url).toMatch(/^https:\/\/[^/]+\.substack\.com\/api\/v1\/free$/);
    // Form-encoded, NOT JSON. The safelisted content type is the only reason
    // this request escapes the browser at all.
    expect(post.contentType).toMatch(/^application\/x-www-form-urlencoded/);
    expect(post.body).toContain("email=reader%40example.com");
  });

  /**
   * The address check has to happen here, because it cannot happen anywhere else.
   * Substack rejects a malformed address into an opaque response we cannot read,
   * so anything that gets past this point is reported to the visitor as success.
   */
  test("a malformed address is refused before anything is sent", async ({ page }) => {
    await page.goto("/");

    let sent = 0;
    await page.route("**/api/v1/free", async (route) => {
      sent += 1;
      await route.fulfill({ status: 200, body: "{}" });
    });

    const form = page.locator("footer form");
    await form.scrollIntoViewIfNeeded();
    await form.getByPlaceholder("name@email.com").fill("reader@example");
    await form.getByRole("button", { name: /subscribe/i }).click();

    await expect(page.getByText(/does not look like an email/i)).toBeVisible();
    expect(sent).toBe(0);
  });

  test("does not scroll sideways at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

/**
 * Getting back out of a subpage.
 *
 * This site has no nav bar by design — the wordmark is the header — and the
 * consequence went unnoticed until someone tried to use it: /about and /partner
 * had no route home at all except the footer, past the entire page. Somebody
 * arriving from a pasted link was stuck.
 *
 * Each of these is a separate way home, and they are tested separately because
 * each is one someone will reach for by reflex.
 */
/**
 * Click a link in the footer, scoped to the footer.
 *
 * The scoping is the point. These locators used to search the whole page for a
 * link called "Privacy" or "About", which was safe only while no other page
 * carried one — and /careers now renders role cards with titles of their own.
 * Naming the landmark says what the test is actually about, and stops a future
 * listing called "Terms of the deal" from making it ambiguous.
 */
async function clickInFooter(page: Page, name: string) {
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name, exact: true }).first().click();
}

test.describe("navigation", () => {
  for (const from of ["/about", "/partner", "/careers"]) {
    test(`the header lockup on ${from} goes home`, async ({ page }) => {
      await page.goto(from);
      await page
        .getByRole("link", { name: /back to the homepage/i })
        .first()
        .click();
      await expect(page).toHaveURL(/localhost:3000\/$/);
    });

    test(`the footer lockup on ${from} goes home`, async ({ page }) => {
      await page.goto(from);
      await page
        .locator("footer")
        .getByRole("link", { name: /back to the homepage/i })
        .click();
      await expect(page).toHaveURL(/localhost:3000\/$/);
    });
  }

  /**
   * Scoped to the footer, which it was not before. These locators used to search
   * the whole page for a link called "About" or "Partner" — safe while no other
   * page carried one, and a trap the moment /careers grew role cards with titles
   * of their own. Naming the landmark says what the test is actually about.
   */
  test("the footer reaches every other page", async ({ page }) => {
    await page.goto("/");

    // Chained rather than returning home between each: the footer is on every
    // page, so walking About -> Partner -> Careers exercises it three times AND
    // proves each page carries it. An earlier version used page.goBack(), which
    // races — the next click can land while the back navigation is still in
    // flight, and the assertion then sees the homepage.
    const pages: [label: string, path: string][] = [
      ["About", "/about"],
      ["Partner", "/partner"],
      ["Careers", "/careers"],
    ];
    for (const [label, path] of pages) {
      await clickInFooter(page, label);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  /**
   * The homepage must NOT grow the small header. Its wordmark is already the
   * header at full bleed, and a second smaller one directly above it reads as a
   * rendering fault rather than as navigation.
   */
  test("the homepage does not carry the subpage header", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body > header")).toHaveCount(0);
    await expect(page.locator("body > main")).toHaveCount(1);
  });

  /**
   * The developer credit. Pinned because the value of it is entirely in the
   * fragment: without `#contact` it lands someone at the top of a portfolio to
   * scroll and hunt, which is how an interested click gets lost. A tidy-up that
   * "simplified" the href would break exactly the thing it is for, and would
   * look like no change at all.
   */
  test("the footer reaches the legal pages", async ({ page }) => {
    await page.goto("/");
    await clickInFooter(page, "Privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "What we collect",
    );

    await page.goto("/");
    await clickInFooter(page, "Terms");
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("the footer credits the developer and links their contact section", async ({
    page,
  }) => {
    await page.goto("/");
    const credit = page.locator("footer").getByRole("link", { name: /site by/i });
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute("href", /ochanda-charles\.me\/#contact$/);
    await expect(credit).toHaveAttribute("target", "_blank");
  });
});

/**
 * The cookie notice.
 *
 * Every assertion here is about a failure that is INVISIBLE when it happens.
 * Consent state lives in Google's dataLayer, so a broken bootstrap looks exactly
 * like a working one from the page — which is precisely how the returning-visitor
 * bug survived being built: someone who had pressed Accept came back defaulted to
 * denied, and nothing on screen said so.
 *
 * The tests stub googletagmanager.com. Nothing here is testing Google's library,
 * and letting it load would make the suite depend on their CDN and on a real
 * measurement id existing.
 */
/**
 * Canonical URLs.
 *
 * app/layout.tsx sets `canonical: "./"` so each route declares itself, and that
 * is right for every route except the one that matters most. Next resolves the
 * relative form against the route's INTERNAL name, and the root route's is
 * `/index` — so the homepage shipped `rel="canonical"` pointing at `.../index`,
 * an address nothing links to, while `/index` answered 200 with the same page and
 * canonicalised to itself. The homepage was donating its ranking signals to a URL
 * that only existed by accident.
 *
 * Nothing on the page looks wrong when this breaks, which is why it survived to
 * production and why it is worth a test rather than a comment.
 */
test.describe("seo", () => {
  test("every route is its own canonical, and the homepage is not /index", async ({
    page,
  }) => {
    for (const path of ["/", "/about", "/partner", "/careers", "/privacy", "/terms"]) {
      await page.goto(path);
      const canonical = await page
        .locator('link[rel="canonical"]')
        .first()
        .getAttribute("href");

      expect(canonical, `${path} should declare a canonical`).toBeTruthy();
      expect(canonical, "no route may canonicalise to /index").not.toMatch(/\/index$/);

      const declared = new URL(canonical ?? "").pathname.replace(/\/$/, "");
      expect(declared, `${path} should point at itself`).toBe(path.replace(/\/$/, ""));
    }
  });

  test("/index redirects to the homepage rather than duplicating it", async ({
    page,
  }) => {
    const response = await page.goto("/index");
    expect(new URL(page.url()).pathname).toBe("/");
    // Followed a redirect rather than being served in place.
    expect(response?.request().redirectedFrom()).not.toBeNull();
  });
});

/**
 * The route from the info panel to the partnership page.
 *
 * The panel is where somebody works out what the show is, which is the moment a
 * sponsor decides whether to ask — and the only way there used to be the footer,
 * past the whole page and behind a dialog they would have to close first.
 *
 * The subtle part is not the link, it is the exit. MoreInfo locks the document
 * scroll while the dialog is up and releases it in an effect cleanup. Navigating
 * away from inside the dialog is the one path where that cleanup has to fire on
 * unmount rather than on a `close` event, and if it does not, the visitor lands
 * on /partner unable to scroll — a page that looks fine and simply will not move.
 */
test.describe("partner route", () => {
  test("the info panel leads to /partner, and the page scrolls when it gets there", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More info" }).click();

    const panel = page.locator("dialog.mm-panel");
    await expect(panel).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await panel.getByRole("link", { name: /partner with us/i }).click();

    await expect(page).toHaveURL(/\/partner$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The scroll lock came off with the dialog.
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    await expect(panel).toHaveCount(0);
  });
});

test.describe("cookie consent", () => {
  /**
   * `dataLayer` is cast rather than imported. types/gtag.d.ts declares it for the
   * app, but this file compiles under e2e/tsconfig.json, and pulling the app's
   * ambient types in just to read one array would couple the suite to them.
   */
  const consentState = (page: Page) =>
    page.evaluate(() => {
      const layer =
        (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [];
      return {
        stored: localStorage.getItem("mm-consent"),
        calls: layer
          .map((a) => Array.from(a))
          .filter((c) => c[0] === "consent")
          .map((c) => [
            c[1],
            (c[2] as { analytics_storage?: string } | undefined)?.analytics_storage,
          ]),
      };
    });

  test.beforeEach(async ({ context }) => {
    await context.route("https://www.googletagmanager.com/**", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
  });

  test("defaults to denied and sets no cookies before a choice", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Cookies" })).toBeVisible();

    const { stored, calls } = await consentState(page);
    expect(stored).toBeNull();
    expect(calls).toEqual([["default", "denied"]]);

    const ga = (await page.context().cookies()).filter((c) => c.name.startsWith("_ga"));
    expect(ga).toEqual([]);
  });

  for (const [button, expected] of [
    ["Accept all", "granted"],
    ["Reject all", "denied"],
  ] as const) {
    test(`${button} is remembered across a reload`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: button }).click();
      await expect(page.getByRole("complementary", { name: "Cookies" })).toHaveCount(0);

      await page.reload();
      // The banner must not come back — asking again is not taking an answer.
      await expect(page.getByRole("complementary", { name: "Cookies" })).toHaveCount(0);

      const { stored, calls } = await consentState(page);
      expect(stored).toBe(expected);
      // The default itself carries the stored choice, so there is no window in
      // which a returning visitor's consent is wrong. See components/Analytics.tsx.
      expect(calls).toEqual([["default", expected]]);
    });
  }

  test("cookie settings offers only the category the site actually has", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Cookie settings" }).first().click();

    const dialog = page.getByRole("dialog", { name: "Cookie settings" });
    await expect(dialog).toBeVisible();

    // One switch, not four. Strictly necessary is stated rather than offered,
    // and there is no marketing category because there is no marketing.
    await expect(dialog.getByRole("switch")).toHaveCount(1);

    const analytics = dialog.getByRole("switch", { name: "Analytics" });
    await expect(analytics).toHaveAttribute("aria-checked", "false");
    await analytics.click();
    await expect(analytics).toHaveAttribute("aria-checked", "true");

    await dialog.getByRole("button", { name: "Save choices" }).click();
    await expect(dialog).toHaveCount(0);

    const { stored, calls } = await consentState(page);
    expect(stored).toBe("granted");
    expect(calls).toEqual([
      ["default", "denied"],
      ["update", "granted"],
    ]);
  });

  /**
   * The tag reports one page_view, at load. Everything after it is a next/link,
   * so without components/AnalyticsPageViews.tsx a whole session would arrive in
   * GA4 as a single landing page — and /about, /partner, /privacy and /terms
   * would read as pages nobody visits, which is indistinguishable in the reports
   * from a site nobody explores.
   *
   * ASSERTS ON THE CONSOLE, not on dataLayer, because the suite runs against
   * `next dev` and lib/analytics.ts deliberately short-circuits to console.debug
   * outside production so a development session cannot reach the real property.
   * That makes the gtag call itself unobservable here. What IS observable is the
   * thing that actually regresses — whether a route change reports at all — and
   * that the landing page is not reported twice.
   *
   * It lives in this describe for the googletagmanager stub in its beforeEach.
   * Consent is irrelevant: Consent Mode decides what Google does with a hit, not
   * whether we report one.
   */
  test("a client-side navigation reports a page view, and the landing page is not double counted", async ({
    page,
  }) => {
    const views: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[analytics] page_view")) views.push(text);
    });

    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Cookies" })).toBeVisible();

    // The tag already counted this one. Reporting it here would double it, and a
    // doubled number looks plausible enough that nobody goes looking.
    expect(views).toEqual([]);

    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Privacy" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/privacy$/);

    await expect.poll(() => views.length).toBe(1);
    expect(views[0]).toContain("/privacy");

    // And again, to prove it is every navigation rather than just the first.
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Terms" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect.poll(() => views.length).toBe(2);
    expect(views[1]).toContain("/terms");
  });

  /**
   * The hover state on Accept all / Reject all.
   *
   * BOTH ANSWERS, IDENTICALLY, is the assertion that matters. An Accept that is
   * warmer or livelier than Reject is the standard consent dark pattern, and it
   * is easy to introduce by accident the moment someone styles the two buttons
   * separately. They share one component and one class precisely so that cannot
   * happen quietly; this is what notices if it does.
   *
   * The rest of it guards a subtler failure: the hover used to be a lone
   * border-colour change, 10% white to red on a 1px edge at the bottom of a dark
   * viewport, which is indistinguishable from a button that does not respond.
   */
  test("both consent answers get the same, visible hover", async ({ page }) => {
    await page.goto("/");

    const read = (name: string) =>
      page.getByRole("button", { name, exact: true }).evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          border: s.borderTopColor,
          transform: s.transform,
        };
      });

    const restAccept = await read("Accept all");
    expect(restAccept.transform).toBe("none");

    /** Hover, then wait for the 150ms transition to settle before reading. */
    const hoverAndSettle = async (name: string) => {
      await page.getByRole("button", { name, exact: true }).hover();
      await expect
        .poll(async () => (await read(name)).border, {
          message: `${name} should settle on the brand red`,
        })
        .toBe("rgb(255, 0, 0)");
      return read(name);
    };

    const settled: Record<string, Awaited<ReturnType<typeof read>>> = {};
    for (const name of ["Accept all", "Reject all"]) {
      const hovered = await hoverAndSettle(name);
      settled[name] = hovered;

      // Three signals move, not one.
      expect(hovered.transform, `${name} should lift 1px`).toBe(
        "matrix(1, 0, 0, 1, 0, -1)",
      );
      expect(hovered.bg, `${name} background should lift off the surface`).not.toBe(
        restAccept.bg,
      );
    }

    // And the two are the same state, which is the point.
    expect(settled["Reject all"]).toEqual(settled["Accept all"]);
  });

  test("the footer link is the way back once the banner is gone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect(page.getByRole("complementary", { name: "Cookies" })).toHaveCount(0);

    // The banner never returns, so this link is the whole of "you can change
    // your preferences at any time". If it breaks, that sentence becomes a lie.
    await page.getByRole("contentinfo").getByRole("button", { name: "Cookies" }).click();

    const dialog = page.getByRole("dialog", { name: "Cookie settings" });
    await expect(dialog).toBeVisible();
    // Opens reflecting the stored choice rather than a default.
    await expect(dialog.getByRole("switch", { name: "Analytics" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await dialog.getByRole("button", { name: "Reject all" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await consentState(page)).stored).toBe("denied");

    // Escape closes without deciding anything.
    await page.getByRole("contentinfo").getByRole("button", { name: "Cookies" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect((await consentState(page)).stored).toBe("denied");
  });
});

/**
 * The careers section.
 *
 * NOTHING IN HERE MAY EVER POST A REAL CV. Every test that submits intercepts
 * /api/careers and captures the body instead — a real POST from a test run would
 * put a fake person, and a real file, into the hosts' Drive folder.
 *
 * The listings come from e2e/fixtures/roles.json, loaded into ROLES_FIXTURE by
 * playwright.config.ts. getRoles() runs on the server, so page.route() cannot
 * reach it, and the committed fallback ships empty because the show is not
 * actually hiring. The fixture holds one Open role and one Closed one, because
 * the closed page is its own behaviour and is the one that will rot unwatched.
 */
test.describe("careers", () => {
  /** Capture what the form sends, and answer as the route would. */
  async function stubApply(page: Page) {
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/careers", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    return sent;
  }

  async function fillApplication(page: Page) {
    await page.getByLabel("Your name").fill("Sam Rivera");
    await page.getByLabel("Email", { exact: true }).fill("sam@example.com");
    await page.getByLabel(/why this role|what you do/i).fill("I cut daily shows.");
    await page.getByRole("checkbox").check();
  }

  test("the index lists an open role and reaches its page", async ({ page }) => {
    await page.goto("/careers");
    await page.getByRole("link", { name: /Associate Producer/i }).click();

    await expect(page).toHaveURL(/\/careers\/associate-producer$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Associate Producer" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /send application/i })).toBeVisible();
  });

  /**
   * The invariant behind the whole page: there is always a way to apply. It has
   * to hold when roles are open, which is the case the fixture puts it in, and
   * when none are — which is production today.
   */
  test("a general application sits on the index alongside the open roles", async ({
    page,
  }) => {
    await page.goto("/careers");
    await expect(page.getByRole("heading", { name: /none of these fit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /send application/i })).toBeVisible();
  });

  test("an application from a role page carries that role's slug", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers/associate-producer");

    await fillApplication(page);
    await page.getByLabel(/linkedin/i).fill("https://example.com/sam");
    await page.getByRole("button", { name: /send application/i }).click();

    await expect(page.getByText(/that is with us/i)).toBeVisible();
    expect(sent).toHaveLength(1);
    const body = sent[0];
    // Narrowing, not a second assertion: toHaveLength has already failed the
    // test if this is missing, and tsc cannot see that.
    if (!body) throw new Error("the form sent nothing at all");
    expect(body.roleSlug).toBe("associate-producer");
    expect(body.consent).toBe(true);
    // No file attached means no cv key, not an empty one — the validator treats
    // a present-but-empty cv object as a failed upload.
    expect(body.cv).toBeUndefined();
  });

  test("an application from the index carries no role at all", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers");

    await fillApplication(page);
    await page.getByLabel(/linkedin/i).fill("https://example.com/sam");
    await page.getByRole("button", { name: /send application/i }).click();

    await expect(page.getByText(/that is with us/i)).toBeVisible();
    expect(sent[0]?.roleSlug).toBe("");
  });

  test("a real PDF goes up base64-encoded", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers/associate-producer");

    await fillApplication(page);
    await page.getByLabel(/your cv/i).setInputFiles({
      name: "sam-rivera.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nnot really a pdf, but it starts like one\n"),
    });
    await page.getByRole("button", { name: /send application/i }).click();

    await expect(page.getByText(/that is with us/i)).toBeVisible();
    const cv = sent[0]?.cv as { type: string; data: string; name: string } | undefined;
    if (!cv) throw new Error("the CV did not travel with the application");
    expect(cv.type).toBe("application/pdf");
    expect(cv.name).toBe("sam-rivera.pdf");
    // "JVBER" is base64 for "%PDF". This is the end-to-end proof of the encoding
    // contract lib/careers.ts checks the other end of, and it costs 200 bytes.
    expect(cv.data.startsWith("JVBER")).toBe(true);
  });

  /**
   * The client-side size check is a COURTESY, not a guard — the request is
   * trivially replayable with curl, and /api/careers re-checks the decoded size.
   * What this proves is that the courtesy works: nobody sits through a
   * three-megabyte upload before being told no.
   */
  test("an oversized file never leaves the browser", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers/associate-producer");

    await fillApplication(page);
    await page.getByLabel(/your cv/i).setInputFiles({
      name: "huge.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(3 * 1024 * 1024),
    });

    // Rejected at the moment it was chosen, before a byte was sent anywhere.
    await expect(page.getByText(/over 2MB/i)).toBeVisible();
    expect(sent).toHaveLength(0);

    // And it stays out of the request. The form still submits — the remaining
    // fields are fine and the server has the last word on whether an
    // application with neither CV nor link is one — but the three megabytes are
    // not in it.
    await page.getByRole("button", { name: /send application/i }).click();
    expect(sent[0]?.cv).toBeUndefined();
  });

  test("a text file wearing a document's name is refused", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers/associate-producer");

    await fillApplication(page);
    await page.getByLabel(/your cv/i).setInputFiles({
      name: "cv.rtf",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world"),
    });

    await expect(page.getByText(/PDF or Word/i).first()).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test("the consent box is required before anything is sent", async ({ page }) => {
    const sent = await stubApply(page);
    await page.goto("/careers/associate-producer");

    await page.getByLabel("Your name").fill("Sam Rivera");
    await page.getByLabel("Email", { exact: true }).fill("sam@example.com");
    await page.getByLabel(/linkedin/i).fill("https://example.com/sam");
    await page.getByLabel(/why this role/i).fill("I cut daily shows.");
    // Deliberately not ticked.
    await page.getByRole("button", { name: /send application/i }).click();

    await expect(page.getByText(/tick the box/i)).toBeVisible();
    // Nothing sent, which is the half that matters: a CV must not reach our own
    // server before somebody has agreed we may keep it. The server refuses this
    // too, but by then it is holding the file.
    expect(sent).toHaveLength(0);
  });

  /**
   * The honeypot is checked server-side, so a browser test cannot prove the
   * cheerful 200 without testing its own stub. What it CAN prove is the half
   * that has to be true in the page: that no person will ever fill this in.
   */
  test("the honeypot is hidden from sight, assistive tech and the tab order", async ({
    page,
  }) => {
    await page.goto("/careers");
    // Scoped to main: the newsletter box in the footer carries a honeypot of its
    // own, by the same name and for the same reason.
    const pot = page.locator('main input[name="company"]');
    await expect(pot).toHaveCount(1);
    await expect(pot).toBeHidden();
    await expect(pot).toHaveAttribute("aria-hidden", "true");
    await expect(pot).toHaveAttribute("tabindex", "-1");
  });

  /**
   * A closed role is a PAGE, not a 404. That URL is the one already pasted into
   * LinkedIn posts and group chats, and it goes on being clicked for months.
   */
  test("a closed role still answers, and tells Google not to index it", async ({
    page,
  }) => {
    const response = await page.goto("/careers/clips-editor");
    expect(response?.status()).toBe(200);

    await expect(page.getByText(/this one has closed/i)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    // No JobPosting markup on a listing that has stopped accepting applications:
    // Google's policy asks for it to come off, and leaving it is a manual-action
    // risk rather than merely stale.
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    // But there is still somewhere to go, which is the whole reason it is a page.
    await expect(page.getByRole("button", { name: /send application/i })).toBeVisible();
  });

  test("an open role carries JobPosting markup", async ({ page }) => {
    await page.goto("/careers/associate-producer");
    const ld = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    const data = JSON.parse(ld ?? "{}");
    expect(data["@type"]).toBe("JobPosting");
    expect(data.title).toBe("Associate Producer");
    // Free text cannot become a structured amount honestly. See lib/schema.tsx.
    expect(data.baseSalary).toBeUndefined();
  });

  test("an unknown slug is a 404", async ({ page }) => {
    const response = await page.goto("/careers/not-a-role");
    expect(response?.status()).toBe(404);
  });
});

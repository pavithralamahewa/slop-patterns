/**
 * Full Held E2E: API + home UI + FTUE flow + persistence + start over + mobile.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.HELD_URL || "http://127.0.0.1:3456";
const CHROME = "/usr/local/bin/google-chrome";

function fail(msg) {
  throw new Error(msg);
}

async function clickText(page, text, { timeout = 8000 } = {}) {
  const handle = await page.waitForFunction(
    (t) => {
      const nodes = [...document.querySelectorAll("button, a")];
      return (
        nodes.find(
          (n) =>
            n.textContent?.trim().includes(t) &&
            !n.disabled &&
            n.offsetParent !== null,
        ) || null
      );
    },
    { timeout },
    text,
  );
  const el = await handle.asElement();
  if (!el) fail(`No clickable element: ${text}`);
  await el.click();
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout },
    text,
  );
}

async function clickTestId(page, id) {
  const el = await page.waitForSelector(`[data-testid="${id}"]`, {
    timeout: 8000,
    visible: true,
  });
  await el.click();
}

async function contrastOk(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, reason: "missing" };
    const s = getComputedStyle(el);
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+), (\d+), (\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
    };
    const lum = ([r, g, b]) => {
      const n = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
    };
    const fg = lum(parse(s.color));
    const bg = lum(parse(s.backgroundColor));
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    return {
      ok: ratio >= 3,
      ratio: Number(ratio.toFixed(2)),
      color: s.color,
      bg: s.backgroundColor,
      text: el.textContent.trim(),
    };
  }, selector);
}

async function noHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2,
  );
}

async function headingOverlap(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return false;
    const next = h1.nextElementSibling;
    if (!next) return false;
    const a = h1.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return a.bottom > b.top + 2;
  });
}

async function apiChecks() {
  const created = await fetch(BASE + "/api/sprints", { method: "POST" }).then(
    (r) => r.json(),
  );
  if (!created?.sprint?.id) fail("POST /api/sprints");
  const listed = await fetch(BASE + "/api/sprints").then((r) => r.json());
  if (!Array.isArray(listed.sprints)) fail("GET /api/sprints");
  const one = await fetch(BASE + `/api/sprints/${created.sprint.id}`).then((r) =>
    r.json(),
  );
  if (one.sprint.id !== created.sprint.id) fail("GET /api/sprints/:id");
  console.log("OK api create/list/get", created.sprint.id);
  return created.sprint;
}

async function main() {
  await apiChecks();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await waitForText(page, "Start the guided demo");
    const ctas = await page.evaluate(() =>
      [...document.querySelectorAll("a")]
        .filter((a) => a.textContent.includes("guided demo"))
        .map((a) => a.textContent.trim()),
    );
    if (ctas.some((t) => /run the guided/i.test(t)))
      fail("Inconsistent CTA copy still says Run");
    const hero = await page.evaluate(() => {
      const links = [...document.querySelectorAll("a.btn-signal")];
      const start = links.find((a) =>
        a.textContent.includes("Start the guided demo"),
      );
      if (!start) return { ok: false, reason: "no start cta" };
      const s = getComputedStyle(start);
      return {
        ok: true,
        text: start.textContent.trim(),
        color: s.color,
        bg: s.backgroundColor,
      };
    });
    if (!hero.ok || hero.bg !== "rgb(23, 23, 23)")
      fail(`Hero CTA ${JSON.stringify(hero)}`);
    console.log("OK home CTA", hero);

    const how = await page.evaluate(() =>
      document.body.innerText.includes("Seven steps. One job each."),
    );
    if (!how) fail("How it works missing");
    console.log("OK landing how-it-works");

    // Mobile home overflow
    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle0" });
    if (!(await noHorizontalOverflow(page))) fail("Home mobile overflow");
    console.log("OK home mobile no overflow");
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(BASE + "/sprint", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle0" });
    await waitForText(page, "Welcome to Held");
    await page.screenshot({
      path: "/tmp/held-e2e-welcome.png",
      fullPage: false,
    });
    await clickTestId(page, "welcome-start");
    await waitForText(page, "This demo already drafted a bet");
    console.log("OK welcome dismissed");

    const coachVisible = await page.$('[data-testid="coach-panel"]');
    if (!coachVisible) fail("Coach missing after welcome");
    await clickTestId(page, "toggle-coach");
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="coach-panel"]'),
    );
    await clickTestId(page, "toggle-coach");
    await page.waitForSelector('[data-testid="coach-panel"]');
    console.log("OK hide/show coach");

    if (await headingOverlap(page)) fail("H1 overlaps following text");
    console.log("OK heading spacing");

    await clickTestId(page, "gate-approve-hypothesis");
    await waitForText(page, "Who we are focusing on");
    console.log("OK → Focus the week (instant gate)");

    // Persistence
    await page.reload({ waitUntil: "networkidle0" });
    await waitForText(page, "Who we are focusing on");
    console.log("OK persistence reload stays on Focus the week");

    const evBefore = await page.evaluate(
      () => (document.body.innerText.match(/character\.vc|gv\.com/g) || []).length,
    );
    await clickTestId(page, "pull-research");
    await page.waitForFunction((n) => {
      const c = (document.body.innerText.match(/character\.vc|gv\.com|held\.local/g) || [])
        .length;
      return c > n;
    }, { timeout: 8000 }, evBefore);
    console.log("OK pull research adds sources");

    await clickTestId(page, "gate-approve-map");
    await waitForText(page, "genuinely different");
    console.log("OK → Explore options");

    await page.waitForSelector('[data-testid^="heat-"]', { timeout: 8000 });
    await page.click('[data-testid^="heat-"]');
    await clickTestId(page, "gate-open-decide");
    await waitForText(page, "This rule is the product");
    console.log("OK → Choose a direction");

    await page.click('[data-testid^="select-"]');
    await clickTestId(page, "gate-supervote");
    await waitForText(page, "Winning direction");
    console.log("OK → Fake the product");

    await clickTestId(page, "preview-facade");
    await page.waitForSelector('[data-testid="facade-preview"] iframe', {
      timeout: 8000,
    });
    console.log("OK façade iframe preview");

    await page.waitForFunction(() => {
      const b = document.querySelector('[data-testid="gate-accept-prototype"]');
      return b instanceof HTMLButtonElement && !b.disabled;
    });
    await clickTestId(page, "gate-accept-prototype");
    await waitForText(page, "Primary evidence rule");
    console.log("OK → Watch real people");

    await clickTestId(page, "draft-screener");
    await page.waitForFunction(
      () =>
        document.body.innerText.toLowerCase().includes("screener") ||
        (document.querySelector("pre")?.innerText.length ?? 0) > 20,
      { timeout: 8000 },
    );
    console.log("OK draft screener");

    await clickTestId(page, "verdict-loop");
    await waitForText(page, "Verdict Packet");
    await waitForText(page, "Download Verdict Packet");
    await page.screenshot({ path: "/tmp/held-e2e-verdict.png" });
    console.log("OK → Verdict Packet");

    // Download intercept
    await page.evaluate(() => {
      window.__heldDl = false;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) {
        window.__heldDl = b instanceof Blob;
        return orig.call(URL, b);
      };
    });
    await clickTestId(page, "download-packet");
    const dl = await page.evaluate(() => window.__heldDl);
    if (!dl) fail("Download did not create a blob");
    console.log("OK download Verdict Packet blob");

    // Mobile sprint overflow
    await page.setViewport({ width: 390, height: 844 });
    if (!(await noHorizontalOverflow(page))) fail("Sprint mobile overflow");
    if (await headingOverlap(page)) fail("Mobile H1 overlap");
    console.log("OK sprint mobile layout");
    await page.setViewport({ width: 1280, height: 900 });

    await clickTestId(page, "start-over");
    await waitForText(page, "Welcome to Held");
    console.log("OK start over restores welcome");
    await clickTestId(page, "welcome-start");
    await waitForText(page, "This demo already drafted a bet");
    console.log("OK start over → Name the bet");

    console.log("E2E PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("E2E FAIL", err);
  process.exit(1);
});

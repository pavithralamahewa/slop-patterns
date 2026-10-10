/**
 * Headless FTUE walkthrough: home → welcome → Foundation → Verdict.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.HELD_URL || "http://127.0.0.1:3456";

async function clickText(page, text, { timeout = 8000 } = {}) {
  const handle = await page.waitForFunction(
    (t) => {
      const nodes = [...document.querySelectorAll("button, a")];
      return nodes.find((n) => n.textContent?.trim().includes(t)) || null;
    },
    { timeout },
    text,
  );
  const el = await handle.asElement();
  if (!el) throw new Error(`No clickable element with text: ${text}`);
  await el.click();
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout },
    text,
  );
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  const shots = [];

  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await waitForText(page, "Start the guided demo");
    const homeCta = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find((n) =>
        n.textContent?.includes("Start the guided demo"),
      );
      if (!a) return null;
      const s = getComputedStyle(a);
      return { text: a.textContent.trim(), bg: s.backgroundColor, color: s.color };
    });
    if (!homeCta?.text) throw new Error("Hero CTA missing text");
    console.log("OK home CTA", homeCta);

    await page.goto(BASE + "/sprint", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle0" });
    await waitForText(page, "Welcome to Held");
    await page.screenshot({ path: "/tmp/held-e2e-welcome.png" });
    shots.push("/tmp/held-e2e-welcome.png");
    await clickText(page, "Start with naming the bet");
    await waitForText(page, "Name the bet");
    console.log("OK welcome dismissed → Name the bet");

    await clickText(page, "Approve this bet");
    await waitForText(page, "Focus the week");
    console.log("OK → Focus the week");

    await clickText(page, "Approve this focus");
    await waitForText(page, "Explore options");
    console.log("OK → Explore options");

    // Silent look ~4s
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some((b) =>
          b.textContent?.includes("Place a Dot"),
        ),
      { timeout: 10000 },
    );
    await clickText(page, "Place a Dot");
    await clickText(page, "Open Choose a direction");
    await waitForText(page, "Choose a direction");
    console.log("OK → Choose a direction");

    await clickText(page, "Select");
    await clickText(page, "Cast supervote");
    await waitForText(page, "Fake the product");
    console.log("OK → Fake the product");

    await clickText(page, "Accept fake product");
    await waitForText(page, "Watch real people");
    console.log("OK → Watch real people");

    await clickText(page, "loop");
    await waitForText(page, "Verdict Packet");
    await waitForText(page, "Download Verdict Packet");
    await page.screenshot({ path: "/tmp/held-e2e-verdict.png" });
    shots.push("/tmp/held-e2e-verdict.png");
    console.log("OK → Verdict Packet");
    console.log("E2E PASS", shots.join(" "));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("E2E FAIL", err);
  process.exit(1);
});

// Diagnose extension loading with verbose logging.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EXT = path.resolve("C:/Users/ronak\OneDrive\Desktop\hack backup\2\cloud-workspace-launcher");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      `--load-extension=${EXT}`,
      `--user-data-dir=C:/tmp/ext2-${Date.now()}`,
      "--enable-logging",
      "--v=1",
    ],
  });
  const page = await browser.newPage();
  // Capture console messages including extension ones.
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push("PAGEERROR: " + e.message));

  // Visit a page to trigger content script + SW.
  await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));

  const targets = await browser.targets();
  console.log("targets:");
  targets.forEach((t) => console.log("  " + t.type() + " :: " + t.url().slice(0, 90)));

  // Try opening the popup directly.
  const sw = targets.find((t) => t.type() === "service_worker");
  if (sw) {
    const id = sw.url().match(/chrome-extension:\/\/([^/]+)\//)[1];
    console.log("\nextension id:", id);
    const pp = await browser.newPage();
    pp.on("console", (m) => logs.push("POPUP: " + m.text()));
    await pp.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
    try {
      await pp.goto(`chrome-extension://${id}/src/popup.html`, { waitUntil: "networkidle0", timeout: 15000 });
      console.log("popup loaded OK");
    } catch (e) {
      console.log("popup goto failed:", e.message);
    }
  } else {
    console.log("\nNO SERVICE WORKER — extension did not load");
  }

  console.log("\nLOGS (" + logs.length + "):");
  logs.slice(0, 30).forEach((l) => console.log("  " + l.slice(0, 200)));
  await browser.close();
})();
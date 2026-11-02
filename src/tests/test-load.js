// Load the extension and capture console errors.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EXT = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--load-extension=${EXT}`, `--user-data-dir=C:/tmp/load-${Date.now()}`],
  });
  const errors = [];
  browser.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  browser.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  const tp = await browser.newPage();
  await tp.goto("about:blank", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));

  const targets = await browser.targets();
  const sw = targets.find((t) => t.type() === "service_worker");
  console.log("service worker:", sw ? sw.url() : "NOT FOUND");
  console.log("all targets:", targets.map((t) => t.type() + " " + t.url().slice(0, 70)).join("\n  "));

  if (sw) {
    // Try to open the popup page directly.
    const id = sw.url().match(/chrome-extension:\/\/([^/]+)\//)[1];
    const pp = await browser.newPage();
    pp.on("console", (m) => { if (m.type() === "error") errors.push("POPUP: " + m.text()); });
    pp.on("pageerror", (e) => errors.push("POPUP PAGEERROR: " + e.message));
    await pp.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
    try {
      await pp.goto(`chrome-extension://${id}/src/popup.html`, { waitUntil: "networkidle0", timeout: 15000 });
    } catch (e) { errors.push("GOTO: " + e.message); }
    await new Promise((r) => setTimeout(r, 500));
    const html = await pp.content();
    console.log("popup loaded, length:", html.length);
  }

  console.log("\nERRORS (" + errors.length + "):");
  errors.slice(0, 20).forEach((e) => console.log("  " + e));

  await browser.close();
})();
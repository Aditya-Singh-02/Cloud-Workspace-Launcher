// Load extension, then open popup directly to start the SW.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EXT = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--load-extension=${EXT}`, `--user-data-dir=C:/tmp/load2-${Date.now()}`],
  });
  const errors = [];
  browser.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  // First discover the extension id by opening the popup URL.
  const pp = await browser.newPage();
  pp.on("console", (m) => { if (m.type() === "error") errors.push("POPUP: " + m.text()); });
  await pp.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
  let id = null;
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    try {
      await pp.goto(`chrome-extension://_test_/_popup.html`, { waitUntil: "domcontentloaded", timeout: 8000 });
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    const targets = await browser.targets();
    const sw = targets.find((t) => t.type() === "service_worker");
    if (sw) id = sw.url().match(/chrome-extension:\/\/([^/]+)\//)[1];
  }
  console.log("extension id:", id);

  if (id) {
    try {
      await pp.goto(`chrome-extension://${id}/src/popup.html`, { waitUntil: "networkidle0", timeout: 15000 });
    } catch (e) { errors.push("GOTO: " + e.message); }
    await new Promise((r) => setTimeout(r, 500));
    const html = await pp.content();
    console.log("popup loaded, length:", html.length);
    console.log("has bootstrap css:", html.includes("bootstrap.min.css"));
    console.log("has bootstrap js:", html.includes("bootstrap.bundle.min.js"));
  }

  console.log("\nERRORS (" + errors.length + "):");
  errors.slice(0, 20).forEach((e) => console.log("  " + e));
  await browser.close();
})();
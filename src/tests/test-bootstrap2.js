// Verify Bootstrap CSS actually applies and check for CSP/network errors.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const EXT = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher");
const SRC = path.join(EXT, "src");
const popupPath = path.join(SRC, "popup.html");

const orig = fs.readFileSync(popupPath, "utf8");
const cdnHtml = orig
  .replace('<link rel="stylesheet" href="popup.css" />',
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
     <link rel="stylesheet" href="popup.css" />`);

fs.writeFileSync(popupPath, cdnHtml);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/pb2-${Date.now()}`],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("requestfailed", (r) => errors.push("REQFAIL: " + r.url() + " " + (r.failure()?.errorText || "")));

  await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(popupPath).href, { waitUntil: "networkidle0" });

  const info = await page.evaluate(() => {
    const body = document.body;
    const cs = getComputedStyle(body);
    // Bootstrap sets a specific font-family on html/body
    const hasBootstrapFont = /system-ui|Segoe UI|Roboto/.test(cs.fontFamily);
    const link = document.querySelector('link[href*="bootstrap"]');
    return {
      linkLoaded: !!link,
      linkHref: link?.href,
      bodyFont: cs.fontFamily.slice(0, 80),
      hasBootstrapFont,
      bootstrapRuleCount: [...document.styleSheets].filter((s) => /bootstrap/.test(s.href || "")).length,
    };
  });

  console.log("INFO:", JSON.stringify(info, null, 2));
  console.log("\nERRORS (" + errors.length + "):");
  errors.slice(0, 10).forEach((e) => console.log("  " + e));

  await page.screenshot({ path: "C:/tmp/bootstrap-cdn.png" });
  await browser.close();
  fs.writeFileSync(popupPath, orig);
  console.log("\nrestored popup.html");
})();
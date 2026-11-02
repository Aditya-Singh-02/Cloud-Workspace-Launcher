// Check chrome://extensions for the loaded extension.
const puppeteer = require("puppeteer-core");
const path = require("path");

const EXT = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--load-extension=${EXT}`, `--user-data-dir=C:/tmp/ext-${Date.now()}`],
  });
  const page = await browser.newPage();
  await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1000));
  const text = await page.evaluate(() => document.body.innerText);
  console.log("extensions page text:\n" + text.slice(0, 1500));
  await browser.close();
})();
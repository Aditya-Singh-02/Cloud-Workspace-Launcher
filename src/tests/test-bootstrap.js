// Test whether Bootstrap loads in the extension popup via CDN vs bundled.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const EXT = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher");
const SRC = path.join(EXT, "src");
const CSS = path.join(SRC, "popup.css");
const BACKUP = path.join(SRC, "_popup.css.bak");

function cardHtml(i) {
  return `
    <article class="card" data-id="ws${i}">
      <div class="card-head"><h3 class="card-title">Workspace ${i + 1} — a longish name here</h3><span class="card-time">just now</span></div>
      <div class="card-meta"><span>5 tabs</span><span>· 2 groups</span><span>· Windows</span></div>
      <div class="card-actions"><button class="ghost restore" title="Restore into this window">Restore</button><button class="ghost danger delete" title="Delete">Delete</button></div>
    </article>`;
}

async function measure(page, label) {
  const r = await page.evaluate(() => {
    const list = document.getElementById("list");
    const cards = [...document.querySelectorAll(".card")];
    return {
      listScrollH: list.scrollHeight, listClientH: list.clientHeight,
      scrollable: list.scrollHeight > list.clientHeight,
      cards: cards.map((c) => {
        const rect = c.getBoundingClientRect();
        const ar = c.querySelector(".card-actions").getBoundingClientRect();
        return { h: +rect.height.toFixed(1), clipped: ar.bottom > rect.bottom + 0.5 };
      }),
    };
  });
  console.log(`\n=== ${label} === scrollH=${r.listScrollH} clientH=${r.listClientH} scrollable=${r.scrollable}`);
  r.cards.forEach((c, i) => console.log(`  card[${i}] h=${c.h} clipped=${c.clipped}`));
}

(async () => {
  fs.copyFileSync(CSS, BACKUP);

  async function runWith(html, label) {
    const popupPath = path.join(SRC, "popup.html");
    const orig = fs.readFileSync(popupPath, "utf8");
    fs.writeFileSync(popupPath, html);
    const browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: "new",
      args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/pb-${Date.now()}-${Math.random().toString(36).slice(2)}`],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(popupPath).href, { waitUntil: "networkidle0" });
    const html5 = Array.from({ length: 5 }, (_, i) => cardHtml(i)).join("");
    await page.evaluate((h) => { document.getElementById("list").innerHTML = h; }, html5);
    await new Promise((r) => setTimeout(r, 200));
    await measure(page, label);
    const err = await page.evaluate(() => window.__bootstrapLoadError || null);
    if (err) console.log("  BOOTSTRAP LOAD ERROR:", err);
    await page.screenshot({ path: `C:/tmp/bootstrap-${label.replace(/[^a-z0-9]/gi, "_")}.png` });
    await browser.close();
    fs.writeFileSync(popupPath, orig);
  }

  const origHtml = fs.readFileSync(path.join(SRC, "popup.html"), "utf8");

  // 1. CDN approach
  const cdnHtml = origHtml
    .replace('<link rel="stylesheet" href="popup.css" />',
      `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
     <link rel="stylesheet" href="popup.css" />`);
  await runWith(cdnHtml, "CDN approach");

  // Restore original
  fs.writeFileSync(path.join(SRC, "popup.html"), origHtml);
  fs.copyFileSync(BACKUP, CSS);
  fs.unlinkSync(BACKUP);
  console.log("\nrestored");
})();
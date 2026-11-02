// Screenshot the popup with 4 cards injected.
const puppeteer = require("puppeteer-core");
const path = require("path");
const http = require("http");
const fs = require("fs");

const SRC = path.resolve("C:/Users/ronak/OneDrive/Desktop/hack backup/2/cloud-workspace-launcher/src");
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/popup.html";
  const fp = path.join(SRC, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const ext = path.extname(fp).slice(1);
    const types = { html: "text/html", css: "text/css", js: "text/javascript" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/ss-${Date.now()}`],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {
      lastError: undefined, openOptionsPage: () => {},
      sendMessage: (msg, cb) => cb({ ok: true, payload: msg.type === "list" ? [] : { backend: "local" } }),
    };
  });
  await page.goto(base + "/popup.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));

  // Inject cards
  const cardSrc = `
    <article class="card bg-dark border-secondary" data-id="wsN">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h3 class="card-title h6 mb-0">Workspace NAME — a longish name here</h3>
        <span class="card-time small text-muted">just now</span>
      </div>
      <div class="card-body text-muted small">
        <span>5 tabs</span><span>· 2 groups</span><span>· Windows</span>
      </div>
      <div class="card-footer d-flex gap-2">
        <button class="btn btn-outline-success btn-sm restore" title="Restore into this window">Restore</button>
        <button class="btn btn-outline-danger btn-sm delete" title="Delete">Delete</button>
      </div>
    </article>`;
  await page.evaluate((cardSrc) => {
    const list = document.getElementById("list");
    list.innerHTML = Array.from({ length: 4 }, (_, i) =>
      cardSrc.replace(/wsN/g, "ws" + i).replace(/NAME/g, i + 1)
    ).join("");
  }, cardSrc);
  await new Promise((r) => setTimeout(r, 200));

  // Check layout metrics
  const info = await page.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    const list = document.getElementById("list");
    const cards = [...document.querySelectorAll(".card")];
    return {
      body: { w: body.width, h: body.height },
      list: { h: list.clientHeight, scrollH: list.scrollHeight },
      cards: cards.map((c, i) => ({
        h: c.getBoundingClientRect().height,
        top: c.getBoundingClientRect().top,
        bottom: c.getBoundingClientRect().bottom,
      })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log("errors:", errors.slice(0, 5));

  await page.screenshot({ path: "C:/tmp/ui-4cards.png" });
  console.log("screenshot -> C:/tmp/ui-4cards.png");
  await browser.close();
  server.close();
})();
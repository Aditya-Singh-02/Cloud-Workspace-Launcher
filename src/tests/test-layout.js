// Dump full layout geometry to find clunky issues.
const puppeteer = require("puppeteer-core");
const path = require("path");
const http = require("http");
const fs = require("fs");

const SRC = path.resolve("C:/Users/ronak\OneDrive\Desktop\hack backup\2\cloud-workspace-launcher/src");
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
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/lay-${Date.now()}`],
  });
  const page = await browser.newPage();
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

  const info = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        sel,
        x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
        w: +rect.width.toFixed(1), h: +rect.height.toFixed(1),
        bottom: +rect.bottom.toFixed(1),
        pad: cs.padding, margin: cs.margin,
        bg: cs.backgroundColor, color: cs.color,
        border: cs.borderColor,
      };
    };
    const body = document.body.getBoundingClientRect();
    return {
      body: { w: body.width, h: body.height },
      header: r(".bar"),
      saveRow: r(".save-row"),
      status: r("#status"),
      list: r("#list"),
      footer: r(".foot"),
      card0: r(".card"),
      cardHeader: r(".card-header"),
      cardBody: r(".card-body"),
      cardFooter: r(".card-footer"),
      restoreBtn: r(".restore"),
      deleteBtn: r(".delete"),
      empty: r(".empty"),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: "C:/tmp/ui-before.png" });
  await browser.close();
  server.close();
})();
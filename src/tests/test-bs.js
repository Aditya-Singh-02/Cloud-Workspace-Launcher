// Serve src/ over HTTP so popup.js (module) + lib/ load without CORS issues.
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
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  console.log("serving:", base);

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/bs-${Date.now()}`],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

  await page.evaluateOnNewDocument(() => {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {
      lastError: undefined,
      openOptionsPage: () => {},
      sendMessage: (msg, cb) => {
        if (msg.type === "list") cb({ ok: true, payload: [] });
        else if (msg.type === "getSettings") cb({ ok: true, payload: { backend: "local" } });
        else cb({ ok: true, payload: null });
      },
    };
  });

  await page.setViewport({ width: 400, height: 520, deviceScaleFactor: 1 });
  await page.goto(base + "/popup.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));

  // Inject cards directly into the list.
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
    list.innerHTML = Array.from({ length: 5 }, (_, i) =>
      cardSrc.replace(/wsN/g, "ws" + i).replace(/NAME/g, i + 1)
    ).join("");
  }, cardSrc);
  await new Promise((r) => setTimeout(r, 200));

  const info = await page.evaluate(() => {
    const list = document.getElementById("list");
    const cards = [...document.querySelectorAll(".card")];
    const bsLoaded = typeof window.bootstrap === "object";
    const bodyRect = document.body.getBoundingClientRect();
    return {
      bsLoaded,
      bodyH: +bodyRect.height.toFixed(1),
      vh: window.innerHeight,
      listScrollH: list.scrollHeight,
      listClientH: list.clientHeight,
      scrollable: list.scrollHeight > list.clientHeight,
      cards: cards.map((c) => {
        const rect = c.getBoundingClientRect();
        const ar = c.querySelector(".restore").getBoundingClientRect();
        return { h: +rect.height.toFixed(1), clipped: ar.bottom > rect.bottom + 0.5 };
      }),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: "C:/tmp/bs-popup.png" });
  console.log("screenshot -> C:/tmp/bs-popup.png");

  // Test the Save modal opens via Bootstrap.
  await page.evaluate(() => document.getElementById("save-btn").click());
  await new Promise((r) => setTimeout(r, 300));
  const modalVisible = await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    return { shown: m.classList.contains("show"), hasBackdrop: !!document.querySelector(".modal-backdrop") };
  });
  console.log("save modal:", JSON.stringify(modalVisible));

  // Diagnose modal closing.
  const diag = await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    const inst = window.bootstrap && window.bootstrap.Modal.getInstance(m);
    return {
      bsType: typeof window.bootstrap,
      hasModalClass: !!window.bootstrap?.Modal,
      getInstance: inst ? "found" : "null",
      isShown: inst ? inst.isShown : "n/a",
      hasShow: m.classList.contains("show"),
    };
  });
  console.log("diag:", JSON.stringify(diag));

  // Close via JS API directly.
  await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    const inst = window.bootstrap.Modal.getInstance(m) || new window.bootstrap.Modal(m);
    inst.hide();
  });
  await new Promise((r) => setTimeout(r, 500));
  const saveClosed = await page.evaluate(() => !document.getElementById("save-modal").classList.contains("show"));
  console.log("save modal closed via JS hide():", saveClosed);

  // Test Restore modal opens.
  await page.evaluate(() => {
    const card = document.querySelector(".card");
    if (card) card.querySelector(".restore").click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const restoreVisible = await page.evaluate(() => {
    const m = document.getElementById("restore-modal");
    return { shown: m.classList.contains("show"), hasBackdrop: !!document.querySelector(".modal-backdrop") };
  });
  console.log("restore modal:", JSON.stringify(restoreVisible));

  console.log("\nERRORS (" + errors.length + "):");
  errors.slice(0, 20).forEach((e) => console.log("  " + e));
  await browser.close();
  server.close();
})();
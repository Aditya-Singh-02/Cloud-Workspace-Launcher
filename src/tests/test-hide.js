// Isolate why hide() didn't remove .show in the previous test.
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
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=C:/tmp/hd-${Date.now()}`],
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

  // Show.
  await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    window.bootstrap.Modal.getOrCreateInstance(m).show();
  });
  await new Promise((r) => setTimeout(r, 400));

  // Try hide() with a fresh instance.
  await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    const inst = new window.bootstrap.Modal(m);
    inst.hide();
  });
  await new Promise((r) => setTimeout(r, 600));
  let s = await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    return { show: m.classList.contains("show"), display: getComputedStyle(m).display, backdrops: document.querySelectorAll(".modal-backdrop").length };
  });
  console.log("hide() via new instance:", JSON.stringify(s));

  // Try hide() via getInstance with longer wait.
  await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    window.bootstrap.Modal.getOrCreateInstance(m).show();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    const inst = window.bootstrap.Modal.getInstance(m);
    if (inst) inst.hide();
  });
  await new Promise((r) => setTimeout(r, 1500));  // wait for transition
  s = await page.evaluate(() => {
    const m = document.getElementById("save-modal");
    return { show: m.classList.contains("show"), display: getComputedStyle(m).display, backdrops: document.querySelectorAll(".modal-backdrop").length };
  });
  console.log("hide() via getInstance (long wait):", JSON.stringify(s));

  await browser.close();
  server.close();
})();
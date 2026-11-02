// Render a screenshot as ASCII art to inspect the layout.
const fs = require("fs");
const PNG = require("pngjs");

(async () => {
  const file = process.argv[2] || "C:/tmp/ui-before.png";
  const data = fs.readFileSync(file);
  const png = PNG.sync.read(data);
  const w = png.width, h = png.height;
  const chars = " .:-=+*#%@";
  const stepX = Math.max(1, Math.floor(w / 100));
  const stepY = Math.max(1, Math.floor(h / 60));
  let out = "";
  for (let y = 0; y < h; y += stepY) {
    let line = "";
    for (let x = 0; x < w; x += stepX) {
      const i = (y * w + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      line += chars[Math.min(chars.length - 1, Math.floor(lum * chars.length))];
    }
    out += line + "\n";
  }
  console.log(out);
})();
// Draws the app icon (pink tile with three ranking bars) and writes
// electron/icon.png (window icon) and electron/icon.ico (the .exe icon). No dependencies.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) raw.set(pixel(x / size, y / size, 1 / size), y * (size * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Coverage of a rounded rectangle at (u, v), anti-aliased over one pixel (px).
function rrect(u, v, x0, y0, x1, y1, r, px) {
  const dx = Math.max(x0 + r - u, 0, u - (x1 - r));
  const dy = Math.max(y0 + r - v, 0, v - (y1 - r));
  const d = Math.hypot(dx, dy) - r;
  return Math.min(1, Math.max(0, 0.5 - d / px));
}

const PINK = [255, 61, 110];
const WHITE = [255, 255, 255];
const GOLD = [255, 210, 31];
// Bars: #2 left, #1 middle (gold, tallest), #3 right.
const BARS = [
  [0.2, 0.42, 0.4, WHITE],
  [0.4, 0.26, 0.6, GOLD],
  [0.6, 0.54, 0.8, WHITE],
];

function pixel(u, v, px) {
  const tile = rrect(u, v, 0.04, 0.04, 0.96, 0.96, 0.2, px);
  let rgb = PINK;
  for (const [x0, top, x1, color] of BARS) {
    const a = rrect(u, v, x0 + 0.015, top, x1 - 0.015, 0.8, 0.035, px);
    if (a > 0) rgb = rgb.map((c, i) => Math.round(c * (1 - a) + color[i] * a));
  }
  return [...rgb, Math.round(tile * 255)];
}

const out = path.join(__dirname, '..', 'electron');
fs.writeFileSync(path.join(out, 'icon.png'), png(256, pixel));

// ICO holding PNG images (supported since Windows Vista).
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((s) => png(s, pixel));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header[e] = s === 256 ? 0 : s;
  header[e + 1] = s === 256 ? 0 : s;
  header.writeUInt16LE(1, e + 4); // planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, ...images]));
console.log('Wrote electron/icon.png and electron/icon.ico');

// 生成 PWA 图标（纯 Node，无依赖）：渐变底 + ¥ 符号
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// 几何距离
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distRect(px, py, cx, cy, hw, hh) {
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dy = Math.max(Math.abs(py - cy) - hh, 0);
  return Math.hypot(dx, dy);
}

function drawIcon(S) {
  const buf = Buffer.alloc(S * S * 4);
  const c1 = [79, 124, 255], c2 = [106, 91, 255];
  const HF = 0.056 * 0.55; // 笔画半宽（占边长比例）
  const segs = [            // 全部使用比例坐标，最后统一乘 S
    [0.32, 0.205, 0.50, 0.45],
    [0.68, 0.205, 0.50, 0.45]
  ];
  const stem = [0.50, (0.205 + 0.76) / 2, HF, (0.76 - 0.205) / 2];
  const bar1 = [0.50, 0.615, 0.165, HF];
  const bar2 = [0.50, 0.720, 0.165, HF];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const g = (x + y) / (2 * S); // 对角渐变
      let r = c1[0] + (c2[0] - c1[0]) * g;
      let gg = c1[1] + (c2[1] - c1[1]) * g;
      let b = c1[2] + (c2[2] - c1[2]) * g;

      let d = Infinity;
      for (const s of segs) d = Math.min(d, distSeg(x, y, s[0]*S, s[1]*S, s[2]*S, s[3]*S));
      d = Math.min(d, distRect(x, y, stem[0]*S, stem[1]*S, stem[2]*S, stem[3]*S));
      d = Math.min(d, distRect(x, y, bar1[0]*S, bar1[1]*S, bar1[2]*S, bar1[3]*S));
      d = Math.min(d, distRect(x, y, bar2[0]*S, bar2[1]*S, bar2[2]*S, bar2[3]*S));

      const cov = Math.max(0, Math.min(1, HF * S + 0.5 - d)); // 抗锯齿覆盖
      buf[i]     = Math.round(r + (255 - r) * cov);
      buf[i + 1] = Math.round(gg + (255 - gg) * cov);
      buf[i + 2] = Math.round(b + (255 - b) * cov);
      buf[i + 3] = 255;
    }
  }
  return encodePNG(S, S, buf);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), drawIcon(180));
console.log('图标已生成:', fs.readdirSync(outDir).join(', '));

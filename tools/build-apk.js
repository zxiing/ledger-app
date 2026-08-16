// APK 一键构建脚本（不用 Gradle，直接 aapt2 + javac + d8 + apksigner）
// 用法: node build-apk.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const TOOLS = __dirname;
const ROOT = path.join(TOOLS, '..');
const JDK = path.join(TOOLS, 'jdk-17.0.20+8');
const SDK = path.join(TOOLS, 'android-sdk');
const BT = path.join(SDK, 'build-tools', '34.0.0');
const PLATFORM_JAR = path.join(SDK, 'platforms', 'android-34', 'android.jar');
const SRC = path.join(ROOT, 'android');
const BUILD = path.join(SRC, 'build');
const AdmZip = require(path.join(TOOLS, 'apkbuild', 'node_modules', 'adm-zip'));

const run = (cmd, opts = {}) => {
  console.log('> ' + cmd.slice(0, 160));
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME: JDK, PATH: path.join(JDK, 'bin') + ';' + process.env.PATH },
    ...opts
  });
};

/* ---------- PNG 图标生成（与 gen-icons.js 同款算法） ---------- */
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
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
function iconPNG(S) {
  const buf = Buffer.alloc(S * S * 4);
  const c1 = [79, 124, 255], c2 = [106, 91, 255];
  const HF = 0.056 * 0.55;
  const segs = [[0.32, 0.205, 0.50, 0.45], [0.68, 0.205, 0.50, 0.45]];
  const stem = [0.50, (0.205 + 0.76) / 2, HF, (0.76 - 0.205) / 2];
  const bar1 = [0.50, 0.615, 0.165, HF];
  const bar2 = [0.50, 0.720, 0.165, HF];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const g = (x + y) / (2 * S);
    let r = c1[0] + (c2[0] - c1[0]) * g;
    let gg = c1[1] + (c2[1] - c1[1]) * g;
    let b = c1[2] + (c2[2] - c1[2]) * g;
    let d = Infinity;
    for (const s of segs) d = Math.min(d, distSeg(x, y, s[0]*S, s[1]*S, s[2]*S, s[3]*S));
    d = Math.min(d, distRect(x, y, stem[0]*S, stem[1]*S, stem[2]*S, stem[3]*S));
    d = Math.min(d, distRect(x, y, bar1[0]*S, bar1[1]*S, bar1[2]*S, bar1[3]*S));
    d = Math.min(d, distRect(x, y, bar2[0]*S, bar2[1]*S, bar2[2]*S, bar2[3]*S));
    const cov = Math.max(0, Math.min(1, HF * S + 0.5 - d));
    buf[i]     = Math.round(r + (255 - r) * cov);
    buf[i + 1] = Math.round(gg + (255 - gg) * cov);
    buf[i + 2] = Math.round(b + (255 - b) * cov);
    buf[i + 3] = 255;
  }
  return encodePNG(S, S, buf);
}

/* ---------- 流程 ---------- */
console.log('== 0. 准备目录 ==');
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(path.join(BUILD, 'obj'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'assets'), { recursive: true });
fs.mkdirSync(path.join(BUILD, 'res'), { recursive: true });

console.log('== 1. 复制网页应用到 assets/www ==');
const www = path.join(BUILD, 'assets', 'www');
fs.mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'style.css', 'app.js', 'manifest.json', 'sw.js']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(www, f));
}
fs.cpSync(path.join(ROOT, 'icons'), path.join(www, 'icons'), { recursive: true });

console.log('== 2. 生成各分辨率图标 ==');
const DENS = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(DENS)) {
  const dir = path.join(BUILD, 'res', 'mipmap-' + d);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), iconPNG(s));
}

console.log('== 3. javac 编译 ==');
run(`"${path.join(JDK, 'bin', 'javac')}" -source 8 -target 8 -encoding UTF-8 ` +
    `-bootclasspath "${PLATFORM_JAR}" -d "${path.join(BUILD, 'obj')}" ` +
    `"${path.join(SRC, 'java', 'com', 'zxiing', 'ledger', 'MainActivity.java')}"`);

console.log('== 4. d8 转 dex ==');
run(`"${path.join(BT, 'd8.bat')}" --release --lib "${PLATFORM_JAR}" ` +
    `--output "${BUILD}" "${path.join(BUILD, 'obj', 'com', 'zxiing', 'ledger', 'MainActivity.class')}" ` +
    `"${path.join(BUILD, 'obj', 'com', 'zxiing', 'ledger', 'MainActivity$Bridge.class')}" ` +
    `"${path.join(BUILD, 'obj', 'com', 'zxiing', 'ledger', 'MainActivity$1.class')}" ` +
    `"${path.join(BUILD, 'obj', 'com', 'zxiing', 'ledger', 'MainActivity$2.class')}"`);

console.log('== 5. aapt2 打包资源 ==');
run(`"${path.join(BT, 'aapt2')}" compile --dir "${path.join(BUILD, 'res')}" -o "${path.join(BUILD, 'res.zip')}"`);
run(`"${path.join(BT, 'aapt2')}" link -o "${path.join(BUILD, 'base.apk')}" ` +
    `-I "${PLATFORM_JAR}" --manifest "${path.join(SRC, 'AndroidManifest.xml')}" ` +
    `-A "${path.join(BUILD, 'assets')}" ` +
    `--min-sdk-version 21 --target-sdk-version 34 --version-code 1 --version-name 2.0 ` +
    `--auto-add-overlay "${path.join(BUILD, 'res.zip')}"`);

console.log('== 6. 注入 classes.dex、规范路径分隔符、arsc 不压缩 ==');
const inZip = new AdmZip(path.join(BUILD, 'base.apk'));
const outZip = new AdmZip();
for (const e of inZip.getEntries()) {
  const name = e.entryName.split('\\').join('/');   // aapt2 在 Windows 上用反斜杠，安卓不认
  outZip.addFile(name, e.getData());
}
outZip.addFile('classes.dex', fs.readFileSync(path.join(BUILD, 'classes.dex')));
for (const e of outZip.getEntries()) {
  if (e.entryName.endsWith('.arsc')) e.header.method = 0;  // Android 11+ 要求 resources.arsc 不压缩
}
outZip.writeZip(path.join(BUILD, 'with-dex.apk'));

console.log('== 7. zipalign 对齐 ==');
run(`"${path.join(BT, 'zipalign')}" -f 4 "${path.join(BUILD, 'with-dex.apk')}" "${path.join(BUILD, 'aligned.apk')}"`);

console.log('== 8. 生成签名密钥（如无） ==');
const ks = path.join(SRC, 'ledger.keystore');
if (!fs.existsSync(ks)) {
  run(`"${path.join(JDK, 'bin', 'keytool')}" -genkeypair -keystore "${ks}" -alias ledger ` +
      `-keyalg RSA -keysize 2048 -validity 10950 -storepass ledger2026 -keypass ledger2026 ` +
      `-dname "CN=Ledger, OU=Personal, O=zxiing, C=CN"`);
}

console.log('== 9. apksigner 签名 ==');
run(`"${path.join(BT, 'apksigner.bat')}" sign --ks "${ks}" --ks-pass pass:ledger2026 ` +
    `--ks-key-alias ledger --out "${path.join(BUILD, 'ledger.apk')}" "${path.join(BUILD, 'aligned.apk')}"`);

console.log('== 10. 验证签名 ==');
run(`"${path.join(BT, 'apksigner.bat')}" verify --print-certs "${path.join(BUILD, 'ledger.apk')}"`);

const out = path.join(ROOT, '..', '记账本.apk');
fs.copyFileSync(path.join(BUILD, 'ledger.apk'), out);
console.log('\n✅ 构建完成: ' + out + ' (' + (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB)');

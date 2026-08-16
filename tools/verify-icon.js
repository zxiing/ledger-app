const fs = require('fs'), zlib = require('zlib');
const buf = fs.readFileSync('E:/accounts/app/icons/icon-512.png');
let pos = 8, w = 0, h = 0, idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.slice(pos + 8, pos + 8 + len);
  if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
  if (type === 'IDAT') idat.push(data);
  pos += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const px = (x, y) => {
  const o = y * (1 + w * 4) + 1 + x * 4;
  return raw[o] + ',' + raw[o + 1] + ',' + raw[o + 2] + ',' + raw[o + 3];
};
console.log('尺寸: ' + w + 'x' + h);
console.log('左上角(背景): ' + px(5, 5));
console.log('右下角(背景): ' + px(506, 506));
console.log('竖笔画(256,300): ' + px(256, 300));
console.log('空白处(150,300): ' + px(150, 300));
console.log('横杠(220,315): ' + px(220, Math.round(0.615 * 512)));
console.log('左斜线(182,130): ' + px(182, 130));
console.log('右斜线(300,150): ' + px(300, 150));
console.log('字上空白(256,80): ' + px(256, 80));

// 用法: node make-qr.js <URL> [输出路径]
const QRCode = require('./qr/node_modules/qrcode');
const url = process.argv[2];
const out = process.argv[3] || 'E:/accounts/手机扫码安装二维码.png';
if (!url) { console.error('缺少 URL 参数'); process.exit(1); }
QRCode.toFile(out, url, { width: 480, margin: 2, color: { dark: '#1a1d27', light: '#ffffff' } })
  .then(() => console.log('二维码已生成: ' + out));

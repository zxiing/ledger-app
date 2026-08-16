const AdmZip = require('E:/accounts/app/tools/apkbuild/node_modules/adm-zip');
const zip = new AdmZip('E:/accounts/记账本.apk');
const entries = zip.getEntries().map(e => e.entryName).sort();
console.log('文件数量:', entries.length);
for (const e of entries) console.log(' ', e);
const dex = zip.getEntry('classes.dex');
console.log('classes.dex 大小:', dex.header.size, '字节');
const html = zip.getEntry('assets/www/index.html');
console.log('assets/www/index.html 存在:', !!html, html ? '(' + html.header.size + ' 字节)' : '');

'use strict';

/* ================= 数据层 ================= */
const LS_REC = 'book.records.v2';
const LS_SET = 'book.settings.v2';

const DEF_OUT = [['餐饮','🍜'],['买菜','🥬'],['交通','🚕'],['购物','🛒'],['日用','🧻'],['娱乐','🎮'],['通讯','📱'],['医疗','💊'],['居住','🏠'],['教育','📚'],['人情','🎁'],['其他','📦']];
const DEF_IN  = [['工资','💰'],['兼职','💼'],['红包','🧧'],['理财','📈'],['报销','🧾'],['其他','📦']];
const PALETTE = ['#4f7cff','#6a5bff','#9c5bff','#e356bf','#f0524f','#ff8a5c','#f6b23a','#21a366','#00b8a9','#3bc9db','#8d6bff','#94a3b8'];
const CAT_BG  = ['#eef2ff','#f3eeff','#f5ecff','#fdeef8','#feeeee','#fff1e8','#fdf4e2','#e6f6ef','#e3f7f4','#e8f8fb','#f1edff','#f0f2f5'];

let records = [];
let settings = { budget: 0, theme: 'auto', customOut: [], customIn: [] };

(function load() {
  try {
    const raw = localStorage.getItem(LS_REC);
    if (raw) records = JSON.parse(raw) || [];
    else {
      const old = localStorage.getItem('book_records');   // 迁移 v1 数据
      if (old) { records = JSON.parse(old) || []; localStorage.setItem(LS_REC, JSON.stringify(records)); }
    }
  } catch (e) { records = []; }
  try { Object.assign(settings, JSON.parse(localStorage.getItem(LS_SET) || '{}')); } catch (e) {}
})();
const saveRec = () => localStorage.setItem(LS_REC, JSON.stringify(records));
const saveSet = () => localStorage.setItem(LS_SET, JSON.stringify(settings));

/* ================= 工具 ================= */
const $ = id => document.getElementById(id);
const fmt = n => '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad2 = n => String(n).padStart(2, '0');
const ymOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WEEK = ['日','一','二','三','四','五','六'];

let seq = 0;
const newId = () => Date.now() * 1000 + (seq = (seq + 1) % 1000);

function catsOf(type) {
  return type === 'out'
    ? DEF_OUT.concat(settings.customOut || [])
    : DEF_IN.concat(settings.customIn || []);
}
function catInfo(name, type) {
  const all = catsOf(type);
  const hit = all.find(c => c[0] === name);
  return hit || ['其他', '📦'];
}
function catColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 997;
  return PALETTE[h % PALETTE.length];
}
function catBg(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 997;
  return CAT_BG[h % CAT_BG.length];
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ================= 全局状态 ================= */
let curMonth = new Date(); curMonth.setDate(1);
let curTab = 'list';
let editId = null;          // 正在编辑的记录 id，null 表示新增
let editType = 'out';
let editCat = DEF_OUT[0][0];
let amtStr = '';            // 键盘输入的金额字符串

/* ================= 渲染：顶部 ================= */
function renderHeader() {
  const ym = ymOf(curMonth);
  const now = new Date();
  $('monthLabel').textContent = curMonth.getFullYear() === now.getFullYear()
    ? (curMonth.getMonth() + 1) + '月'
    : curMonth.getFullYear() + '年' + (curMonth.getMonth() + 1) + '月';

  const ms = records.filter(r => r.date.slice(0, 7) === ym);
  const exp = ms.filter(r => r.type === 'out').reduce((s, r) => s + +r.amount, 0);
  const inc = ms.filter(r => r.type === 'in').reduce((s, r) => s + +r.amount, 0);
  $('totalOut').textContent = '支出 ' + fmt(exp);
  $('totalSub').textContent = '收入 ' + fmt(inc) + ' · 结余 ' + fmt(inc - exp);

  const b = +settings.budget || 0;
  if (b > 0) {
    $('budgetRing').style.display = 'block';
    $('setBudgetChip').style.display = 'none';
    const ratio = Math.min(exp / b, 1);
    const C = 188.5;
    $('ringBar').setAttribute('stroke-dashoffset', (C * (1 - ratio)).toFixed(1));
    $('ringBar').setAttribute('stroke', exp > b ? '#ffb0af' : '#ffffff');
    $('ringTxt').textContent = Math.round(exp / b * 100) + '%';
    $('ringTxt').title = '';
  } else {
    $('budgetRing').style.display = 'none';
    $('setBudgetChip').style.display = 'block';
  }
  return { ms, exp, inc };
}

/* ================= 渲染：明细 ================= */
function renderList() {
  const box = $('page-list');
  const ym = ymOf(curMonth);
  const sorted = records.filter(r => r.date.slice(0, 7) === ym)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (!sorted.length) {
    box.innerHTML = '<div class="empty">📕 本月还没有记录<br>点右下角 ＋ 记一笔吧</div>';
    return;
  }
  const groups = {};
  sorted.forEach(r => (groups[r.date] = groups[r.date] || []).push(r));
  let html = '';
  for (const d of Object.keys(groups)) {
    const dayExp = groups[d].filter(r => r.type === 'out').reduce((s, r) => s + +r.amount, 0);
    const dt = new Date(d + 'T00:00:00');
    const label = (dt.getMonth() + 1) + '月' + dt.getDate() + '日 周' + WEEK[dt.getDay()];
    html += '<div class="day-group"><div class="day-title"><span>' + label +
            '</span><span>支出 ' + fmt(dayExp) + '</span></div>';
    for (const r of groups[d]) {
      const [name, emoji] = catInfo(r.cat, r.type);
      html += '<div class="item" data-id="' + r.id + '">' +
        '<div class="icon" style="background:' + catBg(r.cat) + '">' + emoji + '</div>' +
        '<div class="info"><div class="cat">' + esc(r.cat) + '</div><div class="note">' + esc(r.note) + '</div></div>' +
        '<div class="amount' + (r.type === 'in' ? ' in' : '') + '">' + (r.type === 'in' ? '+' : '-') + fmt(r.amount).slice(0) + '</div>' +
        '</div>';
    }
    html += '</div>';
  }
  box.innerHTML = html;
}

/* ================= 渲染：图表 ================= */
function renderChart() {
  const box = $('page-chart');
  const ym = ymOf(curMonth);
  const ms = records.filter(r => r.date.slice(0, 7) === ym);
  const outs = ms.filter(r => r.type === 'out');
  const inc = ms.filter(r => r.type === 'in').reduce((s, r) => s + +r.amount, 0);
  const exp = outs.reduce((s, r) => s + +r.amount, 0);
  const today = new Date();

  /* 分类环形图 */
  const byCat = {};
  outs.forEach(r => byCat[r.cat] = (byCat[r.cat] || 0) + +r.amount);
  const arr = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  let donutHtml = '<div class="card"><h3>🍩 支出分类</h3>';
  if (!arr.length) {
    donutHtml += '<div class="empty">本月暂无支出</div></div>';
  } else {
    let deg = 0;
    const stops = arr.map(([c, v]) => {
      const s = deg; deg += v / exp * 360;
      return catColor(c) + ' ' + s.toFixed(2) + 'deg ' + deg.toFixed(2) + 'deg';
    });
    donutHtml += '<div class="donut-wrap">' +
      '<div class="donut" style="background:conic-gradient(' + stops.join(',') + ')">' +
      '<div class="donut-center"><b>' + fmt(exp) + '</b><span>总支出</span></div></div>' +
      '<div class="legend">' +
      arr.map(([c, v]) => '<div class="legend-row"><span class="dot" style="background:' + catColor(c) + '"></span>' +
        '<span class="lname">' + esc(c) + '</span><span class="lval">' + fmt(v) + '</span>' +
        '<span class="lpct">' + (v / exp * 100).toFixed(1) + '%</span></div>').join('') +
      '</div></div></div>';
  }

  /* 每日柱状图 */
  const days = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 0).getDate();
  const perDay = Array(days).fill(0);
  outs.forEach(r => perDay[+r.date.slice(8, 10) - 1] += +r.amount);
  const maxDay = Math.max(...perDay);
  let dailyHtml = '<div class="card"><h3>📅 每日支出</h3><div class="bars dbars">' +
    perDay.map((v, i) => {
      const h = maxDay ? v / maxDay * 100 : 0;
      const isToday = curMonth.getFullYear() === today.getFullYear() && curMonth.getMonth() === today.getMonth() && i + 1 === today.getDate();
      return '<div class="bcol"><div class="dbar' + (isToday ? ' today' : '') + '" style="height:' + h + '%"></div></div>';
    }).join('') + '</div><div class="dlabels">' +
    perDay.map((v, i) => '<span>' + ((i + 1) % 5 === 0 || i === 0 ? i + 1 : '') + '</span>').join('') +
    '</div></div>';

  /* 近6个月趋势 */
  let mHtml = '<div class="card"><h3>📈 近6个月</h3><div class="legend-mini">' +
    '<span><i style="background:var(--primary)"></i>支出</span><span><i style="background:var(--green)"></i>收入</span></div><div class="bars mbars">';
  const months = [], mExp = [], mInc = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(curMonth); m.setDate(1); m.setMonth(m.getMonth() - i);
    const key = ymOf(m);
    const rs = records.filter(r => r.date.slice(0, 7) === key);
    months.push((m.getMonth() + 1) + '月');
    mExp.push(rs.filter(r => r.type === 'out').reduce((s, r) => s + +r.amount, 0));
    mInc.push(rs.filter(r => r.type === 'in').reduce((s, r) => s + +r.amount, 0));
  }
  const mMax = Math.max(...mExp, ...mInc, 1);
  mHtml += mExp.map((v, i) =>
    '<div class="mgroup"><div class="mbar-out" style="height:' + (v / mMax * 100) + '%"></div>' +
    '<div class="mbar-in" style="height:' + (mInc[i] / mMax * 100) + '%"></div></div>').join('') +
    '</div><div class="mlabels">' + months.map(m => '<span>' + m + '</span>').join('') + '</div></div>';

  /* 概况 */
  const dayCount = days;
  const maxSingle = outs.length ? Math.max(...outs.map(r => +r.amount)) : 0;
  const sumHtml = '<div class="card"><h3>🧾 本月概况</h3>' +
    '<div class="kv"><span>日均支出</span><span>' + fmt(exp / dayCount) + '</span></div>' +
    '<div class="kv"><span>记账笔数</span><span>' + ms.length + ' 笔</span></div>' +
    '<div class="kv"><span>最大单笔支出</span><span>' + fmt(maxSingle) + '</span></div>' +
    '<div class="kv"><span>结余</span><span style="color:' + (inc - exp >= 0 ? 'var(--green)' : 'var(--danger)') + '">' + fmt(inc - exp) + '</span></div></div>';

  box.innerHTML = donutHtml + dailyHtml + mHtml + sumHtml;
}

/* ================= 渲染：设置 ================= */
function renderMe() {
  $('budgetInput').value = settings.budget || '';
  const b = +settings.budget || 0;
  if (b > 0) {
    const ym = ymOf(curMonth);
    const exp = records.filter(r => r.type === 'out' && r.date.slice(0, 7) === ym).reduce((s, r) => s + +r.amount, 0);
    $('budgetTip').textContent = '当月已用 ' + fmt(exp) + ' / ' + fmt(b) + (exp > b ? '，已超支 ' + fmt(exp - b) : '，剩余 ' + fmt(b - exp));
  } else {
    $('budgetTip').textContent = '';
  }
  $('themeSeg').querySelectorAll('button').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.v === settings.theme));
}

function render() {
  renderHeader();
  renderList();
  renderChart();
  renderMe();
}

/* ================= 主题 ================= */
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').setAttribute('content', t === 'dark' ? '#14161c' : '#4f7cff');
}
darkQuery.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });

/* ================= Tab 切换 ================= */
function switchTab(t) {
  curTab = t;
  ['list', 'chart', 'me'].forEach(k => {
    $('page-' + k).style.display = k === t ? '' : 'none';
  });
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('fab').style.display = t === 'list' ? '' : 'none';
  if (t !== 'list') closeSheet();
}

/* ================= 记一笔弹层 ================= */
function setType(t) {
  editType = t;
  $('typeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === t));
  editCat = catsOf(t)[0][0];
  renderCats();
}
function renderCats() {
  const list = catsOf(editType);
  let html = list.map(([n, e], i) =>
    '<button data-i="' + i + '" class="' + (n === editCat ? 'active' : '') + '"><span class="ci">' + e + '</span>' + esc(n) + '</button>'
  ).join('');
  html += '<button class="add-cat" id="addCatBtn"><span class="ci">＋</span>添加</button>';
  $('catGrid').innerHTML = html;
  $('catGrid').querySelectorAll('button[data-i]').forEach(b =>
    b.addEventListener('click', () => {
      editCat = list[+b.dataset.i][0];
      renderCats();
    }));
  $('addCatBtn').addEventListener('click', openCatModal);
}
function updateAmtShow() {
  const el = $('amtShow');
  if (!amtStr) { el.textContent = '0.00'; el.classList.add('placeholder'); return; }
  el.classList.remove('placeholder');
  el.textContent = amtStr;
}
function pressKey(k) {
  if (k === 'back') { amtStr = amtStr.slice(0, -1); }
  else if (k === '.') {
    if (!amtStr) amtStr = '0.';
    else if (!amtStr.includes('.')) amtStr += '.';
  } else {
    if (amtStr.includes('.')) {
      const [, dec] = amtStr.split('.');
      if (dec.length >= 2) return;
    } else {
      if (amtStr === '0') amtStr = '';                 // 0 开头替换
      if (amtStr.replace('.', '').length >= 8) return; // 整数最多 8 位
    }
    amtStr += k;
  }
  updateAmtShow();
}
function openSheet(id) {
  editId = id || null;
  const r = id ? records.find(x => x.id === id) : null;
  setType(r ? r.type : 'out');
  if (r) {
    editCat = r.cat;
    renderCats();
    amtStr = String(r.amount);
    $('fNote').value = r.note || '';
    $('fDate').value = r.date;
  } else {
    amtStr = '';
    $('fNote').value = '';
    const now = new Date();
    $('fDate').value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }
  updateAmtShow();
  $('delBtn').style.display = r ? 'block' : 'none';
  $('sheetTitle').textContent = r ? '编辑记录' : '记一笔';
  $('mask').classList.add('show');
  $('sheet').classList.add('show');
  document.body.classList.add('no-scroll');
}
function closeSheet() {
  $('mask').classList.remove('show');
  $('sheet').classList.remove('show');
  document.body.classList.remove('no-scroll');
}
function collectAndSave(keepOpen) {
  const amt = parseFloat(amtStr);
  if (!amt || amt <= 0) { toast('请输入金额'); return false; }
  const note = $('fNote').value.trim();
  const date = $('fDate').value || new Date().toISOString().slice(0, 10);
  if (editId) {
    const r = records.find(x => x.id === editId);
    Object.assign(r, { type: editType, cat: editCat, amount: +amt.toFixed(2), note, date });
  } else {
    records.push({ id: newId(), type: editType, cat: editCat, amount: +amt.toFixed(2), note, date });
  }
  saveRec(); render();
  if (keepOpen) {
    amtStr = ''; updateAmtShow(); $('fNote').value = '';
    toast('已保存，继续记 ✅');
  } else {
    closeSheet(); toast('已保存 ✅');
  }
  return true;
}

/* ================= 添加分类 ================= */
const EMOJIS = ['🍜','🥬','🚕','🚇','🛒','🧻','🎮','📱','💊','🏠','📚','🎁','🐶','💄','👕','⚽','✈️','🍼','💻','📷','☕','🍺','🏥','📦'];
let cmEmoji = EMOJIS[0];
function openCatModal() {
  cmEmoji = EMOJIS[0];
  $('cmName').value = '';
  $('cmEmojis').innerHTML = EMOJIS.map((e, i) =>
    '<button data-e="' + e + '" class="' + (i === 0 ? 'active' : '') + '">' + e + '</button>').join('');
  $('cmEmojis').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    cmEmoji = b.dataset.e;
    $('cmEmojis').querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));
  $('catModal').classList.add('show');
}
function addCustomCat() {
  const name = $('cmName').value.trim();
  if (!name) { toast('请输入分类名称'); return; }
  const list = catsOf(editType);
  if (list.some(c => c[0] === name)) { toast('分类已存在'); return; }
  const key = editType === 'out' ? 'customOut' : 'customIn';
  settings[key] = settings[key] || [];
  settings[key].push([name, cmEmoji]);
  saveSet();
  editCat = name;
  $('catModal').classList.remove('show');
  renderCats();
  toast('分类已添加');
}

/* ================= 数据导入导出 ================= */
function exportData() {
  const data = {
    app: 'ledger', version: 2, exportedAt: new Date().toISOString(),
    records, settings
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = '记账备份-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('备份已导出 ⬇️');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : data.records;
      if (!Array.isArray(list)) throw new Error('bad');
      let added = 0;
      for (const r of list) {
        if (!r || typeof r.amount !== 'number' || !r.date) continue;
        if (!records.some(x => x.id === r.id)) { records.push(r); added++; }
      }
      if (data.settings) {
        if (data.settings.budget > 0) settings.budget = data.settings.budget;
        const mergeCats = (k) => {
          settings[k] = settings[k] || [];
          (data.settings[k] || []).forEach(c => { if (!settings[k].some(x => x[0] === c[0])) settings[k].push(c); });
        };
        mergeCats('customOut'); mergeCats('customIn');
      }
      saveRec(); saveSet(); render();
      toast('已导入 ' + added + ' 条记录 ✅');
    } catch (e) { toast('文件格式不正确 ❌'); }
  };
  reader.readAsText(file);
}

/* ================= PWA ================= */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('installCard').style.display = 'block';
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('DOMContentLoaded', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ================= 事件绑定 ================= */
$('prevM').addEventListener('click', () => { curMonth.setMonth(curMonth.getMonth() - 1); render(); });
$('nextM').addEventListener('click', () => { curMonth.setMonth(curMonth.getMonth() + 1); render(); });
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('fab').addEventListener('click', () => openSheet());
$('mask').addEventListener('click', closeSheet);
$('sheetClose').addEventListener('click', closeSheet);
$('page-list').addEventListener('click', e => {
  const item = e.target.closest('.item');
  if (item) openSheet(+item.dataset.id);
});
$('typeSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setType(b.dataset.v)));
$('pad').querySelectorAll('button').forEach(b => b.addEventListener('click', () => pressKey(b.dataset.k)));
$('saveBtn').addEventListener('click', () => collectAndSave(false));
$('againBtn').addEventListener('click', () => collectAndSave(true));
$('delBtn').addEventListener('click', () => {
  if (!confirm('确定删除这条记录？')) return;
  records = records.filter(r => r.id !== editId);
  saveRec(); closeSheet(); render();
  toast('已删除');
});
$('setBudgetChip').addEventListener('click', () => { switchTab('me'); $('budgetInput').focus(); });
$('budgetSave').addEventListener('click', () => {
  const v = parseFloat($('budgetInput').value);
  settings.budget = v > 0 ? +v.toFixed(2) : 0;
  saveSet(); render();
  toast(settings.budget ? '预算已设置为 ' + fmt(settings.budget) : '预算已清除');
});
$('themeSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  settings.theme = b.dataset.v;
  saveSet(); applyTheme(); renderMe();
}));
$('exportBtn').addEventListener('click', exportData);
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => {
  if (e.target.files[0]) importData(e.target.files[0]);
  e.target.value = '';
});
$('clearBtn').addEventListener('click', () => {
  if (!confirm('确定清空所有记账记录？此操作不可恢复！')) return;
  if (!confirm('再次确认：真的要清空全部数据吗？建议先导出备份。')) return;
  records = [];
  saveRec(); render();
  toast('已清空');
});
$('installBtn').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('installCard').style.display = 'none';
  } else {
    toast('请使用浏览器菜单里的「添加到主屏幕」');
  }
});
$('cmClose').addEventListener('click', () => $('catModal').classList.remove('show'));
$('cmAdd').addEventListener('click', addCustomCat);
$('catModal').addEventListener('click', e => { if (e.target === $('catModal')) $('catModal').classList.remove('show'); });

/* ================= 启动 ================= */
applyTheme();
render();

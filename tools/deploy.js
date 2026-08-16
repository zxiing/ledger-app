// 部署辅助：用本机保存的 GitHub 凭据创建仓库并开启 Pages（凭据仅驻留内存）
const { execSync } = require('child_process');
const https = require('https');

const REPO = 'ledger-app';

function getCredentials() {
  const input = 'protocol=https\nhost=github.com\n\n';
  const out = execSync('git credential fill', { input, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).toString();
  const map = {};
  out.trim().split('\n').forEach(line => {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  });
  if (!map.username || !map.password) throw new Error('没有可用的 GitHub 凭据');
  return map;
}

function api(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'ledger-deploy',
        'Accept': 'application/vnd.github+json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const { username, password: token } = getCredentials();
  console.log('GitHub 账号:', username);

  // 1. 创建公开仓库（已存在则继续）
  let r = await api('POST', '/user/repos', token, {
    name: REPO,
    description: '记账本 PWA - 手机本地记账应用',
    private: false,
    auto_init: false
  });
  if (r.status === 201) console.log('仓库已创建: ' + username + '/' + REPO);
  else if (r.status === 422) console.log('仓库已存在，继续使用');
  else throw new Error('创建仓库失败: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));

  // 2. 开启 GitHub Pages（main 分支根目录）
  r = await api('POST', '/repos/' + username + '/' + REPO + '/pages', token, {
    source: { branch: 'main', path: '/' }
  });
  if (r.status === 201) console.log('Pages 已开启');
  else if (r.status === 409) console.log('Pages 已开启过');
  else console.log('Pages 状态: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));

  console.log('SITE=https://' + username + '.github.io/' + REPO + '/');
})().catch(e => { console.error(e.message); process.exit(1); });

/**
 * 剪辑师个人作品集 — 零依赖 Node.js 服务器
 * 功能：静态站点托管 + 内容 SSR 注入 + 后台管理 API（登录 / 内容保存 / 改密码）
 * 运行：node server.js  （端口默认 3000，可用 PORT 环境变量覆盖）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

// ---------- 媒体上传（视频 / 封面图片） ----------
const UPLOAD_CONF = {
  video: { dir: path.join(PUBLIC_DIR, 'videos'), exts: ['.mp4', '.webm'], max: 200 * 1024 * 1024 },
  image: { dir: path.join(PUBLIC_DIR, 'images'), exts: ['.png', '.jpg', '.jpeg', '.webp'], max: 10 * 1024 * 1024 }
};

// ---------- 数据读写 ----------
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { settings: { adminPassword: 'admin123' } };
  }
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
}
// 对外输出时移除密码等敏感字段
function publicData(d) {
  const c = JSON.parse(JSON.stringify(d));
  if (c.settings) delete c.settings.adminPassword;
  return c;
}

// ---------- 会话（内存态，重启失效） ----------
const sessions = new Set();

// ---------- 访问与操作日志（持久化到 access-log.json） ----------
const ACCESS_LOG_FILE = path.join(ROOT, 'access-log.json');
let accessLog = [];
try { accessLog = JSON.parse(fs.readFileSync(ACCESS_LOG_FILE, 'utf8')); } catch (e) { accessLog = []; }
function logEvent(type, action, detail) {
  accessLog.unshift({ ts: Date.now(), type: type, action: action, detail: detail || '' });
  if (accessLog.length > 500) accessLog = accessLog.slice(0, 500);
  try { fs.writeFileSync(ACCESS_LOG_FILE, JSON.stringify(accessLog)); } catch (e) { /* 写入失败不影响服务 */ }
}

// ---------- 工具 ----------
function send(res, status, body, headers) {
  const h = Object.assign({ 'Cache-Control': 'no-cache' }, headers || {});
  res.writeHead(status, h);
  res.end(body);
}
function sendJson(res, obj, status) {
  send(res, status || 200, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 8e6) req.destroy();
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
// 二进制读取（视频上传用），超限直接断开
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('FILE_TOO_LARGE')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function serveStatic(res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not Found');
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  });
}
// 服务端注入内容数据（必须位于 main.js 之前执行），保证访客始终拿到最新内容且无加载闪烁
function servePage(res, pageFile) {
  fs.readFile(path.join(PUBLIC_DIR, pageFile), (err, buf) => {
    if (err) return send(res, 500, 'Page Error');
    const data = publicData(readData());
    const injection =
      '<script>window.__CONTENT__=' +
      JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') +
      '</script>';
    let html = buf.toString('utf8');
    if (html.indexOf('<!--CONTENT_INJECT-->') !== -1) {
      html = html.replace('<!--CONTENT_INJECT-->', injection);
    } else {
      html = html.replace('</body>', injection + '\n</body>');
    }
    send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://internal');
  const p = u.pathname;
  try {
    // 公开内容
    if (p === '/api/content' && req.method === 'GET') {
      return sendJson(res, publicData(readData()));
    }
    // 登录
    if (p === '/api/login' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const d = readData();
      const expect = (d.settings && d.settings.adminPassword) || 'admin123';
      if (body.password && body.password === expect) {
        const token = crypto.randomBytes(24).toString('hex');
        sessions.add(token);
        logEvent('action', '登录后台', '密码验证通过');
        return sendJson(res, { token: token });
      }
      return sendJson(res, { error: '密码错误，请重试' }, 401);
    }
    // 保存内容（需登录）
    if (p === '/api/content' && req.method === 'PUT') {
      const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      if (!sessions.has(token)) return sendJson(res, { error: '登录已失效，请重新登录' }, 401);
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body !== 'object') return sendJson(res, { error: '数据格式错误' }, 400);
      const cur = readData();
      body.settings = cur.settings || { adminPassword: 'admin123' }; // 设置项不通过此接口修改
      writeData(body);
      logEvent('action', '保存内容修改', '通过后台保存全部内容');
      return sendJson(res, { ok: true });
    }
    // 修改密码（需登录）
    if (p === '/api/password' && req.method === 'PUT') {
      const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      if (!sessions.has(token)) return sendJson(res, { error: '登录已失效，请重新登录' }, 401);
      const body = JSON.parse((await readBody(req)) || '{}');
      const d = readData();
      const expect = (d.settings && d.settings.adminPassword) || 'admin123';
      if (!body.oldPassword || body.oldPassword !== expect) return sendJson(res, { error: '原密码错误' }, 400);
      if (!body.newPassword || body.newPassword.length < 6) return sendJson(res, { error: '新密码至少 6 位' }, 400);
      d.settings = d.settings || {};
      d.settings.adminPassword = body.newPassword;
      writeData(d);
      sessions.delete(token); // 强制重新登录
      logEvent('action', '修改后台密码', '');
      return sendJson(res, { ok: true });
    }
    // 访问记录查询 / 清空（需登录）
    if (p === '/api/accesslog' && req.method === 'GET') {
      const t1 = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      if (!sessions.has(t1)) return sendJson(res, { error: '登录已失效，请重新登录' }, 401);
      return sendJson(res, { ok: true, list: accessLog });
    }
    if (p === '/api/accesslog' && req.method === 'DELETE') {
      const t2 = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      if (!sessions.has(t2)) return sendJson(res, { error: '登录已失效，请重新登录' }, 401);
      accessLog = [];
      try { fs.writeFileSync(ACCESS_LOG_FILE, JSON.stringify(accessLog)); } catch (e) { /* 忽略 */ }
      logEvent('action', '清空访问记录', '');
      return sendJson(res, { ok: true });
    }
    // 媒体上传（需登录）：PUT /api/upload?type=video|image&name=文件名，请求体为原始文件字节
    if (p === '/api/upload' && req.method === 'PUT') {
      const tk = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
      if (!sessions.has(tk)) return sendJson(res, { error: '登录已失效，请重新登录' }, 401);
      const type = (u.searchParams.get('type') || 'video').trim();
      const conf = UPLOAD_CONF[type];
      if (!conf) return sendJson(res, { error: '未知的上传类型：' + type }, 400);
      const rawName = (u.searchParams.get('name') || '').trim() || ('file' + conf.exts[0]);
      const ext = path.extname(rawName).toLowerCase();
      if (conf.exts.indexOf(ext) === -1) {
        return sendJson(res, { error: '该类型仅支持：' + conf.exts.join(' / ') }, 400);
      }
      let buf;
      try {
        buf = await readRawBody(req, conf.max);
      } catch (e) {
        return sendJson(res, { error: type === 'video' ? '文件超过 200MB 限制或传输中断' : '文件超过 10MB 限制或传输中断' }, 413);
      }
      if (!buf || buf.length === 0) return sendJson(res, { error: '文件内容为空' }, 400);
      // 存储名转为 ASCII 安全格式，避免中文文件名的 URL 编码差异
      const base = rawName.slice(0, rawName.length - ext.length).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'file';
      const safeName = Date.now() + '-' + base + ext;
      try {
        fs.mkdirSync(conf.dir, { recursive: true });
        fs.writeFileSync(path.join(conf.dir, safeName), buf);
      } catch (e) {
        return sendJson(res, { error: '保存失败：' + e.message }, 500);
      }
      const typeLabel = type === 'video' ? '上传视频' : '上传封面图';
      logEvent('action', typeLabel, safeName + '（' + Math.round(buf.length / 1024) + ' KB）');
      return sendJson(res, { ok: true, url: (type === 'video' ? 'videos/' : 'images/') + safeName, size: buf.length });
    }

    // 页面（记录访客访问）
    if (p === '/' ) {
      logEvent('visit', '访问网站首页', '');
      return servePage(res, 'index.html');
    }
    if (p === '/case' || p === '/case.html') {
      const caseId = u.searchParams.get('id') || '';
      const w = (readData().works || []).filter(function (x) { return x.id === caseId; })[0];
      logEvent('visit', '查看作品案例', w ? w.title : caseId);
      return servePage(res, 'case.html');
    }
    if (p === '/admin' || p === '/admin.html') return servePage(res, 'admin.html');
    // 静态资源
    return serveStatic(res, p);
  } catch (e) {
    return sendJson(res, { error: '服务器错误：' + e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log(' 剪辑师个人作品集网站已启动');
  console.log(' 前台地址：http://localhost:' + PORT);
  console.log(' 后台地址：http://localhost:' + PORT + '/admin');
  console.log(' 初始密码：admin123 （登录后请立即修改）');
  console.log('==============================================');
});

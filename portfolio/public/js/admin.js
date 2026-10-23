/* ============================================================
   后台管理逻辑
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN_KEY = 'portfolio_admin_token';
  var data = null; // 完整内容数据（不含密码）

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 登录 / 退出 ---------- */
  function showLogin() {
    $('loginWrap').style.display = 'flex';
    $('adminApp').classList.remove('on');
  }
  function showApp() {
    $('loginWrap').style.display = 'none';
    $('adminApp').classList.add('on');
  }

  $('loginBtn').addEventListener('click', doLogin);
  $('loginPwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

  function doLogin() {
    var pwd = $('loginPwd').value;
    $('loginErr').textContent = '';
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.token) {
        localStorage.setItem(TOKEN_KEY, res.j.token);
        $('loginPwd').value = '';
        loadContent();
      } else {
        $('loginErr').textContent = res.j.error || '登录失败';
      }
    }).catch(function () { $('loginErr').textContent = '网络错误，请重试'; });
  }

  $('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  });

  /* ---------- 数据加载 ---------- */
  function loadContent() {
    fetch('/api/content').then(function (r) { return r.json(); }).then(function (j) {
      data = j;
      renderEditors();
      showApp();
    }).catch(function () { alert('内容加载失败，请刷新重试'); });
  }

  /* ---------- 选项卡 ---------- */
  var tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.remove('on'); });
      document.querySelector('.admin-panel[data-panel="' + t.getAttribute('data-tab') + '"]').classList.add('on');
      if (t.getAttribute('data-tab') === 'access') fetchAccessLog();
    });
  });

  /* ---------- 访问记录（服务端） ---------- */
  function fmtTs(ts) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function fetchAccessLog() {
    fetch('/api/accesslog', { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); showLogin(); return null; }
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.ok) return;
        var list = j.list || [];
        var visits = list.filter(function (x) { return x.type === 'visit'; }).length;
        var actions = list.filter(function (x) { return x.type === 'action'; }).length;
        var last = list.length ? fmtTs(list[0].ts) : '—';
        $('accessSummary').innerHTML =
          '<div class="log-summary-cell"><span class="n">' + visits + '</span><span class="t">访问次数</span></div>' +
          '<div class="log-summary-cell"><span class="n">' + actions + '</span><span class="t">操作次数</span></div>' +
          '<div class="log-summary-cell"><span class="n">' + list.length + '</span><span class="t">记录总数（上限 500）</span></div>' +
          '<div class="log-summary-cell"><span class="n" style="font-size:14px;">' + esc(last) + '</span><span class="t">最近活动时间</span></div>';
        $('accessList').innerHTML = list.length ? list.map(function (r) {
          var badge = r.type === 'visit'
            ? '<span class="log-badge visit">访问</span>'
            : '<span class="log-badge action">操作</span>';
          return '<div class="log-row">' + badge +
            '<span class="log-time">' + fmtTs(r.ts) + '</span>' +
            '<span class="log-action">' + esc(r.action) + '</span>' +
            '<span class="log-detail">' + esc(r.detail) + '</span></div>';
        }).join('') : '<p class="admin-panel-desc">暂无记录。访客访问网站或后台操作后，记录将显示在这里。</p>';
      })
      .catch(function () { $('accessList').innerHTML = '<p class="admin-panel-desc">访问记录加载失败</p>'; });
  }
  $('accessClear').addEventListener('click', function () {
    if (!confirm('确定清空全部访问与操作记录？')) return;
    fetch('/api/accesslog', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) fetchAccessLog(); });
  });

  /* ---------- 通用字段绑定 ---------- */
  function getByPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o || {})[k]; }, obj);
  }
  function setByPath(obj, path, val) {
    var keys = path.split('.');
    var o = obj;
    for (var i = 0; i < keys.length - 1; i++) { o = o[keys[i]] = o[keys[i]] || {}; }
    o[keys[keys.length - 1]] = val;
  }
  function fillBinds() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var path = el.getAttribute('data-bind');
      var type = el.getAttribute('data-type');
      var v = getByPath(data, path);
      if (type === 'array') el.value = Array.isArray(v) ? v.join('，') : (v || '');
      else if (type === 'lines') el.value = Array.isArray(v) ? v.join('\n') : (v || '');
      else el.value = v == null ? '' : String(v);
    });
  }
  function readBinds() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var path = el.getAttribute('data-bind');
      var type = el.getAttribute('data-type');
      var v = el.value;
      if (type === 'array') v = v.split(/[，,]/).map(function (s) { return s.trim(); }).filter(Boolean);
      else if (type === 'lines') v = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      setByPath(data, path, v);
    });
  }

  /* ---------- 各编辑器渲染 ---------- */
  function rowField(label, value, attrs) {
    attrs = attrs || '';
    return '<div class="admin-field"><label class="admin-label">' + esc(label) + '</label>' +
      '<input class="admin-input" value="' + esc(value) + '" ' + attrs + ' /></div>';
  }

  function renderEditors() {
    fillBinds();

    // 求职意向
    $('intentEditor').innerHTML = (data.profile.intent || []).map(function (r, i) {
      return '<div class="admin-grid-2">' +
        rowField('标签', r.label, 'data-intent-l="' + i + '"') +
        rowField('内容', r.value, 'data-intent-v="' + i + '"') + '</div>';
    }).join('');

    // 数据统计
    $('statsEditor').innerHTML = (data.profile.stats || []).map(function (s, i) {
      return '<div class="admin-card" style="gap:10px;">' +
        rowField('数值', s.num, 'data-stat-n="' + i + '"') +
        rowField('标签', s.label, 'data-stat-l="' + i + '"') + '</div>';
    }).join('');

    // 擅长方向
    $('specEditor').innerHTML = (data.specialties || []).map(function (s, i) {
      return '<div class="admin-card">' +
        '<div class="admin-grid-2">' +
        rowField('名称', s.name, 'data-spec-n="' + i + '"') +
        rowField('图标（mic/film/megaphone）', s.icon, 'data-spec-i="' + i + '"') + '</div>' +
        '<div class="admin-field"><label class="admin-label">描述</label><textarea class="admin-input" data-spec-d="' + i + '">' + esc(s.desc) + '</textarea></div>' +
        rowField('底部标签', s.tags, 'data-spec-t="' + i + '"') + '</div>';
    }).join('');

    // 作品管理
    renderWorks();

    // 案例详情
    var d = data.works[0] && data.works[0].detail;
    if (d) {
      document.querySelector('[data-bind="caseBgParas"]').value = (d.bgParas || []).join('\n');
      document.querySelector('[data-bind="caseTools"]').value = (d.tools || []).join('，');
      $('caseInfoEditor').innerHTML = (d.info || []).map(function (r, i) {
        return '<div class="admin-grid-2">' + rowField('标签', r.label, 'data-ci-l="' + i + '"') + rowField('内容', r.value, 'data-ci-v="' + i + '"') + '</div>';
      }).join('');
      $('techEditor').innerHTML = (d.techniques || []).map(function (t, i) {
        return '<div class="admin-card" style="gap:10px;">' +
          '<div class="admin-grid-2">' + rowField('序号', t.num, 'data-te-n="' + i + '"') + rowField('名称', t.name, 'data-te-t="' + i + '"') + '</div>' +
          '<div class="admin-field"><label class="admin-label">描述</label><textarea class="admin-input" data-te-d="' + i + '">' + esc(t.desc) + '</textarea></div>' +
          '<div style="text-align:right;"><button class="admin-mini-btn danger" data-tech-del="' + i + '">删除此条</button></div></div>';
      }).join('');
    }

    // 技能
    $('skillEditor').innerHTML = (data.skills || []).map(function (s, i) {
      return '<div class="admin-card" style="gap:10px;">' +
        '<div class="admin-grid-2">' + rowField('序号', s.num, 'data-sk-n="' + i + '"') + rowField('名称', s.name, 'data-sk-t="' + i + '"') + '</div>' +
        rowField('描述', s.desc, 'data-sk-d="' + i + '"') +
        rowField('熟练度（0-100）', s.level, 'data-sk-l="' + i + '" type="number"') +
        '<div style="text-align:right;"><button class="admin-mini-btn danger" data-skill-del="' + i + '">删除此条</button></div></div>';
    }).join('');

    // 软件
    $('softEditor').innerHTML = (data.software || []).map(function (s, i) {
      return '<div class="admin-card" style="gap:10px;">' +
        rowField('角标文字', s.glyph, 'data-so-g="' + i + '"') +
        rowField('软件名', s.name, 'data-so-n="' + i + '"') +
        rowField('定位', s.level, 'data-so-l="' + i + '"') + '</div>';
    }).join('');

    // 社交媒体
    $('socialEditor').innerHTML = (data.contact.socials || []).map(function (s, i) {
      return '<div class="admin-grid-2">' + rowField('名称', s.name, 'data-sl-n="' + i + '"') + rowField('链接', s.url, 'data-sl-u="' + i + '"') + '</div>';
    }).join('');
  }

  function renderWorks() {
    $('worksEditor').innerHTML = (data.works || []).map(function (w, i) {
      return '<div class="admin-work-item">' +
        '<div class="thumb"><img src="/' + esc(w.cover || '') + '" alt="" onerror="this.style.opacity=0" /></div>' +
        '<div class="info"><div class="tt">' + esc(w.title) + '</div><div class="cc">' + esc(w.category) + ' · ' + esc(w.year) + ' · ' + esc(w.duration) + '</div></div>' +
        '<div class="ops"><button class="admin-mini-btn" data-work-edit="' + i + '">编辑</button>' +
        '<button class="admin-mini-btn danger" data-work-del="' + i + '">删除</button></div></div>';
    }).join('');
  }

  /* ---------- 媒体上传（视频 / 图片，带进度） ---------- */
  var UPLOAD_RULES = {
    video: { exts: ['.mp4', '.webm'], max: 200 * 1024 * 1024, errSize: '文件超过 200MB，请压缩后重试', errExt: '仅支持 mp4 / webm 格式' },
    image: { exts: ['.png', '.jpg', '.jpeg', '.webp'], max: 10 * 1024 * 1024, errSize: '图片超过 10MB，请压缩后重试', errExt: '仅支持 png / jpg / webp 格式' }
  };
  function uploadFile(file, tipEl, onOk, type) {
    var rule = UPLOAD_RULES[type || 'video'];
    var dot = file.name.lastIndexOf('.');
    var ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
    if (rule.exts.indexOf(ext) === -1) { tipEl.textContent = rule.errExt; return; }
    if (file.size > rule.max) { tipEl.textContent = rule.errSize; return; }
    tipEl.textContent = '上传中 0%…';
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/upload?type=' + (type || 'video') + '&name=' + encodeURIComponent(file.name));
    xhr.setRequestHeader('Authorization', 'Bearer ' + token());
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) tipEl.textContent = '上传中 ' + Math.round((e.loaded / e.total) * 100) + '%…';
    };
    xhr.onload = function () {
      try {
        var j = JSON.parse(xhr.responseText);
        if (j.ok) { tipEl.textContent = '上传成功 ✓（' + Math.round(file.size / 1024 / 1024 * 10) / 10 + ' MB）'; if (onOk) onOk(j.url); }
        else tipEl.textContent = j.error || '上传失败';
      } catch (e) { tipEl.textContent = '上传失败：服务端响应异常'; }
    };
    xhr.onerror = function () { tipEl.textContent = '上传失败，请检查网络后重试'; };
    xhr.send(file);
  }

  /* ---------- 作品编辑弹层 ---------- */
  var editingIndex = -1;
  function openWorkEditor(i) {
    editingIndex = i;
    var w = data.works[i];
    var isNew = !w;
    if (isNew) {
      w = { id: 'work-' + Date.now(), title: '新作品', category: '', year: '2026', duration: '00:00', desc: '', cover: '', video: '', detail: null };
      data.works.push(w);
      editingIndex = data.works.length - 1;
    }
    var html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:300;display:flex;align-items:center;justify-content:center;padding:24px;" id="workModal">' +
      '<div style="width:640px;max-width:100%;max-height:90vh;overflow:auto;background:#1A1A1A;border:1px solid #292929;padding:28px;display:flex;flex-direction:column;gap:14px;">' +
      '<div class="admin-card-title" style="font-size:16px;">' + (isNew ? '新增作品' : '编辑作品') + '</div>' +
      rowField('作品标题', w.title, 'id="wTitle"') +
      '<div class="admin-grid-2">' + rowField('分类', w.category, 'id="wCat"') + rowField('年份', w.year, 'id="wYear"') + '</div>' +
      '<div class="admin-grid-2">' + rowField('时长', w.duration, 'id="wDur"') + rowField('封面路径', w.cover, 'id="wCover"') + '</div>' +
      rowField('视频地址（mp4/webm，可留空）', w.video, 'id="wVideo"') +
      '<div class="admin-field"><label class="admin-label">或上传本地视频（mp4 / webm，不超过 200MB）</label>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<button class="admin-mini-btn" id="wUploadBtn" type="button">选择文件上传</button>' +
      '<input type="file" id="wUploadFile" accept=".mp4,.webm,video/mp4,video/webm" style="display:none;" />' +
      '<span class="admin-panel-desc" id="wUploadTip">上传后自动填入上方视频地址</span></div></div>' +
      '<div class="admin-field"><label class="admin-label">或上传封面图（png / jpg / webp，不超过 10MB）</label>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<button class="admin-mini-btn" id="wCoverBtn" type="button">选择图片上传</button>' +
      '<input type="file" id="wCoverFile" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" style="display:none;" />' +
      '<span class="admin-panel-desc" id="wCoverTip">上传后自动填入上方封面路径</span></div></div>' +
      '<div class="admin-field"><label class="admin-label">一句话描述</label><textarea class="admin-input" id="wDesc">' + esc(w.desc) + '</textarea></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">' +
      '<button class="admin-mini-btn" id="wCancel">取消</button>' +
      '<button class="admin-mini-btn primary" id="wSave">保存作品</button></div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    $('wCancel').addEventListener('click', function () {
      if (isNew) data.works.splice(editingIndex, 1);
      $('workModal').remove(); renderWorks();
    });
    $('wSave').addEventListener('click', function () {
      var x = data.works[editingIndex];
      x.title = $('wTitle').value; x.category = $('wCat').value; x.year = $('wYear').value;
      x.duration = $('wDur').value; x.cover = $('wCover').value; x.video = $('wVideo').value;
      x.desc = $('wDesc').value;
      $('workModal').remove(); renderWorks();
    });
    // 本地视频上传
    $('wUploadBtn').addEventListener('click', function () { $('wUploadFile').click(); });
    $('wUploadFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      uploadFile(f, $('wUploadTip'), function (url) { $('wVideo').value = url; }, 'video');
    });
    // 封面图上传
    $('wCoverBtn').addEventListener('click', function () { $('wCoverFile').click(); });
    $('wCoverFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      uploadFile(f, $('wCoverTip'), function (url) { $('wCover').value = url; }, 'image');
    });
  }

  /* ---------- 事件委托：各编辑器读取 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-work-edit')) openWorkEditor(+t.getAttribute('data-work-edit'));
    if (t.hasAttribute && t.hasAttribute('data-work-del')) {
      if (confirm('确定删除作品「' + data.works[+t.getAttribute('data-work-del')].title + '」？')) {
        data.works.splice(+t.getAttribute('data-work-del'), 1);
        renderWorks();
      }
    }
    if (t.hasAttribute && t.hasAttribute('data-tech-del')) {
      data.works[0].detail.techniques.splice(+t.getAttribute('data-tech-del'), 1);
      renderEditors();
    }
    if (t.hasAttribute && t.hasAttribute('data-skill-del')) {
      data.skills.splice(+t.getAttribute('data-skill-del'), 1);
      renderEditors();
    }
  });
  $('addWorkBtn').addEventListener('click', function () { openWorkEditor(-1); });

  /* ---------- Showreel 本地视频上传 ---------- */
  $('srUploadBtn').addEventListener('click', function () { $('srUploadFile').click(); });
  $('srUploadFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    uploadFile(f, $('srUploadTip'), function (url) {
      var el = document.querySelector('[data-bind="profile.showreel.video"]');
      if (el) el.value = url;
    }, 'video');
  });
  /* ---------- Showreel 封面 / 个人照片上传 ---------- */
  $('scUploadBtn').addEventListener('click', function () { $('scUploadFile').click(); });
  $('scUploadFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    uploadFile(f, $('scUploadTip'), function (url) {
      var el = document.querySelector('[data-bind="profile.showreel.cover"]');
      if (el) el.value = url;
    }, 'image');
  });
  $('ptUploadBtn').addEventListener('click', function () { $('ptUploadFile').click(); });
  $('ptUploadFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    uploadFile(f, $('ptUploadTip'), function (url) {
      var el = document.querySelector('[data-bind="profile.portrait"]');
      if (el) el.value = url;
    }, 'image');
  });

  /* ---------- 收集编辑器数据 ---------- */
  function collectEditors() {
    // 求职意向
    document.querySelectorAll('[data-intent-l]').forEach(function (el) {
      data.profile.intent[+el.getAttribute('data-intent-l')].label = el.value;
    });
    document.querySelectorAll('[data-intent-v]').forEach(function (el) {
      data.profile.intent[+el.getAttribute('data-intent-v')].value = el.value;
    });
    // 统计
    document.querySelectorAll('[data-stat-n]').forEach(function (el) {
      data.profile.stats[+el.getAttribute('data-stat-n')].num = el.value;
    });
    document.querySelectorAll('[data-stat-l]').forEach(function (el) {
      data.profile.stats[+el.getAttribute('data-stat-l')].label = el.value;
    });
    // 擅长方向
    document.querySelectorAll('[data-spec-n]').forEach(function (el) { data.specialties[+el.getAttribute('data-spec-n')].name = el.value; });
    document.querySelectorAll('[data-spec-i]').forEach(function (el) { data.specialties[+el.getAttribute('data-spec-i')].icon = el.value; });
    document.querySelectorAll('[data-spec-d]').forEach(function (el) { data.specialties[+el.getAttribute('data-spec-d')].desc = el.value; });
    document.querySelectorAll('[data-spec-t]').forEach(function (el) { data.specialties[+el.getAttribute('data-spec-t')].tags = el.value; });
    // 案例
    var d = data.works[0] && data.works[0].detail;
    if (d) {
      var bg = document.querySelector('[data-bind="caseBgParas"]');
      if (bg) d.bgParas = bg.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var tl = document.querySelector('[data-bind="caseTools"]');
      if (tl) d.tools = tl.value.split(/[，,]/).map(function (s) { return s.trim(); }).filter(Boolean);
      document.querySelectorAll('[data-ci-l]').forEach(function (el) { d.info[+el.getAttribute('data-ci-l')].label = el.value; });
      document.querySelectorAll('[data-ci-v]').forEach(function (el) { d.info[+el.getAttribute('data-ci-v')].value = el.value; });
      document.querySelectorAll('[data-te-n]').forEach(function (el) { d.techniques[+el.getAttribute('data-te-n')].num = el.value; });
      document.querySelectorAll('[data-te-t]').forEach(function (el) { d.techniques[+el.getAttribute('data-te-t')].name = el.value; });
      document.querySelectorAll('[data-te-d]').forEach(function (el) { d.techniques[+el.getAttribute('data-te-d')].desc = el.value; });
    }
    // 技能
    document.querySelectorAll('[data-sk-n]').forEach(function (el) { data.skills[+el.getAttribute('data-sk-n')].num = el.value; });
    document.querySelectorAll('[data-sk-t]').forEach(function (el) { data.skills[+el.getAttribute('data-sk-t')].name = el.value; });
    document.querySelectorAll('[data-sk-d]').forEach(function (el) { data.skills[+el.getAttribute('data-sk-d')].desc = el.value; });
    document.querySelectorAll('[data-sk-l]').forEach(function (el) { data.skills[+el.getAttribute('data-sk-l')].level = Math.max(0, Math.min(100, +el.value || 0)); });
    // 软件
    document.querySelectorAll('[data-so-g]').forEach(function (el) { data.software[+el.getAttribute('data-so-g')].glyph = el.value; });
    document.querySelectorAll('[data-so-n]').forEach(function (el) { data.software[+el.getAttribute('data-so-n')].name = el.value; });
    document.querySelectorAll('[data-so-l]').forEach(function (el) { data.software[+el.getAttribute('data-so-l')].level = el.value; });
    // 社交
    document.querySelectorAll('[data-sl-n]').forEach(function (el) { data.contact.socials[+el.getAttribute('data-sl-n')].name = el.value; });
    document.querySelectorAll('[data-sl-u]').forEach(function (el) { data.contact.socials[+el.getAttribute('data-sl-u')].url = el.value; });
  }

  /* ---------- 保存 ---------- */
  $('saveBtn').addEventListener('click', function () {
    readBinds();
    collectEditors();
    fetch('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); showLogin(); return; }
      return r.json();
    }).then(function (j) {
      if (j && j.ok) {
        var tip = $('saveTip');
        tip.classList.add('show');
        setTimeout(function () { tip.classList.remove('show'); }, 2000);
      } else if (j && j.error) {
        alert(j.error);
      }
    }).catch(function () { alert('保存失败，请检查网络后重试'); });
  });

  /* ---------- 修改密码 ---------- */
  $('changePwdBtn').addEventListener('click', function () {
    var o = $('oldPwd').value, n1 = $('newPwd').value, n2 = $('newPwd2').value;
    $('pwdErr').textContent = '';
    if (n1 !== n2) { $('pwdErr').textContent = '两次输入的新密码不一致'; return; }
    fetch('/api/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify({ oldPassword: o, newPassword: n1 })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          alert('密码修改成功，请使用新密码重新登录');
          localStorage.removeItem(TOKEN_KEY);
          showLogin();
        } else {
          $('pwdErr').textContent = res.j.error || '修改失败';
        }
      }).catch(function () { $('pwdErr').textContent = '网络错误，请重试'; });
  });

  /* ---------- 启动：已有 token 则直接进入 ---------- */
  if (token()) loadContent(); else showLogin();
})();

// ==UserScript==
// @name         人人热书 · 防跳转纯净阅读
// @namespace    https://local.antijump/
// @version      1.1.2
// @description  拦截小说站的点击劫持、强制跳转、弹窗广告、外站 iframe 与跳 App 广告，只留下正文和翻页按钮。悬浮球面板里可直接管理保护站点。
// @author       WorkBuddy
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/*
 * 设计思路（为什么不用去适配它的广告代码）：
 *   这类站的跳转手段就那么几种——① 把透明链接铺在正文上，点哪都跳；
 *   ② 点击时 window.open 弹新标签；③ 定时把 location.href 改到外站；
 *   ④ iframe / meta refresh 自动跳。所以只要守住"出站"这一个关口，
 *   不管它用什么写法都能挡住，站点改版也不会失效。
 *
 * 换书站或加镜像站：点右下角盾牌 → 面板「保护站点」里直接添加域名（保存在本地，无需改代码）。
 *
 * 说明：脚本会在所有网站加载（@match 全站），但只有「保护站点」列表里的域名
 * 才会真正启用防护；其他网站会在 1 毫秒内静默退出，不做任何事。
 *
 * 站点列表存放在脚本管理器的全局存储（GM_getValue/GM_setValue）里，所有网站
 * 共享同一份——所以在 A 站面板里添加的域名，在 B 站同样生效。
 * （浏览器自带的 localStorage 是按网站隔离的，做不到跨站共享，因此不用它。）
 */

(function () {
  'use strict';

  /* ============================================================
     0. 站点清单
        内置站在 SITES 里；用户自己添加的站存在脚本管理器的全局存储中
        （所有网站共享，盾牌面板里管理），两者合并生效。
        只写域名，不要写 http:// 或 www.
     ============================================================ */
  const SITES = [
    'renrenreshu.com',
    // 'renrenreshu.net',
    // 'renrenshu.cc',
  ];
  const SITES_KEY = 'AJ_SITES_V1';

  // ---------- 站点列表存储（跨网站共享） ----------
  // localStorage 按网站隔离（A 站存的 B 站读不到），所以用脚本管理器的
  // 全局存储（GM_getValue/GM_setValue）。没有 GM 环境时回退 localStorage；
  // 首次运行会把旧版存在 localStorage 里的数据自动迁移到全局存储。
  function parseSiteList(txt) {
    const out = [];
    if (!txt) return out;
    try {
      const v = JSON.parse(txt);
      if (Array.isArray(v)) {
        for (let j = 0; j < v.length; j++) {
          const s = v[j];
          if (typeof s === 'string' && s && out.indexOf(s) < 0) out.push(s);
        }
      }
    } catch (e) { }
    return out;
  }
  function readStoredSites() {
    let gm = '';
    try { if (typeof GM_getValue === 'function') gm = String(GM_getValue(SITES_KEY, '') || ''); } catch (e) { }
    if (gm) return parseSiteList(gm); // 已有全局数据：以它为准（删除过的站点不会从旧 local 数据里"复活"）
    let local = '';
    try { local = localStorage.getItem(SITES_KEY) || ''; } catch (e) { }
    return parseSiteList(local);      // 全局存储为空：从本域 localStorage 做一次性迁移
  }
  let userSites = readStoredSites();
  function saveUserSites() {
    const txt = JSON.stringify(userSites);
    try { if (typeof GM_setValue === 'function') GM_setValue(SITES_KEY, txt); } catch (e) { }
    try { localStorage.setItem(SITES_KEY, txt); } catch (e) { }
  }
  // 首次迁移：全局存储还没有数据时，把从 localStorage 迁移来的结果落盘
  try {
    if (typeof GM_setValue === 'function' && typeof GM_getValue === 'function' && !GM_getValue(SITES_KEY, '') && userSites.length) {
      GM_setValue(SITES_KEY, JSON.stringify(userSites));
    }
  } catch (e) { }
  function allSites() {
    const out = SITES.slice();
    for (let i = 0; i < userSites.length; i++) if (out.indexOf(userSites[i]) < 0) out.push(userSites[i]);
    return out;
  }

  // 把用户输入的网址整理成纯域名；不合法返回 null
  function normSite(v) {
    v = String(v || '').trim().toLowerCase();
    if (!v) return null;
    v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0].replace(/:\d+$/, '').trim();
    if (!v || v.length > 253 || !/^[a-z0-9.-]+$/.test(v)) return null;
    if (v.indexOf('.') < 1 || v.charAt(v.length - 1) === '.' || v.indexOf('..') !== -1) return null;
    return v;
  }

  const HOST = location.hostname.toLowerCase();
  const ACTIVE = allSites().some(function (s) { return HOST === s || HOST.endsWith('.' + s); });
  if (!ACTIVE) return; // 不是目标站点，脚本什么都不做

  /* ============================================================
     1. 配置（存在浏览器本地，关掉浏览器也记得住）
     ============================================================ */
  const KEY = 'AJ_CFG_V1';
  const DEFAULTS = { on: true, guard: true, ads: true, tip: true, ball: true, scheme: true };
  let cfg = Object.assign({}, DEFAULTS);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { } }

  /* ============================================================
     2. 地址判定：这个链接算不算"外站"
     ============================================================ */
  function hostAllowed(h) {
    h = String(h).toLowerCase();
    const list = allSites();
    return h === HOST || list.some(function (s) { return h === s || h.endsWith('.' + s); });
  }

  // 返回 'inner'    = 站内 / 相对地址 / javascript: 之类，放行
  //      'external' = 站外 http(s)，拦截
  //      'app'      = 跳 App 的外部协议（market://、taobao:// 等），受 scheme 开关控制
  const SAFE_SCHEMES = /^(javascript|mailto|tel|sms|about|blob|data|filesystem|chrome|file):/i;
  function classify(raw) {
    if (raw === undefined || raw === null || raw === '') return 'inner';
    raw = String(raw).trim();
    if (raw.charAt(0) === '#' || SAFE_SCHEMES.test(raw)) return 'inner';
    const m = raw.match(/^([a-z][a-z0-9+.-]*):/i);
    if (m) {
      const sc = m[1].toLowerCase();
      if (sc !== 'http' && sc !== 'https') return 'app';
    }
    let u;
    try { u = new URL(raw, location.href); } catch (e) { return 'inner'; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'app';
    return hostAllowed(u.hostname) ? 'inner' : 'external';
  }

  // 拦截判定：站外一律拦；跳 App 按开关
  function shouldBlock(raw) {
    const c = classify(raw);
    if (c === 'external') return true;
    return c === 'app' && cfg.scheme;
  }

  function hostOf(raw) {
    const s = String(raw);
    const m = s.match(/^\s*([a-z][a-z0-9+.-]*):/i);
    if (m && !/^https?$/i.test(m[1])) return m[1].toLowerCase() + '://';
    try { return new URL(raw, location.href).hostname; } catch (e) { return s.slice(0, 40); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============================================================
     3. 统计 / 提示
     ============================================================ */
  const stats = { n: 0, log: [], seen: {} };
  let ui = null;
  let toastFn = function () { };

  function record(kind, url) {
    if (classify(url) === 'app') kind = kind + '·App';
    const h = hostOf(url);
    const k = kind + '|' + h;
    const now = Date.now();
    if (stats.seen[k] && now - stats.seen[k] < 2000) return; // 同一目标 2 秒内只记一次，避免刷屏
    stats.seen[k] = now;
    stats.n++;
    stats.log.unshift({ kind: kind, host: h, t: new Date().toLocaleTimeString('zh-CN', { hour12: false }) });
    if (stats.log.length > 30) stats.log.length = 30;
    toastFn('已拦截' + kind + '：' + h);
    if (ui) ui.refresh();
  }

  function stopEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  /* ============================================================
     4. 第一道防线：API 层拦截（document-start 立即生效）
     ============================================================ */

  // 4.0 【主力】Navigation API —— 唯一能"真正取消"一次导航的官方机制。
  //     网页只要能跳转（点链接、改 location.href、meta refresh、表单提交……）
  //     都会先触发这个 navigate 事件，我们在这里把去往站外的直接 cancel 掉。
  //     Chrome / Edge 102 以上都支持，手机上百分百可用。
  const navApi = (window.navigation && typeof window.navigation.addEventListener === 'function')
    ? window.navigation : null;

  if (navApi) {
    try {
      navApi.addEventListener('navigate', function (e) {
        if (!cfg.on) return;
        const url = e.destination ? e.destination.url : '';
        if (!url) return;
        if (shouldBlock(url) && e.cancelable !== false) {
          e.preventDefault();      // 导航直接被取消，页面纹丝不动
          record(e.formData ? '表单跳转' : '跳转', url);
        }
      });
    } catch (e) { }
  }

  // 4.1 弹窗：window.open
  try {
    const rawOpen = window.open;
    window.open = function (url) {
      if (cfg.on && url && shouldBlock(url)) {
        record('弹窗', url);
        return null;
      }
      return rawOpen.apply(this, arguments);
    };
  } catch (e) { }

  // 4.2 强制跳转：location.assign / location.replace
  //     （location.href = ... 的赋值浏览器不允许被改写，但它同样会触发 4.0 的
  //      navigate 事件，所以一样会被取消）
  try {
    const proto = window.Location && window.Location.prototype;
    if (proto) {
      ['assign', 'replace'].forEach(function (fn) {
        if (!proto[fn]) return;
        const orig = proto[fn];
        proto[fn] = function (url) {
          if (cfg.on && url && shouldBlock(url)) {
            record('跳转', url);
            return;
          }
          return orig.apply(this, arguments);
        };
      });
    }
  } catch (e) { }

  // 说明：早期版本这里还包了一层 setTimeout 回调来对比 location.href，
  // 实测证明无效——旧文档里读 location.href 永远返回旧地址，
  // 直到文档被替换为止，根本检测不到跳转。改用上面的 Navigation API 后删掉。

  /* ============================================================
     5. 第二道防线：点击拦截
     ============================================================ */

  // 找出点击目标上（或其祖先上）内联 on* 属性里写着的外站地址
  function inlineJump(node) {
    let el = node, n = 0;
    while (el && el.nodeType === 1 && n++ < 10) {
      const attrs = el.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (a.name.length > 2 && a.name.charCodeAt(0) === 111 && a.name.charCodeAt(1) === 110 && /[a-z][a-z0-9+.-]*:\/\//i.test(a.value)) {
          const urls = a.value.match(/[a-z][a-z0-9+.-]*:\/\/[^\s'"()<>]+/gi) || [];
          for (let j = 0; j < urls.length; j++) if (shouldBlock(urls[j])) return urls[j];
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function onPointer(e) {
    if (!cfg.on) return;
    const path = e.composedPath ? e.composedPath() : (function () {
      const p = []; let n = e.target; while (n) { p.push(n); n = n.parentNode; } return p;
    })();

    for (let i = 0; i < path.length; i++) {
      const el = path[i];
      if (!el || el.nodeType !== 1) continue;
      if (el.tagName === 'A') {
        const marked = el.getAttribute('data-aj-blocked');
        if (marked) { stopEvent(e); record('点击', marked); return; }
        const raw = el.getAttribute('href');
        if (shouldBlock(raw)) { stopEvent(e); record('点击', raw); return; }
      }
    }

    const jump = inlineJump(e.target);
    if (jump) { stopEvent(e); record('内联脚本', jump); }
  }

  ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(function (t) {
    window.addEventListener(t, onPointer, true);
  });

  /* ============================================================
     6. 第三道防线：导航守卫（仅当浏览器不支持 Navigation API 时才需要）
        新版本 Chrome / Edge 走的是第 4.0 节，导航根本不会发生，轮不到这里。
        老浏览器上还能抢救一下：万一真被跳走了，100ms 内自动弹回来。
     ============================================================ */
  if (!navApi && cfg.guard) {
    let lastGood = location.href;
    setInterval(function () {
      const cur = location.href;
      if (classify(cur) === 'external') {
        if (!cfg.on || !cfg.guard) { lastGood = cur; return; }
        record('自动跳转', cur);
        try { location.replace(lastGood); } catch (e) { }
      } else {
        lastGood = cur;
      }
    }, 100);
  }

  /* ============================================================
     7. 页面清理：外站 iframe、广告位、全屏透明遮罩
     ============================================================ */
  const AD_RE = /(^|[^a-z])(ad|ads|adv|advert|advertise|banner|guanggao|gg|tuiguang|popup|floatad)([^a-z]|$)/i;

  function looksLikeAd(el) {
    const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
    if (!AD_RE.test(sig)) return false;
    if ((el.innerText || '').trim().length > 200) return false; // 有正文，别动
    let longP = 0;
    const ps = el.querySelectorAll('p');
    for (let i = 0; i < ps.length; i++) if ((ps[i].innerText || '').length > 80) longP++;
    return longP === 0;
  }

  function killAds() {
    if (!cfg.ads) return;

    // 7.1 外站 iframe（广告框基本都是外部域）
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      const f = iframes[i];
      const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
      if (src && shouldBlock(src)) f.remove();
    }

    // 7.2 广告容器（按 id / class 关键词，且不含正文）
    const cand = document.querySelectorAll('div,section,aside,ins,ul');
    for (let i = 0; i < cand.length; i++) {
      const el = cand[i];
      if (el.isConnected && looksLikeAd(el)) el.remove();
    }

    // 7.3 全屏透明遮罩（点了就跳的那种）
    const layers = document.querySelectorAll('body > div, body > a, body > section, body > aside');
    for (let i = 0; i < layers.length; i++) {
      const el = layers[i];
      if (!el.isConnected) continue;
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') continue;
      if ((parseInt(s.zIndex, 10) || 0) < 999) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.5) continue;
      if ((el.innerText || '').trim().length >= 40) continue; // 有文字说明是正常浮层
      if (el.querySelectorAll('*').length > 8) continue;      // 结构复杂，别乱删
      el.remove();
    }
  }

  /* ============================================================
     8. 站外链接"去激活"：长按也不会弹出"在新标签页打开"
     ============================================================ */
  function neutralizeLinks() {
    if (!cfg.on) return;
    const list = document.querySelectorAll('a[href]:not([data-aj-checked])');
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      a.setAttribute('data-aj-checked', '1');
      const raw = a.getAttribute('href');
      if (shouldBlock(raw)) {
        a.setAttribute('data-aj-blocked', a.href);
        a.setAttribute('href', 'javascript:void(0)');
        a.removeAttribute('target');
      }
    }
  }

  function restoreLinks() {
    const list = document.querySelectorAll('a[data-aj-blocked]');
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const orig = a.getAttribute('data-aj-blocked');
      if (cfg.on && shouldBlock(orig)) continue; // 按当前配置仍应拦截的保持冻结
      a.setAttribute('href', orig);
      a.removeAttribute('data-aj-blocked');
      a.removeAttribute('data-aj-checked');
    }
  }

  /* ============================================================
     9. meta refresh 自动跳转
     ============================================================ */
  function killMetaRefresh() {
    const metas = document.querySelectorAll('meta[http-equiv]');
    for (let i = 0; i < metas.length; i++) {
      const m = metas[i];
      if (!/^refresh$/i.test(m.getAttribute('http-equiv') || '')) continue;
      const content = m.getAttribute('content') || '';
      const url = content.replace(/^\s*[\d.]+\s*;\s*url\s*=\s*/i, '').replace(/^['"]|['"]$/g, '');
      if (url && shouldBlock(url)) {
        m.remove();
        record('meta', url);
      }
    }
  }

  /* ============================================================
     10. 批量执行 + 定时巡检
     ============================================================ */
  function sweep() {
    try { neutralizeLinks(); } catch (e) { }
    try { killMetaRefresh(); } catch (e) { }
    try { killAds(); } catch (e) { }
  }

  let moTimer = 0;
  try {
    const mo = new MutationObserver(function () {
      if (moTimer) return;
      moTimer = setTimeout(function () { moTimer = 0; sweep(); }, 400);
    });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
  } catch (e) { }

  function startSweeps() {
    let n = 0;
    const fast = setInterval(function () {
      sweep();
      n++;
      if (n >= 15) clearInterval(fast); // 前 15 秒每秒扫一次
    }, 1000);
    setInterval(sweep, 3000);           // 之后每 3 秒一次
  }

  /* ============================================================
     11. 界面：右下角悬浮球 + 控制面板（Shadow DOM 隔离，不受站点样式影响）
     ============================================================ */
  const SHADOW_HTML = [
    '<style>',
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.ball{position:fixed;right:10px;bottom:calc(84px + env(safe-area-inset-bottom));width:42px;height:42px;border-radius:50%;',
    'background:rgba(28,30,35,.82);color:#7ee2b8;display:flex;align-items:center;justify-content:center;font-size:19px;',
    'box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}',
    '.ball.off{color:#8b8f98}',
    '.panel{position:fixed;right:10px;bottom:calc(134px + env(safe-area-inset-bottom));width:min(330px,calc(100vw - 20px));',
    'max-height:62vh;overflow:auto;background:#1c1e23;color:#e6e8ec;border:1px solid #33363d;border-radius:14px;',
    'box-shadow:0 8px 30px rgba(0,0,0,.5);padding:12px 14px;font-size:13px;line-height:1.6}',
    '.panel[hidden]{display:none}',
    '.head{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600;margin-bottom:4px}',
    '.close{cursor:pointer;color:#9aa0aa;padding:0 6px;font-size:20px;line-height:1}',
    '.stat{color:#9aa0aa;margin-bottom:8px;font-size:12px}',
    '.stat b{color:#7ee2b8;font-size:16px;margin:0 2px}',
    '.opt{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid #2a2d33;font-size:13px}',
    '.opt input{width:17px;height:17px;flex:none;accent-color:#7ee2b8}',
    '.log{margin-top:8px;border-top:1px solid #2a2d33;padding-top:6px;max-height:24vh;overflow:auto}',
    '.row{display:flex;gap:6px;font-size:12px;color:#b8bdc6;padding:3px 0}',
    '.row .k{color:#f0a04b;flex:none}',
    '.row .h{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.row .t{color:#6f757f;flex:none}',
    '.empty{color:#6f757f;font-size:12px}',
    '.sites{border-top:1px solid #2a2d33;margin-top:8px;padding-top:8px}',
    '.sites-t{font-size:12px;color:#9aa0aa;margin-bottom:2px}',
    '.site-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;font-size:12.5px}',
    '.site-row .tag{font-size:10px;color:#6f757f;border:1px solid #3a3e46;border-radius:6px;padding:0 5px;flex:none}',
    '.site-row .del{flex:none;cursor:pointer;color:#f0a04b;font-size:12px;padding:1px 6px}',
    '.sites-add{display:flex;gap:6px;margin-top:6px}',
    '.sites-add input{flex:1;min-width:0;background:#262a30;border:1px solid #3a3e46;border-radius:8px;color:#e6e8ec;font-size:12px;padding:7px 9px;outline:none}',
    '.sites-add input::placeholder{color:#6f757f}',
    '.sites-add button{flex:none;padding:7px 12px;border-radius:8px;border:1px solid #3a5a4a;background:#22382f;color:#9fdec4;font-size:12px}',
    '.sites-tip{font-size:11px;color:#6f757f;margin-top:5px;line-height:1.5}',
    '.btns{display:flex;gap:8px;margin-top:10px}',
    '.btns button{flex:1;padding:9px;border-radius:9px;border:1px solid #3a3e46;background:#262a30;color:#dfe3e9;font-size:12px}',
    '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom));',
    'background:rgba(28,30,35,.94);color:#f3f4f7;border:1px solid #3a3e46;border-radius:10px;padding:7px 12px;font-size:12px;',
    'max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .18s;pointer-events:none}',
    '.toast.show{opacity:1}',
    '.toast[hidden]{display:none}',
    '</style>',
    '<div class="ball" id="ball">&#128737;</div>',
    '<div class="panel" id="panel" hidden>',
    '  <div class="head"><span>防跳转守卫</span><span class="close" id="close">&times;</span></div>',
    '  <div class="stat">已拦截 <b id="n">0</b> 次外部跳转<br><span id="mode"></span></div>',
    '  <label class="opt"><input type="checkbox" data-k="on">  拦截点击 / 弹窗 / 强制跳转</label>',
    '  <label class="opt"><input type="checkbox" data-k="guard">  兜底守卫（老浏览器用）</label>',
    '  <label class="opt"><input type="checkbox" data-k="ads">  清理广告位与外站 iframe</label>',
    '  <label class="opt"><input type="checkbox" data-k="tip">  拦截时显示提示</label>',
    '  <label class="opt"><input type="checkbox" data-k="ball">  显示这个悬浮球</label>',
    '  <label class="opt"><input type="checkbox" data-k="scheme">  拦截跳 App（taobao:// 等）</label>',
    '  <div class="sites">',
    '    <div class="sites-t">保护站点：</div>',
    '    <div id="sites-list"></div>',
    '    <div class="sites-add"><input id="site-input" type="text" placeholder="xxx.com，多个用逗号分隔"><button id="site-add">添加</button></div>',
    '    <div class="sites-tip">添加后，到对应网站刷新页面即生效。</div>',
    '  </div>',
    '  <div class="log" id="log"></div>',
    '  <div class="btns"><button data-a="diag">复制诊断信息</button><button data-a="clear">清空记录</button></div>',
    '</div>',
    '<div class="toast" id="toast" hidden></div>'
  ].join('');

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); return true; }
    } catch (e) { }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) { return false; }
  }

  function buildUI() {
    if (ui || !document.documentElement) return;

    const root = document.createElement('div');
    root.id = 'aj-root';
    root.style.cssText = 'all:initial;position:fixed;z-index:2147483600;left:0;top:0;width:0;height:0;';
    document.documentElement.appendChild(root);

    const sh = root.attachShadow({ mode: 'open' });
    sh.innerHTML = SHADOW_HTML;

    const ball = sh.getElementById('ball');
    const panel = sh.getElementById('panel');
    const toastEl = sh.getElementById('toast');
    const nEl = sh.getElementById('n');
    const logEl = sh.getElementById('log');
    let toastTimer = 0;

    toastFn = function (msg) {
      if (!cfg.tip) return;
      toastEl.textContent = msg;
      toastEl.hidden = false;
      requestAnimationFrame(function () { toastEl.classList.add('show'); });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.remove('show');
        setTimeout(function () { toastEl.hidden = true; }, 220);
      }, 1700);
    };

    function refresh() {
      nEl.textContent = stats.n;
      sh.getElementById('mode').textContent = navApi
        ? '拦截模式：Navigation API（导航级，最彻底）'
        : '拦截模式：兼容模式（建议升级 Edge）';
      const boxes = sh.querySelectorAll('input[data-k]');
      for (let i = 0; i < boxes.length; i++) {
        const k = boxes[i].getAttribute('data-k');
        boxes[i].checked = !!cfg[k];
      }
      ball.style.display = cfg.ball ? 'flex' : 'none';
      ball.className = 'ball' + (cfg.on ? '' : ' off');
      if (!stats.log.length) {
        logEl.innerHTML = '<div class="empty">还没有拦截记录</div>';
      } else {
        logEl.innerHTML = stats.log.slice(0, 15).map(function (r) {
          return '<div class="row"><span class="k">' + esc(r.kind) + '</span><span class="h">' +
            esc(r.host) + '</span><span class="t">' + esc(r.t) + '</span></div>';
        }).join('');
      }
      renderSites();
    }

    function copyDiag() {
      const L = [];
      L.push('【防跳转诊断报告】');
      L.push('页面: ' + location.href);
      L.push('站点清单: ' + allSites().join(', '));
      L.push('已拦截: ' + stats.n + ' 次');
      L.push('配置: ' + JSON.stringify(cfg));
      L.push('');
      L.push('最近拦截:');
      stats.log.slice(0, 10).forEach(function (r) { L.push('  - ' + r.t + ' ' + r.kind + ' ' + r.host); });

      const ext = [];
      document.querySelectorAll('a[href]').forEach(function (a) {
        const h = hostOf(a.getAttribute('href') || '');
        if (h && /\./.test(h) && !hostAllowed(h) && ext.indexOf(h) < 0) ext.push(h);
      });
      L.push('');
      L.push('页面里的外站链接域名(' + ext.length + '): ' + ext.slice(0, 25).join(', '));

      const scr = [];
      document.querySelectorAll('script[src]').forEach(function (s) {
        if (classify(s.getAttribute('src')) === 'external') scr.push(s.src);
      });
      L.push('');
      L.push('外站脚本(' + scr.length + '):');
      scr.slice(0, 15).forEach(function (s) { L.push('  ' + s); });

      const ad = [];
      document.querySelectorAll('[id],[class]').forEach(function (el) {
        const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
        if (!AD_RE.test(sig)) return;
        const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
          (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        if (ad.indexOf(tag) < 0 && ad.length < 30) ad.push(tag);
      });
      L.push('');
      L.push('疑似广告容器: ' + (ad.length ? ad.join(' | ') : '无'));

      copyText(L.join('\n'));
      toastFn('诊断信息已复制，可直接粘贴发给开发者');
    }

    ball.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) refresh();
    });
    sh.getElementById('close').addEventListener('click', function () { panel.hidden = true; });

    sh.addEventListener('change', function (e) {
      const k = e.target && e.target.getAttribute && e.target.getAttribute('data-k');
      if (!k) return;
      cfg[k] = !!e.target.checked;
      saveCfg();
      if ((k === 'on' && !cfg.on) || (k === 'scheme' && !cfg.scheme)) restoreLinks();
      sweep();
      refresh();
    });

    sh.querySelector('[data-a="clear"]').addEventListener('click', function () {
      stats.log = []; stats.n = 0; stats.seen = {}; refresh();
    });
    sh.querySelector('[data-a="diag"]').addEventListener('click', copyDiag);

    // ---- 站点管理 ----
    function renderSites() {
      const box = sh.getElementById('sites-list');
      if (!box) return;
      const list = allSites();
      box.innerHTML = list.map(function (s) {
        const builtin = SITES.indexOf(s) >= 0;
        return '<div class="site-row"><span>' + esc(s) + '</span>' +
          (builtin ? '<span class="tag">内置</span>' : '<span class="del" data-s="' + esc(s) + '">删除</span>') +
          '</div>';
      }).join('') || '<div class="empty">暂无</div>';
    }

    function addSitesFromInput() {
      const inp = sh.getElementById('site-input');
      if (!inp) return;
      const parts = String(inp.value || '').split(/[\s,，;；]+/);
      let added = 0, dup = 0, bad = 0;
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        const s = normSite(parts[i]);
        if (!s) { bad++; continue; }
        if (allSites().indexOf(s) >= 0) { dup++; continue; }
        userSites.push(s); added++;
      }
      if (added) saveUserSites();
      inp.value = '';
      renderSites();
      if (added) toastFn('已添加 ' + added + ' 个站点，到该网站刷新生效');
      else if (dup) toastFn('已在列表中');
      else if (bad) toastFn('格式不对：只填域名，如 xxx.com');
    }

    sh.getElementById('site-add').addEventListener('click', addSitesFromInput);
    sh.getElementById('site-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addSitesFromInput(); }
    });
    sh.getElementById('sites-list').addEventListener('click', function (e) {
      const s = e.target && e.target.getAttribute && e.target.getAttribute('data-s');
      if (!s) return;
      userSites = userSites.filter(function (x) { return x !== s; });
      saveUserSites();
      renderSites();
      toastFn('已移除：' + s);
    });

    ui = { refresh: refresh };
    refresh();
  }

  /* ============================================================
     12. 启动
     ============================================================ */
  sweep(); // 先跑一遍（此时页面还很空，主要是装好 observer）

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      buildUI();
      sweep();
      startSweeps();
    });
  } else {
    buildUI();
    sweep();
    startSweeps();
  }
})();

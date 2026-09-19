// Yituo Studio 前端 SPA — 原创实现
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $('#main');

/* ---------------- 状态 ---------------- */
const keysUrl = () => (state.user && state.user.apiBase ? state.user.apiBase : (state.config.apiBases || ['https://www.ydata.space'])[0]) + '/keys';
const state = { user: null, lastResult: null, config: { models: ['gpt-image-2'], apiBases: ['https://www.ydata.space', 'https://vip.ydata.space'], workTtlDays: 7, sizes: [], qualities: [] } };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-cache', ...opts });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => Number(n).toLocaleString('en-US');

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), ms);
}

/* ---------------- 主题 ---------------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  const label = $('#themeBtn .theme-label');
  if (label) label.textContent = dark ? '亮色模式' : '暗色模式';
}
$('#themeBtn').onclick = () => applyTheme(!document.documentElement.classList.contains('dark'));
applyTheme(localStorage.getItem('theme') === 'dark');

/* ---------------- 登录态 ---------------- */
async function refreshMe() {
  try {
    const d = await api('/api/auth/me');
    state.user = d.user;
  } catch (_) { state.user = null; }
  $('#settingsLink').style.display = state.user ? '' : 'none';
  $('#loginLink').style.display = state.user ? 'none' : '';
  renderNavActive();
}
$('#loginLink').onclick = () => openAuth('login');

/* ---------------- 路由 ---------------- */
const routes = { '/': pageHome, '/generate': pageStudio, '/assets': pageAssets, '/logs': pageLogs, '/docs': pageDocs, '/about': pageAbout, '/settings': pageSettings };
function nav() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  (routes[path] || pageHome)();
  renderNavActive(path);
}
function renderNavActive(path = location.pathname) {
  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === path));
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault();
  history.pushState(null, '', a.getAttribute('href'));
  nav();
  window.scrollTo(0, 0);
});
window.addEventListener('popstate', nav);

/* ---------------- 首页 ---------------- */
function tr(s, n) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
async function pageHome() {
  main.innerHTML = `
  <div class="page">
    <div class="rings"></div>
    <div class="page-head"><span class="brand-name">Y Data Img Studio</span><span class="brand-badge">AI 生图工作台</span></div>
    <section class="hero">
      <div>
        <h1>让想象，<br /><span class="grad">抵达眼前。</span></h1>
        <p class="lead">写下一句话，把脑海里的光影、人物与故事，认真画成一张图。绑定你的 Y Data 密钥即可使用，支持参考图改图、任意尺寸与透明背景。</p>
        <div class="hero-actions">
          <button class="btn primary" id="goStudio">开始创作 <span class="arr">→</span></button>
          <a class="btn ghost" href="#gallery">浏览灵感 ↓</a>
        </div>
        <div class="stats">
          <div class="stat"><b>3</b><span>已接入模型</span></div>
          <div class="stat"><b id="statWorks">–</b><span>已生成作品</span></div>
          <div class="stat"><b id="statAvg">–</b><span>平均出片</span></div>
        </div>
      </div>
      <div class="showcase-card" id="showcase"></div>
    </section>

    <section class="section" id="gallery">
      <h2>我们的作品</h2>
      <p class="sub">精选画作展示 · 感受一下你能画出的样子。</p>
      <div class="gallery-grid" id="galleryGrid"></div>
    </section>

    <section class="section" id="starts">
      <h2>从一个起点开始</h2>
      <p class="sub">点任意一张，自动进入工作台并预填提示词。</p>
      <div class="bento-grid" id="bentoGrid"></div>
    </section>

    <section class="section">
      <h2>模型 · 已接入</h2>
      <p class="sub">三款模型经由 Y Data 平台双线路供能 · 支持文生图与参考图改图。</p>
      <div class="models">
        <div class="model-chip"><div class="m-dot">G</div><div><b>gpt-image-2</b><br /><span>文生图 · 参考图改图 · 透明背景</span></div></div>
        <div class="model-chip"><div class="m-dot">F</div><div><b>gpt-image-2.5-flare</b><br /><span>2.5 系列 · 炫光渲染</span></div></div>
        <div class="model-chip"><div class="m-dot">S</div><div><b>gpt-image-2.5-sunburst</b><br /><span>2.5 系列 · 旭日渲染</span></div></div>
      </div>
    </section>

    <section class="cta-band">
      <h3>灵感不必完整，<br />先让它出现。</h3>
      <p>从一句话、一张参考图开始，慢慢接近你真正想要的画面。</p>
      <button class="btn primary" id="goStudio2">进入工作台 <span class="arr">→</span></button>
    </section>
    <div class="site-footer">Y Data Img Studio · AI 图像创作工作台 · 由 Y Data 提供<br />首页作品展示经 <a href="https://img.junliai.org/" target="_blank" rel="noopener">Junli Studio</a> 授权同步</div>
  </div>`;
  $('#goStudio').onclick = $('#goStudio2').onclick = () => { history.pushState(null, '', '/generate'); nav(); window.scrollTo(0, 0); };
  main.querySelectorAll('.hero-actions .ghost').forEach((a) => a.onclick = (e) => { e.preventDefault(); $('#gallery').scrollIntoView({ behavior: 'smooth' }); });

  api('/api/stats').then((d) => {
    $('#statWorks').textContent = fmtNum(d.works);
    $('#statAvg').textContent = d.avgSec ? d.avgSec + 's' : '–';
  }).catch(() => {});

  // 首页展示内容：来自作品同步（hero 大卡 / work 作品墙 / bento 起点卡片）
  api('/api/showcase').then((sc) => {
    const hero = (sc.hero || [])[0];
    $('#showcase').innerHTML = hero ? `
      <img src="${esc(hero.image)}" alt="${esc(hero.title)}" />
      <span class="live">L I V E</span>
      <div class="sc-overlay">
        <span class="sc-tag">${esc(hero.title || '最新出片')}</span>
        <p class="sc-prompt">${esc(tr(hero.prompt, 130))}</p>
      </div>` : `<div class="sc-empty">第一幅画还等你来画 ✨</div>`;

    const works = sc.work || [];
    $('#galleryGrid').innerHTML = works.length
      ? works.map((w) => `
        <button class="g-card" data-prompt="${esc(w.prompt || w.title || '')}" title="${esc(w.title || '进入工作台')}">
          <img src="${esc(w.image)}" loading="lazy" alt="${esc(w.title || '作品')}" />
          ${w.title || w.prompt ? `<div class="g-body"><div class="g-title">${esc(w.title || tr(w.prompt, 16))}</div>${w.prompt ? `<div class="g-prompt">${esc(tr(w.prompt, 60))}</div>` : ''}</div>` : ''}
        </button>`).join('')
      : `<div class="empty-tip" style="grid-column:1/-1">作品同步中，稍后再来看看。</div>`;

    const bento = sc.bento || [];
    $('#bentoGrid').innerHTML = bento.length
      ? bento.map((b) => `
        <button class="b-card" data-prompt="${esc(b.prompt || '')}">
          <img src="${esc(b.image)}" loading="lazy" alt="${esc(b.title)}" />
          <span class="b-go">→</span>
          <div class="b-overlay"><div class="b-title">${esc(b.title)}</div>${b.prompt ? `<div class="b-prompt">${esc(tr(b.prompt, 64))}</div>` : ''}</div>
        </button>`).join('')
      : `<div class="empty-tip" style="grid-column:1/-1">起点卡片同步中。</div>`;

    $$('#galleryGrid .g-card, #bentoGrid .b-card').forEach((c) => c.onclick = () => {
      if (c.dataset.prompt) sessionStorage.setItem('prefill', c.dataset.prompt);
      history.pushState(null, '', '/generate'); nav(); window.scrollTo(0, 0);
    });
  }).catch(() => {
    $('#showcase').innerHTML = `<div class="sc-empty">第一幅画还等你来画 ✨</div>`;
    $('#galleryGrid').innerHTML = `<div class="empty-tip" style="grid-column:1/-1">加载失败，稍后再试。</div>`;
    $('#bentoGrid').innerHTML = `<div class="empty-tip" style="grid-column:1/-1">加载失败，稍后再试。</div>`;
  });
}

/* ---------------- 工作台 ---------------- */
async function pageStudio() {
  if (!state.user) { openAuth('login'); }
  const sizes = [['1024x1024', '方形 1:1'], ['1536x1024', '横版 3:2'], ['1024x1536', '竖版 2:3'], ['2048x1152', '宽幅 16:9'], ['2048x2048', '大图 1:1'], ['auto', '自动']];
  const qualities = [['auto', '自动'], ['low', '草稿（快）'], ['medium', '标准'], ['high', '精细']];
  const models = state.config.models || ['gpt-image-2'];
  const modelNames = { 'gpt-image-2': '标准版', 'gpt-image-2.5-flare': '炫光版', 'gpt-image-2.5-sunburst': '旭日版' };
  main.innerHTML = `
  <div class="page">
    <div class="page-head"><span class="brand-name">创作工作台</span><span class="brand-badge">文生图 · 参考图改图</span></div>
    <div class="studio">
      <div>
        <div class="panel">
          <div class="field">
            <label>画面描述</label>
            <textarea id="prompt" placeholder="例：一只戴草帽的熊猫在竹林里喝茶，晨雾弥漫，电影感光线，细节丰富"></textarea>
          </div>
          <div class="field">
            <label>参考图（可选，最多 4 张，上传后走改图模式）</label>
            <div class="refs" id="refs">
              <button class="ref-add" id="refAdd" type="button">＋</button>
            </div>
            <input type="file" id="refFile" accept="image/png,image/jpeg,image/webp" multiple hidden />
          </div>
          <div class="field"><label>模型</label>
            <select id="model">${models.map((m) => `<option value="${esc(m)}">${esc(m)}${modelNames[m] ? ' · ' + modelNames[m] : ''}</option>`).join('')}</select>
          </div>
          <div class="row2">
            <div class="field"><label>尺寸</label><select id="size">${sizes.map(([v, t]) => `<option value="${v}">${t}${v !== 'auto' ? ' · ' + v : ''}</option>`).join('')}</select></div>
            <div class="field"><label>质量</label><select id="quality">${qualities.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
          </div>
          <div class="row2">
            <div class="field"><label>数量</label><select id="count">${[1, 2, 3, 4].map((i) => `<option value="${i}">${i} 张</option>`).join('')}</select></div>
            <div class="field"><label>格式</label><select id="fmt"><option value="png">PNG</option><option value="jpeg">JPEG（更小）</option><option value="webp">WebP</option></select></div>
          </div>
          <button class="btn primary block" id="genBtn">开始生成</button>
          <div class="gen-cost" id="genCost"></div>
          <div class="gen-cost">⚠️ 图片仅保留 ${state.config.workTtlDays || 7} 天，到期自动删除，请及时下载</div>
          ${state.user && !state.user.hasKey ? `
          <div class="key-banner">
            🔑 还未绑定 Y Data API 密钥，无法生成。
            <a href="/settings" data-nav="/settings">去设置绑定 →</a>
          </div>` : ''}
        </div>
      </div>
      <div>
        <div class="panel result-area" id="resultArea">
          <div class="result-empty"><span class="big">🖼️</span><span>${state.user ? (state.user.hasKey ? '左边写下描述，点「开始生成」' : '先在设置页绑定密钥，然后回来创作') : '登录后开始创作'}</span></div>
        </div>
        <div class="panel">
          <b style="font-size:14.5px">我的作品</b>
          <div id="myWorks" style="margin-top:12px"></div>
        </div>
      </div>
    </div>
  </div>`;

  // 恢复上一次生成的结果（切走菜单再回来，结果区不丢）
  const last = loadLastResult();
  if (last && last.images && last.images.length) {
    renderResult(last, '上次生成 · ' + timeAgo(last.at || Date.now()));
  }

  const refs = [];
  const renderRefs = () => {
    $('#refs').innerHTML = refs.map((r, i) => `<div class="ref-item"><img src="${r}" /><button class="rm" data-i="${i}">✕</button></div>`).join('') + `<button class="ref-add" id="refAdd" type="button">＋</button>`;
    $('#refAdd').onclick = () => $('#refFile').click();
    $$('#refs .rm').forEach((b) => b.onclick = () => { refs.splice(Number(b.dataset.i), 1); renderRefs(); });
  };
  $('#refAdd').onclick = () => $('#refFile').click();
  $('#refFile').onchange = async (e) => {
    for (const f of e.target.files) {
      if (refs.length >= 4) break;
      refs.push(await fileToDataURL(f));
    }
    e.target.value = ''; renderRefs();
  };
  const cost = () => {
    $('#genCost').textContent = state.user
      ? (state.user.hasKey ? `本次 ${Number($('#count').value)} 张 · 费用直接从你的 Y Data 账户扣除` : '绑定密钥后即可生成')
      : '登录并绑定密钥后即可生成';
  };
  cost();
  window._studioCost = cost;

  const prefill = sessionStorage.getItem('prefill');
  if (prefill) { $('#prompt').value = prefill; sessionStorage.removeItem('prefill'); }

  $('#genBtn').onclick = () => generate();

  loadMyWorks();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function loadMyWorks() {
  if (!state.user) return;
  try {
    const d = await api('/api/my/works');
    const el = $('#myWorks');
    if (!el) return;
    const works = (d.works || []).filter((w) => w.status === 'done' && w.images && w.images.length);
    const MAX = 16; // 一排 8 张，最多 2 排
    const show = works.slice(0, MAX);
    el.innerHTML = works.length
      ? `<div class="works-grid">${show.map((w) => `
          <figure class="w-thumb"><img class="zoomable" src="${esc(w.images[0])}" loading="lazy" /><span class="w-cap">${esc(w.prompt.slice(0, 16))}${w.prompt.length > 16 ? '…' : ''}</span></figure>`).join('')}
          ${works.length > MAX ? `<button class="works-more" id="worksMore"><span class="dot">⋯</span>查看更多<span class="cnt">共 ${works.length} 张</span></button>` : ''}</div>`
      : `<div class="empty-tip" style="grid-column:1/-1">还没有自己的作品，画一张试试。</div>`;
    // 点击缩略图空白处 → 在结果区完整呈现（图片点击交给 lightbox 放大）
    $$('#myWorks .w-thumb').forEach((f, i) => f.addEventListener('click', (e) => {
      if (e.target.closest('img.zoomable')) return;
      const w = show[i];
      if (!w) return;
      renderResult(w, '生成时间 · ' + fmtTime(w.createdAt));
      const area = $('#resultArea');
      if (area) area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    const more = $('#worksMore');
    if (more) more.onclick = () => { history.pushState(null, '', '/assets'); nav(); window.scrollTo(0, 0); };
  } catch (_) {}
}

async function generate() {
  if (!state.user) { openAuth('login'); return; }
  const prompt = $('#prompt').value.trim();
  if (!prompt) { toast('先写下画面描述吧'); return; }
  const n = Number($('#count').value);
  const refs = $$('#refs .ref-item img').map((i) => i.src).filter((s) => s.startsWith('data:'));
  const btn = $('#genBtn');
  btn.disabled = true;
  const area = $('#resultArea');
  const t0 = Date.now();
  area.innerHTML = `
  <div class="gen-status">
    <div class="gen-steps" id="genSteps">
      <div class="g-step"><span class="gs-num">1</span><span class="gs-txt">解析画面描述</span></div>
      <div class="g-step"><span class="gs-num">2</span><span class="gs-txt">构思构图与光影</span></div>
      <div class="g-step"><span class="gs-num">3</span><span class="gs-txt">绘制主体与细节</span></div>
      <div class="g-step"><span class="gs-num">4</span><span class="gs-txt">润色收尾出图</span></div>
    </div>
    <div class="gen-elapsed"><span class="spinner"></span><span id="elapsed">已用时 0s · 一般 20–120 秒出图</span></div>
  </div>`;
  const renderSteps = (sec) => {
    const cur = sec < 8 ? 1 : sec < 20 ? 2 : sec < 45 ? 3 : 4;
    $$('#genSteps .g-step').forEach((el, i) => {
      const s = i + 1;
      const num = el.querySelector('.gs-num');
      el.classList.toggle('done', s < cur);
      el.classList.toggle('active', s === cur);
      if (s < cur) num.textContent = '✓';
      else if (s === cur) num.textContent = '';
      else num.textContent = String(s);
    });
  };
  renderSteps(0);
  const timer = setInterval(() => {
    const sec = Math.round((Date.now() - t0) / 1000);
    const e = $('#elapsed');
    if (e) e.textContent = `已用时 ${sec}s · 一般 20–120 秒出图`;
    renderSteps(sec);
  }, 1000);
  try {
    const { jobId } = await api('/api/generate', { method: 'POST', body: JSON.stringify({ model: $('#model') ? $('#model').value : undefined, prompt, size: $('#size').value, quality: $('#quality').value, n, outputFormat: $('#fmt').value, refs }) });
    if (window._studioCost) window._studioCost();
    await pollJob(jobId, area, t0);
    refreshMe(); loadMyWorks();
  } catch (e) {
    area.innerHTML = `<div class="gen-err">⚠️ ${esc(e.message)}${/绑定.*密钥|请先绑定/.test(e.message) ? '<br /><a href="/settings" data-nav="/settings" style="font-weight:700">去设置绑定密钥 →</a>' : ''}</div>`;
  } finally {
    clearInterval(timer);
    btn.disabled = false;
  }
}
/* 结果呈现 + 最后一次生成的持久化（切走再回来仍显示） */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}
function renderResult(work, label) {
  const area = $('#resultArea');
  if (!area) return;
  area.innerHTML = `
    ${label ? `<div class="result-label">${esc(label)}</div>` : ''}
    <div class="result-grid">${work.images.map((u) => `
      <figure><img class="zoomable" src="${esc(u)}" loading="lazy" /><figcaption><span>${Math.round((work.elapsedMs || 0) / 1000) || ''}${work.elapsedMs ? 's' : ''}</span><a href="${esc(u)}" download target="_blank">下载</a></figcaption></figure>`).join('')}
    </div>`;
}
function saveLastResult(work) {
  state.lastResult = work;
  try { sessionStorage.setItem('lastResult', JSON.stringify(work)); } catch (_) {}
}
function loadLastResult() {
  if (state.lastResult) return state.lastResult;
  try { return JSON.parse(sessionStorage.getItem('lastResult') || 'null'); } catch (_) { return null; }
}
async function pollJob(jobId, area, t0) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await api('/api/jobs/' + jobId);
    if (d.status === 'done') {
      const work = { images: d.images, elapsedMs: d.elapsedMs || (Date.now() - t0), at: Date.now() };
      saveLastResult(work);
      renderResult(work, '上次生成 · ' + timeAgo(work.at));
      return;
    }
    if (d.status === 'error') {
      area.innerHTML = `<div class="gen-err">⚠️ ${esc(d.error || '生成失败')}<br /><small style="opacity:.75">失败不扣费；请核对密钥有效性与 Y Data 余额后重试</small></div>`;
      return;
    }
  }
}

/* ---------------- 资产 ---------------- */
const daysLeft = (expiresAt) => Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400e3));
const fmtTime = (ts) => new Date(ts + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);
async function pageAssets() {
  if (!state.user) { pageHome(); openAuth('login'); return; }
  main.innerHTML = `
  <div class="page">
    <div class="page-head"><span class="brand-name">我的资产</span><span class="brand-badge">生成的图片</span></div>
    <div class="warn-banner">⚠️ <b>图片仅保留 ${state.config.workTtlDays || 7} 天</b>，到期自动永久删除且无法恢复——请及时下载保存重要图片。</div>
    <div class="gallery-grid" id="assetsGrid"><div class="empty-tip" style="grid-column:1/-1">加载中…</div></div>
  </div>`;
  try {
    const d = await api('/api/my/works');
    const works = (d.works || []).filter((w) => w.status === 'done' && w.images.length);
    $('#assetsGrid').innerHTML = works.length ? works.map((w) => `
      <figure class="g-card asset-card" style="cursor:zoom-in">
        <img class="zoomable" src="${esc(w.images[0])}" loading="lazy" />
        <span class="expire-badge ${daysLeft(w.expiresAt) <= 2 ? 'urgent' : ''}">剩 ${daysLeft(w.expiresAt)} 天</span>
        <div class="g-body">
          <div class="g-prompt">${esc(tr(w.prompt, 40))}</div>
          <div class="asset-actions">
            <a href="${esc(w.images[0])}" download target="_blank">下载</a>
            <span>${w.images.length > 1 ? w.images.length + ' 张 · ' : ''}${fmtTime(w.createdAt)}</span>
          </div>
        </div>
      </figure>`).join('')
      : `<div class="empty-tip" style="grid-column:1/-1">还没有生成过图片。去工作台画第一张吧。</div>`;
    // 多图作品：其余图片也展示
    const extras = works.flatMap((w) => w.images.slice(1).map((u) => ({ u, w })));
    if (extras.length) {
      $('#assetsGrid').insertAdjacentHTML('beforeend', extras.map(({ u, w }) => `
        <figure class="g-card asset-card" style="cursor:zoom-in">
          <img class="zoomable" src="${esc(u)}" loading="lazy" />
          <span class="expire-badge ${daysLeft(w.expiresAt) <= 2 ? 'urgent' : ''}">剩 ${daysLeft(w.expiresAt)} 天</span>
          <div class="g-body"><div class="asset-actions"><a href="${esc(u)}" download target="_blank">下载</a><span>${fmtTime(w.createdAt)}</span></div></div>
        </figure>`).join(''));
    }
  } catch (e) {
    $('#assetsGrid').innerHTML = `<div class="empty-tip" style="grid-column:1/-1">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------------- 日志 ---------------- */
async function pageLogs() {
  if (!state.user) { pageHome(); openAuth('login'); return; }
  main.innerHTML = `
  <div class="page">
    <div class="page-head"><span class="brand-name">生成日志</span><span class="brand-badge">最近 100 条 · 保留 ${state.config.workTtlDays || 7} 天</span></div>
    <div class="panel log-panel" id="logPanel"><div class="empty-tip">加载中…</div></div>
  </div>`;
  try {
    const d = await api('/api/my/works');
    const works = d.works || [];
    $('#logPanel').innerHTML = works.length ? `
      <div class="log-list">
        ${works.map((w) => `
        <div class="log-item ${w.status === 'error' ? 'err' : ''}">
          ${w.status === 'done' && w.images[0] ? `<img class="log-thumb zoomable" src="${esc(w.images[0])}" loading="lazy" style="cursor:zoom-in" />` : `<div class="log-thumb log-thumb-empty">${w.status === 'error' ? '✕' : '…'}</div>`}
          <div class="log-main">
            <div class="log-top">
              <span class="log-model">${esc(w.model || '')}</span>
              <span class="log-time">${fmtTime(w.createdAt)}</span>
            </div>
            <div class="log-prompt" title="${esc(w.prompt)}">${esc(tr(w.prompt, 90))}</div>
            ${w.status === 'error' ? `<div class="log-error">${esc(w.error || '生成失败')}</div>` : ''}
          </div>
          <div class="log-side">
            <span class="log-status ok">${w.status === 'done' ? '成功' : '失败'}</span>
            <span class="log-meta">${w.size || ''} · ${w.n || 1} 张 · ${Math.round((w.elapsedMs || 0) / 1000)}s</span>
          </div>
        </div>`).join('')}
      </div>` : `<div class="empty-tip">还没有生成记录。</div>`;
  } catch (e) {
    $('#logPanel').innerHTML = `<div class="empty-tip">加载失败：${esc(e.message)}</div>`;
  }
}
function pageDocs() {
  const keyUrl = keysUrl();
  main.innerHTML = `
  <div class="page">
    <div class="page-head"><span class="brand-name">使用文档</span><span class="brand-badge">从零到出图</span></div>

    <div class="panel doc-body">
      <p class="doc-kicker">01 · 准备密钥</p>
      <h3>选择线路并获取 Y Data API 密钥</h3>
      <p>本站是 <b>Y Data</b> 平台的附属生图站点，支持两条线路，<b>均可使用全部生图模型</b>：生成费用直接从你的 Y Data 账户余额扣除，本站不收任何中间费用。</p>
      <div class="doc-lines">
        <div class="doc-line"><b>www.ydata.space</b><span>个人版（C 端）· 面向个人创作者，注册即用</span><a href="https://www.ydata.space/keys" target="_blank" rel="noopener">获取密钥 ↗</a></div>
        <div class="doc-line"><b>vip.ydata.space</b><span>企业版（B 端）· 面向企业与商用场景，批量更优</span><a href="https://vip.ydata.space/keys" target="_blank" rel="noopener">获取密钥 ↗</a></div>
      </div>
      <ol class="doc-steps">
        <li>打开所属线路的密钥页（需先注册 / 登录该线路的 Y Data 账号）</li>
        <li>点击「新建密钥」，<b>分组务必选择生图分组</b>（如 gpt-image-2 分组）</li>
        <li>复制以 <code>sk-</code> 开头的密钥，妥善保存——密钥只完整显示一次</li>
      </ol>
      <div class="doc-note">两条线路的<b>账号与密钥相互独立</b>：在设置页绑定哪条线路，就要使用那条线路的密钥。余额不足或分组不对时生成会失败并提示 401/403，去对应线路的后台充值或换分组即可。</div>

      <p class="doc-kicker">02 · 绑定</p>
      <h3>在本站绑定密钥</h3>
      <ol class="doc-steps">
        <li>注册并登录本站（侧边栏「登录」）</li>
        <li>进入「设置」页，把 <code>sk-</code> 密钥粘贴进「API 密钥」并保存</li>
        <li>绑定后即可在工作台生成；可随时更换或解绑</li>
      </ol>
      <div class="doc-note">密钥仅存储在站点服务器上用于代你调用生成接口，不会展示给任何第三方页面。</div>

      <p class="doc-kicker">03 · 生成</p>
      <h3>工作台四步出图</h3>
      <ol class="doc-steps doc-steps-4">
        <li>写下画面描述——主体、场景、风格、光线，越具体越好</li>
        <li>需要改图时，上传 1–4 张参考图进入改图模式</li>
        <li>选择模型（三款可选）、尺寸、质量与张数</li>
        <li>点击「开始生成」，约 20–120 秒出图，点图片可放大查看与下载</li>
      </ol>
      <p>常用尺寸：方形 1024×1024 · 横版 1536×1024 · 竖版 1024×1536 · 宽幅 2048×1152。透明背景请选 PNG 或 WebP 格式。</p>

      <p class="doc-kicker">04 · 保存政策（重要）</p>
      <h3>图片仅保留 ${state.config.workTtlDays || 7} 天</h3>
      <div class="warn-banner">⚠️ <b>生成的图片（含「资产」页里的所有图片）仅保留 ${state.config.workTtlDays || 7} 天</b>，到期后被<b>自动永久删除，无法恢复</b>。请务必在 ${state.config.workTtlDays || 7} 天内把需要的图片下载到本地；每张图的剩余天数见「资产」页角标。</div>
      <p>生成记录（成功与失败）可在「日志」页查看，同样保留 ${state.config.workTtlDays || 7} 天。</p>

      <p class="doc-kicker">05 · 常见问题</p>
      <h3>FAQ</h3>
      <dl class="doc-faq">
        <dt>生成失败提示 401 / 403？</dt><dd>密钥无效、分组不对或 Y Data 余额不足。去 Y Data 后台核对后，在「设置」页更新密钥。</dd>
        <dt>提示"请先绑定 API 密钥"？</dt><dd>先到「设置」页完成密钥绑定（见上文 02）。</dd>
        <dt>改图后人物变样了？</dt><dd>描述里强调「严格保持人物长相、发型、服装不变」，或降低改动幅度。</dd>
        <dt>能一次生成多张吗？</dt><dd>可以，数量选 1–4 张；并发任务最多 2 个，排队请稍候。</dd>
        <dt>图片找不到了？</dt><dd>超过 ${state.config.workTtlDays || 7} 天已被自动删除。养成及时下载的习惯。</dd>
      </dl>
    </div>
  </div>`;
}
function pageAbout() {
  main.innerHTML = `
  <div class="page">
    <div class="page-head"><span class="brand-name">关于</span><span class="brand-badge">Y Data Img Studio</span></div>
    <div class="panel doc-body">
      <p><b>Y Data Img Studio</b> 是 <a href="https://www.ydata.space" target="_blank" rel="noopener">Y Data</a> 的附属 AI 生图工作台：绑定你的 Y Data 密钥即可使用 ${state.config.models.length} 款模型，费用直连你的 Y Data 账户，本站不加价。</p>
      <p>生成服务由 Y Data 平台提供；生成的图片在本站保留 ${state.config.workTtlDays || 7} 天，请及时下载。</p>
      <p style="color:var(--ink-2)">提示：请勿生成违反法律法规与平台政策的内容。</p>
    </div>
  </div>`;
}

/* ---------------- 设置（仿 Junli Studio 版式：账号 / API Key / 修改密码 / 退出登录） ---------------- */
async function pageSettings() {
  if (!state.user) {
    // 未登录：同版式引导卡，点击打开登录弹窗（含注册滑块验证）
    main.innerHTML = `
    <div class="page settings-page">
      <div class="page-head"><span class="brand-name">设置</span><span class="brand-badge">API Key · 密码 · 登录状态</span></div>
      <div class="panel s-card" style="text-align:center;padding:44px 30px">
        <div style="font-size:40px;margin-bottom:10px">🔐</div>
        <div class="s-title" style="margin-bottom:6px">请先登录</div>
        <p class="s-desc" style="max-width:340px;margin:0 auto 20px">登录后即可在此绑定 API Key、修改密码与管理登录状态。</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn primary" id="goLoginBtn">登录</button>
          <button class="btn ghost" id="goRegBtn">注册新账号</button>
        </div>
      </div>
    </div>`;
    $('#goLoginBtn').onclick = () => openAuth('login');
    $('#goRegBtn').onclick = () => openAuth('register');
    renderNavActive('/settings');
    return;
  }
  main.innerHTML = `
  <div class="page settings-page">
    <div class="page-head"><span class="brand-name">设置</span><span class="brand-badge">API Key · 密码 · 登录状态 — 都在这里</span></div>

    <div class="panel s-card">
      <div class="s-title">账号</div>
      <div class="user-card" style="margin-bottom:0">
        <img src="/assets/logo.png" />
        <div>
          <b style="font-size:16px">${esc(state.user.username)}</b>
          <div class="credits">${state.user.hasKey ? '<span class="key-chip ok">已绑定密钥</span> <span class="mono">' + esc(state.user.maskedKey) + '</span>' : '<span class="key-chip">未绑定密钥</span>'}</div>
        </div>
      </div>
    </div>

    <div class="panel s-card">
      <div class="s-title">API Key</div>
      <p class="s-desc">调用生图接口需要的访问密钥，仅保存在站点服务器用于代你请求；生成费用直接从你的 Y Data 账户扣除。</p>
      <div class="field"><label>接口线路</label>
        <div class="base-select" id="baseSelect">
          ${(state.config.apiBases || []).map((b) => `
            <button type="button" class="base-opt ${((state.user.apiBase || (state.config.apiBases || ['https://www.ydata.space'])[0]) === b) ? 'on' : ''}" data-base="${esc(b)}">${esc(b.replace('https://', ''))}<span>${b.includes('vip') ? '企业 B 端' : '个人 C 端'}</span></button>`).join('')}
        </div>
      </div>
      <div class="field"><label>当前密钥</label>
        <div class="current-key ${state.user.hasKey ? 'bound' : ''}">${state.user.hasKey ? '<span class="mono">' + esc(state.user.maskedKey) + '</span>' : '未绑定'} <span style="float:right;color:var(--ink-3);font-size:11.5px">${esc((state.user.apiBase || 'https://www.ydata.space').replace('https://', ''))}</span></div>
      </div>
      <div class="field"><label>新密钥（sk- 开头）</label>
        <div class="redeem-row">
          <input id="apiKeyInput" placeholder="粘贴 sk-... 密钥" autocomplete="off" />
          <button class="btn primary" id="saveKeyBtn">保存密钥</button>
        </div>
      </div>
      ${state.user.hasKey ? '<button class="btn ghost" id="clearKeyBtn">清除密钥</button>' : ''}
      <p class="redeem-tip">没有密钥？去 <a href="${esc(keysUrl())}" target="_blank" rel="noopener">${esc(keysUrl())}</a> 创建（选择生图分组）。401/403 一般是密钥无效、分组不对或余额不足。</p>
    </div>

    <div class="panel s-card">
      <div class="s-title">修改密码</div>
      <p class="s-desc">修改后其他设备需要用新密码重新登录。</p>
      <div class="s-grid">
        <div class="field"><label>当前密码</label><input id="oldPwd" type="password" autocomplete="current-password" /></div>
        <div class="field"><label>新密码（至少 6 位）</label><input id="newPwd" type="password" autocomplete="new-password" /></div>
        <div class="field"><label>确认新密码</label><input id="newPwd2" type="password" autocomplete="new-password" /></div>
        <div class="field s-btn-cell"><button class="btn primary block" id="chgPwd">保存新密码</button></div>
      </div>
    </div>

    <div class="panel s-card">
      <div class="s-title">退出登录</div>
      <p class="s-desc">退出后需要重新登录才能生成；绑定的密钥仍保留在账号里。</p>
      <button class="btn danger" id="logoutBtn">退出登录</button>
    </div>
  </div>`;
  window._selectedBase = state.user.apiBase || (state.config.apiBases || ['https://www.ydata.space'])[0];
  $$('#baseSelect .base-opt').forEach((b) => b.onclick = () => {
    $$('#baseSelect .base-opt').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    window._selectedBase = b.dataset.base;
    // 切换线路立即保存（仅线路，不动密钥）
    api('/api/auth/apikey', { method: 'POST', body: JSON.stringify({ apiBase: window._selectedBase }) })
      .then(() => refreshMe().then(() => toast('线路已切换：' + window._selectedBase.replace('https://', ''))))
      .catch((e) => toast(e.message));
  });
  $('#saveKeyBtn').onclick = async () => {
    const key = $('#apiKeyInput').value.trim();
    if (!key) { toast('先粘贴 sk- 开头的密钥'); return; }
    try {
      await api('/api/auth/apikey', { method: 'POST', body: JSON.stringify({ key, apiBase: window._selectedBase }) });
      toast('密钥已保存'); await refreshMe(); pageSettings();
    } catch (e) { toast(e.message); }
  };
  const clearBtn = $('#clearKeyBtn');
  if (clearBtn) clearBtn.onclick = async () => {
    if (!confirm('确认清除已绑定的 API Key？清除后无法生成，需重新绑定。')) return;
    try { await api('/api/auth/apikey', { method: 'POST', body: JSON.stringify({ key: '', apiBase: window._selectedBase }) }); toast('已清除 API Key'); await refreshMe(); pageSettings(); }
    catch (e) { toast(e.message); }
  };
  $('#chgPwd').onclick = async () => {
    if ($('#newPwd').value !== $('#newPwd2').value) { toast('两次输入的新密码不一致'); return; }
    try { await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ oldPassword: $('#oldPwd').value, newPassword: $('#newPwd').value }) }); toast('密码已修改'); pageSettings(); }
    catch (e) { toast(e.message); }
  };
  $('#logoutBtn').onclick = async () => {
    if (!confirm('确认退出登录？')) return;
    await api('/api/auth/logout', { method: 'POST' }); location.href = '/';
  };
}

/* ---------------- 登录 / 注册弹窗（注册含滑块验证） ---------------- */
const modal = $('#authModal');
function openAuth(tab) {
  modal.hidden = false;
  switchAuthTab(tab || 'login');
  if (tab === 'register') loadSliderCaptcha();
}
function closeAuth() { modal.hidden = true; }
$('#authClose').onclick = closeAuth;
modal.addEventListener('click', (e) => { if (e.target === modal) closeAuth(); });
$$('.auth-tab').forEach((b) => b.onclick = () => switchAuthTab(b.dataset.tab));
function switchAuthTab(tab) {
  $$('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#loginForm').hidden = tab !== 'login';
  $('#registerForm').hidden = tab !== 'register';
  if (tab === 'register') loadSliderCaptcha();
}

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
    closeAuth(); await refreshMe(); toast('登录成功'); pageRefreshCurrent();
  } catch (err) { $('#loginErr').textContent = err.message; }
};
$('#registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.password.value !== f.password2.value) { $('#registerErr').textContent = '两次密码不一致'; return; }
  if (!sliderState.passed) { $('#registerErr').textContent = '请先完成滑块验证'; return; }
  try {
    await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: f.username.value, password: f.password.value, captchaId: sliderState.id, captchaX: sliderState.answer }) });
    closeAuth(); await refreshMe(); toast('注册成功，欢迎加入！'); pageRefreshCurrent();
  } catch (err) {
    $('#registerErr').textContent = err.message;
    loadSliderCaptcha();
  }
};
function pageRefreshCurrent() { nav(); }

/* ---------------- 图片放大查看（lightbox） ---------------- */
function openLightbox(src) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = `
      <img alt="预览" />
      <a class="lb-download" download>⬇ 下载</a>
      <button class="lb-close" title="关闭 (Esc)">✕</button>`;
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('open'); });
    lb.querySelector('.lb-close').onclick = () => lb.classList.remove('open');
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.remove('open'); });
  }
  lb.querySelector('img').src = src;
  lb.querySelector('.lb-download').href = src;
  lb.classList.add('open');
}
document.addEventListener('click', (e) => {
  const img = e.target.closest('img.zoomable');
  if (img) { e.preventDefault(); e.stopPropagation(); openLightbox(img.src); }
});

/* 滑块验证码逻辑 */
const sliderState = { id: null, answer: null, passed: false, dragging: false, startX: 0, curX: 0, scale: 1 };
async function loadSliderCaptcha() {
  sliderState.passed = false; sliderState.answer = null;
  const box = $('#sliderBox');
  box.classList.remove('passed', 'shake');
  $('#sliderLoading').style.display = 'flex';
  $('#registerErr').textContent = '';
  const pillEl = $('#sliderPill');
  if (pillEl) { pillEl.textContent = '拖动下方滑块完成拼图'; pillEl.classList.remove('ok'); }
  resetSliderBar();
  try {
    const c = await api('/api/captcha/new');
    sliderState.id = c.id;
    sliderState.y = c.y;
    const bg = await loadImg('data:image/png;base64,' + c.bg);
    const piece = await loadImg('data:image/png;base64,' + c.piece);
    const ctx = $('#sliderCanvas').getContext('2d');
    ctx.clearRect(0, 0, 320, 180);
    ctx.drawImage(bg, 0, 0);
    const pctx = $('#pieceCanvas').getContext('2d');
    pctx.clearRect(0, 0, 64, 64);
    pctx.drawImage(piece, 0, 0);
    // 画布按容器宽度等比缩放（板块与表单同宽），拼图块尺寸与 y 同步换算
    const cw = $('#sliderCanvas').clientWidth || 320;
    const scale = cw / 320;
    sliderState.scale = scale;
    const pc = $('#pieceCanvas');
    pc.style.width = Math.round(64 * scale) + 'px';
    pc.style.height = 'auto';
    $('#sliderPiece').style.top = Math.round(c.y * scale) + 'px';
    $('#sliderPiece').style.transform = 'translateX(0px)';
    $('#sliderLoading').style.display = 'none';
    initSliderDrag();
  } catch (e) {
    $('#sliderLoading').innerHTML = '加载失败，点击右上角 ↻ 重试';
  }
}
$('#sliderRefresh').onclick = () => { if (!sliderState.passed) loadSliderCaptcha(); };
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function resetSliderBar() {
  $('#sliderThumb').style.left = '4px';
  $('#sliderFill').style.width = '0';
  $('#sliderTip').textContent = '向右拖动滑块填充拼图';
  $('#sliderTip').style.display = '';
}
function initSliderDrag() {
  const thumb = $('#sliderThumb'), piece = $('#sliderPiece'), fill = $('#sliderFill');
  const bar = $('#sliderBar');
  const maxSlide = Math.max(40, (bar ? bar.clientWidth : 320) - 44); // CSS 像素行程
  const scale = sliderState.scale || 1;
  const onMove = (e) => {
    if (!sliderState.dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let dx = Math.min(maxSlide, Math.max(0, clientX - sliderState.startX));
    sliderState.curX = dx / scale; // 换算回 320 宽画布坐标再提交
    piece.style.transform = `translateX(${dx}px)`;
    thumb.style.left = 4 + dx + 'px';
    fill.style.width = dx + 44 + 'px';
    $('#sliderTip').style.display = 'none';
  };
  const onUp = async () => {
    if (!sliderState.dragging) return;
    sliderState.dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    // 提交验证
    try {
      const v = await api('/api/captcha/check', { method: 'POST', body: JSON.stringify({ id: sliderState.id, x: sliderState.curX }) });
      if (v.passed) {
        sliderState.passed = true;
        sliderState.answer = sliderState.curX;
        $('#sliderBox').classList.add('passed');
        $('#sliderTip').textContent = '';
        const pill = $('#sliderPill');
        if (pill) { pill.textContent = '✓ 验证成功'; pill.classList.add('ok'); }
      } else {
        const box = $('#sliderBox');
        box.classList.add('shake');
        setTimeout(() => box.classList.remove('shake'), 450);
        setTimeout(() => loadSliderCaptcha(), 480);
      }
    } catch (_) { loadSliderCaptcha(); }
  };
  thumb.onmousedown = thumb.ontouchstart = (e) => {
    if (sliderState.passed) return;
    sliderState.dragging = true;
    sliderState.startX = (e.touches ? e.touches[0].clientX : e.clientX) - sliderState.curX;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    e.preventDefault();
  };
}

/* ---------------- 启动 ---------------- */
(async () => {
  try { state.config = Object.assign(state.config, await api('/api/config')); } catch (_) {}
  await refreshMe();
  nav();
})();

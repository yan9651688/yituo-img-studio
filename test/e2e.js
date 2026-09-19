// 端到端测试：滑块验证码 → 注册 → 登录态 → 真实生图 → 作品库
// 用法: node test/e2e.js [baseUrl]（默认 http://127.0.0.1:8100，需先启动 server.js 且配置 UPSTREAM_KEY）
'use strict';
const zlib = require('zlib');
const BASE = process.argv[2] || 'http://127.0.0.1:8100';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); };

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const setCookie = res.headers.get('set-cookie');
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data, setCookie };
}

// 极简 PNG 解码（仅支持本服务生成的 filter-0 RGBA8），返回 {w,h,pixels}
function decodePNG(buf) {
  let off = 8; const chunks = {};
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { chunks.ihdr = data; } else if (type === 'IDAT') { chunks.idat = Buffer.concat([chunks.idat || Buffer.alloc(0), data]); }
    off += 12 + len;
  }
  const w = chunks.ihdr.readUInt32BE(0), h = chunks.ihdr.readUInt32BE(4);
  const raw = zlib.inflateSync(chunks.idat);
  const stride = w * 4 + 1;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) raw.copy(px, y * w * 4, y * stride + 1, (y + 1) * stride);
  return { w, h, px };
}

(async () => {
  // 1. 配置
  let r = await api('/api/config');
  assert(r.status === 200 && Array.isArray(r.data.models) && r.data.models.length === 3, 'config 返回 3 个模型');

  // 2. 滑块验证码：找深靛色缺口（照片压暗 + 靛蓝偏色），46px 窗口密度最高处
  r = await api('/api/captcha/new');
  assert(r.status === 200 && r.data.id && r.data.bg && r.data.piece, '验证码下发');
  const findHole = (b64) => {
    const img = decodePNG(Buffer.from(b64, 'base64'));
    const holePx = (i) => {
      const R = img.px[i], G = img.px[i + 1], B = img.px[i + 2];
      return Math.abs(R - 35) < 12 && Math.abs(G - 31) < 12 && Math.abs(B - 55) < 14; // 均匀深蓝灰纯色缺口
    };
    const hist = new Array(img.w).fill(0);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (holePx((y * img.w + x) * 4)) hist[x]++;
    let bestX = 0, bestCnt = -1;
    for (let x = 0; x + 46 <= img.w; x++) {
      let c = 0; for (let k = 0; k < 46; k++) c += Math.min(hist[x + k], 60); // 封顶抗噪
      if (c > bestCnt) { bestCnt = c; bestX = x; }
    }
    return bestX;
  };
  const holeX = findHole(r.data.bg);
  assert(holeX >= 40 && holeX <= 260, `缺口定位合理 x=${holeX}`);

  // 先测一个错误答案，应当不通过
  let chk = await api('/api/captcha/check', { method: 'POST', body: JSON.stringify({ id: r.data.id, x: (holeX + 25) % 240 }) });
  assert(chk.data && chk.data.passed === false, '错误滑块位置被拒绝');
  // 重新取一张正确的
  r = await api('/api/captcha/new');
  chk = await api('/api/captcha/check', { method: 'POST', body: JSON.stringify({ id: r.data.id, x: findHole(r.data.bg) - 9 }) }); // 减去 core 在画布内的 9px 偏移
  assert(chk.data && chk.data.passed === true, '正确滑块位置通过');

  // 3. 注册（带验证码 id；服务端要求验证码已通过）
  const username = 'tester_' + Date.now().toString(36);
  const regBody = JSON.stringify({ username, password: 'test123456', captchaId: r.data.id });
  const reg = await api('/api/auth/register', { method: 'POST', body: regBody });
  assert(reg.status === 200 && reg.data.ok, '注册成功');
  const cookie = (reg.setCookie || '').split(';')[0];
  assert(!!cookie, '会话 Cookie 下发');

  // 4. 登录态（新架构：无积分字段，需绑定密钥）
  r = await api('/api/auth/me', { headers: { Cookie: cookie } });
  assert(r.data.user && r.data.user.hasKey === false, '新用户未绑定密钥');

  // 5. 未绑定密钥时生成应被拒绝（403）
  r = await api('/api/generate', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ prompt: 'x' }) });
  assert(r.status === 403, '未绑定密钥生成被拒绝');

  // 6. 绑定测试密钥（环境变量 TEST_API_KEY）
  const testKey = process.env.TEST_API_KEY || process.env.UPSTREAM_KEY || '';
  assert(!!testKey, 'TEST_API_KEY 环境变量存在');
  r = await api('/api/auth/apikey', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ key: testKey, apiBase: process.env.TEST_API_BASE }) });
  assert(r.status === 200 && r.data.user.hasKey === true && r.data.user.maskedKey, '密钥绑定成功（脱敏返回）');
  r = await api('/api/auth/apikey', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ key: 'bad-format' }) });
  assert(r.status === 400, '非法密钥格式被拒绝');

  // 7. 真实生图（绑定时的线路与密钥）
  console.log('生成中（真实调用 Y Data 上游，约 20–120s）…');
  r = await api('/api/generate', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ prompt: 'a cute panda drinking coffee, flat illustration', size: '1024x1024', quality: 'low', n: 1 }) });
  assert(r.status === 200 && r.data.jobId, '生成任务已创建');
  const { jobId } = r.data;
  let fin = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((s) => setTimeout(s, 3000));
    const j = await api('/api/jobs/' + jobId, { headers: { Cookie: cookie } });
    if (j.data.status === 'done' || j.data.status === 'error') { fin = j.data; break; }
  }
  assert(!!fin && fin.status === 'done' && fin.images.length === 1, fin && fin.status === 'done' ? `真实生成完成 ${Math.round(fin.elapsedMs / 1000)}s` : `生成失败: ${(fin && fin.error || '').slice(0, 80)}`);
  const imgRes = await fetch(BASE + fin.images[0]);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  assert(imgRes.status === 200 && imgBuf[0] === 0x89 && imgBuf[1] === 0x50, '图片可访问且为 PNG');

  // 8. 线路切换（仅线路不动密钥；切换后密钥属另一线路属预期行为）
  r = await api('/api/auth/apikey', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ apiBase: 'https://vip.ydata.space' }) });
  assert(r.status === 200 && r.data.user.apiBase === 'https://vip.ydata.space', '线路切换为 vip');
  r = await api('/api/auth/apikey', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ apiBase: 'https://evil.example.com' }) });
  assert(r.status === 200 && r.data.user.apiBase === 'https://vip.ydata.space', '非法线路被白名单拒绝');
  r = await api('/api/auth/apikey', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ apiBase: 'https://www.ydata.space' }) });
  assert(r.status === 200 && r.data.user.apiBase === 'https://www.ydata.space', '线路切回 www');

  // 9. 日志含成功记录
  r = await api('/api/my/works', { headers: { Cookie: cookie } });
  assert(r.status === 200 && r.data.works.length >= 1 && r.data.works[0].status === 'done' && r.data.works[0].expiresAt > Date.now(), '日志包含成功记录且带过期时间');

  // 9. 未登录访问受保护接口
  r = await api('/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'x' }) });
  assert(r.status === 401, '未登录生成被拒绝');

  console.log('\n全部通过 ✅');
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });

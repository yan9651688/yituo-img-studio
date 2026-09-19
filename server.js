// Yituo Studio — AI 生图工作台（仅 gpt-image-2 · 仅生图）
// 零依赖 Node 服务：静态资源 + 注册登录 + 滑块验证码 + 生图代理(CheapToken)
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 8100);
const API_BASES = ['https://www.cheaptoken.org']; // 可选线路（默认第一条）
const DEFAULT_API_BASE = API_BASES[0];
const MODELS = ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];
const WORK_TTL_MS = 7 * 24 * 3600e3; // 作品与图片保存 7 天
const MAX_CONCURRENT_PER_USER = 2;

fs.mkdirSync(IMG_DIR, { recursive: true });
const SHOWCASE_DIR = path.join(DATA_DIR, 'showcase');
fs.mkdirSync(SHOWCASE_DIR, { recursive: true });

/* ---------------- 首页画廊同步（地址经环境变量 SHOWCASE_URL 配置；未配置则只用本地缓存不外拉） ---------------- */
const SHOWCASE_URL = process.env.SHOWCASE_URL || '';
const SHOWCASE_JSON = path.join(DATA_DIR, 'showcase.json');
const SHOWCASE_TTL = 6 * 3600e3;
// 作品墙人工撰写的高精度提示词（上游数据不带 prompt，按键为本地图片文件名；上游若补了 prompt 则以上游为准）
const WORK_PROMPTS = {
  'work-sc-a8723d0d-f.png': { title: '夏日公路快餐店', prompt: '日系画报风人像：黑色丸子头的亚洲女孩笑容灿烂，穿深灰色做旧复古汽车印花T恤与浅蓝磨边牛仔短裤，右手举着印黄色笑脸和彩色波点的纸杯饮料，肩挎梵高《星空》图案帆布包，一只手掌伸向镜头形成广角透视；背景是美式复古公路汉堡快餐店，红白遮阳棚、霓虹灯招牌与棕榈树，蓝天白云正午明亮日光；画面叠加手绘涂鸦贴纸——虚线描边、笑脸星星、Let\'s Go 手写对话气泡；高饱和明黄与克莱因蓝撞色，低机位仰拍，青春夏日氛围感拉满。' },
  'work-sc-ad24ab24-6.png': { title: '蓝调东京街头', prompt: '日系街头时尚人像：头戴宝蓝色棒球帽的棕发女孩，穿粉色光泽缎面幻彩条纹衬衫、内搭白色透视长袖、黑色短裤配黑白条纹长袜，斜挎浅蓝色小包挂粉色毛绒挂件；她单手扶住街边护栏，另一只手向镜头伸出形成强烈透视感，一腿向后扬起，神情清冷直视镜头；背景是蓝调时刻的日本都市街头——霓虹招牌、高楼大厦、行驶的汽车、电线杆与砖石路面；霓虹冷色环境光，广角低机位，青春街头大片质感。' },
  'work-sc-6f2dd007-f.png': { title: '柯基骑士糖果王国', prompt: '皮克斯风格3D卡通渲染：戴棕色复古飞行帽和护目镜的小男孩，穿白色短袖与蓝色牛仔背带裤，肩披黄色披风，骑在一只四蹄腾空的巨型柯基犬背上，柯基佩戴棕色皮革铆钉挽具、吐舌欢快奔跑；场景是童话糖果甜品世界——粉色蘑菇小屋、姜饼圆顶建筑、彩色糖果窗户，地面散落巨型草莓、蓝莓、曲奇和糖霜甜甜圈，天空飘着甜品造型热气球；阳光明媚，色彩缤纷饱和，低机位广角跟拍视角，梦幻超现实童话感，细节精致。' },
  'work-sc-42fef439-5.png': { title: '道场少年', prompt: '日系清新人像摄影：黑色蓬松短发的年轻男子头戴黑色头戴式耳机，温柔微笑，身穿白色合气道道服搭配深藏青色袴，左手挎印有日文「合気道」的黑色帆布包，右手端着印白色书法字的深绿茶杯；背景是传统日式庭院道场——木结构建筑、黑瓦坡屋顶、透着暖光的格子门窗与纸灯笼，「合氣道」竖式木牌立在青苔石阶小径旁，四周葱郁树林；柔和自然光，绿意通透，三分法构图，治愈系胶片质感。' },
  'work-sc-64ded39b-f.png': { title: '朱墙白梅', prompt: '新中式静物摄影：古朴双耳陶罐中插着数枝绽放的白梅花，枝条疏影横斜自然舒展；陶罐立于雕花红木条案上，背景是朱红色墙面，深色镂空花格窗与一盏点亮的红灯笼垂着流苏铜钱挂饰；柔和侧光勾勒花枝轮廓，暖红与素白强烈对比，居中偏左构图，古典意境浓厚，写实质感细腻，浓厚中式美学氛围。' },
  'work-sc-50b67599-4.png': { title: '书生与全息代码', prompt: '古风科幻创意插画：身穿汉服的年轻书生端坐古式书案前，手持毛笔指向面前悬浮的全息发光屏幕，屏幕上滚动代码窗口、进度条和一座金色发光的中式楼阁三维模型；四周环绕表情夸张的围观古人——惊呼的老者、抱拳作揖的道士、目瞪口呆的村民、跪地惊叹的年轻人；场景是古代中式书院内景，木质梁柱、灯笼字画、牌匾楹联，书案上摊开古籍；暖黄灯光与青蓝全息光交融，戏谑生动，古今虚实碰撞。' },
  'work-sc-135db927-f.png': { title: '水墨神隐世界', prompt: '吉卜力风格手绘水彩电影海报：上半部是棕色短发少女的巨大侧脸特写，侧脸剪影内以水墨晕染填入神隐世界——灯火通明的红色汤屋楼阁、庭院中的黑袍白面具无脸男、云雾间隐现的飞龙；下半部穿红色连衣裙的少女全身立于水边，白色小路蜿蜒伸向远方，两侧桥梁与灯笼剪影点缀，水面映出倒影；低饱和墨灰烟青色调配朱红点缀，米白宣纸留白与墨点飞溅，柔和漫射光，竖版居中构图，唯美治愈。' },
  'work-sc-71216b27-5.png': { title: '高原代言海报', prompt: '商业产品广告海报：年轻俊朗的高原藏族青年，白衬衫外搭深棕红色藏袍，肩部金色刺绣，佩绿松石耳饰，温暖微笑，半身像居于画面左侧，胸前手持一支深蓝色细杆电子产品；背景是辽阔高原——湛蓝天空白云、连绵雪山与碧绿草地湖泊；右侧留白排书法大标题与卖点图标，底部横排五支不同配色产品；明亮自然日光，蓝棕撞色清新大气，人像精修与商业排版质感。' }
};

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, timeout: 30e3 }, (res) => {
      if (res.statusCode >= 301 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGet(new URL(res.headers.location, url).href, headers));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), type: res.headers['content-type'] || '' }));
    }).on('error', reject).end();
  });
}

async function syncShowcase() {
  if (!SHOWCASE_URL) return; // 未配置同步源：只用本地缓存
  try {
    const res = await httpsGet(SHOWCASE_URL, { 'User-Agent': 'yituo-studio-sync/1.0' });
    if (res.status !== 200) throw new Error('showcase http ' + res.status);
    const data = JSON.parse(res.buf.toString('utf8')).data || {};
    const sections = ['hero', 'work', 'bento'];
    const out = {};
    for (const sec of sections) {
      out[sec] = [];
      for (const it of (data[sec] || [])) {
        const item = { id: it.id, title: it.title || '', prompt: it.prompt || '', subtitle: it.subtitle || '', weight: it.weight || 0 };
        if (it.image_url) {
          const ext = (it.image.match(/\.(png|jpe?g|webp)(\.thumb\.jpg)?$/i) || [, 'png'])[1];
          const fname = `${sec}-${it.id.replace(/[^a-zA-Z0-9-]/g, '')}.${String(ext).toLowerCase() === 'jpg' ? 'jpg' : String(ext).toLowerCase()}`;
          const local = path.join(SHOWCASE_DIR, fname);
          if (!fs.existsSync(local) || fs.statSync(local).size === 0) {
            const img = await httpsGet(it.image_url, { 'User-Agent': 'yituo-studio-sync/1.0' });
            if (img.status === 200 && img.buf.length > 1000) fs.writeFileSync(local, img.buf);
          }
          if (fs.existsSync(local) && fs.statSync(local).size > 0) item.image = '/showcase/' + fname;
        }
        if (item.image) out[sec].push(item);
      }
      out[sec].sort((a, b) => a.weight - b.weight);
    }
    // 合并人工撰写的作品墙提示词（文件名匹配；仅在对应字段为空时填充）
    for (const w of out.work) {
      const meta = WORK_PROMPTS[(w.image || '').split('/').pop()];
      if (!meta) continue;
      if (!w.title) w.title = meta.title;
      if (!w.prompt) w.prompt = meta.prompt;
    }
    fs.writeFileSync(SHOWCASE_JSON, JSON.stringify(out));
    // 首页主展示图固定为站点定制图（存在即优先），文案自持
    const heroCover = path.join(PUBLIC_DIR, 'assets', 'hero-cover.jpg');
    if (fs.existsSync(heroCover)) {
      out.hero = [{ id: 'site-hero', title: 'Y2K 恋爱摄影风', prompt: '小恶魔系女孩 · 旧数码相机直闪 · 电玩城霓虹灯 · 暧昧挑逗感 —— 一句话，你也可以拍出这样的心动瞬间。', image: '/assets/hero-cover.jpg' }];
      fs.writeFileSync(SHOWCASE_JSON, JSON.stringify(out));
    }
    console.log(`showcase synced: hero=${out.hero.length} work=${out.work.length} bento=${out.bento.length}`);
  } catch (e) {
    console.error('showcase sync failed:', String(e.message || e));
  }
}
function showcaseCache() {
  try { return JSON.parse(fs.readFileSync(SHOWCASE_JSON, 'utf8')); } catch (_) { return { hero: [], work: [], bento: [] }; }
}
syncShowcase();
setInterval(syncShowcase, SHOWCASE_TTL);

/* ---------------- 数据层：JSON 文件 + 原子写 ---------------- */
const db = (() => {
  let data = { users: [], sessions: {}, works: [], cdks: [], counters: { work: 0 } };
  try { data = Object.assign(data, JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))); } catch (_) {}
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = DB_PATH + '.tmp';
      fs.writeFile(tmp, JSON.stringify(data), () => fs.rename(tmp, DB_PATH, () => {}));
    }, 120);
  };
  return { get data() { return data; }, save };
})();

// 旧单密钥迁移：拆成按线路独立的密钥槽位 user.keys[apiBase]（www 与 vip 各自绑定互不影响）
for (const u of db.data.users) {
  if (!u.keys) u.keys = {};
  if (u.apiKey) { const b = u.apiBase || DEFAULT_API_BASE; if (!u.keys[b]) u.keys[b] = u.apiKey; delete u.apiKey; }
}

/* ---------------- 小工具 ---------------- */
const rand = (n) => crypto.randomBytes(n).toString('base64url');
const now = () => Date.now();
const hashPassword = (pwd) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 32).toString('hex');
  return salt + ':' + hash;
};
const verifyPassword = (pwd, stored) => {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pwd, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
};
const json = (res, code, obj, cache = 'no-store') => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache });
  res.end(body);
};
const readBody = (req, limitMB) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limitMB * 1024 * 1024) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readJson = async (req, limitMB = 1) => {
  const raw = (await readBody(req, limitMB)).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { throw new Error('bad json'); }
};
const parseCookies = (req) => {
  const out = {}; const raw = req.headers.cookie || '';
  raw.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
};
const dayKeyCN = (ts = now()) => new Date(ts + 8 * 3600e3).toISOString().slice(0, 10); //UTC+8

/* ---------------- 会话 ---------------- */
const SESSION_TTL = 30 * 24 * 3600e3;
function createSession(res, userId) {
  const token = rand(32);
  db.data.sessions[token] = { userId, exp: now() + SESSION_TTL };
  db.save();
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`);
}
function currentUser(req) {
  const token = parseCookies(req).sid;
  const s = token && db.data.sessions[token];
  if (!s || s.exp < now()) return null;
  return db.data.users.find((u) => u.id === s.userId) || null;
}
const lineKey = (u, base) => (u.keys && u.keys[base]) || null;
const maskKey = (k) => k.slice(0, 7) + '…' + k.slice(-4);
const publicUser = (u) => {
  const base = u.apiBase || DEFAULT_API_BASE;
  const key = lineKey(u, base);
  const keys = {};
  for (const b of API_BASES) { const k = lineKey(u, b); keys[b] = k ? { bound: true, masked: maskKey(k) } : { bound: false, masked: null }; }
  return { username: u.username, hasKey: !!key, maskedKey: key ? maskKey(key) : null, apiBase: base, keys };
};

/* ---------------- 滑块验证码：服务端程序化生成 PNG ---------------- */
// PNG 编码（RGBA8，filter 0），用内置 zlib，零依赖
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}
// 伪随机（种子可复现）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const CAPTCHA_W = 320, CAPTCHA_H = 180, PS = 64, CORE = 46, TAB_R = 9, TOLERANCE = 8, CAPTCHA_TTL = 5 * 60e3;
const captchas = new Map(); // id -> {x, y, exp}

/* PNG 解码（truecolor 8bit，filter 0-4）——零依赖读取照片底图 */
function decodePNG(buf) {
  let off = 8, idat = null, w = 0, h = 0, colorType = 2;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') { idat = idat ? Buffer.concat([idat, data]) : data; }
    off += 12 + len;
  }
  if (!idat || (colorType !== 2 && colorType !== 6)) throw new Error('unsupported png ' + colorType);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(idat);
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    line.fill(0);
    raw.copy(line, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + b) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (ft === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
    }
    line.copy(prev);
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
  }
  return { w, h, px };
}

/* 启动时加载照片底图库（预筛掉与缺口纯色过近的照片，避免干扰识别） */
const CAPTCHA_BG_DIR = path.join(DATA_DIR, 'captcha-bg');
const captchaPhotos = [];
const isHoleColored = (px, i) => Math.abs(px[i] - 35) < 12 && Math.abs(px[i + 1] - 31) < 12 && Math.abs(px[i + 2] - 55) < 14;
function loadCaptchaPhotos() {
  try {
    for (const f of fs.readdirSync(CAPTCHA_BG_DIR).filter((f) => f.endsWith('.png')).sort()) {
      try {
        const img = decodePNG(fs.readFileSync(path.join(CAPTCHA_BG_DIR, f)));
        if (img.w !== CAPTCHA_W || img.h !== CAPTCHA_H) continue;
        let near = 0;
        for (let i = 0; i < img.px.length; i += 4) if (isHoleColored(img.px, i)) near++;
        if (near / (img.w * img.h) > 0.01) { console.log(`captcha bg skipped (close to hole color): ${f}`); continue; }
        captchaPhotos.push(img.px);
      } catch (_) {}
    }
  } catch (_) {}
  console.log(`captcha photos loaded: ${captchaPhotos.length}`);
}
loadCaptchaPhotos();

/* 经典拼图形状：核心方块 + 四边中点随机凸/凹半圆 */
function jigsawInside(rnd) {
  const c = PS / 2, half = CORE / 2;
  const tab = [0, 1, 2, 3].map(() => (rnd() < 0.5 ? 1 : -1)); // 上右下左：1 凸 / -1 凹
  return (px, py) => {
    const inSq = Math.abs(px - c) <= half && Math.abs(py - c) <= half;
    let v = inSq;
    let d = Math.hypot(px - c, py - (c - half));
    v = tab[0] > 0 ? (v || d <= TAB_R) : (v && !(d <= TAB_R));
    d = Math.hypot(px - (c + half), py - c);
    v = tab[1] > 0 ? (v || d <= TAB_R) : (v && !(d <= TAB_R));
    d = Math.hypot(px - c, py - (c + half));
    v = tab[2] > 0 ? (v || d <= TAB_R) : (v && !(d <= TAB_R));
    d = Math.hypot(px - (c - half), py - c);
    v = tab[3] > 0 ? (v || d <= TAB_R) : (v && !(d <= TAB_R));
    return v;
  };
}

function newCaptcha() {
  const id = rand(16);
  const x = 66 + Math.floor(Math.random() * (CAPTCHA_W - PS - 86)); // 66..214
  const y = 10 + Math.floor(Math.random() * (CAPTCHA_H - PS - 20)); // 10..106
  captchas.set(id, { x, exp: now() + CAPTCHA_TTL, passed: false });
  if (captchas.size > 5000) for (const [k, v] of captchas) if (v.exp < now()) captchas.delete(k);
  const bg = captchaPhotos.length ? captchaPhotos[Math.floor(Math.random() * captchaPhotos.length)] : paintFallback();
  const bgCopy = Buffer.from(bg);
  const piece = Buffer.alloc(PS * PS * 4);
  const rnd = mulberry32(Math.floor(Math.random() * 2 ** 31));
  const inside = jigsawInside(rnd);
  const edge = (px, py) => inside(px, py) && !(inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1));
  for (let py = 0; py < PS; py++) for (let px = 0; px < PS; px++) {
    if (!inside(px, py)) continue;
    const sx = Math.min(CAPTCHA_W - 1, x + px), sy = Math.min(CAPTCHA_H - 1, y + py);
    const di = (py * PS + px) * 4, si = (sy * CAPTCHA_W + sx) * 4;
    // 拼图块：原图提亮 + 白描边
    piece[di] = Math.min(255, bg[si] * 1.15);
    piece[di + 1] = Math.min(255, bg[si + 1] * 1.15);
    piece[di + 2] = Math.min(255, bg[si + 2] * 1.15);
    piece[di + 3] = 255;
    if (edge(px, py)) { piece[di] = 255; piece[di + 1] = 255; piece[di + 2] = 255; }
    // 背景缺口：均匀深蓝灰纯色（极验式）+ 亮色内缘（凹陷感）
    bgCopy[si] = 35; bgCopy[si + 1] = 31; bgCopy[si + 2] = 55;
    if (edge(px, py)) { bgCopy[si] = Math.min(255, bg[si] * 0.4 + 150); bgCopy[si + 1] = Math.min(255, bg[si + 1] * 0.4 + 150); bgCopy[si + 2] = Math.min(255, bg[si + 2] * 0.4 + 155); }
  }
  return { id, bg: encodePNG(CAPTCHA_W, CAPTCHA_H, bgCopy).toString('base64'), piece: encodePNG(PS, PS, piece).toString('base64'), y };
}
/* 无照片时的纯色兜底 */
const CAPTCHA_PALETTES = [
  [[197, 210, 254], [251, 207, 232]], [[191, 219, 254], [221, 214, 254]], [[253, 230, 168], [254, 202, 202]],
  [[167, 243, 208], [186, 230, 253]], [[251, 207, 232], [233, 213, 255]], [[254, 215, 186], [254, 215, 226]],
];
function paintFallback() {
  const buf = Buffer.alloc(CAPTCHA_W * CAPTCHA_H * 4);
  const rnd = mulberry32(Math.floor(Math.random() * 2 ** 31));
  const pal = CAPTCHA_PALETTES[Math.floor(rnd() * CAPTCHA_PALETTES.length)];
  for (let y = 0; y < CAPTCHA_H; y++) for (let x = 0; x < CAPTCHA_W; x++) {
    const t = (x / CAPTCHA_W + y / CAPTCHA_H) / 2;
    const i = (y * CAPTCHA_W + x) * 4;
    buf[i] = pal[0][0] + (pal[1][0] - pal[0][0]) * t;
    buf[i + 1] = pal[0][1] + (pal[1][1] - pal[0][1]) * t;
    buf[i + 2] = pal[0][2] + (pal[1][2] - pal[0][2]) * t;
    buf[i + 3] = 255;
  }
  return buf;
}
function passCaptcha(id, answerX) {
  const c = captchas.get(id);
  if (!c || c.exp < now()) return { passed: false };
  const ax = Number(answerX);
  if (Number.isFinite(ax) && Math.abs(ax - c.x) <= TOLERANCE) {
    c.passed = true; c.exp = now() + 10 * 60e3; // 通过后保留 10 分钟供注册使用
    return { passed: true };
  }
  captchas.delete(id); // 错了就作废重来
  return { passed: false };
}
function consumeCaptcha(id) {
  const c = captchas.get(id);
  captchas.delete(id);
  return !!c && c.passed && c.exp > now();
}

/* ---------------- IP 限速 ---------------- */
const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = now(); const b = rateBuckets.get(key) || [];
  const recent = b.filter((ts) => ts > t - windowMs);
  if (recent.length >= max) { rateBuckets.set(key, recent); return false; }
  recent.push(t); rateBuckets.set(key, recent); return true;
}

/* ---------------- 上游调用（CheapToken 线路） ---------------- */
const ALLOWED_SIZES = new Set(['auto', '1024x1024', '1536x1024', '1024x1536', '2048x1152', '2048x2048']);
const ALLOWED_QUALITY = new Set(['auto', 'low', 'medium', 'high']);
const ALLOWED_FORMAT = new Set(['png', 'jpeg', 'webp']);

function upstreamRequest(baseUrl, apiPath, body, apiKey, isMultipart, boundary) {
  return new Promise((resolve, reject) => {
    let payload; const headers = { 'Authorization': 'Bearer ' + apiKey };
    if (isMultipart) {
      headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
      payload = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = Buffer.from(JSON.stringify(body));
    }
    const u = new URL(baseUrl + apiPath);
    const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST', headers: { ...headers, 'Content-Length': payload.length }, timeout: 300e3 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null; try { data = JSON.parse(text); } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300 && data) resolve(data);
        else reject(new Error((data && data.error && (data.error.message || data.error.code)) || `upstream ${res.statusCode}: ${text.slice(0, 200)}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    req.write(payload); req.end();
  });
}
function dataURLParts(dataURL) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataURL || '');
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 12 * 1024 * 1024) return null;
  return { mime: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], buf };
}
async function callGenerate({ model, apiKey, baseUrl, prompt, size, quality, n, outputFormat, outputCompression }) {
  const body = { model, prompt, n, size: size || 'auto', quality: quality || 'auto' };
  if (outputFormat && outputFormat !== 'png') { body.output_format = outputFormat; if (outputCompression != null) body.output_compression = outputCompression; }
  return upstreamRequest(baseUrl, '/v1/images/generations', body, apiKey, false);
}
async function callEdit({ model, apiKey, baseUrl, prompt, size, quality, n, refs }) {
  const boundary = '----yituostudio' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  const pushField = (name, value) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  pushField('model', model); pushField('prompt', prompt); pushField('n', String(n));
  if (size && size !== 'auto') pushField('size', size);
  if (quality && quality !== 'auto') pushField('quality', quality);
  refs.slice(0, 4).forEach((d, i) => {
    const p = dataURLParts(d); if (!p) throw new Error('参考图格式不支持（需 png/jpg/webp，≤12MB）');
    const ext = p.mime.split('/')[1].replace('jpeg', 'jpg');
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="ref${i}.${ext}"\r\nContent-Type: ${p.mime}\r\n\r\n`));
    parts.push(p.buf); parts.push(Buffer.from('\r\n'));
  });
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return upstreamRequest(baseUrl, '/v1/images/edits', Buffer.concat(parts), apiKey, true, boundary);
}

/* ---------------- 生成任务 ---------------- */
const jobs = new Map(); // id -> job
function publicWork(w) {
  return { id: w.id, prompt: w.prompt, model: w.model, size: w.size, n: w.n, images: w.images || [], status: w.status || 'done', error: w.error || null, createdAt: w.createdAt, expiresAt: w.createdAt + WORK_TTL_MS, user: w.userName, elapsedMs: w.elapsedMs };
}
function logWork(entry) {
  db.data.counters.work++;
  db.data.works.unshift({ id: db.data.counters.work, public: entry.status !== 'error', ...entry });
  db.data.works = db.data.works.slice(0, 500);
  db.save();
}
/* 作品与图片 7 天过期清理 */
function cleanupExpired() {
  try {
    const cutoff = now() - WORK_TTL_MS;
    const before = db.data.works.length;
    db.data.works = db.data.works.filter((w) => w.createdAt > cutoff);
    let removedFiles = 0;
    for (const f of fs.readdirSync(IMG_DIR)) {
      const p = path.join(IMG_DIR, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); removedFiles++; } } catch (_) {}
    }
    if (db.data.works.length !== before || removedFiles) {
      db.save();
      console.log(`cleanup: removed ${before - db.data.works.length} works, ${removedFiles} files`);
    }
  } catch (e) { console.error('cleanup failed:', String(e.message || e)); }
}
setTimeout(cleanupExpired, 30e3);
setInterval(cleanupExpired, 3600e3);
async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'running'; job.startedAt = now();
  const started = now();
  try {
    const hasRefs = job.refs && job.refs.length > 0;
    const invoke = () => hasRefs
      ? callEdit({ model: job.model, apiKey: job.apiKey, baseUrl: job.apiBase, prompt: job.prompt, size: job.size, quality: job.quality, n: job.n, refs: job.refs })
      : callGenerate({ model: job.model, apiKey: job.apiKey, baseUrl: job.apiBase, prompt: job.prompt, size: job.size, quality: job.quality, n: job.n, outputFormat: job.outputFormat });
    // 上游偶发通道/定价抖动（如“仅支持图片生成”“价格未配置”、5xx）时自动重试一次
    const RETRYABLE = /cannot process text conversation|价格未配置|无可用渠道|upstream 5\d\d/i;
    let result = null, lastErr = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try { result = await invoke(); }
      catch (e) { lastErr = e; if (attempt === 0 && RETRYABLE.test(String(e.message || e))) { job.retried = true; await new Promise((r) => setTimeout(r, 1500)); continue; } break; }
    }
    if (!result) throw lastErr || new Error('上游未返回图片');
    const items = (result.data || []).map((d) => d.b64_json || d.url).filter(Boolean);
    if (!items.length) throw new Error('上游未返回图片');
    const images = [];
    for (let i = 0; i < items.length; i++) {
      const ext = job.outputFormat === 'png' || !job.outputFormat ? 'png' : job.outputFormat;
      let buf;
      if (items[i].startsWith('http')) {
        buf = await new Promise((resolve, reject) => {
          https.get(items[i], (r) => { const ch = []; r.on('data', (c) => ch.push(c)); r.on('end', () => resolve(Buffer.concat(ch))); }).on('error', reject);
        });
      } else buf = Buffer.from(items[i], 'base64');
      const name = `${jobId}-${i}.${ext}`;
      fs.writeFileSync(path.join(IMG_DIR, name), buf);
      images.push('/img/' + name);
    }
    job.status = 'done'; job.images = images; job.elapsedMs = now() - started;
    logWork({ jobId, userId: job.userId, userName: job.userName, prompt: job.prompt, model: job.model, size: job.size, n: job.n, images, status: 'done', createdAt: now(), elapsedMs: job.elapsedMs });
  } catch (e) {
    let msg = String(e.message || e).slice(0, 300);
    // 把上游原始报错翻译成可操作的提示
    if (/invalid (api_)?key|invalid token/i.test(msg)) msg += ' ——请确认密钥正确、所在分组支持生图且账户余额充足。';
    else if (/价格未配置/.test(msg)) msg = '该模型在当前线路暂未配置定价（CheapToken 上游配置问题），请稍后重试或先换其他模型。';
    else if (/cannot process text conversation/i.test(msg)) msg = '上游通道暂时异常（已自动重试仍失败），请稍后重试；' + msg.slice(0, 120);
    job.status = 'error'; job.error = msg;
    logWork({ jobId: job.id, userId: job.userId, userName: job.userName, prompt: job.prompt, model: job.model, size: job.size, n: job.n, images: [], status: 'error', error: job.error, createdAt: now(), elapsedMs: now() - started });
  } finally { job.refs = null; job.apiKey = null; }
  setTimeout(() => jobs.delete(jobId), 30 * 60e3);
}

/* ---------------- 静态文件 ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(res, filePath, cache = 'no-cache') {
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}

/* ---------------- 路由 ---------------- */
async function handleApi(req, res, pathname) {
  const ip = req.socket.remoteAddress || '';
  const sendErr = (code, msg) => json(res, code, { error: msg });

  /* ---- 公开接口 ---- */
  if (req.method === 'GET' && pathname === '/api/config') {
    return json(res, 200, { models: MODELS, apiBases: API_BASES, workTtlDays: 7, sizes: [...ALLOWED_SIZES], qualities: [...ALLOWED_QUALITY] });
  }
  if (req.method === 'GET' && pathname === '/api/captcha/new') {
    if (!rateLimit('cap' + ip, 60, 60e3)) return sendErr(429, '尝试过于频繁，请稍后再试');
    const c = newCaptcha();
    return json(res, 200, { id: c.id, bg: c.bg, piece: c.piece, y: c.y, w: CAPTCHA_W, h: CAPTCHA_H, pieceSize: PS });
  }
  if (req.method === 'POST' && pathname === '/api/captcha/check') {
    if (!rateLimit('capchk' + ip, 30, 60e3)) return sendErr(429, '尝试过于频繁，请稍后再试');
    const b = await readJson(req, 1);
    return json(res, 200, passCaptcha(String(b.id || ''), b.x));
  }
  if (req.method === 'GET' && pathname === '/api/stats') {
    const done = db.data.works.filter((w) => w.elapsedMs);
    const avg = done.length ? Math.round(done.reduce((s, w) => s + w.elapsedMs, 0) / done.length / 100) / 10 : 0;
    return json(res, 200, { models: MODELS.length, works: db.data.counters.work, avgSec: avg });
  }
  if (req.method === 'GET' && pathname === '/api/showcase') {
    return json(res, 200, showcaseCache(), 'public, max-age=300');
  }
  if (req.method === 'GET' && pathname === '/api/works') {
    const cutoff = now() - WORK_TTL_MS;
    const list = db.data.works.filter((w) => w.public && w.createdAt > cutoff).slice(0, 24).map(publicWork);
    return json(res, 200, { works: list });
  }

  /* ---- 注册 / 登录 ---- */
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    if (!rateLimit('reg' + ip, 10, 3600e3)) return sendErr(429, '注册过于频繁，请一小时后再试');
    const b = await readJson(req, 1);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    if (!/^[a-zA-Z0-9_\-@.\u4e00-\u9fa5]{2,60}$/.test(username)) return sendErr(400, '用户名需 2-60 位，可用中英文、数字、下划线、中划线或邮箱');
    if (password.length < 6 || password.length > 72) return sendErr(400, '密码至少 6 位');
    if (!consumeCaptcha(String(b.captchaId || ''))) return sendErr(400, '滑块验证未通过，请重新完成验证');
    if (db.data.users.some((u) => u.username === username)) return sendErr(400, '用户名已被占用');
    const user = { id: rand(12), username, passHash: hashPassword(password), apiKey: null, createdAt: now() };
    db.data.users.push(user); db.save();
    createSession(res, user.id);
    return json(res, 200, { ok: true, user: publicUser(user) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (!rateLimit('log' + ip, 15, 600e3)) return sendErr(429, '尝试过于频繁，请稍后再试');
    const b = await readJson(req, 1);
    const user = db.data.users.find((u) => u.username === String(b.username || '').trim());
    if (!user || !verifyPassword(String(b.password || ''), user.passHash)) return sendErr(401, '用户名或密码不正确');
    createSession(res, user.id);
    return json(res, 200, { ok: true, user: publicUser(user) });
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req).sid;
    if (token) { delete db.data.sessions[token]; db.save(); }
    res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  /* ---- 以下需登录 ---- */
  const user = currentUser(req);
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!user) return json(res, 200, { user: null });
    return json(res, 200, { user: publicUser(user) });
  }
  if (!user) return sendErr(401, '请先登录');

  /* 绑定 / 解绑 CheapToken API Key（每条线路独立一个密钥槽位） */
  if (req.method === 'POST' && pathname === '/api/auth/apikey') {
    const b = await readJson(req, 1);
    const apiBase = API_BASES.includes(b.apiBase) ? b.apiBase : (user.apiBase || DEFAULT_API_BASE);
    if (!user.keys) user.keys = {};
    // 仅切换线路（不带 key 字段）：两条线路各自绑定的密钥原样保留
    if (b.key === undefined) { user.apiBase = apiBase; db.save(); return json(res, 200, { ok: true, user: publicUser(user) }); }
    const key = String(b.key || '').trim();
    if (!key) { delete user.keys[apiBase]; user.apiBase = apiBase; db.save(); return json(res, 200, { ok: true, user: publicUser(user) }); }
    if (!/^sk-[A-Za-z0-9_-]{20,120}$/.test(key)) return sendErr(400, '密钥格式不正确（应以 sk- 开头）');
    user.keys[apiBase] = key; user.apiBase = apiBase; db.save();
    return json(res, 200, { ok: true, user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/password') {
    const b = await readJson(req, 1);
    if (!verifyPassword(String(b.oldPassword || ''), user.passHash)) return sendErr(400, '当前密码不正确');
    const np = String(b.newPassword || '');
    if (np.length < 6 || np.length > 72) return sendErr(400, '新密码至少 6 位');
    user.passHash = hashPassword(np); db.save();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/my/works') {
    const cutoff = now() - WORK_TTL_MS;
    const list = db.data.works.filter((w) => w.userId === user.id && w.createdAt > cutoff).slice(0, 100).map(publicWork);
    return json(res, 200, { works: list });
  }
  // 清空当前用户的全部生成记录（日志 + 资产共用数据源），同时删除对应图片文件
  if (req.method === 'POST' && pathname === '/api/my/works/clear') {
    if (!rateLimit('clear:' + user.id, 5, 60e3)) return sendErr(429, '操作太频繁，请稍后再试');
    let removed = 0;
    db.data.works = db.data.works.filter((w) => {
      if (w.userId !== user.id) return true;
      removed++;
      for (const img of (w.images || [])) {
        try { fs.unlinkSync(path.join(IMG_DIR, path.basename(img))); } catch (_) {}
      }
      return false;
    });
    db.save();
    return json(res, 200, { ok: true, removed });
  }
  // 删除单条生成记录（含对应图片）
  if (req.method === 'POST' && pathname === '/api/my/works/delete') {
    if (!rateLimit('delw:' + user.id, 20, 60e3)) return sendErr(429, '操作太频繁，请稍后再试');
    const b = await readJson(req, 1);
    const id = Number(b.id);
    if (!Number.isInteger(id)) return sendErr(400, '参数错误');
    const idx = db.data.works.findIndex((w) => w.id === id && w.userId === user.id);
    if (idx < 0) return sendErr(404, '记录不存在');
    const [w] = db.data.works.splice(idx, 1);
    for (const img of (w.images || [])) {
      try { fs.unlinkSync(path.join(IMG_DIR, path.basename(img))); } catch (_) {}
    }
    db.save();
    return json(res, 200, { ok: true });
  }
  // 批量删除生成记录（含对应图片）
  if (req.method === 'POST' && pathname === '/api/my/works/delete-batch') {
    if (!rateLimit('delw:' + user.id, 20, 60e3)) return sendErr(429, '操作太频繁，请稍后再试');
    const b = await readJson(req, 1);
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter(Number.isInteger))].slice(0, 100) : [];
    if (!ids.length) return sendErr(400, '参数错误');
    const idSet = new Set(ids);
    let removed = 0;
    db.data.works = db.data.works.filter((w) => {
      if (idSet.has(w.id) && w.userId === user.id) {
        removed++;
        for (const img of (w.images || [])) {
          try { fs.unlinkSync(path.join(IMG_DIR, path.basename(img))); } catch (_) {}
        }
        return false;
      }
      return true;
    });
    db.save();
    return json(res, 200, { ok: true, removed });
  }
  if (req.method === 'POST' && pathname === '/api/generate') {
    const myActive = [...jobs.values()].filter((j) => j.userId === user.id && j.status !== 'done' && j.status !== 'error').length;
    if (myActive >= MAX_CONCURRENT_PER_USER) return sendErr(429, `同一时刻最多 ${MAX_CONCURRENT_PER_USER} 个任务，请稍候`);
    const genBase = user.apiBase || DEFAULT_API_BASE;
    const genKey = (user.keys && user.keys[genBase]) || null;
    if (!genKey) return sendErr(403, '还未绑定 CheapToken API 密钥：请在「设置」页绑定后再生成');
    const b = await readJson(req, 24); // 参考图走 base64，放宽
    const prompt = String(b.prompt || '').trim();
    if (!prompt) return sendErr(400, '请写下画面描述');
    if (prompt.length > 32000) return sendErr(400, '描述过长（≤32000 字符）');
    const model = MODELS.includes(b.model) ? b.model : MODELS[0];
    const size = ALLOWED_SIZES.has(b.size) ? b.size : 'auto';
    const quality = ALLOWED_QUALITY.has(b.quality) ? b.quality : 'auto';
    const outputFormat = ALLOWED_FORMAT.has(b.outputFormat) ? b.outputFormat : 'png';
    const n = Math.min(4, Math.max(1, Number(b.n) || 1));
    const refs = Array.isArray(b.refs) ? b.refs.filter(Boolean).slice(0, 4) : [];
    for (const r of refs) if (!dataURLParts(r)) return sendErr(400, '参考图格式不支持（需 png/jpg/webp）');
    const jobId = rand(10);
    jobs.set(jobId, { id: jobId, userId: user.id, userName: user.username, apiKey: genKey, apiBase: genBase, model, prompt, size, quality, n, outputFormat, refs, status: 'pending', createdAt: now() });
    runJob(jobId);
    return json(res, 200, { jobId });
  }
  if (req.method === 'GET' && pathname.match(/^\/api\/jobs\/([A-Za-z0-9_-]+)$/)) {
    const job = jobs.get(RegExp.$1);
    if (!job || (job.userId !== user.id)) return sendErr(404, '任务不存在');
    return json(res, 200, { status: job.status, images: job.images || null, error: job.error || null, elapsedMs: job.elapsedMs || (job.startedAt ? now() - job.startedAt : 0) });
  }
  return sendErr(404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (pathname.startsWith('/img/') && /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/.test(path.basename(pathname))) {
      return serveStatic(res, path.join(IMG_DIR, path.basename(pathname)), 'public, max-age=86400');
    }
    if (pathname.startsWith('/showcase/') && /^[A-Za-z0-9._-]+$/.test(path.basename(pathname))) {
      return serveStatic(res, path.join(SHOWCASE_DIR, path.basename(pathname)), 'public, max-age=86400');
    }
    if (pathname.startsWith('/assets/') || pathname === '/favicon.svg') {
      return serveStatic(res, path.join(PUBLIC_DIR, pathname), 'public, max-age=86400');
    }
    if (pathname === '/' || !pathname.includes('.')) {
      return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'), 'no-cache');
    }
    return serveStatic(res, path.join(PUBLIC_DIR, pathname));
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Img Studio listening on http://127.0.0.1:${PORT}`));

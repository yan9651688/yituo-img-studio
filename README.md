# Y Data Img Studio

[Y Data](https://www.ydata.space) 的附属 AI 生图工作台：用户绑定自己的 Y Data API 密钥即可使用 gpt-image-2 系列模型生图，支持 www / vip 双线路可选，费用直连用户账户，本站不经手任何费用。

## 功能

- **三模型生图**：gpt-image-2 / gpt-image-2.5-flare / gpt-image-2.5-sunburst，文生图 + 参考图改图（最多 4 张）
- **账号体系**：注册（照片拼图滑块验证码）/ 登录 / 修改密码 / API 密钥绑定（服务端存储、前端脱敏）
- **资产页**：生成图片管理，每张带剩余天数角标，一键下载
- **日志页**：最近 100 条生成记录（成功/失败/耗时/模型），失败原因可见
- **7 天保留**：图片与记录到期自动清理（每小时巡检），页面多处严格告知
- **体验细节**：生成四步进度动画、结果区持久化（切走再回来仍在）、图片点击全屏放大（lightbox）、明暗双主题、作品结果恢复

## 换品牌部署（fork 指南）

整套代码与具体品牌无关，改 4 处即可变成你自己的站点：

1. **API 线路**：`server.js` 顶部 `API_BASES`——配置 1 条或 2 条均可；只配 1 条时，设置页会自动隐藏线路选择器（单线路模式），配 2 条则显示 C 端 / B 端双线路独立绑密钥
2. **品牌文案**：全局替换 `Y Data` 为你的品牌名（`public/index.html` 标题 / `public/app.js` 首页、文档、关于、设置页）
3. **Logo**：替换 `public/assets/logo.png`（正方形最佳，渲染为 46×46 圆角方块 + favicon），并升级 `index.html` 里的 `?v=` 缓存版本号
4. **首页大图**：替换 `public/assets/hero-cover.jpg`，文案在 `server.js` 的 `syncShowcase` 里改

上游需为 OpenAI 兼容中转（`POST {apiBase}/v1/images/generations`，Bearer sk- 密钥）。部署同下，测试跑 `TEST_API_BASE=... TEST_API_KEY=sk-... node test/e2e.js http://127.0.0.1:8100`。

## 技术

零依赖 Node.js（≥18），无数据库（JSON 文件存储），无构建（原生 SPA）。

- `server.js` — 全部后端：静态服务、账号会话、滑块验证码（服务端像素级合成真实照片拼图，零依赖 PNG 编解码器）、上游代理、7 天过期清理、首页作品同步
- `public/` — 前端 SPA（首页 / 工作台 / 资产 / 日志 / 文档 / 设置）
- `test/e2e.js` — 端到端测试（含验证码缺口识别、真实生图）
- `captcha-bg/` — 验证码照片底图库（320×180 PNG，部署时复制到 `data/captcha-bg/`）

## 部署

```bash
# 1. 上传代码到 /opt/yituo-img，安装 Node ≥18

# 2. 配置环境变量（密钥不要进版本库）
cat > /opt/yituo-img/.env <<'EOF'
PORT=8100
EOF
chmod 600 /opt/yituo-img/.env

# 3. 放置验证码底图
mkdir -p /opt/yituo-img/data/captcha-bg
cp captcha-bg/*.png /opt/yituo-img/data/captcha-bg/

# 4. systemd 服务
systemctl enable --now yituo-img   # 参考下方 unit
```

```ini
# /etc/systemd/system/yituo-img.service
[Unit]
Description=Yi Tuo Hub Img Studio
After=network-online.target

[Service]
WorkingDirectory=/opt/yituo-img
EnvironmentFile=/opt/yituo-img/.env
ExecStart=/usr/bin/node /opt/yituo-img/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

nginx 反代 `127.0.0.1:8100` 即可（`client_max_body_size 32m`，参考图走 base64）。

## 测试

```bash
TEST_API_KEY=sk-xxx node test/e2e.js http://127.0.0.1:8100
```

## 说明

- 首页作品展示经 [Junli Studio](https://img.junliai.org/) 授权同步（服务端每 6 小时拉取并本地化图片）
- 用户 API 密钥仅存储在站点服务器用于代用户调用生成接口

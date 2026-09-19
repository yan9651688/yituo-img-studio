# Y Data Img Studio

[Y Data](https://www.ydata.space) 的附属 AI 生图工作台：用户绑定自己的 Y Data API 密钥即可使用 gpt-image-2 系列模型生图，支持 www / vip 双线路可选，费用直连用户账户，本站不经手任何费用。

## 功能

- **三模型生图**：gpt-image-2 / gpt-image-2.5-flare / gpt-image-2.5-sunburst，文生图 + 参考图改图（最多 4 张）
- **账号体系**：注册（照片拼图滑块验证码）/ 登录 / 修改密码 / API 密钥绑定（服务端存储、前端脱敏）
- **资产页**：生成图片管理，每张带剩余天数角标，一键下载
- **日志页**：最近 100 条生成记录（成功/失败/耗时/模型），失败原因可见
- **7 天保留**：图片与记录到期自动清理（每小时巡检），页面多处严格告知
- **体验细节**：生成四步进度动画、结果区持久化（切走再回来仍在）、图片点击全屏放大（lightbox）、明暗双主题（画廊暖白 × 午夜工坊）、作品结果恢复

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

- 首页画廊支持从外部源定时同步并本地化图片（地址经 `SHOWCASE_URL` 环境变量配置，不配置则用本地缓存）
- 用户 API 密钥仅存储在站点服务器用于代用户调用生成接口

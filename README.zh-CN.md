# 《活该》网页游戏 MVP

[English](README.md) · [**简体中文**](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

一款房间码邀请的在线双人 AI 道德辩论游戏。每条轨道由系统随机放置一名好人，玩家再放置两名人物；双方进行三轮攻防并留下六段不可修改的辩词，最终接受 AI 列车长的压轨决定与共同的黑暗哲学审判。

**在线体验：** https://game.sadsunset.cloud/

比赛舞台固定在一个 `100dvh` 屏幕内。首轮攻方随机，之后逐轮互换；攻击、等待、防守和回合结果均在弹窗中完成。DeepSeek 会分别处理单回合胜负、整条轨道生死和赛后反讽评议，输入包含列车长人设、人物姓名与背景、词条、胜出论据以及全部辩词。玩家可随时投降，整场按房间设置局数累计幸存积分。

## 本地运行

要求 Node.js 24+、pnpm 11+。

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

开发模式前端位于 `http://localhost:5173`，API 位于 `http://localhost:3000`。AI 使用 DeepSeek 官方 OpenAI 兼容接口，默认模型为 `deepseek-v4-flash`。房主每次创建房间前必须输入并测试自己的 DeepSeek Key；Key 只保存在该房间的服务端内存中，整场结束后删除。

## 生产运行

```powershell
pnpm build
$env:SESSION_SECRET='至少32位的随机字符串'
pnpm start
```

生产服务同源托管网页、REST 和 Socket.IO。公网部署必须在 HTTPS 反向代理后运行，并把 `/socket.io` 配置为 WebSocket 升级。SQLite 数据默认写入 `data/game.db`。

## Docker

创建 `.env` 并至少填写 `SESSION_SECRET`：

```powershell
docker compose up --build
```

数据保存在 `game-data` 卷。备份时停止新房间或暂停容器，然后复制该卷中的 `game.db`、`game.db-wal` 和 `game.db-shm`。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

正式浏览器验收基准为 1280×720 及以上桌面视口。小屏会提示使用横屏或桌面设备。

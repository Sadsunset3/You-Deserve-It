# 房间级 DeepSeek Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建房前强制测试 DeepSeek Key，并让每个房间只使用其内存中的 Key，整场结束后删除。

**Architecture:** 创建请求携带 Key，服务端用独立 `RoomAiKeyStore` 在内存中按房间码保存，AI 调用时按房间创建网关。Key 不进入 Room、RoomView、SQLite、日志或浏览器存储；测试连接使用同一 Base URL 与模型。比赛结束、投降、掉线判负和过期清理均触发删除。

**Tech Stack:** TypeScript、React、Fastify、OpenAI-compatible DeepSeek API、Vitest、Testing Library、SQLite/Drizzle。

## Global Constraints

- Key 不写入 SQLite、房间快照、日志、RoomView、Socket 或浏览器存储。
- 不再读取 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` 作为生产裁决回退。
- 修改 Key 后必须重新测试；未测试成功不能创建房间。
- 当前目录不是 Git 仓库，计划中的提交步骤以检查变更代替。

---

### Task 1: 扩展建房合同与 API 客户端

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts`
- Modify: `apps/web/src/api.ts`

**Interfaces:**
- Produces: `createRoomSchema` 接受 `{ nickname, config, apiKey }`，`api.testDeepSeekKey(apiKey)`，`api.create(nickname, config, apiKey)`。

- [x] 写失败合同测试：缺少或空白 `apiKey` 被拒绝，非空 Key 通过。
- [x] 运行合同测试，确认因当前 schema 未包含 Key 而失败。
- [x] 增加长度受限、去除首尾空白的 `apiKey` schema，并更新 Web API 方法。
- [x] 运行合同测试确认通过。

### Task 2: 房间密钥仓库与 DeepSeek 连接测试

**Files:**
- Create: `apps/server/src/ai/room-key-store.ts`
- Create: `apps/server/src/ai/room-key-store.test.ts`
- Modify: `apps/server/src/ai/client.ts`
- Test: `apps/server/src/ai/client.test.ts`

**Interfaces:**
- Produces: `RoomAiKeyStore.set(code, key)`, `get(code)`, `delete(code)`, `has(code)`；`testAiConnection(apiKey, options)`；`createAiGateway({ apiKey })` 仅接受显式 Key。

- [x] 写失败测试：房间 Key 隔离、删除后不可取；环境变量 Key 不被 `resolveAiConfig` 使用；连接测试发送最小 completion 并把失败转为安全错误。
- [x] 运行目标测试并确认预期失败。
- [x] 实现内存仓库、显式 Key 配置和连接测试。
- [x] 运行目标测试确认通过。

### Task 3: 服务端绑定、调用与销毁房间 Key

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Test: `apps/server/src/app.test.ts`
- Test: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Consumes: `RoomAiKeyStore` 与 `createAiGateway({ apiKey })`。
- Produces: `POST /api/ai/test-key`；`POST /api/rooms` 绑定 Key；每次裁决按房间码取 Key；终局清理回调或终局检查。

- [x] 写失败服务端测试：测试接口成功/失败、建房必须携带 Key、两个房间使用不同 Key、快照无 Key、投降与最终比赛结束删除 Key、缺失 Key 返回明确错误。
- [x] 运行目标测试并确认预期失败。
- [x] 注入 `aiGatewayFactory` 和 `RoomAiKeyStore`；实现测试接口、建房绑定及房间级裁决。
- [x] 在投降、双方确认最后一局结束、掉线判负和清理路径删除 Key。
- [x] 运行服务端测试确认通过。

### Task 4: 建房界面的 Key 输入与连通测试

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `api.testDeepSeekKey(apiKey)` 与 `api.create(..., apiKey)`。
- Produces: 密码输入框、测试按钮、成功/失败状态和建房门禁。

- [x] 写失败 UI 测试：创建模式显示密码框；加入模式隐藏；未测试不能创建；成功后允许；修改 Key 使成功状态失效；Key 不写入 sessionStorage。
- [x] 运行 Web 目标测试并确认预期失败。
- [x] 实现 Key 状态、测试连接动作、按钮禁用逻辑和状态文案，保持现有首页视觉体系。
- [x] 运行 Web 目标测试确认通过。

### Task 5: 删除固定 Key、文档和完整验证

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `README.md`

**Interfaces:**
- Produces: 无固定 AI Key 的运行配置与新的建房说明。

- [x] 清空并移除 `.env` 的真实 `DEEPSEEK_API_KEY`，删除 compose 固定 Key 传入，更新示例和 README。
- [x] 搜索仓库，确认真实 Key 与生产环境 Key 回退引用均不存在。
- [x] 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- [x] 启动本地生产构建，在浏览器验证输入、失败提示、创建门禁和加入切换；用自动化测试验证连接成功后的建房提交。

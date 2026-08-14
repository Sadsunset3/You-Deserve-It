# 《活该》权威攻防对局重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将每局重构为单屏弹窗驱动的三回合攻防，并由 DeepSeek 完成回合裁决、最终压轨和双方共享的黑暗哲学审判。

**Architecture:** 服务端 `RoomManager` 是唯一状态机，REST 命令只触发合法状态转换，Socket.IO 广播玩家专属 `RoomView`。AI 网关拆成三类强类型裁决；前端只根据 phase 渲染固定舞台和模态层，不自行推断或推进比赛。

**Tech Stack:** TypeScript 6、React、Vite、Fastify、Socket.IO、Zod、OpenAI 兼容 DeepSeek API、Vitest、Testing Library、SQLite/Drizzle。

## Global Constraints

- 比赛舞台必须保持在一个 `100dvh` 内，1280×720 及以上无纵向滚动；首页仍可滚动。
- 每条轨道固定一名服务端自动抽取好人加两名玩家人物，共三人。
- 每局三次攻防、六段原始辩词；首轮攻方随机，之后严格互换。
- DeepSeek 不可用时必须使用确定性本地备用结果，不得卡住房间。
- AI 只返回经过 Zod 校验的 JSON；Prompt 和完整输入由服务端构造。
- 所有写操作保留 `commandId` 幂等和 `expectedVersion` 冲突保护。
- 关键操作支持键盘、清晰焦点和 `prefers-reduced-motion`。
- 工作区当前没有 `.git`，每个任务以通过测试的本地检查点代替 Git commit；不得删除或覆盖用户已有修改。

---

## 文件结构

- `packages/contracts/src/index.ts`: 对局 phase、命令 schema、AI 输入输出和玩家视图的公共类型。
- `apps/server/src/content/catalog.ts`: 65 名去重人物、词条与列车长目录。
- `apps/server/src/ai/schemas.ts`: 三类 AI 响应 Zod schema。
- `apps/server/src/ai/prompts.ts`: 三类 system prompt 与纯数据 user payload 构造。
- `apps/server/src/ai/fallback.ts`: 回合、压轨、哲学审判的确定性备用结果。
- `apps/server/src/ai/client.ts`: `AiGateway` 三方法、重试、解析和 fallback 编排。
- `apps/server/src/rooms/types.ts`: `Room`、`RoundRecord` 和快照迁移类型。
- `apps/server/src/rooms/manager.ts`: 服务端权威状态转换、计时推进、计分和下一局。
- `apps/server/src/app.ts`: REST 命令、阶段广播和分段 AI 编排。
- `apps/web/src/game/GameStage.tsx`: 单屏舞台布局。
- `apps/web/src/game/DebateModal.tsx`: 攻击、等待、防守和回合结果模态层。
- `apps/web/src/game/JudgmentOverlay.tsx`: 最终压轨与哲学审判界面。
- `apps/web/src/game/CharacterCard.tsx`: 名称头像、背景、词条和胜出论据。
- `apps/web/src/game/SelectionTray.tsx`, `RailLane.tsx`: 自动好人第三卡位、选择和发牌动画。
- `apps/web/src/App.tsx`: 房间订阅、命令发送、退出房间，不再承载阶段 UI 细节。
- `apps/web/src/styles.css`: 共享 token 与尚未拆出的旧样式；新增组件优先使用对应组件 class，避免扩大全局选择器。

---

### Task 1: 稳定当前部分修改并恢复绿色基线

**Files:**
- Modify: `apps/server/src/content/catalog.ts`
- Modify: `apps/server/src/content/catalog.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/web/src/game/CharacterCard.tsx`
- Modify: `apps/web/src/game/SelectionTray.tsx`
- Modify: `apps/web/src/game/RailLane.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: 33 名好人、32 名恶人；`automaticCharacters`; `surrender()`；完整名称头像；可测试的发牌状态。

- [ ] **Step 1: 运行当前聚焦测试并记录真实失败**

Run: `pnpm --filter @ydi/server test -- catalog.test.ts manager.test.ts; pnpm --filter @ydi/web test -- App.test.tsx`

Expected: 当前未收尾的第三卡位、投降 UI 或类型错误失败；不得通过修改断言掩盖行为缺失。

- [ ] **Step 2: 修正人物卡名称重复和第三卡位**

`CharacterCard` 只在 `.portrait` 中渲染 `card.name`，正文直接渲染 `background`。`RailLane` 先渲染只读自动人物，再渲染两个可投放槽位：

```tsx
<div className="rail-slot automatic-slot" data-testid={`automatic-character-${isMine ? 'mine' : 'opponent'}`}>
  <span className="automatic-label">系统抽取</span>
  {automaticCharacter ? <CharacterCard card={automaticCharacter} /> : <span>等待抽取好人</span>}
</div>
```

- [ ] **Step 3: 完成投降端到端路径**

保留签名：

```ts
RoomManager.surrender(code: string, playerId: string, expectedVersion: number): Promise<Room>
```

它只允许非 `waiting`、非 `match-end` 状态，将对方设为 `finalResult.survivor`、对方积分加一、清空 deadline 并进入 `match-end`。前端确认后调用 `/surrender`，成功后清理 `ydi_room` 并回首页。

- [ ] **Step 4: 运行聚焦测试直至通过**

Run: `pnpm --filter @ydi/server test -- catalog.test.ts manager.test.ts && pnpm --filter @ydi/web test -- App.test.tsx`

Expected: PASS；无 React act warning、无未恢复 fake timer。

- [ ] **Step 5: 建立本地检查点**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS。工作区无 Git，因此不执行 commit。

---

### Task 2: 定义完整公共状态机与 AI 契约

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

**Interfaces:**
- Produces: `Phase`, `RoundRecord`, `RoundVerdict`, `TrackVerdict`, `PhilosophyJudgment`, 三类 AI 输入和新的 `RoomView`。

- [ ] **Step 1: 写失败的契约测试**

增加字面量测试，验证合法 phase、三类响应 schema 和非法 seat/空判断被拒绝：

```ts
expect(roundVerdictSchema.parse({ winner: 'defense', reason: '事实成立', winningArgument: '他救过人', fallback: false }).winner).toBe('defense');
expect(() => trackVerdictSchema.parse({ crushedSeat: 'c', survivor: 'a', reason: 'x', decisiveFactors: [], fallback: false })).toThrow();
expect(philosophyJudgmentSchema.parse(validJudgment).questions).toHaveLength(2);
```

- [ ] **Step 2: 运行契约测试确认失败**

Run: `pnpm --filter @ydi/contracts test`

Expected: FAIL，提示 schema 或类型尚未导出。

- [ ] **Step 3: 实现公共类型**

`Phase` 精确替换为：

```ts
export type Phase = 'waiting' | 'selecting' | 'traits' | 'attack-input' | 'defense-input' | 'round-adjudicating' | 'round-result' | 'track-adjudicating' | 'judgment-generating' | 'judgment' | 'between-games' | 'match-end';
```

定义：

```ts
export type SpeechRecord = { seat: 'a' | 'b'; role: 'attack' | 'defense'; targetId: string; text: string; round: 1 | 2 | 3 };
export type RoundRecord = { round: 1 | 2 | 3; attacker: 'a' | 'b'; defender: 'a' | 'b'; targetId: string; attack: SpeechRecord; defense: SpeechRecord; verdict: RoundVerdict };
export type RoundVerdict = { winner: 'attack' | 'defense'; reason: string; winningArgument: string; fallback: boolean };
export type TrackVerdict = { crushedSeat: 'a' | 'b'; survivor: 'a' | 'b'; reason: string; decisiveFactors: string[]; fallback: boolean };
export type PhilosophyJudgment = { title: string; summary: string; playerA: string; playerB: string; conductorCritique: string; questions: [string, string]; fallback: boolean };
```

`RoomView` 增加 `roundAttacker`, `currentTargetId`, `roundRecords`, `trackVerdict`, `judgment`, `nextGameReady`，并只暴露当前玩家应见的信息。

- [ ] **Step 4: 运行测试和类型检查**

Run: `pnpm --filter @ydi/contracts test && pnpm --filter @ydi/contracts typecheck`

Expected: PASS。

---

### Task 3: 拆分并实现三类 DeepSeek 裁决

**Files:**
- Create: `apps/server/src/ai/schemas.ts`
- Create: `apps/server/src/ai/prompts.ts`
- Modify: `apps/server/src/ai/fallback.ts`
- Modify: `apps/server/src/ai/client.ts`
- Modify: `apps/server/src/ai/client.test.ts`
- Modify: `apps/server/src/ai/fallback.test.ts`

**Interfaces:**
- Consumes: Task 2 的 AI 输入输出类型。
- Produces: `AiGateway`。

```ts
export type AiGateway = {
  decideRound(input: RoundDecisionInput): Promise<RoundVerdict>;
  decideTrack(input: TrackDecisionInput): Promise<TrackVerdict>;
  judgeMatch(input: JudgmentInput): Promise<PhilosophyJudgment>;
};
```

- [ ] **Step 1: 写三组失败测试**

每个方法至少覆盖有效 JSON、连续三次非法 JSON 后 fallback、未配置 API 后 fallback。检查发送给 `createCompletion` 的 user message JSON 包含列车长 persona/rule、人物 background、traits、历史 arguments 和本轮 speeches。

- [ ] **Step 2: 运行 AI 测试确认失败**

Run: `pnpm --filter @ydi/server test -- client.test.ts fallback.test.ts`

Expected: FAIL，缺少 `decideTrack` 和 `judgeMatch`。

- [ ] **Step 3: 实现独立 schema 和 prompt**

`prompts.ts` 导出：

```ts
buildRoundMessages(input: RoundDecisionInput): CompletionMessage[]
buildTrackMessages(input: TrackDecisionInput): CompletionMessage[]
buildJudgmentMessages(input: JudgmentInput): CompletionMessage[]
```

哲学审判 system prompt 明确：“可以尖锐、反讽、揭示自利和双重标准；不得辱骂玩家、诊断精神疾病、宣称 AI 是绝对道德权威。”

- [ ] **Step 4: 实现三个确定性 fallback**

回合 fallback 使用人物阵营、词条极性、列车长 bias 和辩词长度；压轨 fallback 汇总每边人物阵营、词条和胜出论据；审判 fallback 使用固定结构引用双方真实目标与辩词数量，不生成空文案。

- [ ] **Step 5: 实现统一重试器**

```ts
async function requestStructured<T>(schema: ZodType<T>, request: () => Promise<unknown>, fallback: () => T): Promise<T>
```

最多三次；第三次失败返回 fallback。不得吞掉已通过 schema 的 `fallback: false`。

- [ ] **Step 6: 运行 AI 测试**

Run: `pnpm --filter @ydi/server test -- client.test.ts fallback.test.ts`

Expected: PASS。

---

### Task 4: 重构房间快照和服务端三回合状态机

**Files:**
- Create: `apps/server/src/rooms/types.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`
- Modify: `apps/server/src/persistence/store.test.ts`

**Interfaces:**
- Consumes: `AiGateway`、Task 2 公共类型。
- Produces: `RoomManager.submitAttack`, `submitDefense`, `advanceAfterRound`, `resolveTrack`, `saveJudgment`, `readyNextGame`。

- [ ] **Step 1: 写状态机失败测试**

使用固定 random 和 fake AI，覆盖：首轮攻方随机；三轮攻守为 `a/b/a` 或 `b/a/b`；非法席位提交被拒；每轮两段原始辩词被保存；只有胜方辩词附加；第三轮进入 `track-adjudicating`；双方下一局准备后重置。

- [ ] **Step 2: 写超时和恢复失败测试**

覆盖攻击超时写入空 attack、防守超时写入空 defense、加载旧快照补齐新字段、在 `defense-input` 刷新后仍能继续。

- [ ] **Step 3: 运行 manager 测试确认失败**

Run: `pnpm --filter @ydi/server test -- manager.test.ts store.test.ts`

Expected: FAIL，旧 phase 或字段不匹配。

- [ ] **Step 4: 提取 Room 类型并实现快照迁移**

```ts
export function migrateRoomSnapshot(snapshot: unknown): Room
```

旧 `attack-a/attack-b/defense-a/defense-b` 房间安全终止为 `match-end`，理由为“版本升级后本局已结束，请重新开局”；等待房间可直接补默认字段继续。

- [ ] **Step 5: 实现回合开始与攻守交替**

```ts
private startRound(room: Room) {
  room.roundAttacker ??= this.random() < 0.5 ? 'a' : 'b';
  if (room.round > 1) room.roundAttacker = room.roundAttacker === 'a' ? 'b' : 'a';
  this.dealAutomaticCharacters(room);
  room.phase = 'selecting';
}
```

自动好人排除双方手牌、本局已用人物和另一边本轮自动人物。

- [ ] **Step 6: 实现攻击、防守与胜出辩词写入**

`submitAttack` 验证当前席位、对方三名目标和文本长度，进入 `defense-input`。`submitDefense` 先原子写入 defense 并进入 `round-adjudicating`；AI 完成后以版本条件提交 `round-result`，把胜方原文写入 `characterArguments[targetId]`。

- [ ] **Step 7: 实现第三轮后的最终流程和多局准备**

第三轮 `round-result` 后进入 `track-adjudicating`。压轨成功后幸存方加一并进入 `judgment-generating`；审判保存后进入 `judgment`。双方调用 `ready-next-game` 后，未完成设置局数或平分则新开一局，否则进入 `match-end`。

- [ ] **Step 8: 运行 manager 全量测试**

Run: `pnpm --filter @ydi/server test -- manager.test.ts store.test.ts`

Expected: PASS。

---

### Task 5: 编排 REST、AI 中间广播和幂等命令

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`

**Interfaces:**
- Consumes: Task 4 `RoomManager` 方法。
- Produces: `/attack`, `/defend`, `/advance-round`, `/ready-next-game`, `/surrender`。

- [ ] **Step 1: 写 HTTP 失败测试**

创建真实双人 session/cookie，走完一次攻击和防守；断言非攻方 409、合法提交 200、重复 commandId 200 且不重复添加记录、双方获得各自裁剪的视图。

- [ ] **Step 2: 运行 HTTP 测试确认失败**

Run: `pnpm --filter @ydi/server test -- app.test.ts`

Expected: FAIL，路由仍使用旧 phase 或缺少新动作。

- [ ] **Step 3: 实现分段 AI 编排**

防守路由顺序必须是：保存 defense/进入 adjudicating → `broadcast(code)` → 调用 `decideRound` → 条件提交结果 → `broadcast(code)`。最终压轨和哲学审判同样在每个耗时 AI 调用前先广播中间 phase，避免双方看到冻结页面。

- [ ] **Step 4: 保持幂等边界**

`once(code, commandId, action)` 只包围第一次状态写入；AI 结果提交使用 `expectedVersion` 和 phase 检查，不能让重试覆盖更新状态。

- [ ] **Step 5: 运行服务端全量测试**

Run: `pnpm --filter @ydi/server test`

Expected: PASS。

---

### Task 6: 建立固定单屏舞台和三人物轨道

**Files:**
- Create: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/game/TrainStage.tsx`
- Modify: `apps/web/src/game/RailLane.tsx`
- Modify: `apps/web/src/game/SelectionTray.tsx`
- Modify: `apps/web/src/game/CharacterCard.tsx`
- Create: `apps/web/src/game/GameStage.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: 新 `RoomView`。
- Produces: `<GameStage room onAction onSurrender />`。

- [ ] **Step 1: 写失败的舞台组件测试**

断言每边三张人物卡、自动卡只读、顶部存在比分/回合/投降、攻防阶段页面没有内联 textarea。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ydi/web test -- GameStage.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现单屏 grid**

CSS 主结构：

```css
.game-shell { height: 100dvh; margin: 0; overflow: hidden; }
.game-stage { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.rail-board { min-height: 0; overflow: hidden; }
.rail-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

不要对 `.home` 应用禁止滚动。1280×720 时压缩人物背景到 3 行，详情由弹窗提供。

- [ ] **Step 4: 完成人物卡和发牌动画**

名称头像使用完整名字；故事正文显示背景；词条和胜出论据以计数/短标签呈现。六张手牌从中央档案堆依次进入，最后一张在 1.2 秒内落位；动画期间操作可用；减弱动画直接显示。

- [ ] **Step 5: 运行组件测试**

Run: `pnpm --filter @ydi/web test -- GameStage.test.tsx App.test.tsx`

Expected: PASS。

---

### Task 7: 实现攻防、等待和回合裁决弹窗

**Files:**
- Create: `apps/web/src/game/DebateModal.tsx`
- Create: `apps/web/src/game/DebateModal.test.tsx`
- Modify: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `<DebateModal room onSubmitAttack onSubmitDefense />`。

- [ ] **Step 1: 写角色视图失败测试**

分别用攻方、守方 `RoomView` 断言：攻方可选对方三人并输入；守方只见等待；攻击提交后守方看见攻击原文与防守框；攻方等待；AI 阶段双方看见列车长裁决中；结果阶段双方看见赢家与理由。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ydi/web test -- DebateModal.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现可访问模态层**

使用原生 `<dialog open>` 或带 `role="dialog" aria-modal="true"` 的焦点陷阱。标题与说明使用 `aria-labelledby/aria-describedby`；不可逆提交按钮写“提交攻击辩词”或“提交防守辩词”；等待和 AI 阶段没有关闭按钮。

- [ ] **Step 4: 防止重复提交**

提交后立即禁用控件并显示“正在提交…”。失败时保留文本并恢复操作；phase 或 version 更新后清理旧本地草稿。

- [ ] **Step 5: 运行弹窗测试**

Run: `pnpm --filter @ydi/web test -- DebateModal.test.tsx`

Expected: PASS。

---

### Task 8: 实现最终压轨、黑暗审判和下一局

**Files:**
- Create: `apps/web/src/game/JudgmentOverlay.tsx`
- Create: `apps/web/src/game/JudgmentOverlay.test.tsx`
- Modify: `apps/web/src/game/GameStage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `<JudgmentOverlay room onReadyNextGame />`。

- [ ] **Step 1: 写失败测试**

断言 `track-adjudicating` 显示列车长正在决定轨道；`judgment-generating` 显示压轨结果和审判生成状态；`judgment` 同时显示甲乙评议、列车长批判和两个问题；下一局按钮反映双方准备；`match-end` 显示总积分胜者。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ydi/web test -- JudgmentOverlay.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现黑暗视觉状态**

黑色占满舞台，审判红用于压轨方向和关键判断。只允许一次 600ms 列车横移与随后内容硬切；禁止闪烁。`prefers-reduced-motion` 下全部即时显示。

- [ ] **Step 4: 实现下一局和整场结束交互**

尚未准备按钮为“准备下一局”，点击后禁用并显示“等待对方”；双方准备后由服务器进入下一局。整场结束仅提供“返回首页”。

- [ ] **Step 5: 运行审判测试**

Run: `pnpm --filter @ydi/web test -- JudgmentOverlay.test.tsx`

Expected: PASS。

---

### Task 9: 精简 App 编排并完成端到端回归

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `GameStage` 和新命令。
- Produces: 完整可玩的多局房间流程。

- [ ] **Step 1: 写完整三回合前端流程测试**

用连续 `RoomView` rerender 模拟 selecting → traits → attack → defense → round result 三次 → track verdict → judgment → next game，断言每个阶段只出现对应交互，且旧内联 `.debate` 表单不存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @ydi/web test -- App.test.tsx`

Expected: FAIL，App 仍含旧阶段 JSX。

- [ ] **Step 3: 让 App 只负责会话和命令**

`App` 保留首页、room subscription、poll fallback、统一错误和 `api.action`。进入房间后只渲染：

```tsx
<GameStage room={room} error={error} send={send} leave={leaveRoom} />
```

- [ ] **Step 4: 更新 README**

写明三回合/六辩词、自动好人、DeepSeek 三阶段、fallback、投降和 1280×720 单屏要求；不暴露服务端密钥。

- [ ] **Step 5: 运行全量自动化验证**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: 全部 PASS，输出无 warning/error。

---

### Task 10: 浏览器视觉与双端验收

**Files:**
- Modify only if browser verification finds a reproducible defect; add a failing test before each behavior fix.

**Interfaces:**
- Produces: 真实浏览器验收记录。

- [ ] **Step 1: 验收首页未被比赛单屏样式污染**

在 1280×720 和窄屏打开首页，确认故事首页仍可正常滚动、创建/加入表单可用。

- [ ] **Step 2: 双会话走完三回合**

创建两个独立会话，验证首轮攻方随机、两端弹窗互补、三轮攻守交替、六段辩词、胜出论据附加、最终压轨、共同审判和下一局准备。

- [ ] **Step 3: 验证单屏尺寸**

在比赛阶段读取：

```js
({ innerHeight, scrollHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight })
```

Expected: 1280×720 与 1440×900 下 `scrollHeight <= innerHeight`。

- [ ] **Step 4: 验证故障和退出**

无 `DEEPSEEK_API_KEY` 时走完整局并看到 fallback 标记；任一方投降后另一方立即看到整场获胜，投降方回首页。

- [ ] **Step 5: 最终验证**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: 全部 PASS。记录仍存在的限制，不以测试通过替代视觉验收。


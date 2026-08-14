# 《活该》全局火车舞台与人物拖放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将在线双人对局改造成贯穿整局的火车双轨舞台，支持人物和词条的原生 Pointer Events 拖放，并让每局随机列车长真实影响 DeepSeek 裁决。

**Architecture:** 服务端仍是房间状态的唯一事实来源，只增加当前列车长 ID 和公开档案；现有选人、词条与辩词命令保持不变。前端把 `RoomScreen` 拆为稳定的 `TrainStage` 舞台和随阶段切换的操作托盘，拖放只负责产生与点击/键盘相同的纯状态转换，提交成功后仍以服务端快照为准。

**Tech Stack:** TypeScript 6、React、原生 Pointer Events、Fastify、Vitest、Testing Library、CSS transforms、DeepSeek OpenAI-compatible API。

## Global Constraints

- 每位玩家只能操作自己的铁路；对方锁定前不能泄露人物身份、阵营或卡面。
- 每人仍为六选二，选满后必须手动点击“锁定人物”。
- 每一局随机一名列车长，同一局三个回合保持不变，下一局重新抽取。
- 页面显示的列车长姓名、人设、规则、倾向必须与 DeepSeek 和本地降级裁决使用的数据一致。
- 拖放必须兼容鼠标、触屏和触控笔，并提供点击和键盘等价操作。
- 尊重 `prefers-reduced-motion`；关键状态不能只依靠颜色表达。
- 不引入拖拽库，不改变现有服务端选人、词条和辩词 HTTP 命令结构。
- 实施期间不得提交 Git Commit：当前工作目录不是 Git 仓库。

## File Structure

- Modify `packages/contracts/src/index.ts`: 增加列车长人设及房间公开字段。
- Modify `packages/contracts/src/index.test.ts`: 校验扩展后的共享类型相关结构。
- Modify `apps/server/src/content/catalog.ts`: 补充五名列车长人设，提供可测试的随机抽取函数。
- Modify `apps/server/src/content/catalog.test.ts`: 覆盖列车长目录和确定性抽取。
- Modify `apps/server/src/rooms/manager.ts`: 保存、公开、按局更换列车长，并传递完整 AI 上下文。
- Modify `apps/server/src/rooms/manager.test.ts`: 覆盖按局随机、重连稳定和超时裁决。
- Modify `apps/server/src/ai/client.ts`: 在提示中明确使用列车长身份和规则。
- Modify `apps/server/src/ai/client.test.ts`: 断言 DeepSeek 请求包含完整列车长与人物上下文。
- Create `apps/web/src/game/selection-state.ts`: 纯函数管理两个人物槽位。
- Create `apps/web/src/game/selection-state.test.ts`: 覆盖放置、交换、撤回和容量边界。
- Create `apps/web/src/game/use-pointer-drag.ts`: 统一 Pointer Events 生命周期、命中检测和取消清理。
- Create `apps/web/src/game/use-pointer-drag.test.tsx`: 覆盖合法释放、非法释放和 `pointercancel`。
- Create `apps/web/src/game/TrainStage.tsx`: 固定火车、列车长和双轨舞台骨架。
- Create `apps/web/src/game/CharacterCard.tsx`: 可拖放、可点击、键盘可用的人物卡。
- Create `apps/web/src/game/RailLane.tsx`: 玩家铁路、人物槽位和对手隐藏状态。
- Create `apps/web/src/game/SelectionTray.tsx`: 六张手牌、两个暂选槽位和锁定提交。
- Create `apps/web/src/game/TraitTray.tsx`: 词条拖放与提交。
- Create `apps/web/src/game/DebateTray.tsx`: 攻防目标和辩词操作台。
- Create `apps/web/src/game/VerdictOverlay.tsx`: 判词和列车去向状态。
- Modify `apps/web/src/App.tsx`: 用新的舞台组件组合现有房间流程。
- Modify `apps/web/src/App.test.tsx`: 覆盖完整舞台、隐藏边界和阶段切换。
- Modify `apps/web/src/styles.css`: 实现响应式铁路、漫画卡面、拖动层和减少动态效果。

---

### Task 1: 扩展列车长契约和内容目录

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/server/src/content/catalog.ts`
- Test: `apps/server/src/content/catalog.test.ts`

**Interfaces:**
- Produces: `Conductor = { id: string; name: string; persona: string; rule: string; bias: number }`
- Produces: `RoomView.conductor: Conductor | null`
- Produces: `pickConductor(value?: typeof catalog, random?: () => number): Conductor`

- [ ] **Step 1: 写契约和抽取行为的失败测试**

```ts
it('exposes the active conductor in a room view', () => {
  const conductor: Conductor = { id: 'moral', name: '铁面老周', persona: '从不相信事出有因。', rule: '对严重道德污点零容忍。', bias: -2 };
  expect(conductor.persona).toContain('事出有因');
});

it('picks a conductor with an injectable random source', () => {
  expect(pickConductor(catalog, () => 0)).toEqual(catalog.conductors[0]);
  expect(pickConductor(catalog, () => 0.999)).toEqual(catalog.conductors.at(-1));
});
```

- [ ] **Step 2: 运行测试并确认因 `persona`、`RoomView.conductor` 和 `pickConductor` 缺失而失败**

Run: `pnpm --filter @ydi/contracts test && pnpm --filter @ydi/server test -- src/content/catalog.test.ts`  
Expected: FAIL，错误指向新增字段或导出不存在。

- [ ] **Step 3: 完成最小契约和目录实现**

在 `Conductor` 增加 `persona`，在 `RoomView` 增加 `conductor: Conductor | null`，为五个目录项补充各自原创人设，并实现：

```ts
export function pickConductor(value = catalog, random = secureRandom): Conductor {
  const index = Math.min(value.conductors.length - 1, Math.floor(random() * value.conductors.length));
  return value.conductors[index]!;
}
```

同步扩展 Zod 目录 schema，使缺少 `persona` 的目录无法通过验证。

- [ ] **Step 4: 运行目标测试确保通过**

Run: `pnpm --filter @ydi/contracts test && pnpm --filter @ydi/server test -- src/content/catalog.test.ts`  
Expected: PASS。

- [ ] **Step 5: 运行共享类型检查**

Run: `pnpm --filter @ydi/contracts typecheck && pnpm --filter @ydi/server typecheck && pnpm --filter @ydi/web typecheck`  
Expected: 现有 `RoomView` fixture 因缺少 `conductor` 产生可定位错误；在后续测试 fixture 中显式补上该字段，不给运行时代码增加兼容假值。

### Task 2: 在房间生命周期内保存并按局更换列车长

**Files:**
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Consumes: `pickConductor()` 和 `RoomView.conductor`
- Produces: `Room.conductorId: string | null`
- Produces: `RoomManager` 构造选项中的 `random?: () => number`，供发牌与列车长抽取测试注入

- [ ] **Step 1: 写失败测试覆盖首次抽取、回合稳定、下一局更新和恢复稳定**

```ts
it('keeps one conductor for a game and picks again for the next game', async () => {
  const randomValues = [0, 0, 0, 0.99];
  const rooms = createRooms({ random: () => randomValues.shift() ?? 0 });
  const code = await startReadyRoom(rooms);
  const first = rooms.get(code).conductorId;
  rooms.get(code).round = 2;
  expect(rooms.get(code).conductorId).toBe(first);
  await finishCurrentGameForTest(rooms, code);
  expect(rooms.get(code).conductorId).not.toBe(first);
});

it('restores the persisted conductor instead of drawing another', async () => {
  const original = await persistedStartedRoom();
  const restored = reloadRoomManager(original.store);
  expect(restored.get(original.code).conductorId).toBe(original.conductorId);
});
```

- [ ] **Step 2: 运行测试确认失败原因是房间未保存列车长**

Run: `pnpm --filter @ydi/server test -- src/rooms/manager.test.ts`  
Expected: FAIL，`conductorId` 不存在或始终为空。

- [ ] **Step 3: 写最小房间生命周期实现**

创建房间时令 `conductorId: null`；首次 `start()` 发牌时调用 `pickConductor`；`advanceRound()` 不更换；`finishCurrentGame()` 确认继续下一局时重新抽取。`view()` 通过 ID 查找并返回完整 `conductor`，等待阶段返回 `null`。持久化恢复只读取已有 ID。

- [ ] **Step 4: 运行房间测试确保通过**

Run: `pnpm --filter @ydi/server test -- src/rooms/manager.test.ts`  
Expected: PASS。

- [ ] **Step 5: 增加缺失目录项的显式错误测试并实现**

```ts
it('rejects a persisted room whose conductor no longer exists', () => {
  expect(() => rooms.view(code, 'p1')).toThrow(/conductor is missing/i);
});
```

`view()`、AI 裁决和超时裁决统一通过 `requireConductor(room)` 查找；找不到时抛出 `conductor is missing: <id>`，不得静默替换。

- [ ] **Step 6: 重新运行房间测试**

Run: `pnpm --filter @ydi/server test -- src/rooms/manager.test.ts`  
Expected: PASS。

### Task 3: 将真实列车长与人物上下文传给 DeepSeek

**Files:**
- Modify: `apps/server/src/ai/client.ts`
- Modify: `apps/server/src/ai/client.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`
- Modify: `apps/server/src/rooms/manager.test.ts`

**Interfaces:**
- Produces: `DecisionInput` 增加必填的 `conductorName`、`conductorPersona`、`conductorRule`、`characterName`、`characterBackground`、`traits`
- Consumes: 房间当前 `Conductor` 以及目标人物/词条

- [ ] **Step 1: 写失败测试捕获实际发送的 DeepSeek 请求内容**

```ts
it('sends the visible conductor and character context to DeepSeek', async () => {
  const requestBodies: unknown[] = [];
  const gateway = createAiGateway({
    apiKey: 'x',
    createCompletion: async (body) => {
      requestBodies.push(body);
      return { choices: [{ message: { content: '{"winner":"defense","reason":"符合规则","coreArgument":"已经补救","fallback":false}' } }] };
    },
  });
  await gateway.decide(decisionFixture);
  expect(JSON.stringify(requestBodies[0])).toContain('铁面老周');
  expect(JSON.stringify(requestBodies[0])).toContain('从不相信事出有因');
  expect(JSON.stringify(requestBodies[0])).toContain('急诊医生');
});
```

- [ ] **Step 2: 运行 AI 测试确认当前请求适配层不可注入或上下文字段缺失**

Run: `pnpm --filter @ydi/server test -- src/ai/client.test.ts`  
Expected: FAIL。

- [ ] **Step 3: 最小化调整 AI 网关**

将 `createCompletion` 作为可选依赖注入，默认值仍调用 `client.chat.completions.create`。系统提示明确写入“你必须忠实采用本局列车长的人设与规则”；用户消息继续序列化完整 `DecisionInput`。保留 JSON Output、禁用思考和三次失败后本地降级。

- [ ] **Step 4: 运行 AI 测试确保通过**

Run: `pnpm --filter @ydi/server test -- src/ai/client.test.ts`  
Expected: PASS。

- [ ] **Step 5: 写房间集成失败测试并接入当前列车长**

```ts
expect(aiInputs[0]).toMatchObject({
  conductorName: roomConductor.name,
  conductorPersona: roomConductor.persona,
  conductorRule: roomConductor.rule,
  conductorBias: roomConductor.bias,
  characterName: target.name,
  characterBackground: target.background,
});
```

在 `defend()` 组装完整输入；在防守超时路径使用 `requireConductor(room).bias`，删除所有 `catalog.conductors[0]` 引用。

- [ ] **Step 6: 运行 AI 和房间测试**

Run: `pnpm --filter @ydi/server test -- src/ai/client.test.ts src/rooms/manager.test.ts`  
Expected: PASS。

### Task 4: 用纯函数建立两槽位选择模型

**Files:**
- Create: `apps/web/src/game/selection-state.ts`
- Create: `apps/web/src/game/selection-state.test.ts`

**Interfaces:**
- Produces: `type SelectionSlots = [string | null, string | null]`
- Produces: `placeCharacter(slots, characterId, slotIndex): SelectionSlots`
- Produces: `removeCharacter(slots, characterId): SelectionSlots`
- Produces: `selectedCharacterIds(slots): string[]`

- [ ] **Step 1: 写所有状态转换的失败测试**

```ts
it('places, moves, swaps and removes characters without duplicates', () => {
  expect(placeCharacter([null, null], 'a', 0)).toEqual(['a', null]);
  expect(placeCharacter(['a', null], 'a', 1)).toEqual([null, 'a']);
  expect(placeCharacter(['a', 'b'], 'a', 1)).toEqual(['b', 'a']);
  expect(removeCharacter(['a', 'b'], 'a')).toEqual([null, 'b']);
  expect(selectedCharacterIds(['a', 'b'])).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: 运行测试确认模块尚不存在**

Run: `pnpm --filter @ydi/web test -- src/game/selection-state.test.ts`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现不可变纯函数**

`placeCharacter` 若目标人物已在另一槽位且目标为空则移动；若目标已有另一人物则交换；永远返回新元组且不产生重复 ID。`removeCharacter` 只清除匹配槽位。`selectedCharacterIds` 按槽位顺序过滤空值。

- [ ] **Step 4: 运行测试确保通过**

Run: `pnpm --filter @ydi/web test -- src/game/selection-state.test.ts`  
Expected: PASS。

### Task 5: 建立可取消的 Pointer Events 拖放基础层

**Files:**
- Create: `apps/web/src/game/use-pointer-drag.ts`
- Create: `apps/web/src/game/use-pointer-drag.test.tsx`

**Interfaces:**
- Produces: `usePointerDrag({ onDrop }): { dragState, bindDragSource(id), cancelDrag }`
- `onDrop(sourceId: string, target: DropTarget | null): void`
- `DropTarget = { type: 'selection-slot'; index: 0 | 1 } | { type: 'hand' } | { type: 'character'; id: string }`
- 合法目标通过 DOM 的 `data-drop-type`、`data-slot-index`、`data-character-id` 解析

- [ ] **Step 1: 写失败测试覆盖合法投放、非法释放和取消**

```tsx
it('drops on a semantic target and clears on pointer cancel', () => {
  const onDrop = vi.fn();
  render(<DragHarness onDrop={onDrop} />);
  fireEvent.pointerDown(screen.getByRole('button', { name: '消防员' }), { pointerId: 1, clientX: 10, clientY: 10 });
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(screen.getByTestId('slot-0'));
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 30 });
  expect(onDrop).toHaveBeenCalledWith('good-1', { type: 'selection-slot', index: 0 });
  fireEvent.pointerDown(screen.getByRole('button', { name: '消防员' }), { pointerId: 2 });
  fireEvent.pointerCancel(window, { pointerId: 2 });
  expect(screen.queryByTestId('drag-layer')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认 Hook 尚不存在**

Run: `pnpm --filter @ydi/web test -- src/game/use-pointer-drag.test.tsx`  
Expected: FAIL。

- [ ] **Step 3: 实现最小 Hook**

在 `pointerdown` 时记录 ID、指针 ID 和坐标，并调用 `setPointerCapture`（若存在）；在 window 的 `pointermove` 中用 `requestAnimationFrame` 合并坐标更新；在 `pointerup` 使用 `document.elementFromPoint(...).closest('[data-drop-type]')` 解析目标；在 `pointercancel`、窗口失焦、阶段依赖变化和卸载时调用 `cancelDrag()`。所有监听器在 effect cleanup 中移除。

- [ ] **Step 4: 运行 Hook 测试确保通过**

Run: `pnpm --filter @ydi/web test -- src/game/use-pointer-drag.test.tsx`  
Expected: PASS，无 act 警告。

### Task 6: 实现选人阶段的双轨舞台

**Files:**
- Create: `apps/web/src/game/CharacterCard.tsx`
- Create: `apps/web/src/game/RailLane.tsx`
- Create: `apps/web/src/game/SelectionTray.tsx`
- Create: `apps/web/src/game/TrainStage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 4 的槽位纯函数、Task 5 的拖放 Hook、`RoomView.conductor`
- Produces: `TrainStage({ room, children, dragLayer })`
- Produces: `SelectionTray({ room, send })`

- [ ] **Step 1: 更新房间 fixture 并写失败的舞台/隐私/锁定测试**

```tsx
it('renders one train stage, conductor profile, two players and six hand cards', () => {
  render(<RoomScreen room={selectingRoom} send={send} />);
  expect(screen.getByRole('region', { name: '火车审判现场' })).toBeInTheDocument();
  expect(screen.getByText(selectingRoom.conductor!.name)).toBeInTheDocument();
  expect(screen.getAllByTestId('hand-character')).toHaveLength(6);
  expect(screen.getAllByText('对方人物尚未公开')).toHaveLength(2);
});

it('requires two slotted characters and a manual lock', async () => {
  render(<RoomScreen room={selectingRoom} send={send} />);
  await user.click(screen.getByRole('button', { name: /消防员/ }));
  await user.click(screen.getByTestId('mine-slot-0'));
  await user.click(screen.getByRole('button', { name: /调查记者/ }));
  await user.click(screen.getByTestId('mine-slot-1'));
  expect(send).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '锁定人物' }));
  expect(send).toHaveBeenCalledWith('select', expect.objectContaining({ characterIds: expect.any(Array) }));
});
```

- [ ] **Step 2: 运行测试确认当前页面没有固定舞台和槽位交互**

Run: `pnpm --filter @ydi/web test -- src/App.test.tsx`  
Expected: FAIL，找不到火车舞台、槽位或六张卡。

- [ ] **Step 3: 实现固定舞台和点击/键盘选择的最小版本**

`TrainStage` 渲染页头、`ConductorPanel`、火车和两条 `RailLane`。`SelectionTray` 使用 `SelectionSlots`，点击人物后进入“待放置”状态，点击自己的槽位完成放置；人物按钮使用 `aria-pressed`，槽位使用有意义的 `aria-label`。对方未锁定时仅渲染两张统一背面占位，不从 `room.hand` 或未公开字段推导信息。

- [ ] **Step 4: 接入 Pointer Events 和提交失败保护**

人物卡和已上轨卡均注册拖动源；槽位、手牌区注册语义投放目标。新增 `submitting` 防止重复操作；`await send(...)` 成功后清空槽位，catch 时不清空并把错误继续交给现有上层处理。

- [ ] **Step 5: 运行 App 和拖放测试**

Run: `pnpm --filter @ydi/web test -- src/App.test.tsx src/game/use-pointer-drag.test.tsx src/game/selection-state.test.ts`  
Expected: PASS。

### Task 7: 将词条、攻防和判决纳入同一舞台

**Files:**
- Create: `apps/web/src/game/TraitTray.tsx`
- Create: `apps/web/src/game/DebateTray.tsx`
- Create: `apps/web/src/game/VerdictOverlay.tsx`
- Modify: `apps/web/src/game/TrainStage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: 同一个 `TrainStage`、`RoomView.characters`、`RoomView.activeSpeaker`
- Produces: 所有对局阶段只更换 `stage-controls` 内容，不卸载双轨场景

- [ ] **Step 1: 写失败测试证明阶段切换仍保留同一个舞台**

```tsx
it.each(['traits', 'attack-a', 'defense-a', 'match-end'] as const)('keeps the train stage during %s', (phase) => {
  render(<RoomScreen room={{ ...baseRoom, phase }} send={send} />);
  expect(screen.getByRole('region', { name: '火车审判现场' })).toBeInTheDocument();
  expect(screen.getByTestId('rail-a')).toBeInTheDocument();
  expect(screen.getByTestId('rail-b')).toBeInTheDocument();
});
```

另写词条拖到人物后调用 `send('trait', ...)`、攻击目标高亮、非当前行动者不可编辑、最终结果显示列车去向的测试。

- [ ] **Step 2: 运行测试确认当前阶段组件位于舞台外或不存在**

Run: `pnpm --filter @ydi/web test -- src/App.test.tsx`  
Expected: FAIL。

- [ ] **Step 3: 提取并接入三个阶段托盘**

`TraitTray` 将词条点击/拖放统一为 `{ traitId, targetId }`；`DebateTray` 保留现有 2000 字和不可修改规则；`VerdictOverlay` 根据 `finalResult.survivor` 与当前席位计算火车目标轨道。`RoomScreen` 只负责根据 phase 选择托盘并将其作为 `TrainStage` 子内容。

- [ ] **Step 4: 处理阶段变化取消拖放**

将 `room.phase` 和 `room.version` 作为拖放 Hook 的取消依赖；快照推进阶段时清除人物/词条拖动影子、待选目标和已失效的本地输入，但不得在同阶段版本刷新时清空尚未提交的选人槽位。

- [ ] **Step 5: 运行全部前端测试**

Run: `pnpm --filter @ydi/web test`  
Expected: PASS。

### Task 8: 完成漫画铁路视觉、响应式与减少动态效果

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/game/TrainStage.tsx`
- Modify: `apps/web/src/game/VerdictOverlay.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces: CSS 状态类 `.is-dragging`、`.is-drop-target`、`.is-judged`、`.train-to-a`、`.train-to-b`
- Produces: `data-reduced-motion` 或媒体查询下的静态判决表现

- [ ] **Step 1: 写失败测试验证结构状态而非动画实现细节**

```tsx
it('marks the judged rail and train destination without relying on color alone', () => {
  render(<RoomScreen room={finishedRoom} send={send} />);
  expect(screen.getByTestId('judgment-result')).toHaveTextContent('列车驶向');
  expect(screen.getByTestId('train')).toHaveAttribute('data-destination', 'b');
});
```

- [ ] **Step 2: 运行测试确认判决语义状态缺失**

Run: `pnpm --filter @ydi/web test -- src/App.test.tsx`  
Expected: FAIL。

- [ ] **Step 3: 实现视觉 token 与桌面布局**

复用现有 `--ink`、`--red`、`--paper` 等变量；使用粗黑描边、纸张背景、红黄重点色构建列车长档案、火车、双轨、两个人物槽和底部六卡。拖动影子使用 `position: fixed; pointer-events: none; transform: translate3d(...)`，合法目标同时显示文字“松开放置”和虚线边框。

- [ ] **Step 4: 实现移动端与减少动态效果**

在窄屏把六张手牌改为横向滚动、缩短铁路、确保触摸目标至少 44×44 CSS px。只使用 `transform`/`opacity` 制作吸附和列车运动，并增加：

```css
@media (prefers-reduced-motion: reduce) {
  .drag-layer, .train-engine, .character-card { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 5: 运行前端测试、lint、类型检查和构建**

Run: `pnpm --filter @ydi/web test && pnpm --filter @ydi/web lint && pnpm --filter @ydi/web typecheck && pnpm --filter @ydi/web build`  
Expected: 全部退出码 0，无 React act 警告。

### Task 9: 完整集成验证与浏览器验收

**Files:**
- Modify only if verification exposes a regression; every fix must first add a failing regression test to the nearest existing `*.test.ts(x)` file.

**Interfaces:**
- Consumes: Tasks 1–8 的最终行为
- Produces: 可在 `http://127.0.0.1:3100/` 双客户端完成的整局游戏

- [ ] **Step 1: 运行整个工作区自动验证**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`  
Expected: 所有包退出码 0，服务端 7 个以上测试文件和前端新增测试全部通过。

- [ ] **Step 2: 启动生产构建并验证健康检查**

Run: `pnpm --filter @ydi/server start`  
另一个终端运行：`Invoke-RestMethod http://127.0.0.1:3100/api/health | ConvertTo-Json -Compress`  
Expected: `{"ok":true,"catalog":true}`。

- [ ] **Step 3: 使用两个独立浏览器会话完成主路径**

按顺序验证：创建/加入房间 → 双方准备 → 六张卡拖两人到己方轨道 → 手动锁定 → 对手锁定前保持背面、锁定后公开 → 拖词条到人物 → 双方完成攻防 → DeepSeek 返回 `fallback=false` → 列车显示败方轨道 → 下一回合列车长不变。

- [ ] **Step 4: 验证下一局列车长和恢复路径**

完成第三回合进入下一局，确认列车长重新抽取；刷新任一客户端，确认重连后列车长、人物位置、词条与阶段保持不变。

- [ ] **Step 5: 验证边界输入方式**

用浏览器设备模拟验证触屏拖放；只用键盘完成两个人物的选择和锁定；启用减少动态效果后确认列车不位移但结果文字、目标轨道和判词仍完整显示。

- [ ] **Step 6: 记录真实 DeepSeek 验证**

Run: `pnpm --filter @ydi/server verify:deepseek`  
Expected: 输出仅包含模型、耗时、胜方和 `fallback:false`，不得输出 API key 或完整辩词。


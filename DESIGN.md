# Design System

## Overview

场景是深夜桌面上摊开的黑白庭审卷宗，被红色列车警示灯短暂扫过。整体像低成本黑白印刷品，但排版和交互保持精确，不使用仿手绘 SVG 或任何现有漫画 IP 素材。

## Color

```css
:root {
  --bg: oklch(0.985 0 0);
  --surface: oklch(0.94 0 0);
  --ink: oklch(0.13 0 0);
  --muted: oklch(0.42 0 0);
  --primary: oklch(0.54 0.20 352);
  --primary-strong: oklch(0.42 0.18 352);
  --accent: oklch(0.22 0.04 255);
  --success: oklch(0.43 0.12 150);
}
```

采用 restrained 策略。黑白承担 90% 的界面，审判红只用于主动作、危险状态与列车轨道选择；深蓝黑用于连接和系统信息。

## Typography

- 展示标题：`Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`，只用于游戏标题与审判结论。
- 正文与控件：`"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif`。
- 数据与计时：`"Cascadia Mono", "SFMono-Regular", monospace`。
- 正文行长不超过 72ch，辩词输入保持 1rem 以上字号。

## Shape and Material

- 主边框为 3px 实黑，次级分隔为 1px 黑线。
- 卡片圆角最多 8px，不使用柔和大阴影；强调层使用 5px 硬阴影且无模糊。
- 网点纹理由径向渐变生成，只放在舞台背景与裁决遮罩，不铺满正文。
- 撕纸感通过少量 `clip-path: polygon()` 用于标题标签，不用于表单控件。

## Layout

首页像一张左右分栏的案卷封面；牌桌由左右两条轨道和中间列车长裁决栏构成。信息随阶段渐进出现，不把所有规则同时塞进屏幕。桌面基准 1440×900，1280×720 仍完整可操作，小屏显示设备提示。

## Components

- Button：实黑次按钮、审判红主按钮、透明文本按钮，均具备 hover/focus/active/disabled/loading。
- Input：2px 黑边、明确标签、内联错误，不用占位符替代标签。
- Character card：卡面、分类章、人物名、背景、累计词条和选中状态；选中状态同时使用轮廓、文字与符号。
- Trait token：类似剪下的报纸条目，可投放但不使用拖拽作为唯一操作。
- Timer：等宽数字与文字阶段名；最后 10 秒才进入红色告警。
- Verdict：以整页硬切换和单次列车横移表现，减弱动画时改为直接显隐。

## Motion

普通状态转换为 150–220ms ease-out。人物选择使用轻微位移与硬阴影变化；提交锁定使用一次印章反馈；最终拉杆允许 600ms 单次列车横移。所有动画在 `prefers-reduced-motion: reduce` 下变为即时或短交叉淡入。

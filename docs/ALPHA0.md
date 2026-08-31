# Memo Flash Vision · Alpha 0.2

## 这次重构的目标

Alpha 0.2 把两个原型里真正成熟的部分重新合并：

- Memo：产品结构、IndexedDB、ReviewLog、统计与 mono-color 视觉。
- Fangge：翻卡动画、触屏评级、错卡二刷、固定背卡页面和会话节奏。

同时引入正式的数据层级：

```
Project
  └─ Deck
      └─ Card
```

每日复习现在以 **Project** 为范围，而不是把所有学科混在一个全局队列里。

## Project 模型

Bundled data 目前迁为两个项目：

- 软件架构
  - 软件架构（76 张）
- CET-6
  - 24 个词汇卡组（2345 张）

首页左上方的九点区域现在是 Project Switcher。切换 Project 后以下内容同时变化：

- 今日复习队列
- 首页最近卡组预览
- 项目统计
- Decks 页面
- Progress 页面

## Daily

每日队列仍使用：

1. 最多 10 张 lapse 卡
2. 当前 Project 下所有到期卡
3. 最多 20 张新卡

因此 Daily 是一个真正的 Project-scoped session。

## Fangge 会话行为

恢复：

- 点击卡片正反双向翻转
- 0.5 秒 rotateX 翻卡 + lift 动画
- 左滑：不认识
- 右滑：认识
- 下滑：眼熟
- 左屏缘右滑：返回
- 正面直接滑：先落评级 → 自动翻面 → 盖章 → 换卡
- 下滑评级时阻止页面滚动
- 背卡页固定在 100dvh，不允许浏览器上下拖动打断手势
- × / △ / ○ 描边印章动画
- 错卡同 session 第二遍
- 第二遍认识 → 2 天；眼熟 → 1 天（与 Fangge 一致）

## IndexedDB v2

新增 `projects` 表，`decks` 增加 `projectId` 索引。

数据库升级采用 Dexie schema migration，不清空旧的 `states` 和 `logs`。

旧 Deck 自动映射：

- `fangge-cards` → `cet6`
- 其他 bundled architecture deck → `software-architecture`

## Home preview

首页 FRONT/BACK 预览不再使用写死的 Green 公式占位。

它优先显示当前 Project 最近复习过的 Deck 和 Card；没有历史时回退到该 Project 第一套 bundled deck。

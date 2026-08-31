# Memo Flashcards · Alpha 0

> Working title: **Memo**. 名字暂定，架构先定。

## 目标

把两个已有原型整合为一个离线优先的通用闪卡软件：

- **architecture-flashcards-mobile**：通用问答卡、分类/薄弱卡思路、Leitner 复习。
- **fangge-cards**：成熟的每日任务、三向手势、错词二刷、简化 SM-2、2345 个六级词。

Alpha 0 不做账号、后端、订阅、AI 生成和云同步。

## 已纳入范围

- Home / Today
- Deck Library
- Review Session
- 三档评级：Again / Hard / Good
- 第一遍答错 → 同会话第二轮
- 今日队列：最多 10 个错卡 + 全部到期卡 + 最多 20 个新卡
- IndexedDB / Dexie
- 每次复习写 ReviewLog
- Today / Streak / Accuracy / 7 日学习量
- PWA 离线壳
- 软件架构 76 张 + CET-6 2345 张 = **2421 张**

## 核心分层

```
React UI
  ↓
Study Session
  ↓
Scheduler
  ↓
ReviewState + ReviewLog
  ↓
Dexie / IndexedDB

Bundled assets → Seed Adapter → Deck / Card
Legacy exports → Migration Adapter（下一里程碑）
```

卡片内容、当前记忆状态、历史复习事件三者必须分离。

## 数据模型

```ts
Deck { id, name, description?, source, cardCount?, order? }

Card {
  id, legacyKey?, deckId,
  front, back, note?, tags[],
  order, source
}

ReviewState {
  cardId, intervalDays, dueDay,
  lapses, reviewCount, lastReviewAt?
}

ReviewLog {
  id?, cardId, deckId, reviewedAt, rating,
  previousIntervalDays, nextIntervalDays, dueDay
}
```

ReviewLog 采用 append-only 思路。连续学习、认识率、学习量以及未来的遗忘分析都从历史事件推导。

## Alpha 0 调度

先保留 Fangge 中容易理解的行为：

- 新卡 + Good → 3 天
- 新卡 + Hard → 1 天
- Again → 今天再次到期并记一次 lapse
- 复习卡 + Good → interval × 2.5
- 复习卡 + Hard → interval × 1.6
- 第一遍 Again → 当前 session 结束后进入错卡第二遍

调度器独立在 core 中，未来换 FSRS 不需要改 UI 或数据库主体。

## 视觉

mono-color 的编辑设计语言用于产品系统而不是套海报皮：

- 暖纸底
- 深海军蓝主墨
- 朱红强调墨
- 主动留白
- serif 大标题
- 微弱网点/印刷纹理
- Home / Progress 可以表达品牌
- Review 页面主动收静，只服务记忆动作

Fangge 原来的批改符号继续作为交互语言：
**× 不认识 / △ 眼熟 / ○ 认识**

## Alpha 0 完成标准

- 测试通过
- Vite 构建通过并生成 PWA
- 首次启动幂等写入 2421 张卡
- 每次评级在同一事务写 ReviewState + ReviewLog
- Again 卡在同一 session 获得一次第二遍
- 刷新和离线重开后进度仍存在
- 首页和统计页只展示真实历史数据

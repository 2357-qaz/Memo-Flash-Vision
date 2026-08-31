# Legacy migration

## architecture-flashcards-mobile

原始题卡：
```js
[category, difficulty, question, answer, note]
```

迁移为：
```js
{
  id: "arch-001",
  deckId: "software-architecture",
  front: question,
  back: answer,
  note,
  tags: [category, difficulty],
  source: "architecture-flashcards-mobile"
}
```

后续导入旧进度时可将 Box 粗略映射为 0 / 1 / 3 / 7 / 14 天。

## fangge-cards

24 个原 deckId 原样保留。词卡使用 `<deckId>:<word>` 作为新 ID，并把旧 word key 保存为 `legacyKey`。

旧状态可直接映射：
- `iv` → `intervalDays`
- `due` → `dueDay`
- `lapse` → `lapses`
- `seen` → `reviewCount`

Alpha 0 已把两边内容资产复制为静态 JSON seed，因此新运行时不依赖旧仓库的单文件实现。

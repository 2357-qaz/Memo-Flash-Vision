# Memo Flash Vision

Offline-first flashcards with a mono-color editorial interface.

## Alpha 0.2

Current foundation:

- **Project → Deck → Card** hierarchy
- Project-scoped Daily review
- 76 software architecture cards
- 24 CET-6 decks / 2,345 vocabulary cards
- **2,421 cards total**
- React + TypeScript + Vite
- IndexedDB via Dexie
- Again / Hard / Good scheduler
- Fangge-style 3-way touch gestures and flip animation
- Same-session second pass for missed cards
- Append-only ReviewLog
- Project-scoped Today / Streak / Accuracy / 7-day statistics
- Dynamic recent-deck home preview
- PWA + GitHub Pages

## Review gestures

- Tap: flip front/back
- Swipe left: Again / 不认识
- Swipe right: Good / 认识
- Swipe down: Hard / 眼熟
- Swipe right from the left screen edge: leave review

A swipe can rate directly from the front side; the card flips, stamps the judgment, then advances.

## Local development

```bash
npm install
npm test
npm run dev
```

Production build:

```bash
npm run build
```

See [docs/ALPHA0.md](docs/ALPHA0.md) and [docs/MIGRATION.md](docs/MIGRATION.md).

## GitHub Pages

Pushes to `main` build and deploy the Vite app automatically.

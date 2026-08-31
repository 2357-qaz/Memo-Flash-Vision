# Memo Flash Vision

Offline-first flashcards with a mono-color editorial interface.

## Alpha 0

This repository is the clean migration target for the unified flashcard prototype.

Current bundled content:

- 76 software architecture cards
- 24 CET-6 decks / 2,345 vocabulary cards
- **2,421 cards total**

Current product foundation:

- React + TypeScript + Vite
- IndexedDB via Dexie
- Today queue: up to 10 lapse cards + all due reviews + up to 20 fresh cards
- Again / Hard / Good rating
- Same-session second pass for missed cards
- Append-only ReviewLog
- Real Today / Streak / Accuracy / 7-day statistics
- Responsive mono-color UI
- PWA support

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

A Pages deployment workflow is included. After GitHub Pages is enabled with **Source: GitHub Actions**, the workflow can deploy the Vite build automatically.

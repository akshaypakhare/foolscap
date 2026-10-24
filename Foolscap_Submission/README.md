# Foolscap — Collaborative Documents

> Submitted for the assessment as *DraftSpace — Collaborative Documents*; the product was renamed Foolscap (a classic paper size) during polish. The project folder name is unchanged.

A small Google Docs–inspired document workspace built for the Ajaia Full Stack Product Engineer take-home. Vanilla JS front end, a dependency-light Node.js API, JSON-file persistence.

## Design

A warm "paper and ink" identity: dark ink sidebar, paper-toned canvas, serif writing surface (Newsreader) with Instrument Sans UI and a single green accent. Responsive down to phone width. Screenshots are in `submission/assets/`.

## Features

- Create, list, open, rename, edit, autosave, and reopen documents; content survives refresh and server restart.
- Rich text: bold, italic, underline, headings (H1–H3), bulleted and numbered lists, clear formatting.
- Import `.txt` and `.md` (≤ 300 KB) as new editable documents. Markdown subset: `#`–`###`, `-`/`*` bullets, `1.` lists, `**bold**`, `*italic*`.
- Sharing with roles: **Owner**, **Editor**, **Viewer**. Dashboard filters for *My documents* / *Shared with me*; viewers get a read-only editor.
- Permissions enforced on the server (see below), not just in the UI.
- **Version history:** automatic checkpoints (first change after a pause, and before every restore), preview any version, one-click restore (editors/owner only; nothing is lost because the current text is checkpointed first).
- **Slash menu:** type `/` in the page for headings, lists, or plain text, filtered as you type.
- **Command palette (⌘K / Ctrl+K):** jump to any document, create, import, share, open history, toggle focus mode, switch demo account.
- **Live outline** built from headings (click to jump), reading time, and "last edited by".
- **Focus mode** (hides all chrome; Esc exits), drag-and-drop import, delete with confirmation, toolbar buttons that reflect the current selection.
- Save status indicator, empty/loading/error states, search, responsive layout, HTML export.
- Server-side HTML sanitization (allowlist via `sanitize-html`).

## Prerequisites

Node.js 20+ and npm.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts on change
npm test           # 10 automated tests (node:test)
```

Production uses the same `npm start`; the port comes from `PORT`.

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Directory holding `store.json` (created on first run, git-ignored) |

## Demo accounts (not real authentication)

Click an avatar to switch user. There are no passwords: the server trusts a `user` query parameter / `x-user-id` header that must match one of three seeded users.

| User | ID | Owns (shared with) |
|---|---|---|
| Akshay Pakhare | `u-akshay` | Welcome (Jamie: editor) · Q3 Product Roadmap (Jamie: viewer, Morgan: editor) · Personal Reading List (private) |
| Jamie Chen | `u-jamie` | Weekly Team Meeting Notes (Akshay: editor, Morgan: viewer) · Customer Onboarding Checklist (Akshay: viewer) · Blog Post Ideas (private) |
| Morgan Lee | `u-morgan` | Design Review Feedback (Akshay: editor, Jamie: viewer) · Vacation Plans (private) |

Seed data is created on first run (`rm -rf data` to reset). Every case is covered: owner, editor, viewer, private, and no access (e.g. Morgan cannot see Welcome or Akshay's reading list).

## Permission model

| Action | Owner | Editor | Viewer | No access |
|---|---|---|---|---|
| Read | ✓ | ✓ | ✓ | 404 |
| Edit content | ✓ | ✓ | 403 | 404 |
| Rename | ✓ | 403 | 403 | 404 |
| Share / unshare / delete | ✓ | 403 | 403 | 404 |

Unauthorized users receive 404 so document existence is not leaked.

## Deployment

`render.yaml` is provided (build `npm ci`, start `npm start`, health check `/api/health`). To deploy on Render you must connect a Git repository you have published yourself, then create a Web Service (or Blueprint) from it. **Persistence caveat:** Render's free plan has an ephemeral filesystem, so documents reset on redeploy/restart. For durable data use a paid plan with a persistent disk (mount e.g. `/var/data`, set `DATA_DIR=/var/data`) or swap `lib/store.js` for a database. After deploying, verify: `GET /api/health` returns `{"ok":true}`, then create a document, refresh, and switch users.

## Known limitations

- No real authentication; the user switcher is a demo identity model. Do not store confidential data.
- Not real-time collaboration: last write wins, no conflict detection or presence.
- JSON file store: single process only, whole file rewritten on each save.
- Editing relies on `contenteditable`/`execCommand` (deprecated but widely supported); no links, images, or tables.
- Version history keeps the last 30 checkpoints per document and restores content only (titles are not versioned).
- Only `.txt` and `.md` import; no `.docx`.
- Google Fonts are loaded from a CDN; offline the UI falls back to system fonts.
- Browser testing was manual (no automated end-to-end suite).

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details.

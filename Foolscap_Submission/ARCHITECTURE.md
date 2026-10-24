# Architecture

## Overview

Single Node.js process (`http` module, no framework) that serves a static vanilla-JS single-page app and a JSON API. Persistence is one JSON file.

```
server.js        routing, auth-by-demo-user, permission checks, validation
lib/store.js     JSON-file store (atomic write, corrupt-file protection)
lib/sanitize.js  allowlist HTML sanitizer (sanitize-html) + escapeHtml
lib/markdown.js  .md / .txt -> HTML converters (escape first)
public/          index.html, styles.css
                 app.js  dashboard, editor core, share modal; exposes window.Foolscap
                 ux.js   outline, slash menu, command palette, focus mode, history drawer, drag-drop, delete
test/            node:test suite over real HTTP
```

`createApp({ dataDir })` builds the server so tests run against isolated temp directories on ephemeral ports.

## API

| Method & path | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/users` | seeded demo users |
| `GET /api/documents` | docs the current user can read |
| `POST /api/documents` | create `{title}` |
| `GET /api/documents/:id` | read |
| `PATCH /api/documents/:id` | update `{title?, content?}` |
| `DELETE /api/documents/:id` | owner only |
| `POST /api/documents/:id/share` | owner: `{userId, role: viewer\|editor}` |
| `DELETE /api/documents/:id/share/:userId` | owner: revoke |
| `GET /api/documents/:id/versions` | list checkpoints (any reader) |
| `GET /api/documents/:id/versions/:vid` | preview one version |
| `POST /api/documents/:id/versions/:vid/restore` | editor/owner: restore (checkpoints current text first) |
| `POST /api/import` | `{filename, content}` for `.txt`/`.md` |

Identity: `?user=` or `x-user-id`, validated against the seeded user list.

## Data model

```
{ users: [...], documents: [{ id (uuid), title, content (sanitized HTML), ownerId,
  sharedWith: [{userId, role}], lastEditedBy, createdAt, updatedAt,
  versions: [{ id, content, savedAt, authorId, createdAt }] (max 30) }] }
```

Version bodies are never returned with the document (only `versionCount`). Old store files without `versions` are normalised on read. A checkpoint stores the *previous* content, at most once per 2 minutes of editing (configurable via `createApp({versionGapMs})`) and always before a restore. API responses add derived fields: `access` (owned/shared), `canEdit`, `canRename`, and expanded user objects.

## Permissions

Checked in the route handlers on every request: read = owner or shared; edit = owner or editor; rename/delete/share = owner. No-access users get 404, read-only users get 403. The UI mirrors this (read-only editor, disabled toolbar) but is not relied upon; tests call the API directly.

## Content safety

- Saved HTML is run through `sanitize-html` with an allowlist (`p br div h1-h3 ul ol li strong b em i u`), no attributes, and script/style/svg/iframe contents dropped. Sanitization happens server-side on every write and import, so direct API calls cannot bypass it.
- Imports are HTML-escaped before the small Markdown conversion, then sanitized again.
- Request bodies are capped (1.5 MB), imports at 300 KB, titles at 120 chars; types are validated.
- Static serving uses a fixed route allowlist (no filesystem path from the URL). Responses carry CSP, `nosniff`, and frame-deny headers.
- The earlier regex-based sanitizer was replaced after review because regex stripping is bypassable (e.g. `<img/onerror=…>`).

## Persistence

`store.json` is written via temp file + rename. A corrupt file is copied aside and surfaces as a 500 rather than being silently reset. Operations are synchronous, so read-modify-write is safe in one process, but it is not safe across multiple instances.

## Front-end structure

`app.js` owns state and the core flows; `ux.js` layers interaction features on top through `window.Foolscap`, so each file stays focused. Overlays (palette, slash menu, history drawer, confirm) are plain DOM with ARIA roles and keyboard handling; Esc closes the topmost one.

## Trade-offs

Vanilla JS and the JSON file were kept for speed and zero build step. `execCommand` is deprecated; a production editor would use TipTap/Lexical with a schema. Last-write-wins autosave avoids CRDT complexity but loses concurrent edits.

## Path to production

Real auth/sessions, a database (Postgres/SQLite) with migrations, schema-based editor, revision history, optimistic concurrency or CRDTs for real-time collaboration, rate limiting, and end-to-end browser tests.

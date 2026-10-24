# Foolscap — Collaborative Documents · Submission

*(Assessment working title: "DraftSpace — Collaborative Documents". Renamed Foolscap during polish.)*

**Candidate:** Akshay Pakhare · **Role:** AI-Native Full Stack Product Engineer, Ajaia LLC

| Item | URL |
|---|---|
| Source repository | `TODO – paste GitHub URL` |
| Live application | `TODO – paste URL (deployment config is ready: render.yaml)` |
| Walkthrough video (3–5 min) | `TODO – paste URL` |

## 1. What it is

Foolscap is a Google Docs–style editor for writing together: rich text, `.txt`/`.md` import, Owner / Editor / Viewer sharing enforced on the server, autosave, and version history with restore. Run it with `npm install && npm start`; `npm test` runs 10 tests. Three seeded demo accounts (Akshay, Jamie, Morgan) each own documents and share some with each other, so every permission case can be shown in seconds.

## 2. How I worked with AI

I treated AI as a team of fast, fallible engineers and kept the review, verification and product decisions myself. The loop on every change was **audit → change → test → verify in a real browser → fix → document**.

| Stage | What AI did | How it was verified |
|---|---|---|
| Scaffold | ChatGPT generated an initial UI, API and docs | Treated as an unreviewed draft, not as working software |
| Audit | Claude Code read all code, ran the tests, and found the draft's weak points before any new work | I confirmed each finding against the code |
| Security review | Replaced a bypassable regex HTML sanitizer with a maintained allowlist library; wrote 10 XSS payloads as tests | Tests assert none of the payloads survive a save |
| Authorization | Found and fixed gaps (editors could rename; viewers got an editable-looking editor) | A 4-role permission matrix tested over real HTTP, including direct API calls |
| Reliability | Fixed silent data loss on a corrupt store file and dropped sockets on oversized bodies | Dedicated tests for both |
| Features | Designed and built version history, slash menu, ⌘K palette, live outline, focus mode, drag-and-drop import | Server logic unit-tested; UI exercised with real keystrokes in a browser |
| UX redesign | Replaced a generic purple SaaS look with a paper-and-ink identity, SVG icons and a new logo | Checked at desktop and phone widths, console clean |
| Docs and demo | Generated README, architecture notes, demo data and a timed walkthrough script | Cross-checked every claim against the running app |

### Where I did not trust the AI

- **The scaffold's tests were hollow.** The 3 inherited tests only covered helper functions; none called the API. I rewrote the suite as 10 tests against a live server with isolated data directories.
- **Failing tests were triaged, not silenced.** Of two early failures, one was a wrong assertion in the test (escaped text is safe), the other a real server bug (oversized requests reset the socket). I fixed the test in one case and the server in the other.
- **Tool output was cross-checked.** The browser screenshot tool sometimes lagged behind page state, so I confirmed outcomes by reading the DOM. A slash-menu check that looked broken turned out to be my own double input; I re-ran it cleanly rather than "fixing" working code.
- **Scope was my call.** I kept the vanilla JS and JSON stack instead of a rewrite, added one dependency (`sanitize-html`) only for the security-critical piece, and skipped dark mode because the CSS made a retrofit fragile.

Details are in `AI_WORKFLOW.md`.

## 3. Requirements coverage

| Requirement | Status |
|---|---|
| Create, list, open, rename, save, reopen documents | Done |
| Persistence across refresh and server restart | Done (JSON file, atomic writes) |
| Bold, italic, underline, headings, bullets, numbers | Done (toolbar and slash menu) |
| Import `.txt` and `.md` with validation | Done |
| Owned vs shared clearly distinguished | Done ("Written by me" / "Shared with me", role chips) |
| Owner / Editor / Viewer sharing, enforced server-side | Done |
| Polished, responsive UI with empty, loading and error states | Done |
| Automated tests | 10 passing |
| Live deployment | Config ready, not deployed |
| Walkthrough video | To be recorded |

## 4. Beyond the brief

- **Version history:** automatic checkpoints, preview, restore. Restoring checkpoints the current text first, so nothing is lost.
- **Slash menu** (`/`), **⌘K command palette**, **live outline**, reading time, **focus mode**, drag-and-drop import, delete with confirmation, toolbar that mirrors the current selection.

## 5. Architecture and safety

Single Node.js process (built-in `http`), vanilla-JS front end, one JSON file for storage.

```
server.js        routes, demo identity, permission checks, validation
lib/store.js     atomic writes, corrupt-file protection
lib/sanitize.js  allowlist HTML sanitizer (sanitize-html)
lib/markdown.js  .md / .txt to HTML (escape first)
public/app.js    dashboard, editor core, sharing
public/ux.js     outline, slash menu, palette, focus mode, history, drag-drop
test/            10 tests over real HTTP, isolated temp data
```

| Action | Owner | Editor | Viewer | No access |
|---|---|---|---|---|
| Read | yes | yes | yes | 404 |
| Edit content / restore a version | yes | yes | 403 | 404 |
| Rename, share, delete | yes | 403 | 403 | 404 |

- Content is sanitized on the server on every write and import, so direct API calls cannot bypass it. Imports are escaped first and sanitized again.
- Body, import and title size limits plus type checks return 400/413 instead of crashing. Responses carry CSP, `nosniff` and frame-deny headers.
- No-access users get 404 so document ids are not leaked.

## 6. Testing

Ten tests against a real server: health and static serving; create / rename / update / read; persistence across restart; corrupt data file; the four-role permission matrix with revocation; malformed and oversized requests; `.txt`/`.md` import and rejections; ten XSS payloads; version history; permission helpers. I also ran the main journeys in a browser (create, format, autosave, reload, import, share as viewer, history restore, delete, phone width). Not covered: an automated browser suite, and drag-and-drop import was not exercised.

## 7. Limitations

- **No real authentication:** a seeded user switcher demonstrates authorization only. Not for real data.
- **No real-time collaboration:** last write wins.
- **Storage:** a single-process JSON file. Render's free tier is ephemeral, so durable hosting needs a persistent disk or a database.
- `contenteditable`/`execCommand` editor; no links, images or tables; import limited to `.txt` and `.md`.

**With more time:** real auth, a database, a schema-based editor (TipTap), conflict handling or CRDTs, and end-to-end browser tests.

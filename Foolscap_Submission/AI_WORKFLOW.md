# AI Workflow

## Tools

- **ChatGPT** produced the initial scaffold (UI, API, docs) before this session.
- **Claude Code** (this session) audited, hardened, tested, and documented that scaffold, running commands locally and driving the app in a browser pane.

## What the AI did, and what was checked

1. **Audit.** Read all source; ran the 3 existing tests (pass). Found that those tests only covered pure helper functions, not the HTTP API.
2. **Problems found and fixed**
   - Regex HTML sanitizer was bypassable → replaced with `sanitize-html` allowlist; tests include 10 payloads (e.g. `<img/src=x/onerror=…>`, entity-encoded `javascript:`, nested `<scr<script>ipt>`).
   - Editors could rename documents → rename is owner-only; client sends the title only when allowed.
   - Viewers saw an editable editor (changes just failed to save) → editor is read-only with disabled toolbar.
   - Corrupt `store.json` was silently overwritten with seed data → now backed up and reported.
   - Oversized request bodies destroyed the socket → now a clean 413. Non-object/typed-wrong bodies → 400.
   - Markdown import produced one `<ul>` per bullet → lists are grouped; added bold/italic.
   - Dashboard previews ran words together → fixed text extraction.
   - Added owner-only DELETE (UI button added in the second pass), security headers, `.gitignore`, `.env.example`, health check in `render.yaml`.
3. **Tests.** Rewrote the suite as 10 `node:test` tests over real HTTP with temp data dirs: health/static, CRUD, restart persistence, corrupt file, owner/editor/viewer/stranger matrix, validation, import (txt/md, bad inputs), sanitization, version history (checkpoints, preview, restore, permissions), helpers. Two initial failures (a test assertion that wrongly expected escaped text to vanish; a socket reset on oversize bodies) were investigated: one was a test bug, one was a real server bug, both fixed.
4. **Manual browser checks** in the in-app browser: create → rename → bold/italic/underline/list → autosave → reload; `.md` import and rejected `.exe`; share as viewer → switch to second user → read-only UI and a direct PATCH returning 403. One console error observed was that intentional 403.

## Second pass: product differentiation

The author asked for a more distinctive, UX-focused product. I chose features that solve real writing-tool problems and could be verified: version history with restore (server-enforced, tested), slash menu, ⌘K palette, outline, focus mode, drag-drop import, delete confirmation. I deliberately skipped dark mode because the existing CSS hard-codes colours and a retrofit would be fragile. Each feature was exercised in the in-app browser (slash menu with real keystrokes, palette, focus mode, history preview/restore, delete confirm, viewer view with restore and delete hidden). The browser screenshot tool lagged behind page state at times, so those checks were confirmed by reading the DOM. The first slash-menu attempt looked broken because I typed into the page twice; re-running cleanly worked.

## Third pass: visual redesign

The author found the look generic (purple SaaS). I replaced `styles.css` and `index.html` with a distinct paper-and-ink identity: dark sidebar, warm canvas, serif document typography, SVG icon set instead of Unicode glyphs, a dark floating formatting toolbar, and a greeting-led dashboard (the fake "Free plan" card and decorative stat tiles were removed). Behaviour code was left alone apart from small hooks (greeting/summary, user-menu and toast classes). Verified at 1280px and 375px in the in-app browser with no console errors; the 10 automated tests still pass. Screenshots in `submission/assets/` were regenerated from this version.

## Fourth pass: demo data and rename

Added seeded documents for all three accounts covering every sharing case (owner, editor, viewer, private, no access) plus two documents with prior versions, and renamed the product from DraftSpace to Foolscap with a new logo (sheet with fold and margin line, also the favicon). Verified the seed through the API and the logo in the browser; tests unchanged and passing.

## Judgment calls

Keep the existing vanilla/JSON architecture rather than rewrite; add one dependency (`sanitize-html`) only for the security-sensitive piece; keep the demo user switcher and state clearly that it is not authentication; make rename owner-only.

## Not verified / remaining

No automated end-to-end browser suite; mobile layout was not exercised in this session; Render deployment has not been performed. Requirements and decisions above were reviewed by the author before submission.

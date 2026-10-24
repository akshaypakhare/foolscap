# Walkthrough script (3–5 min — you record this)

## Prep
- `rm -rf data && npm start`, open http://localhost:3000 (fresh seed data: each account owns documents and shares some with the others; see the README table).
- Tabs: app; terminal (for `npm test`); `ARCHITECTURE.md`. Files ready: `submission/sample-files/launch-notes.md`, `meeting-notes.txt`.
- Start as **Akshay Pakhare** (default). Reset between takes with `rm -rf data` and restarting.

## Sequence
| Time | Do | Expect |
|---|---|---|
| 0:00–0:20 | Intro: Foolscap, lightweight collaborative docs, vanilla JS + Node, built with AI assistance and verified by tests | Dashboard with Welcome doc |
| 0:20–1:00 | New document → rename title to "Q3 Plan" | Editor opens, status "Saved" after typing |
| 1:00–1:50 | Type text; select it: bold, italic, underline; set Heading 2; add bulleted then numbered list. Wait for "Saved", press refresh, reopen doc | Formatting and text persist |
| 1:50–2:30 | Back to dashboard → Import a file → `launch-notes.md`. Then try a `.pdf`/`.exe` | Heading, bullets, numbered list, bold appear; unsupported type shows error toast |
| 2:30–3:10 | As Akshay open **Q3 Product Roadmap** (shared: Jamie viewer, Morgan editor). Switch to Jamie: it's under *Shared with me*, read-only, toolbar disabled, "View only", no Share/Delete. Switch to Morgan: same doc is editable but cannot rename/share. Show Morgan has no access to *Personal Reading List*. Optionally share launch-notes live | Viewer cannot edit or rename or share |
| 3:10–3:30 | **Differentiators:** press ⌘K (palette), type `/` in a doc (slash menu), show the outline, click History → preview → Restore, toggle Focus mode (Esc exits). | Each works as described |
| 3:30–3:50 | Terminal: `npm test` (10 pass). Mention direct-API 403 tests and sanitizer tests; show ARCHITECTURE.md briefly | All green |
| 3:50–4:15 | Wrap-up: features, server-side permissions, honest limits (demo identity, JSON store, no real-time) | — |

Tip: the first content change to any document creates a history checkpoint, so edit the Welcome doc once (wait for "Saved") before opening History. Later checkpoints are spaced 2 minutes apart; every restore also checkpoints.

## Likely questions
- **What makes it different from a basic editor?** Version history with server-enforced restore, slash menu, ⌘K palette, outline, focus mode.
- **Is auth real?** No — seeded demo users; the point is server-enforced authorization. Production would add sessions/OIDC.
- **Why vanilla/JSON?** Time-box and zero build; documented path to Postgres + TipTap.
- **XSS?** Server-side allowlist sanitizer on every write/import, CSP header, tests with bypass payloads.
- **Does data persist when deployed?** Only with a persistent disk; Render free tier is ephemeral.
- **How did you use AI?** See AI_WORKFLOW.md — scaffold generated, then audited and fixed with tests.

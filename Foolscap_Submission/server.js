const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sanitizeHtml } = require('./lib/sanitize');
const { markdownToHtml, textToHtml } = require('./lib/markdown');
const { createStore } = require('./lib/store');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 1_500_000;
const MAX_IMPORT_CHARS = 300_000;
const MAX_TITLE = 120;
const MAX_VERSIONS = 30;
const DEFAULT_VERSION_GAP_MS = 2 * 60 * 1000; // checkpoint at most once per editing burst

// Demo identity model: three seeded users, selected by the `user` query
// parameter or `x-user-id` header. There are no passwords or sessions. This
// demonstrates server-side authorization, NOT authentication.
const USERS = [
  { id: 'u-akshay', name: 'Akshay Pakhare', email: 'akshay@example.com', initials: 'AP' },
  { id: 'u-jamie', name: 'Jamie Chen', email: 'jamie@example.com', initials: 'JC' },
  { id: 'u-morgan', name: 'Morgan Lee', email: 'morgan@example.com', initials: 'ML' }
];

const STATIC_ROUTES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/ux.js': ['ux.js', 'text/javascript; charset=utf-8']
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Demo seed: every account owns documents, and every sharing case exists
// (owner, editor, viewer, private, shared-out) so the app can be demoed immediately.
function initialStore() {
  const ago = mins => new Date(Date.now() - mins * 60_000).toISOString();
  const doc = (id, title, ownerId, content, sharedWith, minsAgo, extra = {}) => ({
    id, title, content, ownerId, sharedWith, versions: [], lastEditedBy: ownerId,
    createdAt: ago(minsAgo + 600), updatedAt: ago(minsAgo), ...extra
  });
  const docs = [
    doc('doc-welcome', 'Welcome to Foolscap', 'u-akshay',
      '<h1>A clean sheet for good ideas.</h1><p>Foolscap is a simple home for your team’s shared writing.</p><h2>Get started</h2><ul><li>Create a document from the dashboard</li><li>Format your ideas with the toolbar</li><li>Share a document with a teammate</li></ul><p><strong>Tip:</strong> your changes save automatically.</p>',
      [{ userId: 'u-jamie', role: 'editor' }], 5),

    // ---- Akshay ----
    doc('doc-roadmap', 'Q3 Product Roadmap', 'u-akshay',
      '<h1>Q3 Product Roadmap</h1><p>Three bets for the quarter, in priority order.</p><h2>1. Faster onboarding</h2><ul><li>Cut setup from 9 steps to 4</li><li>Import existing notes in one click</li></ul><h2>2. Sharing that feels safe</h2><ol><li>Clear Owner / Editor / Viewer roles</li><li>Revoke access instantly</li></ol><h2>3. Version history</h2><p>Let people <strong>restore</strong> anything, any time.</p>',
      [{ userId: 'u-jamie', role: 'viewer' }, { userId: 'u-morgan', role: 'editor' }], 45,
      { versions: [{ id: 'v-roadmap-1', content: '<h1>Q3 Product Roadmap</h1><p>Rough draft — priorities not decided yet.</p><ul><li>Onboarding?</li><li>Sharing?</li></ul>', savedAt: ago(300), authorId: 'u-akshay', createdAt: ago(240) }] }),
    doc('doc-reading', 'Personal Reading List', 'u-akshay',
      '<h1>Reading list</h1><p>Private to me — nobody else has access.</p><ul><li>Designing Data-Intensive Applications</li><li>The Pragmatic Programmer</li><li>Refactoring UI</li></ul>',
      [], 180),

    // ---- Jamie ----
    doc('doc-meeting', 'Weekly Team Meeting Notes', 'u-jamie',
      '<h1>Weekly sync</h1><p><strong>Attendees:</strong> Akshay, Jamie, Morgan</p><h2>Decisions</h2><ul><li>Ship the beta on Friday</li><li>Morgan owns the design review</li></ul><h2>Action items</h2><ol><li>Akshay — finalize the roadmap</li><li>Jamie — send customer invites</li><li>Morgan — share design feedback</li></ol>',
      [{ userId: 'u-akshay', role: 'editor' }, { userId: 'u-morgan', role: 'viewer' }], 20,
      { versions: [{ id: 'v-meeting-1', content: '<h1>Weekly sync</h1><p>Agenda to be filled in.</p>', savedAt: ago(500), authorId: 'u-jamie', createdAt: ago(480) }] }),
    doc('doc-onboarding', 'Customer Onboarding Checklist', 'u-jamie',
      '<h1>Onboarding checklist</h1><ol><li>Send welcome email</li><li>Create their workspace</li><li>Schedule a 20-minute kickoff call</li><li>Follow up after one week</li></ol>',
      [{ userId: 'u-akshay', role: 'viewer' }], 90),
    doc('doc-blog', 'Blog Post Ideas (draft)', 'u-jamie',
      '<h1>Blog ideas</h1><p>Private brainstorm, not ready to share.</p><ul><li>Why version history builds trust</li><li>Writing tools should get out of the way</li></ul>',
      [], 240),

    // ---- Morgan ----
    doc('doc-design', 'Design Review Feedback', 'u-morgan',
      '<h1>Design review</h1><h2>What works</h2><ul><li>Calm, readable writing surface</li><li>Slash menu is fast</li></ul><h2>To improve</h2><ol><li>Clearer empty states</li><li>Larger tap targets on mobile</li></ol>',
      [{ userId: 'u-akshay', role: 'editor' }, { userId: 'u-jamie', role: 'viewer' }], 30),
    doc('doc-vacation', 'Vacation Plans', 'u-morgan',
      '<h1>Vacation plans</h1><p>Private notes — only Morgan can see this.</p><ul><li>Book flights</li><li>Pack light</li></ul>',
      [], 300)
  ];
  return { users: USERS, documents: docs };
}

function cleanText(value, max = MAX_TITLE) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function canRead(doc, userId) {
  return !!doc && (doc.ownerId === userId || doc.sharedWith.some(s => s.userId === userId));
}
function canEdit(doc, userId) {
  return !!doc && (doc.ownerId === userId || doc.sharedWith.some(s => s.userId === userId && s.role === 'editor'));
}
function isOwner(doc, userId) { return !!doc && doc.ownerId === userId; }

// Older store files predate version history; normalise on read.
function ensure(doc) {
  if (doc && !Array.isArray(doc.versions)) doc.versions = [];
  if (doc && !doc.lastEditedBy) doc.lastEditedBy = doc.ownerId;
  return doc;
}

function publicDoc(doc, userId) {
  ensure(doc);
  const owner = USERS.find(u => u.id === doc.ownerId);
  const { versions, ...rest } = doc;
  return {
    ...rest,
    versionCount: versions.length,
    lastEditor: USERS.find(u => u.id === doc.lastEditedBy) || null,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email, initials: owner.initials } : null,
    access: isOwner(doc, userId) ? 'owned' : 'shared',
    canEdit: canEdit(doc, userId),
    canRename: isOwner(doc, userId),
    sharedWith: doc.sharedWith.map(s => ({ ...s, user: USERS.find(u => u.id === s.userId) })).filter(s => s.user)
  };
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk); // beyond the limit: drain and discard
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request body is too large.'));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        resolve(parsed);
      } catch { reject(new HttpError(400, 'Request body must be a JSON object.')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const route = STATIC_ROUTES[pathname];
  if (!route) return false;
  fs.readFile(path.join(PUBLIC_DIR, route[0]), (err, bytes) => {
    if (err) { res.writeHead(500, SECURITY_HEADERS); res.end('Could not load app'); return; }
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-cache', ...SECURITY_HEADERS });
    res.end(bytes);
  });
  return true;
}

function createApp({ dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'), versionGapMs = DEFAULT_VERSION_GAP_MS } = {}) {
  const store = createStore(dataDir, initialStore);

  function findDoc(data, id) { return ensure(data.documents.find(d => d.id === id)); }

  // Keep the previous content as a restorable checkpoint, at most once per gap.
  function checkpoint(doc, force = false) {
    const last = doc.versions[doc.versions.length - 1];
    const age = last ? Date.now() - Date.parse(last.createdAt) : Infinity;
    if (!force && age < versionGapMs) return;
    doc.versions.push({ id: crypto.randomUUID(), content: doc.content, savedAt: doc.updatedAt, authorId: doc.lastEditedBy, createdAt: new Date().toISOString() });
    if (doc.versions.length > MAX_VERSIONS) doc.versions.splice(0, doc.versions.length - MAX_VERSIONS);
  }
  function newDoc(userId, title, content) {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), title, content, ownerId: userId, sharedWith: [], versions: [], lastEditedBy: userId, createdAt: now, updatedAt: now };
  }

  async function route(req, res, url, userId) {
    const { pathname } = url; const method = req.method;

    if (method === 'GET' && pathname === '/api/documents') {
      const docs = store.read().documents.filter(d => canRead(d, userId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(d => publicDoc(d, userId));
      return send(res, 200, { documents: docs, currentUser: USERS.find(u => u.id === userId) });
    }

    if (method === 'POST' && pathname === '/api/documents') {
      const body = await readBody(req);
      const title = cleanText(body.title) || 'Untitled document';
      const data = store.read(); const doc = newDoc(userId, title, '<p></p>');
      data.documents.push(doc); store.write(data);
      return send(res, 201, { document: publicDoc(doc, userId) });
    }

    if (method === 'POST' && pathname === '/api/import') {
      const body = await readBody(req);
      const filename = cleanText(body.filename, 200); const ext = path.extname(filename).toLowerCase();
      if (!['.txt', '.md'].includes(ext)) throw new HttpError(400, 'Only .txt and .md files are supported.');
      if (typeof body.content !== 'string') throw new HttpError(400, 'File content must be text.');
      if (!body.content.trim()) throw new HttpError(400, 'The selected file is empty.');
      if (body.content.length > MAX_IMPORT_CHARS) throw new HttpError(413, 'Files must be smaller than 300 KB.');
      if (body.content.includes('\u0000')) throw new HttpError(400, 'Binary files cannot be imported.');
      const title = cleanText(path.basename(filename, ext)) || 'Imported document';
      const html = ext === '.md' ? markdownToHtml(body.content) : textToHtml(body.content);
      const data = store.read(); const doc = newDoc(userId, title, sanitizeHtml(html));
      data.documents.push(doc); store.write(data);
      return send(res, 201, { document: publicDoc(doc, userId) });
    }

    let m = pathname.match(/^\/api\/documents\/([^/]+)$/);
    if (m && method === 'GET') {
      const doc = findDoc(store.read(), m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      return send(res, 200, { document: publicDoc(doc, userId) });
    }
    if (m && method === 'PATCH') {
      const body = await readBody(req); const data = store.read(); const doc = findDoc(data, m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      if (!canEdit(doc, userId)) throw new HttpError(403, 'You have view-only access to this document.');
      if (body.title !== undefined) {
        if (typeof body.title !== 'string') throw new HttpError(400, 'Title must be text.');
        const title = cleanText(body.title);
        if (title !== doc.title) {
          if (!isOwner(doc, userId)) throw new HttpError(403, 'Only the owner can rename this document.');
          if (!title) throw new HttpError(400, 'Document title cannot be empty.');
          doc.title = title;
        }
      }
      if (body.content !== undefined) {
        if (typeof body.content !== 'string') throw new HttpError(400, 'Content must be text.');
        const next = sanitizeHtml(body.content);
        if (next !== doc.content) { checkpoint(doc); doc.content = next; doc.lastEditedBy = userId; }
      }
      doc.updatedAt = new Date().toISOString(); store.write(data);
      return send(res, 200, { document: publicDoc(doc, userId) });
    }
    if (m && method === 'DELETE') {
      const data = store.read(); const doc = findDoc(data, m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      if (!isOwner(doc, userId)) throw new HttpError(403, 'Only the owner can delete this document.');
      data.documents = data.documents.filter(d => d.id !== doc.id); store.write(data);
      return send(res, 200, { ok: true });
    }

    m = pathname.match(/^\/api\/documents\/([^/]+)\/versions(?:\/([^/]+?)(\/restore)?)?$/);
    if (m) {
      const data = store.read(); const doc = findDoc(data, m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      const author = v => USERS.find(u => u.id === v.authorId) || null;
      if (!m[2] && method === 'GET') {
        const versions = doc.versions.slice().reverse().map(v => ({ id: v.id, savedAt: v.savedAt, author: author(v), words: (v.content.replace(/<[^>]*>/g, ' ').match(/\S+/g) || []).length }));
        return send(res, 200, { versions });
      }
      const version = m[2] && doc.versions.find(v => v.id === m[2]);
      if (m[2] && !version) throw new HttpError(404, 'Version not found.');
      if (m[2] && !m[3] && method === 'GET') return send(res, 200, { version: { id: version.id, savedAt: version.savedAt, author: author(version), content: version.content } });
      if (m[2] && m[3] && method === 'POST') {
        if (!canEdit(doc, userId)) throw new HttpError(403, 'You have view-only access to this document.');
        checkpoint(doc, true); // today's text stays recoverable
        doc.content = version.content; doc.lastEditedBy = userId; doc.updatedAt = new Date().toISOString();
        store.write(data);
        return send(res, 200, { document: publicDoc(doc, userId) });
      }
    }

    m = pathname.match(/^\/api\/documents\/([^/]+)\/share$/);
    if (m && method === 'POST') {
      const body = await readBody(req); const data = store.read(); const doc = findDoc(data, m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      if (!isOwner(doc, userId)) throw new HttpError(403, 'Only the document owner can manage sharing.');
      const targetId = cleanText(body.userId, 80);
      if (body.role !== undefined && !['viewer', 'editor'].includes(body.role)) throw new HttpError(400, 'Role must be "viewer" or "editor".');
      const role = body.role || 'editor';
      if (!USERS.some(u => u.id === targetId)) throw new HttpError(400, 'Choose a valid teammate.');
      if (targetId === doc.ownerId) throw new HttpError(400, 'The owner already has access.');
      const existing = doc.sharedWith.find(s => s.userId === targetId);
      if (existing) existing.role = role; else doc.sharedWith.push({ userId: targetId, role });
      doc.updatedAt = new Date().toISOString(); store.write(data);
      return send(res, 200, { document: publicDoc(doc, userId) });
    }

    m = pathname.match(/^\/api\/documents\/([^/]+)\/share\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const data = store.read(); const doc = findDoc(data, m[1]);
      if (!canRead(doc, userId)) throw new HttpError(404, 'Document not found or you do not have access.');
      if (!isOwner(doc, userId)) throw new HttpError(403, 'Only the owner can remove access.');
      doc.sharedWith = doc.sharedWith.filter(s => s.userId !== m[2]);
      doc.updatedAt = new Date().toISOString(); store.write(data);
      return send(res, 200, { document: publicDoc(doc, userId) });
    }

    throw new HttpError(404, 'Route not found.');
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && serveStatic(res, url.pathname)) return;
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, name: 'Foolscap' });
      if (req.method === 'GET' && url.pathname === '/api/users') return send(res, 200, { users: USERS });
      if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Not found.');
      const userId = cleanText(url.searchParams.get('user') || req.headers['x-user-id'] || 'u-akshay', 80);
      if (!USERS.some(u => u.id === userId)) throw new HttpError(400, 'Unknown user. Choose one of the seeded demo accounts.');
      await route(req, res, url, userId);
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Unexpected server error. ' + (err.message || '') });
    }
  });

  return { server, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().server.listen(port, () => console.log(`Foolscap running on http://localhost:${port}`));
}

module.exports = { createApp, canRead, canEdit, initialStore, USERS };

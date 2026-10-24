const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, canRead, canEdit } = require('../server');
const { sanitizeHtml } = require('../lib/sanitize');
const { markdownToHtml, textToHtml } = require('../lib/markdown');

const OWNER = 'u-akshay'; const EDITOR = 'u-jamie'; const OTHER = 'u-morgan';

async function start(dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foolscap-'))) {
  const { server } = createApp({ dataDir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, user, body, raw) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user-id': user } : {}) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
    });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  return { call, dataDir, base, close: () => new Promise(r => server.close(r)) };
}

test('health endpoint and static page are served', async () => {
  const app = await start();
  try {
    const health = await app.call('GET', '/api/health');
    assert.equal(health.status, 200); assert.equal(health.body.ok, true);
    const page = await fetch(app.base + '/');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(app.base + '/server.js')).status, 404, 'source files must not be served');
    assert.equal((await fetch(app.base + '/../package.json')).status, 404);
  } finally { await app.close(); }
});

test('create, rename, update, read back, list', async () => {
  const app = await start();
  try {
    const created = await app.call('POST', '/api/documents', OWNER, { title: 'Plan' });
    assert.equal(created.status, 201);
    const id = created.body.document.id;
    const patched = await app.call('PATCH', `/api/documents/${id}`, OWNER, { title: 'Plan v2', content: '<h1>Hi</h1><p><strong>bold</strong></p>' });
    assert.equal(patched.status, 200);
    const read = await app.call('GET', `/api/documents/${id}`, OWNER);
    assert.equal(read.body.document.title, 'Plan v2');
    assert.equal(read.body.document.content, '<h1>Hi</h1><p><strong>bold</strong></p>');
    const list = await app.call('GET', '/api/documents', OWNER);
    assert.ok(list.body.documents.some(d => d.id === id && d.access === 'owned'));
  } finally { await app.close(); }
});

test('data persists across a server restart', async () => {
  const first = await start();
  const id = (await first.call('POST', '/api/documents', OWNER, { title: 'Durable' })).body.document.id;
  await first.call('PATCH', `/api/documents/${id}`, OWNER, { content: '<p>kept</p>' });
  await first.close();
  const second = await start(first.dataDir);
  try {
    const doc = (await second.call('GET', `/api/documents/${id}`, OWNER)).body.document;
    assert.equal(doc.title, 'Durable'); assert.equal(doc.content, '<p>kept</p>');
  } finally { await second.close(); }
});

test('a corrupt data file is reported and backed up, not silently replaced', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foolscap-'));
  fs.writeFileSync(path.join(dir, 'store.json'), '{not json');
  const app = await start(dir);
  try {
    const res = await app.call('GET', '/api/documents', OWNER);
    assert.equal(res.status, 500);
    assert.equal(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'), '{not json');
    assert.ok(fs.readdirSync(dir).some(f => f.includes('corrupt')));
  } finally { await app.close(); }
});

test('permissions: viewer cannot edit, editor cannot rename/share/delete, strangers see nothing', async () => {
  const app = await start();
  try {
    const id = (await app.call('POST', '/api/documents', OWNER, { title: 'Secret' })).body.document.id;
    await app.call('PATCH', `/api/documents/${id}`, OWNER, { content: '<p>original</p>' });

    // Stranger: 404 on read, no leakage in list, cannot edit/share/delete.
    assert.equal((await app.call('GET', `/api/documents/${id}`, OTHER)).status, 404);
    assert.equal((await app.call('GET', '/api/documents', OTHER)).body.documents.some(d => d.id === id), false);
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OTHER, { content: '<p>x</p>' })).status, 404);
    assert.equal((await app.call('DELETE', `/api/documents/${id}`, OTHER)).status, 404);

    // Viewer.
    let r = await app.call('POST', `/api/documents/${id}/share`, OWNER, { userId: OTHER, role: 'viewer' });
    assert.equal(r.status, 200);
    assert.equal((await app.call('GET', `/api/documents/${id}`, OTHER)).body.document.access, 'shared');
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OTHER, { content: '<p>hacked</p>' })).status, 403);
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OTHER, { title: 'hacked' })).status, 403);
    assert.equal((await app.call('DELETE', `/api/documents/${id}`, OTHER)).status, 403);
    assert.equal((await app.call('POST', `/api/documents/${id}/share`, OTHER, { userId: OTHER, role: 'editor' })).status, 403);

    // Editor can change content, but not title, sharing or deletion.
    await app.call('POST', `/api/documents/${id}/share`, OWNER, { userId: EDITOR, role: 'editor' });
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, EDITOR, { content: '<p>edited</p>' })).status, 200);
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, EDITOR, { title: 'Renamed' })).status, 403);
    assert.equal((await app.call('POST', `/api/documents/${id}/share`, EDITOR, { userId: OTHER, role: 'editor' })).status, 403);
    assert.equal((await app.call('DELETE', `/api/documents/${id}/share/${OTHER}`, EDITOR)).status, 403);
    assert.equal((await app.call('DELETE', `/api/documents/${id}`, EDITOR)).status, 403);

    const final = (await app.call('GET', `/api/documents/${id}`, OWNER)).body.document;
    assert.equal(final.content, '<p>edited</p>'); assert.equal(final.title, 'Secret');

    // Revoking access takes effect immediately; owner can delete.
    await app.call('DELETE', `/api/documents/${id}/share/${EDITOR}`, OWNER);
    assert.equal((await app.call('GET', `/api/documents/${id}`, EDITOR)).status, 404);
    assert.equal((await app.call('DELETE', `/api/documents/${id}`, OWNER)).status, 200);
    assert.equal((await app.call('GET', `/api/documents/${id}`, OWNER)).status, 404);
  } finally { await app.close(); }
});

test('validation and malformed requests', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/api/documents', 'u-nobody')).status, 400);
    assert.equal((await app.call('POST', '/api/documents', OWNER, undefined, '{bad json')).status, 400);
    assert.equal((await app.call('POST', '/api/documents', OWNER, undefined, '[1,2]')).status, 400);
    assert.equal((await app.call('GET', '/api/documents/does-not-exist', OWNER)).status, 404);
    assert.equal((await app.call('GET', '/api/documents/..%2F..%2Fetc', OWNER)).status, 404);
    const id = (await app.call('POST', '/api/documents', OWNER, { title: '  ' })).body.document.id;
    assert.equal((await app.call('GET', `/api/documents/${id}`, OWNER)).body.document.title, 'Untitled document');
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OWNER, { title: '   ' })).status, 400);
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OWNER, { title: 42 })).status, 400);
    assert.equal((await app.call('PATCH', `/api/documents/${id}`, OWNER, { content: { a: 1 } })).status, 400);
    assert.equal((await app.call('POST', `/api/documents/${id}/share`, OWNER, { userId: 'u-ghost', role: 'editor' })).status, 400);
    assert.equal((await app.call('POST', `/api/documents/${id}/share`, OWNER, { userId: OWNER, role: 'editor' })).status, 400);
    assert.equal((await app.call('POST', `/api/documents/${id}/share`, OWNER, { userId: EDITOR, role: 'admin' })).status, 400);
    assert.equal((await app.call('POST', '/api/documents', OWNER, undefined, JSON.stringify({ title: 'x'.repeat(2_000_000) }))).status, 413);
  } finally { await app.close(); }
});

test('import: txt and md, validation, and XSS-safe output', async () => {
  const app = await start();
  try {
    const md = await app.call('POST', '/api/import', OWNER, { filename: 'notes.md', content: '# Title\n\n- a\n- b\n\n1. one\n2. two\n\nsome **bold** and *it*\n<script>alert(1)</script>' });
    assert.equal(md.status, 201); assert.equal(md.body.document.title, 'notes');
    assert.match(md.body.document.content, /<h1>Title<\/h1>/);
    assert.match(md.body.document.content, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
    assert.match(md.body.document.content, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
    assert.match(md.body.document.content, /<strong>bold<\/strong>/);
    assert.doesNotMatch(md.body.document.content, /<script/i);
    const txt = await app.call('POST', '/api/import', OWNER, { filename: 'a.txt', content: 'line1\n<img src=x onerror=alert(1)>' });
    assert.equal(txt.status, 201); assert.doesNotMatch(txt.body.document.content, /<img/); // angle brackets arrive escaped, as text
    assert.equal((await app.call('POST', '/api/import', OWNER, { filename: 'a.pdf', content: 'x' })).status, 400);
    assert.equal((await app.call('POST', '/api/import', OWNER, { filename: 'a.txt', content: '   ' })).status, 400);
    assert.equal((await app.call('POST', '/api/import', OWNER, { filename: 'a.txt', content: 5 })).status, 400);
    assert.equal((await app.call('POST', '/api/import', OWNER, { filename: 'a.txt', content: 'a\u0000b' })).status, 400);
    assert.equal((await app.call('POST', '/api/import', OWNER, { filename: 'a.txt', content: 'x'.repeat(300_001) })).status, 413);
    // Imported doc belongs to the importer.
    assert.equal((await app.call('GET', `/api/documents/${md.body.document.id}`, OTHER)).status, 404);
  } finally { await app.close(); }
});

test('stored content is sanitized on save', async () => {
  const app = await start();
  try {
    const id = (await app.call('POST', '/api/documents', OWNER, {})).body.document.id;
    const payloads = [
      '<script>alert(1)</script><p>ok</p>',
      '<img/src=x/onerror=alert(1)>',
      '<p onclick="alert(1)">x</p>',
      '<a href="jav&#x61;script:alert(1)">l</a>',
      '<svg><script>alert(1)</script></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<style>body{display:none}</style>',
      '<p style="background:url(javascript:alert(1))">s</p>',
      '<scr<script>ipt>alert(1)</script>',
      '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'
    ];
    for (const p of payloads) {
      const res = await app.call('PATCH', `/api/documents/${id}`, OWNER, { content: p });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.body.document.content, /<script|<img|<svg|<iframe|<style|<math|<a |onerror|onclick|javascript:|style=/i, `leaked from: ${p}`);
    }
    const keep = await app.call('PATCH', `/api/documents/${id}`, OWNER, { content: '<h2>H</h2><ul><li><u>u</u> <em>e</em> <strong>s</strong></li></ul>' });
    assert.equal(keep.body.document.content, '<h2>H</h2><ul><li><u>u</u> <em>e</em> <strong>s</strong></li></ul>');
  } finally { await app.close(); }
});

test('unit: permission helpers and converters', () => {
  const doc = { ownerId: 'o', sharedWith: [{ userId: 'e', role: 'editor' }, { userId: 'v', role: 'viewer' }] };
  assert.deepEqual(['o', 'e', 'v', 'x'].map(u => canRead(doc, u)), [true, true, true, false]);
  assert.deepEqual(['o', 'e', 'v', 'x'].map(u => canEdit(doc, u)), [true, true, false, false]);
  assert.match(markdownToHtml('## Hi'), /<h2>Hi<\/h2>/);
  assert.equal(textToHtml('<b>x</b>'), '<p>&lt;b&gt;x&lt;/b&gt;</p>');
  assert.equal(sanitizeHtml(undefined), '');
});

test('version history: checkpoints, preview, restore, permissions', async () => {
  const { server } = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'foolscap-')), versionGapMs: 0 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, user, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-user-id': user }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    const id = (await call('POST', '/api/documents', OWNER, { title: 'H' })).body.document.id;
    await call('PATCH', `/api/documents/${id}`, OWNER, { content: '<p>one</p>' });
    await call('POST', `/api/documents/${id}/share`, OWNER, { userId: EDITOR, role: 'editor' });
    await call('POST', `/api/documents/${id}/share`, OWNER, { userId: OTHER, role: 'viewer' });
    const edited = await call('PATCH', `/api/documents/${id}`, EDITOR, { content: '<p>two</p>' });
    assert.equal(edited.body.document.lastEditor.id, EDITOR);
    assert.equal(edited.body.document.versions, undefined, 'version bodies are not sent with the document');

    const list = (await call('GET', `/api/documents/${id}/versions`, OTHER)).body.versions;
    assert.equal(list.length, 2); // "<p></p>" and "<p>one</p>", newest first
    const one = list[0];
    assert.equal((await call('GET', `/api/documents/${id}/versions/${one.id}`, OTHER)).body.version.content, '<p>one</p>');

    assert.equal((await call('POST', `/api/documents/${id}/versions/${one.id}/restore`, OTHER)).status, 403);
    const restored = await call('POST', `/api/documents/${id}/versions/${one.id}/restore`, EDITOR);
    assert.equal(restored.body.document.content, '<p>one</p>');
    // Restoring checkpointed "two", so nothing is lost.
    const after = (await call('GET', `/api/documents/${id}/versions`, OWNER)).body.versions;
    const texts = await Promise.all(after.map(async v => (await call('GET', `/api/documents/${id}/versions/${v.id}`, OWNER)).body.version.content));
    assert.ok(texts.includes('<p>two</p>'));

    assert.equal((await call('GET', `/api/documents/${id}/versions/nope`, OWNER)).status, 404);
    const stranger = await call('POST', '/api/documents', OWNER, {});
    assert.equal((await call('GET', `/api/documents/${stranger.body.document.id}/versions`, OTHER)).status, 404);
  } finally { await new Promise(r => server.close(r)); }
});

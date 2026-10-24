// Foolscap UX layer: outline, slash menu, command palette, focus mode,
// version history, drag-and-drop import, delete confirmation, live toolbar state.
// Builds on the API exposed by app.js as window.Foolscap.
(() => {
  const D = window.Foolscap; const { state, api, $, toast, escapeHtml } = D;
  const editor = $('editorContent');
  const inEditor = () => !$('editorScreen').classList.contains('hidden') && !!state.activeDoc;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const goDashboard = () => document.querySelector('.nav-item[data-filter="all"]').click();

  // ---------- Outline + reading time + live toolbar state ----------
  function renderOutline() {
    const heads = [...editor.querySelectorAll('h1,h2,h3')].filter(h => h.textContent.trim());
    $('outlineList').innerHTML = heads.map((h, i) => `<li class="lvl-${h.tagName[1]}"><button data-outline="${i}">${escapeHtml(h.textContent.trim().slice(0, 60))}</button></li>`).join('');
    $('outlineEmpty').classList.toggle('hidden', heads.length > 0);
    const words = (editor.textContent.match(/\S+/g) || []).length;
    $('readTime').textContent = words ? `${Math.max(1, Math.round(words / 220))} min read` : '0 min read';
  }
  $('outlineList').addEventListener('click', e => {
    const b = e.target.closest('[data-outline]'); if (!b) return;
    const h = [...editor.querySelectorAll('h1,h2,h3')].filter(x => x.textContent.trim())[Number(b.dataset.outline)];
    if (h) { h.scrollIntoView({ behavior: 'smooth', block: 'center' }); h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 1200); }
  });
  const refreshOutline = debounce(renderOutline, 200);
  editor.addEventListener('input', refreshOutline);
  new MutationObserver(refreshOutline).observe(editor, { childList: true });

  function syncToolbar() {
    if (!inEditor() || !editor.contains(document.getSelection().anchorNode)) return;
    document.querySelectorAll('[data-command]').forEach(b => { try { b.classList.toggle('active', document.queryCommandState(b.dataset.command)); } catch { /* unsupported */ } });
    const block = (document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
    $('blockFormat').value = ['h1', 'h2', 'h3'].includes(block) ? block : 'p';
  }
  document.addEventListener('selectionchange', syncToolbar);

  // ---------- Slash menu ----------
  const SLASH = [
    { key: 'text', label: 'Text', hint: 'Plain paragraph', icon: '¶', run: () => document.execCommand('formatBlock', false, 'p') },
    { key: 'heading 1 h1 title', label: 'Heading 1', hint: 'Big section title', icon: 'H1', run: () => document.execCommand('formatBlock', false, 'h1') },
    { key: 'heading 2 h2', label: 'Heading 2', hint: 'Medium heading', icon: 'H2', run: () => document.execCommand('formatBlock', false, 'h2') },
    { key: 'heading 3 h3', label: 'Heading 3', hint: 'Small heading', icon: 'H3', run: () => document.execCommand('formatBlock', false, 'h3') },
    { key: 'bullet list ul', label: 'Bulleted list', hint: 'Simple list of points', icon: '•', run: () => document.execCommand('insertUnorderedList') },
    { key: 'number list ol', label: 'Numbered list', hint: 'Ordered steps', icon: '1.', run: () => document.execCommand('insertOrderedList') }
  ];
  const slash = { open: false, items: [], index: 0, range: null };
  const menu = $('slashMenu');

  function slashQuery() {
    const sel = document.getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode; if (!node || node.nodeType !== 3 || !editor.contains(node)) return null;
    const m = node.textContent.slice(0, sel.anchorOffset).match(/(?:^|\s)\/([a-z0-9 ]{0,14})$/i);
    return m ? { text: m[1], node, end: sel.anchorOffset, start: sel.anchorOffset - m[1].length - 1 } : null;
  }
  function closeSlash() { slash.open = false; menu.classList.add('hidden'); }
  function renderSlash() {
    menu.innerHTML = slash.items.map((it, i) => `<button role="option" data-slash="${i}" class="${i === slash.index ? 'sel' : ''}"><span class="slash-ico">${it.icon}</span><span><b>${it.label}</b><small>${it.hint}</small></span></button>`).join('');
  }
  function updateSlash() {
    if (!inEditor() || !state.activeDoc.canEdit) return closeSlash();
    const q = slashQuery(); if (!q) return closeSlash();
    slash.items = SLASH.filter(it => !q.text.trim() || (it.label + ' ' + it.key).toLowerCase().includes(q.text.trim().toLowerCase()));
    if (!slash.items.length) return closeSlash();
    slash.index = Math.min(slash.index, slash.items.length - 1); slash.range = q; slash.open = true;
    renderSlash(); menu.classList.remove('hidden');
    const r = document.getSelection().getRangeAt(0).cloneRange(); const rect = r.getClientRects()[0] || r.startContainer.parentElement.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
    const below = rect.bottom + 8; menu.style.top = (below + 250 > window.innerHeight ? Math.max(8, rect.top - 258) : below) + 'px';
  }
  function chooseSlash(i) {
    const it = slash.items[i], q = slash.range; if (!it || !q) return;
    const r = document.createRange(); r.setStart(q.node, q.start); r.setEnd(q.node, q.end);
    const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete'); closeSlash(); editor.focus(); it.run(); D.scheduleSave();
  }
  editor.addEventListener('input', updateSlash);
  editor.addEventListener('keydown', e => {
    if (!slash.open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); slash.index = (slash.index + (e.key === 'ArrowDown' ? 1 : -1) + slash.items.length) % slash.items.length; renderSlash(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseSlash(slash.index); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeSlash(); }
  }, true);
  menu.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('[data-slash]'); if (b) chooseSlash(Number(b.dataset.slash)); });
  editor.addEventListener('blur', () => setTimeout(closeSlash, 120));

  // ---------- Focus mode ----------
  function setFocus(on) {
    document.body.classList.toggle('focus-mode', on);
    $('focusBtn').classList.toggle('active', on);
    if (on) toast('Focus mode on · press Esc to exit');
  }
  $('focusBtn').addEventListener('click', () => setFocus(!document.body.classList.contains('focus-mode')));

  // ---------- Confirm dialog + delete ----------
  function confirmDialog(title, text, okLabel) {
    return new Promise(resolve => {
      $('confirmTitle').textContent = title; $('confirmText').textContent = text; $('confirmOk').textContent = okLabel;
      const modal = $('confirmModal'); modal.classList.remove('hidden'); $('confirmCancel').focus();
      const done = v => { modal.classList.add('hidden'); $('confirmOk').onclick = $('confirmCancel').onclick = null; modal.onclick = null; resolve(v); };
      $('confirmOk').onclick = () => done(true); $('confirmCancel').onclick = () => done(false); modal.onclick = e => { if (e.target === modal) done(false); };
    });
  }
  $('deleteBtn').addEventListener('click', async () => {
    const d = state.activeDoc; if (!d) return;
    if (!(await confirmDialog('Delete this document?', `“${d.title}” will be permanently deleted for you and everyone it is shared with.`, 'Delete document'))) return;
    try { clearTimeout(state.saveTimer); state.savedHtml = editor.innerHTML; await api(`/api/documents/${d.id}`, { method: 'DELETE' }); toast('Document deleted.'); D.closeEditor(); }
    catch (e) { toast(e.message, true); }
  });

  // ---------- Version history ----------
  const drawer = $('historyDrawer'); let selected = null;
  function ago(iso) { return D.formatDate(iso) + ' · ' + new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  async function openHistory() {
    if (!inEditor()) return; await D.flushSave();
    drawer.classList.remove('hidden'); $('versionPreview').classList.add('hidden'); selected = null;
    $('versionList').innerHTML = '<li class="version-empty">Loading…</li>';
    try {
      const { versions } = await api(`/api/documents/${state.activeDoc.id}/versions`);
      $('historySub').textContent = versions.length ? `${versions.length} earlier version${versions.length === 1 ? '' : 's'} · newest first` : 'Earlier versions of this document';
      $('versionList').innerHTML = versions.length
        ? versions.map(v => `<li><button data-version="${v.id}"><span class="v-dot"></span><span><b>${escapeHtml(ago(v.savedAt))}</b><small>${escapeHtml(v.author ? v.author.name : 'Unknown')} · ${v.words} words</small></span></button></li>`).join('')
        : '<li class="version-empty">No earlier versions yet. Foolscap keeps a checkpoint the first time you change a document after a pause, and before every restore.</li>';
    } catch (e) { $('versionList').innerHTML = `<li class="version-empty">${escapeHtml(e.message)}</li>`; }
  }
  $('historyBtn').addEventListener('click', () => drawer.classList.contains('hidden') ? openHistory() : drawer.classList.add('hidden'));
  $('historyClose').addEventListener('click', () => drawer.classList.add('hidden'));
  $('versionList').addEventListener('click', async e => {
    const b = e.target.closest('[data-version]'); if (!b) return;
    document.querySelectorAll('[data-version]').forEach(x => x.classList.toggle('sel', x === b));
    try {
      const { version } = await api(`/api/documents/${state.activeDoc.id}/versions/${b.dataset.version}`);
      selected = version.id; $('previewBody').innerHTML = version.content || '<p></p>';
      $('previewMeta').textContent = `Previewing ${ago(version.savedAt)}`;
      $('restoreBtn').classList.toggle('hidden', !state.activeDoc.canEdit); $('versionPreview').classList.remove('hidden');
    } catch (err) { toast(err.message, true); }
  });
  $('restoreBtn').addEventListener('click', async () => {
    if (!selected) return;
    try { await api(`/api/documents/${state.activeDoc.id}/versions/${selected}/restore`, { method: 'POST' }); drawer.classList.add('hidden'); await D.openDoc(state.activeDoc.id); toast('Version restored. Your previous text is saved in history.'); }
    catch (err) { toast(err.message, true); }
  });

  // ---------- Command palette ----------
  const pal = { open: false, items: [], index: 0 };
  function actions() {
    const a = [
      { label: 'New document', hint: 'Create', icon: '＋', run: () => D.createDoc() },
      { label: 'Import a .txt or .md file', hint: 'Import', icon: '↥', run: () => $('fileInput').click() },
      { label: 'Go to all documents', hint: 'Navigate', icon: '▦', run: goDashboard }
    ];
    if (inEditor()) {
      a.push({ label: 'Toggle focus mode', hint: 'View', icon: '⛶', run: () => setFocus(!document.body.classList.contains('focus-mode')) });
      a.push({ label: 'Show version history', hint: 'History', icon: '↺', run: openHistory });
      if (state.activeDoc.access === 'owned') a.push({ label: 'Share this document', hint: 'Share', icon: '⇄', run: D.openShareModal });
    }
    state.users.filter(u => u.id !== state.userId).forEach(u => a.push({ label: `Switch to ${u.name}`, hint: 'Account', icon: u.initials, run: () => { goDashboard(); D.setUser(u.id); } }));
    return a;
  }
  function paletteItems(q) {
    q = q.trim().toLowerCase();
    const docs = state.docs.filter(d => !q || (d.title + ' ' + D.plainText(d.content)).toLowerCase().includes(q)).slice(0, 6)
      .map(d => ({ label: d.title, hint: d.access === 'owned' ? 'Yours' : 'Shared', icon: '▤', run: () => D.openDoc(d.id) }));
    const acts = actions().filter(a => !q || a.label.toLowerCase().includes(q));
    return [...acts, ...docs].slice(0, 9);
  }
  function renderPalette() {
    $('paletteList').innerHTML = pal.items.length
      ? pal.items.map((it, i) => `<li><button role="option" data-pal="${i}" class="${i === pal.index ? 'sel' : ''}"><span class="pal-ico">${escapeHtml(it.icon)}</span><span class="pal-label">${escapeHtml(it.label)}</span><span class="pal-hint">${escapeHtml(it.hint)}</span></button></li>`).join('')
      : '<li class="version-empty">No matches.</li>';
    const sel = $('paletteList').querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() { pal.open = true; pal.index = 0; $('paletteModal').classList.remove('hidden'); $('paletteInput').value = ''; pal.items = paletteItems(''); renderPalette(); $('paletteInput').focus(); }
  function closePalette() { pal.open = false; $('paletteModal').classList.add('hidden'); }
  function runPalette(i) { const it = pal.items[i]; if (!it) return; closePalette(); it.run(); }
  $('paletteInput').addEventListener('input', e => { pal.items = paletteItems(e.target.value); pal.index = 0; renderPalette(); });
  $('paletteInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (pal.items.length) { pal.index = (pal.index + (e.key === 'ArrowDown' ? 1 : -1) + pal.items.length) % pal.items.length; renderPalette(); } }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(pal.index); }
  });
  $('paletteList').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (b) runPalette(Number(b.dataset.pal)); });
  $('paletteModal').addEventListener('click', e => { if (e.target === $('paletteModal')) closePalette(); });
  document.querySelectorAll('.search-box kbd, .search-box .kbd, .search-box span:last-child').forEach(el => { if (/⌘/.test(el.textContent)) { el.style.cursor = 'pointer'; el.title = 'Open command palette'; el.addEventListener('click', openPalette); } });

  // ---------- Drag and drop import ----------
  let dragDepth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; $('dropOverlay').classList.remove('hidden'); } });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('dropOverlay').classList.add('hidden'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('dropOverlay').classList.add('hidden'); D.importFile(e.dataTransfer.files[0]); });

  // ---------- Global keys ----------
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.open ? closePalette() : openPalette(); return; }
    if (e.key !== 'Escape') return;
    if (pal.open) closePalette();
    else if (!$('confirmModal').classList.contains('hidden')) $('confirmCancel').click();
    else if (!drawer.classList.contains('hidden')) drawer.classList.add('hidden');
    else if (document.body.classList.contains('focus-mode')) setFocus(false);
  });

  // ---------- Per-document UI state ----------
  // app.js builds the editor for each opened document; refresh our parts after it does.
  new MutationObserver(() => {
    if (!inEditor()) { setFocus(false); drawer.classList.add('hidden'); return; }
    const d = state.activeDoc;
    $('deleteBtn').style.display = d.access === 'owned' ? '' : 'none';
    renderOutline();
  }).observe($('docTitle').closest('.editor-screen'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { if (inEditor()) { $('deleteBtn').style.display = state.activeDoc.access === 'owned' ? '' : 'none'; renderOutline(); } })
    .observe($('saveText'), { childList: true, characterData: true, subtree: true });
})();

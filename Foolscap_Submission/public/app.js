(() => {
  const $ = id => document.getElementById(id);
  const state = { userId: localStorage.getItem('foolscap-user') || 'u-akshay', user: null, users: [], docs: [], activeDoc: null, filter: 'all', search: '', saveTimer: null, savedHtml: '', listView: false, toastTimer: null };
  const colors = ['avatar-purple','avatar-blue','avatar-green','avatar-pink'];
  async function api(path, options = {}) {
    const response = await fetch(path + (path.includes('?') ? '&' : '?') + 'user=' + encodeURIComponent(state.userId), { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Something went wrong.'); return data;
  }
  function toast(message, bad = false) { const node = $('toast'); node.textContent = message; node.classList.toggle('bad', bad); node.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.remove('show'), 2700); }
  function initials(name = '') { return name.split(/\s+/).map(x => x[0] || '').slice(0,2).join('').toUpperCase(); }
  function avatar(user, extra = '') { const i = Math.max(0, state.users.findIndex(u => u.id === user.id)); return `<span class="avatar ${colors[i % colors.length]} ${extra}">${escapeHtml(user.initials || initials(user.name))}</span>`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function plainText(html = '') { const el = document.createElement('div'); el.innerHTML = html.replace(/<\/(p|h[1-6]|li|div)>/gi, ' </$1>'); return (el.textContent || '').replace(/\s+/g,' ').trim(); }
  function formatDate(iso) { if (!iso) return 'Just now'; const date = new Date(iso); const diff = Date.now() - date.getTime(); if (diff < 60_000) return 'Just now'; if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff/60_000))}m ago`; if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff/3_600_000))}h ago`; if (diff < 172_800_000) return 'Yesterday'; return date.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function currentUser() { return state.users.find(u => u.id === state.userId); }
  async function boot() {
    try { const u = await fetch('/api/users').then(r => r.json()); state.users = u.users || []; await refreshDocs(); updateUserUi(); renderDocs(); }
    catch (e) { toast('Could not connect to the server: ' + e.message, true); }
  }
  async function refreshDocs() { const data = await api('/api/documents'); state.docs = data.documents; state.user = data.currentUser; }
  function updateUserUi() { const u = currentUser(); if (!u) return; $('profileName').textContent = u.name; $('profileEmail').textContent = u.email; $('profileAvatar').textContent = u.initials; $('topAvatar').textContent = u.initials; $('allCount').textContent = state.docs.length; }
  function visibleDocs() {
    return state.docs.filter(d => (state.filter === 'all' || (state.filter === 'owned' && d.access === 'owned') || (state.filter === 'shared' && d.access === 'shared')) && (!state.search || (d.title + ' ' + plainText(d.content)).toLowerCase().includes(state.search.toLowerCase())));
  }
  function previewMarkup(doc) {
    const text = plainText(doc.content); const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3);
    return `<div class="preview-paper"><h4>${escapeHtml(doc.title)}</h4>${parts.map(p=>`<p>${escapeHtml(p.slice(0,110))}</p>`).join('') || '<div class="preview-line"></div><div class="preview-line short"></div>'}<div class="preview-line purple"></div></div>`;
  }
  function renderDocs() {
    const docs = visibleDocs(); $('allCount').textContent = state.docs.length;
    const mine = state.docs.filter(d=>d.access==='owned').length, shared = state.docs.filter(d=>d.access==='shared').length;
    const hour = new Date().getHours(), part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening', first = (currentUser()?.name || '').split(' ')[0];
    $('greeting').textContent = `Good ${part}${first ? ', ' + first : ''}.`;
    $('todayLabel').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
    $('summaryLine').textContent = state.docs.length ? `${mine} written by you · ${shared} shared with you · last change ${formatDate(state.docs[0].updatedAt).toLowerCase()}` : 'Your library is empty. Start with a new document or import a file.';
    const filterLabels = { all: ['All documents','Pick up where you left off.'], owned: ['Written by me','Documents you own.'], shared: ['Shared with me','Work your teammates have shared.'] };
    $('breadcrumbTitle').textContent = filterLabels[state.filter][0]; $('listTitle').textContent = state.search ? 'Search results' : (state.filter === 'all' ? 'Recent documents' : filterLabels[state.filter][0]); $('listSubtitle').textContent = state.search ? `${docs.length} result${docs.length===1?'':'s'} for “${state.search}”` : filterLabels[state.filter][1];
    $('documentsGrid').classList.toggle('list-layout', state.listView);
    $('documentsGrid').innerHTML = docs.map((doc, index) => {
      const owner = doc.owner || currentUser(); const shared = doc.sharedWith || []; const iconClass = ['','blue','green'][index%3]; const excerpt = plainText(doc.content) || 'Empty document';
      return `<article class="doc-card" data-open-doc="${escapeHtml(doc.id)}"><div class="doc-preview">${previewMarkup(doc)}</div><div class="doc-card-body"><div class="doc-title-row"><span class="doc-title-text" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</span><button class="doc-more" data-doc-menu="${escapeHtml(doc.id)}" aria-label="Document actions">···</button></div><p class="doc-excerpt">${escapeHtml(excerpt.slice(0,100))}</p><div class="doc-card-footer"><div class="doc-person">${avatar(owner,'mini-avatar')}<span>${doc.access==='owned'?'You':`By ${escapeHtml(owner.name.split(' ')[0])} · ${doc.canEdit?'Editor':'Viewer'}`}</span></div><span>${shared.length ? `<span class="shared-badge">${shared.length} shared</span>` : formatDate(doc.updatedAt)}</span></div></div></article>`;
    }).join('');
    $('emptyState').classList.toggle('hidden', docs.length > 0); $('documentsGrid').classList.toggle('hidden', docs.length === 0);
    $('allCount').textContent = state.docs.length;
  }
  async function createDoc(title = 'Untitled document', content) {
    try { const result = await api('/api/documents', { method:'POST', body:JSON.stringify({title}) }); state.docs.unshift(result.document); if (content !== undefined) { const updated = await api(`/api/documents/${result.document.id}`, {method:'PATCH',body:JSON.stringify({content})}); Object.assign(result.document, updated.document); } renderDocs(); openDoc(result.document.id); }
    catch(e) { toast(e.message,true); }
  }
  async function openDoc(id) {
    try {
      const doc = (await api(`/api/documents/${encodeURIComponent(id)}`)).document;
      state.activeDoc = doc; state.savedHtml = doc.content;
      $('dashboard').classList.add('hidden'); $('editorScreen').classList.remove('hidden');
      $('docTitle').value = doc.title; $('docTitle').readOnly = !doc.canRename;
      $('editorContent').innerHTML = doc.content || '<p></p>';
      $('editorContent').setAttribute('contenteditable', String(doc.canEdit));
      document.querySelectorAll('.format-toolbar button, #blockFormat').forEach(el => { el.disabled = !doc.canEdit; });
      $('saveText').textContent = doc.canEdit ? 'Saved' : 'View only'; $('saveDot').className = 'save-dot';
      $('updatedMeta').textContent = formatDate(doc.updatedAt); $('breadcrumbTitle').textContent = doc.title;
      updateWordCount(); updateEditorDetails(); window.scrollTo(0, 0);
    } catch (e) { toast(e.message, true); }
  }
  function updateEditorDetails() {
    const d=state.activeDoc; if(!d)return; const owner=d.owner || currentUser(); $('ownerDetail').textContent=d.ownerId===state.userId?'You':owner.name; $('editedDetail').textContent=formatDate(d.updatedAt)+(d.lastEditor?' · '+d.lastEditor.name.split(' ')[0]:''); $('accessDetail').textContent=d.access==='owned'?'Owner':(d.canEdit?'Can edit':'Can view');
    const people=[]; people.push({user:owner,role:'Owner'}); (d.sharedWith||[]).forEach(s=>{if(s.user)people.push({user:s.user,role:s.role==='editor'?'Can edit':'Can view'});});
    $('peopleList').innerHTML=people.map(p=>`<div class="person-row">${avatar(p.user)}<div><strong>${escapeHtml(p.user.id===state.userId?'You':p.user.name)}</strong><small>${escapeHtml(p.role)}</small></div></div>`).join('');
    $('avatarStack').innerHTML=(d.sharedWith||[]).slice(0,3).map(s=>s.user?avatar(s.user):'').join(''); $('shareBtn').disabled=d.access!=='owned'; $('sideShareBtn').style.display=d.access==='owned'?'':'none';
  }
  function scheduleSave() { if(!state.activeDoc || !state.activeDoc.canEdit)return; clearTimeout(state.saveTimer); $('saveDot').className='save-dot saving'; $('saveText').textContent='Unsaved changes'; updateWordCount(); state.saveTimer=setTimeout(saveDoc,650); }
  async function saveDoc() {
    if(!state.activeDoc || !state.activeDoc.canEdit)return; const content=$('editorContent').innerHTML; const title=$('docTitle').value.trim() || 'Untitled document'; $('saveText').textContent='Saving…'; $('saveDot').className='save-dot saving';
    try { const result=await api(`/api/documents/${state.activeDoc.id}`,{method:'PATCH',body:JSON.stringify(state.activeDoc.canRename?{title,content}:{content})}); state.activeDoc=result.document; state.savedHtml=content; const item=state.docs.find(d=>d.id===state.activeDoc.id); if(item)Object.assign(item,result.document); $('docTitle').value=result.document.title; $('saveText').textContent='Saved'; $('saveDot').className='save-dot'; $('updatedMeta') .textContent='Just now'; updateEditorDetails(); }
    catch(e){$('saveText').textContent='Save failed';$('saveDot').className='save-dot error';toast(e.message,true);}
  }
  function updateWordCount() { const text=plainText($('editorContent').innerHTML); const count=text?text.split(/\s+/).filter(Boolean).length:0; $('wordCount').textContent=`${count} word${count===1?'':'s'}`; }
  function closeEditor() { clearTimeout(state.saveTimer); if(state.activeDoc && state.activeDoc.canEdit && $('editorContent').innerHTML!==state.savedHtml) saveDoc().finally(finishClose); else finishClose(); }
  async function finishClose() { try{await refreshDocs();updateUserUi();}catch{} state.activeDoc=null; $('editorScreen').classList.add('hidden');$('dashboard').classList.remove('hidden');renderDocs(); }
  function openShareModal() {
    const d=state.activeDoc;if(!d)return;if(d.access!=='owned'){toast('Only the document owner can manage sharing.',true);return;}
    const existing=new Set((d.sharedWith||[]).map(s=>s.userId)); const options=state.users.filter(u=>u.id!==d.ownerId); $('shareUser').innerHTML=options.map(u=>`<option value="${u.id}" ${existing.has(u.id)?'disabled':''}>${escapeHtml(u.name)} · ${escapeHtml(u.email)}${existing.has(u.id)?' (already added)':''}</option>`).join('');
    $('shareForm').querySelector('button').disabled=options.every(u=>existing.has(u.id));renderSharePeople();$('shareModal').classList.remove('hidden');
  }
  function renderSharePeople() { const d=state.activeDoc;if(!d)return;const list=[{user:d.owner,role:'owner',owner:true},...(d.sharedWith||[]).filter(s=>s.user).map(s=>({user:s.user,role:s.role,owner:false}))]; $('modalPeopleList').innerHTML=list.map(p=>`<div class="access-row">${avatar(p.user)}<div class="access-person"><strong>${escapeHtml(p.user.id===state.userId?'You':p.user.name)}</strong><small>${escapeHtml(p.user.email)}</small></div><span class="access-role">${p.owner?'Owner':p.role==='editor'?'Can edit':'Can view'}</span>${p.owner?'':`<button class="remove-access" data-remove-access="${p.user.id}" title="Remove access" aria-label="Remove access">×</button>`}</div>`).join(''); }
  async function shareSubmit(event) { event.preventDefault(); if(!state.activeDoc)return;try{const data=await api(`/api/documents/${state.activeDoc.id}/share`,{method:'POST',body:JSON.stringify({userId:$('shareUser').value,role:$('shareRole').value})});state.activeDoc=data.document;const item=state.docs.find(d=>d.id===state.activeDoc.id);if(item)Object.assign(item,data.document);updateEditorDetails();renderSharePeople();openShareModal();toast('Access updated successfully.');}catch(e){toast(e.message,true);} }
  async function removeAccess(userId) { try{const data=await api(`/api/documents/${state.activeDoc.id}/share/${userId}`,{method:'DELETE'});state.activeDoc=data.document;const item=state.docs.find(d=>d.id===state.activeDoc.id);if(item)Object.assign(item,data.document);updateEditorDetails();renderSharePeople();openShareModal();toast('Access removed.');}catch(e){toast(e.message,true);} }
  async function importFile(file) { if(!file)return; const ext=file.name.split('.').pop().toLowerCase();if(!['txt','md'].includes(ext)){toast('Please choose a .txt or .md file.',true);return;}if(file.size>300*1024){toast('File must be smaller than 300 KB.',true);return;}try{const content=await file.text();const data=await api('/api/import',{method:'POST',body:JSON.stringify({filename:file.name,content})});state.docs.unshift(data.document);renderDocs();openDoc(data.document.id);toast('File imported as an editable document.');}catch(e){toast(e.message,true);}finally{$('fileInput').value='';} }
  function exportHtml() { if(!state.activeDoc)return;const blob=new Blob([`<!doctype html><meta charset="utf-8"><title>${escapeHtml(state.activeDoc.title)}</title><article>${$('editorContent').innerHTML}</article>`],{type:'text/html;charset=utf-8'});downloadBlob(blob,(state.activeDoc.title||'document').replace(/[^a-z0-9-_ ]/gi,'').trim()+'.html');toast('Document exported as HTML.'); }
  function downloadBlob(blob,name) { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function setUser(userId) { if(!state.users.some(u=>u.id===userId))return;state.userId=userId;localStorage.setItem('foolscap-user',userId);state.filter='all';state.search='';$('searchInput').value='';$('sidebar').classList.remove('open');refreshDocs().then(()=>{updateUserUi();renderDocs();toast(`Viewing as ${currentUser().name}`);}).catch(e=>toast(e.message,true)); }
  function showUserMenu() { const existing=document.getElementById('userMenu');if(existing){existing.remove();return;}const menu=document.createElement('div');menu.id='userMenu';menu.className='user-menu';menu.innerHTML=`<div class="user-menu-label">Switch demo account</div>`+state.users.map(u=>`<button data-switch-user="${u.id}" class="${u.id===state.userId?'sel':''}"><span class="avatar mini-avatar">${escapeHtml(u.initials)}</span><span><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)}</small></span>${u.id===state.userId?'<span class="check">✓</span>':''}</button>`).join('');document.body.appendChild(menu); }
  $('newDoc').addEventListener('click',()=>createDoc());$('createFirst').addEventListener('click',()=>createDoc());$('emptyCreate').addEventListener('click',()=>createDoc());$('backToDocs').addEventListener('click',closeEditor);$('shareBtn').addEventListener('click',openShareModal);$('sideShareBtn').addEventListener('click',openShareModal);$('shareForm').addEventListener('submit',shareSubmit);$('fileInput').addEventListener('change',e=>importFile(e.target.files[0]));$('exportBtn').addEventListener('click',exportHtml);$('searchInput').addEventListener('input',e=>{state.search=e.target.value;renderDocs();});
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));$('dashboard').classList.remove('hidden');$('editorScreen').classList.add('hidden');state.activeDoc=null;renderDocs();$('sidebar').classList.remove('open');}));
  document.querySelectorAll('[data-close="shareModal"]').forEach(btn=>btn.addEventListener('click',()=>$('shareModal').classList.add('hidden')));$('shareModal').addEventListener('click',e=>{if(e.target===$('shareModal'))$('shareModal').classList.add('hidden');});$('modalPeopleList').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-access]');if(btn)removeAccess(btn.dataset.removeAccess);});$('documentsGrid').addEventListener('click',e=>{const menu=e.target.closest('[data-doc-menu]');if(menu){e.stopPropagation();const doc=state.docs.find(d=>d.id===menu.dataset.docMenu);if(doc)openDoc(doc.id);return;}const card=e.target.closest('[data-open-doc]');if(card)openDoc(card.dataset.openDoc);});
  document.querySelectorAll('[data-command]').forEach(btn=>btn.addEventListener('click',()=>{if(!state.activeDoc?.canEdit){toast('You have view-only access.',true);return;} $('editorContent').focus();document.execCommand(btn.dataset.command,false,null);btn.classList.toggle('active',document.queryCommandState(btn.dataset.command));scheduleSave();}));
  $('blockFormat').addEventListener('change',e=>{if(!state.activeDoc?.canEdit)return;$('editorContent').focus();document.execCommand('formatBlock',false,e.target.value);scheduleSave();});$('clearFormat').addEventListener('click',()=>{if(!state.activeDoc?.canEdit)return;$('editorContent').focus();document.execCommand('removeFormat',false,null);document.execCommand('formatBlock',false,'p');scheduleSave();});$('editorContent').addEventListener('input',scheduleSave);$('docTitle').addEventListener('input',scheduleSave);$('editorContent').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();clearTimeout(state.saveTimer);saveDoc();}});
  $('listViewBtn').addEventListener('click',()=>{state.listView=!state.listView;$('documentsGrid').classList.toggle('list-layout',state.listView);document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active',b.id==='listViewBtn'?state.listView:!state.listView));});$('helpBtn').addEventListener('click',()=>$('helpPopover').classList.toggle('hidden'));$('closeHelp').addEventListener('click',()=>$('helpPopover').classList.add('hidden'));$('mobileMenu').addEventListener('click',()=>$('sidebar').classList.toggle('open'));$('profileAvatar').addEventListener('click',showUserMenu);$('topAvatar').addEventListener('click',showUserMenu);document.addEventListener('click',e=>{const switcher=e.target.closest('[data-switch-user]');if(switcher){setUser(switcher.dataset.switchUser);document.getElementById('userMenu')?.remove();}else if(!e.target.closest('#userMenu')&&!e.target.closest('#profileAvatar')&&!e.target.closest('#topAvatar'))document.getElementById('userMenu')?.remove();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('shareModal').classList.add('hidden');$('helpPopover').classList.add('hidden');}});
  window.addEventListener('beforeunload',e=>{if(state.activeDoc&&state.activeDoc.canEdit&&$('editorContent').innerHTML!==state.savedHtml){e.preventDefault();e.returnValue='';}});
  async function flushSave() { if (state.activeDoc?.canEdit && $('editorContent').innerHTML !== state.savedHtml) { clearTimeout(state.saveTimer); await saveDoc(); } }
  window.Foolscap = { state, api, $, toast, escapeHtml, avatar, formatDate, plainText, openDoc, createDoc, importFile, setUser, openShareModal, closeEditor, flushSave, scheduleSave, renderDocs, refreshDocs, updateUserUi };
  boot();
})();

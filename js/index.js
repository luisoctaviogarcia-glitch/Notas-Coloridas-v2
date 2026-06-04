// ═══════════════════════════════════════════════
//  STATE & DB
// ═══════════════════════════════════════════════
let db;
let notes = [];
let folders = [];
let currentView = 'all';   // 'all' | 'starred' | 'trash' | folder-id
let currentNoteId = null;
let sortMode = 'date';      // 'date' | 'title'
let expandedAll = false;
let noteImages = [];         // base64 images for current note
let undoHistory = [];
let redoHistory = [];
let currentFontSize = 15;
let currentFont = 'Sora';
let confirmCallback = null;

// Color de fondo de nota
const bgClasses = ['bg-purple','bg-teal','bg-rose','bg-amber','bg-green','bg-slate'];
// ── IndexedDB init ──
function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('NotasApp', 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', {keyPath:'id'});
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', {keyPath:'id'});
    };
    req.onsuccess = e => { db = e.target.result; res(); };
    req.onerror = () => rej(req.error);
  });
}

async function loadAll() {
  notes = await getAllFromStore('notes');
  folders = await getAllFromStore('folders');
}

function getAllFromStore(storeName) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

function putItem(storeName, item) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(item);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

function deleteItem(storeName, id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

async function clearStore(storeName) {
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear().onsuccess = () => res();
  });
}

// ── Helpers ──
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es', {day:'2-digit', month:'short', year:'numeric'});
}

function getFolderName(fid) {
  if (!fid) return 'Sin carpeta';
  const f = folders.find(x => x.id === fid);
  return f ? f.name : 'Sin carpeta';
}

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════
function getVisibleNotes() {
  let list = notes.filter(n => !n.deleted);
  if (currentView === 'starred') list = list.filter(n => n.starred);
  else if (currentView === 'trash') list = notes.filter(n => n.deleted);
  else if (currentView !== 'all') list = list.filter(n => n.folderId === currentView);

  // search filter
  const sq = document.getElementById('search-input').value.trim().toLowerCase();
  if (sq) list = list.filter(n => n.title.toLowerCase().includes(sq) || n.content.toLowerCase().includes(sq));

  // sort
  if (sortMode === 'title') list.sort((a,b) => a.title.localeCompare(b.title));
  else list.sort((a,b) => b.createdAt - a.createdAt);

  return list;
}

function renderNotes() {
  const grid = document.getElementById('notes-grid');
  const empty = document.getElementById('empty-state');
  const list = getVisibleNotes();
  grid.innerHTML = '';

  if (list.length === 0) { empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  list.forEach(note => {
    const card = document.createElement('div');
    /* Se crea la Tarjeta */
    card.className = 'note-card' + (note.starred ? ' starred' : '') + (note.pinned ? ' pinned' : '') + (note.bgColor ? ' ' + note.bgColor : '');
    card.dataset.id = note.id;

    const preview = note.content.slice(0, 100);
    const folderName = getFolderName(note.folderId);

    card.innerHTML = `
      <div class="note-card-header">
        <div class="note-card-title">${escHtml(note.title || 'Sin título')}</div>
        <div class="note-card-meta">${fmtDate(note.createdAt)}</div>
        <div class="note-card-expand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="note-card-preview">${escHtml(preview)}${note.content.length > 100 ? '…' : ''}</div>
      <div class="note-card-body">
        <div class="note-card-content">${escHtml(note.content)}</div>
      </div>
      <div class="note-card-footer">
        <span class="note-card-folder-tag">${escHtml(folderName)}</span>
        <div class="note-card-actions">
          ${currentView === 'trash' ? `
            <button class="nc-action" data-action="restore-note" data-id="${note.id}" title="Restaurar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0"/><polyline points="12 8 12 12 14 14"/></svg>
            </button>
            <button class="nc-action" style="color:var(--danger)" data-action="perm-delete" data-id="${note.id}" title="Eliminar definitivamente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          ` : `
            <button class="nc-action ${note.starred?'starred':''}" data-action="toggle-star" data-id="${note.id}" title="Destacar">
              <svg viewBox="0 0 24 24" fill="${note.starred?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <button class="nc-action" data-action="edit-note" data-id="${note.id}" title="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          `}
        </div>
      </div>
    `;

    // expand/collapse header
    card.querySelector('.note-card-header').addEventListener('click', e => {
      if (e.target.closest('.nc-action')) return;
      card.classList.toggle('expanded');
    });

    // open on title double click
    card.querySelector('.note-card-title').addEventListener('dblclick', () => {
      if (currentView !== 'trash') openNote(note.id);
    });

    grid.appendChild(card);
  });

  // delegate action clicks
  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleNoteCardAction(btn.dataset.action, btn.dataset.id);
    });
  });
}

async function handleNoteCardAction(action, id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  if (action === 'toggle-star') {
    note.starred = !note.starred;
    await putItem('notes', note);
    renderNotes();
    updateCounts();
  } else if (action === 'edit-note') {
    openNote(id);
  } else if (action === 'restore-note') {
    note.deleted = false;
    await putItem('notes', note);
    renderNotes(); updateCounts();
    showToast('Nota restaurada');
  } else if (action === 'perm-delete') {
    showConfirm('Eliminar definitivamente', '¿Eliminar esta nota para siempre? No se puede deshacer.', async () => {
      notes = notes.filter(n => n.id !== id);
      await deleteItem('notes', id);
      renderNotes(); updateCounts();
      showToast('Nota eliminada definitivamente');
    });
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Counts ──
function updateCounts() {
  const activeNotes = notes.filter(n => !n.deleted);
  document.getElementById('sb-count-all').textContent = activeNotes.length;
  document.getElementById('sb-count-starred').textContent = activeNotes.filter(n=>n.starred).length;
  document.getElementById('sb-count-trash').textContent = notes.filter(n=>n.deleted).length;
}

// ── Sidebar folders ──
function renderSidebarFolders() {
  const list = document.getElementById('sb-folders-list');
  list.innerHTML = '';
  folders.forEach(f => {
    const cnt = notes.filter(n => n.folderId === f.id && !n.deleted).length;
    const item = document.createElement('div');
    item.className = 'sb-folder-item';
    item.dataset.folder = f.id;

    // first letters of titles
    const folderNotes = notes.filter(n => n.folderId === f.id && !n.deleted);
    let firstLetters = '';
    if (folderNotes.length > 0) {
      const letters = [...new Set(folderNotes.map(n => (n.title || 'S')[0].toUpperCase()))].slice(0,5).join(' ');
      firstLetters = `<span style="font-size:11px;color:var(--accent);font-family:var(--mono);margin-left:4px">${letters}</span>`;
    }

    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent)"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <span style="flex:1;font-size:13px;color:var(--text2)">${escHtml(f.name)}</span>
      ${firstLetters}
      <span class="sb-count">${cnt}</span>
    `;
    item.addEventListener('click', () => {
      selectView(f.id);
      closeSidebar();
    });
    list.appendChild(item);
  });
}

// ── Folder dropdown options ──
function renderFolderDropdown() {
  const panel = document.getElementById('folder-dd-panel');
  // Remove old folder items (between first item and separator)
  const items = panel.querySelectorAll('[data-folder]:not([data-folder="all"])');
  items.forEach(i => i.remove());

  const sep = panel.querySelector('.dd-sep');
  folders.forEach(f => {
    const item = document.createElement('div');
    item.className = 'dd-item';
    item.dataset.folder = f.id;
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      ${escHtml(f.name)}
    `;
    item.addEventListener('click', () => {
      selectView(f.id);
      closeDropdowns();
    });
    panel.insertBefore(item, sep);
  });
}

// ── Note folder select ──
function renderNoteFolderSelect() {
  const sel = document.getElementById('note-folder-sel');
  sel.innerHTML = '<option value="">Sin carpeta</option>';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
}

// ══════════════════════════════════════════════
//  VIEW SELECTION
// ══════════════════════════════════════════════
function selectView(view) {
  currentView = view;
  // update sidebar active
  document.querySelectorAll('.sb-block, .sb-folder-item').forEach(el => el.classList.remove('active'));
  if (view === 'all') document.getElementById('sb-all').classList.add('active');
  else if (view === 'starred') document.getElementById('sb-starred').classList.add('active');
  else if (view === 'trash') document.getElementById('sb-trash').classList.add('active');
  else {
    const fItem = document.querySelector(`.sb-folder-item[data-folder="${view}"]`);
    if (fItem) fItem.classList.add('active');
  }
  // update top bar label
  const label = view === 'all' ? 'Todas las notas'
    : view === 'starred' ? 'Destacados'
    : view === 'trash' ? 'Eliminadas'
    : (folders.find(f=>f.id===view)||{name:'Carpeta'}).name;
  document.getElementById('folder-btn-label').textContent = label;
  renderNotes();
  // show trash clear button
  const grid = document.getElementById('notes-grid');
  const existingClear = document.getElementById('trash-clear-btn');
  if (existingClear) existingClear.remove();
  if (view === 'trash' && notes.filter(n=>n.deleted).length > 0) {
    const btn = document.createElement('button');
    btn.className = 'trash-clear-btn'; btn.id = 'trash-clear-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg> Vaciar papelera`;
    btn.addEventListener('click', () => {
      showConfirm('Vaciar papelera', '¿Eliminar todas las notas de la papelera?', async () => {
        const deleted = notes.filter(n=>n.deleted);
        for (const n of deleted) await deleteItem('notes', n.id);
        notes = notes.filter(n=>!n.deleted);
        renderNotes(); updateCounts(); selectView('trash');
      });
    });
    document.getElementById('main').prepend(btn);
  }
}

// Crear un input dedicado para imágenes y añadirlo al DOM
// ── SISTEMA DE IMÁGENES COMPLETO ──
function renderNoteImages() {
  const preview = document.getElementById('note-images-preview');
  if (!preview) return; 
  preview.innerHTML = '';
  preview.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:8px 0;width:100%';

  noteImages.forEach((src, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;border-radius:12px;overflow:hidden;border:1px solid #2a2a4a';

    const img = new Image();
    img.style.cssText = 'width:100%;max-height:300px;object-fit:cover;display:block;border-radius:12px';
    img.src = src;

    const btn = document.createElement('button');
    btn.innerHTML = '×';
    btn.style.cssText = `
      position:absolute;top:8px;right:8px;
      width:28px;height:28px;
      background:rgba(0,0,0,0.6);
      border:none;border-radius:50%;
      color:white;font-size:18px;
      cursor:pointer;display:flex;
      align-items:center;justify-content:center;
      line-height:1;z-index:5;
      backdrop-filter:blur(4px);
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      noteImages.splice(i, 1);
      renderNoteImages();
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    preview.appendChild(wrap);
  });
}
function closeNote() {
  document.getElementById('note-page').classList.remove('open');
  document.getElementById('note-dots-menu').classList.remove('open');
  currentNoteId = null;
}

async function saveNote() {
  const title = document.getElementById('note-title-input').value.trim();
  const content = document.getElementById('note-content-input').value;
  const folderId = document.getElementById('note-folder-sel').value || null;
  const pinBtn = document.getElementById('note-pin-btn');
  const starBtn = document.getElementById('nf-star');
  const isPinned = pinBtn.style.color === 'var(--accent)';
  const isStarred = starBtn.classList.contains('active-star');

  if (!title && !content) { showToast('La nota está vacía'); return; }

  if (currentNoteId) {
    const note = notes.find(n => n.id === currentNoteId);
    if (note) {
      note.title = title || 'Sin título';
      note.content = content;
      note.folderId = folderId;
      note.updatedAt = Date.now();
      note.pinned = isPinned;
      note.starred = isStarred;
      note.images = [...noteImages];
      note.fontSize = currentFontSize;
      note.font = currentFont;
      await putItem('notes', note);
    }
  } else {
    const note = {
      id: genId(),
      title: title || 'Sin título',
      content,
      folderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      starred: isStarred,
      pinned: isPinned,
      deleted: false,
      images: [...noteImages],
      fontSize: currentFontSize,
      font: currentFont
    };
    notes.push(note);
    currentNoteId = note.id;
    await putItem('notes', note);
  }

  renderNotes();
  updateCounts();
  renderSidebarFolders();
  showToast('Nota guardada ✓');
}


// ══════════════════════════════════════════════
//  NOTE EDITOR
// ══════════════════════════════════════════════
function openNote(id) {
  currentNoteId = id;
  const note = id ? notes.find(n => n.id === id) : null;
  noteImages = note && note.images ? [...note.images] : [];
  undoHistory = [];
  redoHistory = [];
  currentFontSize = note && note.fontSize ? note.fontSize : 15;
  currentFont = note && note.font ? note.font : 'Sora';

  document.getElementById('note-title-input').value = note ? note.title : '';
  document.getElementById('note-content-input').value = note ? note.content : '';
  document.getElementById('note-content-input').style.fontSize = currentFontSize + 'px';
  document.getElementById('note-content-input').style.fontFamily = currentFont;
  document.getElementById('font-size-val').textContent = currentFontSize;
  document.querySelectorAll('.font-opt').forEach(o => o.classList.toggle('active', o.dataset.font === currentFont));

  // folder select
  renderNoteFolderSelect();
  document.getElementById('note-folder-sel').value = note && note.folderId ? note.folderId : '';

  // pin button
  const pinBtn = document.getElementById('note-pin-btn');
  pinBtn.style.color = note && note.pinned ? 'var(--accent)' : '';

  // star button
  const starBtn = document.getElementById('nf-star');
  starBtn.classList.toggle('active-star', !!(note && note.starred));
  starBtn.querySelector('svg').setAttribute('fill', note && note.starred ? 'currentColor' : 'none');

  // images
  renderNoteImages();

  // font panel close
  document.getElementById('font-panel').classList.remove('visible');

// restaurar color de fondo
bgClasses.forEach(c => document.getElementById('note-page').classList.remove(c));
if (note && note.bgColor) {
  document.getElementById('note-page').classList.add(note.bgColor);
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.bg === note.bgColor);
  });
} else {
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.bg === '');
  });
}

  document.getElementById('note-page').classList.add('open');
  setTimeout(() => document.getElementById('note-title-input').focus(), 350);
}


// ══════════════════════════════════════════════
//  FOLDERS CRUD
// ══════════════════════════════════════════════
async function createFolder(name) {
  const f = { id: genId(), name, createdAt: Date.now() };
  folders.push(f);
  await putItem('folders', f);
  renderSidebarFolders();
  renderFolderDropdown();
  renderNoteFolderSelect();
  showToast(`Carpeta "${name}" creada`);
}

async function deleteFolder(id) {
  // Move notes from this folder to no folder
  for (const n of notes.filter(n => n.folderId === id)) {
    n.folderId = null;
    await putItem('notes', n);
  }
  folders = folders.filter(f => f.id !== id);
  await deleteItem('folders', id);
  renderSidebarFolders();
  renderFolderDropdown();
  renderNoteFolderSelect();
  renderFoldersModal();
  updateCounts();
  showToast('Carpeta eliminada');
}

function renderFoldersModal() {
  const list = document.getElementById('folders-list-modal');
  list.innerHTML = '';
  if (folders.length === 0) {
    list.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:8px 0">No hay carpetas creadas</p>';
    return;
  }
  folders.forEach(f => {
    const item = document.createElement('div');
    item.className = 'folder-item-modal';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <span>${escHtml(f.name)}</span>
      <button class="folder-del-btn" data-id="${f.id}" title="Eliminar carpeta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    `;
    list.appendChild(item);
  });
  list.querySelectorAll('.folder-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm('Eliminar carpeta', 'Las notas de esta carpeta quedarán sin clasificar.', () => deleteFolder(btn.dataset.id));
    });
  });
}

// ══════════════════════════════════════════════
//  BACKUP / RESTORE
// ══════════════════════════════════════════════
function backupNotes() {
  const data = { version: 2, exportedAt: new Date().toISOString(), notes, folders };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notas-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Respaldo descargado ✓');
}

async function restoreNotes(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.notes) throw new Error('Formato inválido');
    await clearStore('notes');
    await clearStore('folders');
    notes = data.notes || [];
    folders = data.folders || [];
    for (const n of notes) await putItem('notes', n);
    for (const f of folders) await putItem('folders', f);
    renderAll();
    showToast('Notas restauradas ✓');
  } catch(e) {
    showToast('Error: archivo inválido');
  }
}

// ══════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
}
function closeDropdowns() {
  document.getElementById('folder-dd-panel').classList.remove('open');
  document.getElementById('folder-dropdown-btn').classList.remove('open');
  document.getElementById('dots-menu').classList.remove('open');
}

function openModal(id) {
  document.getElementById(id).classList.add('visible');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
}

function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCallback = cb;
  openModal('confirm-modal');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2600);
}

function renderAll() {
  renderNotes();
  updateCounts();
  renderSidebarFolders();
  renderFolderDropdown();
}

// ══════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════
document.getElementById('hamburger-btn').addEventListener('click', () => {
  closeDropdowns();
  openSidebar();
});

document.getElementById('overlay').addEventListener('click', closeSidebar);

// Folder dropdown
document.getElementById('folder-dropdown-btn').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('folder-dd-panel');
  const btn = document.getElementById('folder-dropdown-btn');
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  document.getElementById('dots-menu').classList.remove('open');
});

document.getElementById('folder-dd-panel').addEventListener('click', e => {
  const item = e.target.closest('[data-folder]');
  const actionItem = e.target.closest('[data-action]');
  if (item) {
    selectView(item.dataset.folder);
    closeDropdowns();
  }
  if (actionItem) {
    handleMainAction(actionItem.dataset.action);
    closeDropdowns();
  }
});

// Dots menu
document.getElementById('dots-btn').addEventListener('click', e => {
  e.stopPropagation();
  const menu = document.getElementById('dots-menu');
  menu.classList.toggle('open');
  closeDropdowns();
  document.getElementById('dots-menu').classList.toggle('open');
  document.getElementById('folder-dd-panel').classList.remove('open');
  document.getElementById('folder-dropdown-btn').classList.remove('open');
});

document.getElementById('dots-menu').addEventListener('click', e => {
  const item = e.target.closest('[data-action]');
  if (item) { handleMainAction(item.dataset.action); closeDropdowns(); }
});

function handleMainAction(action) {
  if (action === 'expand-all') {
    document.querySelectorAll('.note-card').forEach(c => c.classList.add('expanded'));
  } else if (action === 'collapse-all') {
    document.querySelectorAll('.note-card').forEach(c => c.classList.remove('expanded'));
  } else if (action === 'sort-date') {
    sortMode = 'date'; renderNotes(); showToast('Ordenado por fecha');
  } else if (action === 'sort-title') {
    sortMode = 'title'; renderNotes(); showToast('Ordenado por título');
  } else if (action === 'backup') {
    backupNotes();
  } else if (action === 'restore') {
    document.getElementById('restore-file-input').click();
  }
}

// Search
document.getElementById('search-btn').addEventListener('click', () => {
  const bar = document.getElementById('search-bar');
  bar.classList.add('visible');
  document.getElementById('search-input').focus();
  closeDropdowns();
});
document.getElementById('search-close-btn').addEventListener('click', () => {
  document.getElementById('search-bar').classList.remove('visible');
  document.getElementById('search-input').value = '';
  renderNotes();
});
document.getElementById('search-input').addEventListener('input', () => renderNotes());

// FAB
document.getElementById('fab').addEventListener('click', () => openNote(null));

// Note page
document.getElementById('note-back-btn').addEventListener('click', closeNote);
document.getElementById('note-save-btn').addEventListener('click', saveNote);

document.getElementById('note-pin-btn').addEventListener('click', function() {
  const isPinned = this.style.color === 'var(--accent)';
  this.style.color = isPinned ? '' : 'var(--accent)';
  showToast(isPinned ? 'Nota desfijada' : 'Nota fijada');
});



document.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', async () => {
    const bg = swatch.dataset.bg;
    // actualizar nota
    if (currentNoteId) {
      const note = notes.find(n => n.id === currentNoteId);
      if (note) {
        note.bgColor = bg;
        await putItem('notes', note);
        renderNotes();
      }
    }
    // marcar swatch activo
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    // actualizar fondo de la página de nota
    const notePage = document.getElementById('note-page');
    bgClasses.forEach(c => notePage.classList.remove(c));
    if (bg) notePage.classList.add(bg);
  });
});

document.getElementById('note-dots-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('note-dots-menu').classList.toggle('open');
});

document.getElementById('nd-share').addEventListener('click', async () => {
  if (navigator.share) {
    const title = document.getElementById('note-title-input').value;
    const content = document.getElementById('note-content-input').value;
    await navigator.share({ title, text: content });
  } else showToast('Compartir no disponible');
  document.getElementById('note-dots-menu').classList.remove('open');
});

document.getElementById('nd-duplicate').addEventListener('click', async () => {
  if (!currentNoteId) return;
  const orig = notes.find(n => n.id === currentNoteId);
  if (!orig) return;
  const dup = { ...orig, id: genId(), title: orig.title + ' (copia)', createdAt: Date.now(), updatedAt: Date.now() };
  notes.push(dup);
  await putItem('notes', dup);
  renderNotes(); updateCounts();
  showToast('Nota duplicada');
  document.getElementById('note-dots-menu').classList.remove('open');
});

document.getElementById('nd-move-trash').addEventListener('click', async () => {
  if (!currentNoteId) return;
  const note = notes.find(n => n.id === currentNoteId);
  if (!note) return;
  note.deleted = true;
  await putItem('notes', note);
  renderNotes(); updateCounts();
  closeNote();
  showToast('Nota eliminada');
});

// Note footer
document.getElementById('nf-star').addEventListener('click', function() {
  const isStarred = this.classList.toggle('active-star');
  this.querySelector('svg').setAttribute('fill', isStarred ? 'currentColor' : 'none');
  showToast(isStarred ? 'Añadida a destacados' : 'Quitada de destacados');
});

document.getElementById('nf-trash').addEventListener('click', async () => {
  if (!currentNoteId) {
    closeNote(); return;
  }
  showConfirm('Eliminar nota', '¿Enviar esta nota a la papelera?', async () => {
    const note = notes.find(n => n.id === currentNoteId);
    if (note) { note.deleted = true; await putItem('notes', note); }
    renderNotes(); updateCounts();
    closeNote();
    showToast('Nota eliminada');
  });
});

document.getElementById('nf-font').addEventListener('click', () => {
  document.getElementById('font-panel').classList.toggle('visible');
});

document.querySelectorAll('.font-opt').forEach(opt => {
  opt.addEventListener('click', function() {
    document.querySelectorAll('.font-opt').forEach(o => o.classList.remove('active'));
    this.classList.add('active');
    currentFont = this.dataset.font;
    document.getElementById('note-content-input').style.fontFamily = currentFont;
  });
});

document.getElementById('font-minus').addEventListener('click', () => {
  if (currentFontSize > 11) {
    currentFontSize--;
    document.getElementById('font-size-val').textContent = currentFontSize;
    document.getElementById('note-content-input').style.fontSize = currentFontSize + 'px';
  }
});
document.getElementById('font-plus').addEventListener('click', () => {
  if (currentFontSize < 24) {
    currentFontSize++;
    document.getElementById('font-size-val').textContent = currentFontSize;
    document.getElementById('note-content-input').style.fontSize = currentFontSize + 'px';
  }
});

// Image insert
// Reutilizar el input oculto ya existente en el DOM
const imgInput = document.getElementById('restore-file-input');



// Input de imágenes fijo en el DOM
const noteImgInput = document.createElement('input');
noteImgInput.type = 'file';
noteImgInput.accept = 'image/*';
noteImgInput.multiple = true;
noteImgInput.setAttribute('style','position:fixed;top:-9999px;left:-9999px;opacity:0;width:1px;height:1px');
document.body.appendChild(noteImgInput);

noteImgInput.addEventListener('change', function() {
  const files = Array.from(this.files);
  if (!files.length) return;

  files.forEach(file => {
    const reader = new FileReader();

    reader.addEventListener('load', function() {
      noteImages.push(this.result);
      renderNoteImages();
      showToast('Imagen agregada ✓');
    });

    reader.addEventListener('error', function() {
      showToast('Error leyendo imagen');
    });

    reader.readAsDataURL(file);
  });

  // Reset después de un tick
  setTimeout(() => { this.value = ''; }, 100);
});

document.getElementById('nf-image').addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  noteImgInput.click();
});

// Undo/Redo (simple textarea history)
const contentTA = document.getElementById('note-content-input');
contentTA.addEventListener('input', () => {
  undoHistory.push(contentTA.value);
  if (undoHistory.length > 50) undoHistory.shift();
  redoHistory = [];
});
document.getElementById('nf-undo').addEventListener('click', () => {
  if (undoHistory.length > 1) {
    redoHistory.push(undoHistory.pop());
    contentTA.value = undoHistory[undoHistory.length-1] || '';
  }
});
document.getElementById('nf-redo').addEventListener('click', () => {
  if (redoHistory.length > 0) {
    const val = redoHistory.pop();
    undoHistory.push(val);
    contentTA.value = val;
  }
});

// Sidebar nav blocks
document.getElementById('sb-all').addEventListener('click', () => { selectView('all'); closeSidebar(); });
document.getElementById('sb-starred').addEventListener('click', () => { selectView('starred'); closeSidebar(); });
document.getElementById('sb-trash').addEventListener('click', () => { selectView('trash'); closeSidebar(); });

// Manage folders
document.getElementById('manage-folders-btn').addEventListener('click', () => {
  renderFoldersModal();
  openModal('folders-modal');
  closeSidebar();
});
document.getElementById('create-folder-btn').addEventListener('click', () => {
  const inp = document.getElementById('new-folder-input');
  const name = inp.value.trim();
  if (!name) return;
  createFolder(name);
  inp.value = '';
});
document.getElementById('new-folder-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('create-folder-btn').click();
});

// Support
document.getElementById('support-btn').addEventListener('click', () => {
  openModal('support-modal');
  closeSidebar();
});

// Modal closes
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

// Confirm modal
document.getElementById('confirm-ok-btn').addEventListener('click', () => {
  closeModal('confirm-modal');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});

// Restore file
document.getElementById('restore-file-input').addEventListener('change', async function() {
  if (this.files[0]) {
    showConfirm('Restaurar respaldo', 'Esto reemplazará todas las notas actuales.', async () => {
      await restoreNotes(this.files[0]);
      this.value = '';
    });
  }
});

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#folder-dd-panel') && !e.target.closest('#folder-dropdown-btn')) {
    document.getElementById('folder-dd-panel').classList.remove('open');
    document.getElementById('folder-dropdown-btn').classList.remove('open');
  }
  if (!e.target.closest('#dots-menu') && !e.target.closest('#dots-btn')) {
    document.getElementById('dots-menu').classList.remove('open');
  }
  if (!e.target.closest('#note-dots-menu') && !e.target.closest('#note-dots-btn')) {
    document.getElementById('note-dots-menu').classList.remove('open');
  }
});

// ── PWA manifest injection ──
(function() {
  const manifest = {
    name: 'Notas',
    short_name: 'Notas',
    start_url: './',
    display: 'standalone',
    background_color: '#0f0f1a',
    theme_color: '#1a1a2e',
    icons: [{ src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="24" fill="%231a1a2e"/><text y="130" x="40" font-size="120" font-family="sans-serif">📝</text></svg>', sizes: '192x192', type: 'image/svg+xml' }]
  };
  const blob = new Blob([JSON.stringify(manifest)], {type:'application/json'});
  document.getElementById('manifest-link').href = URL.createObjectURL(blob);
})();

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
(async () => {
  await initDB();
  await loadAll();
  renderAll();
  selectView('all');
  document.getElementById('note-content-input').style.fontSize = currentFontSize + 'px';
})();
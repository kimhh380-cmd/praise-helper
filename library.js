// 내 악보함: 이 기기에 저장한 악보들 (처음 화면 아래에 보여요)
//  - 오선·타브 악보 (악보 만들기)        localStorage 'mh-scorelib'
//  - 실행 악보 (구간을 정한 악보)         localStorage 'mh-sheets'
//  - 실행 순서 (이름 붙인 순서 파일)      localStorage 'mh-orders'
//  - PDF·사진 파일                       IndexedDB 'mh-lib' → 'files'
// 프로젝트에 들어가 있으면 프로젝트에 공유된 악보도 함께 보여요.

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const libUpsert = (key, x) => { const list = lsGet(key, []).filter(y => y && y.id !== x.id); list.unshift(x); return lsSet(key, list); };
const libDrop = (key, id) => lsSet(key, lsGet(key, []).filter(y => y && y.id !== id));

// ───────── 오선·타브 악보 ─────────
function libScores() { return lsGet('mh-scorelib', []).filter(x => x && x.id); }
function libGetScore(id) { const e = libScores().find(x => x.id === id); if (!e) return null; try { const d = JSON.parse(e.data); d.libId = e.id; return d; } catch (e2) { return null; } }
function libPutScore(doc) {
  if (!doc || !Array.isArray(doc.notes)) return;
  if (!doc.libId) doc.libId = rsId('n');
  libUpsert('mh-scorelib', { id: doc.libId, title: doc.title || '악보', instId: doc.instId, notes: doc.notes.length, updatedAt: Date.now(), data: JSON.stringify(doc) });
}
function libDelScore(id) { libDrop('mh-scorelib', id); }

// ───────── 실행 악보 ─────────
function libSheets() { return lsGet('mh-sheets', []).filter(x => x && x.id && x.ver >= 2); }
function libGetSheet(id) { return libSheets().find(x => x.id === id) || null; }
function libPutSheet(s) {
  const x = JSON.parse(JSON.stringify(s));
  delete x.where; delete x.dirty;
  if (!x.id) x.id = rsId('s');
  x.updatedAt = Date.now();
  libUpsert('mh-sheets', x);
  return x;
}
function libDelSheet(id) { libDrop('mh-sheets', id); }

// ───────── 실행 순서 ─────────
function libOrders() { return lsGet('mh-orders', []).filter(x => x && x.id); }
function libGetOrder(id) { return libOrders().find(x => x.id === id) || null; }
function libPutOrder(o) {
  const x = { id: o.id || rsId('o'), name: String(o.name || '실행 순서').slice(0, 60), items: (o.items || []).map(String).slice(0, 200), sheet: o.sheet || null, updatedAt: Date.now() };
  libUpsert('mh-orders', x);
  return x;
}
function libDelOrder(id) { libDrop('mh-orders', id); }

// ───────── PDF·사진 파일 (IndexedDB) ─────────
const FDB = { p: null };
function fdb() {
  if (!FDB.p) FDB.p = new Promise(res => {
    try {
      const r = indexedDB.open('mh-lib', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files', { keyPath: 'key' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return FDB.p;
}
async function fdbDo(mode, fn) {
  const db = await fdb();
  if (!db) throw 'nodb';
  return new Promise((res, rej) => {
    const tx = db.transaction('files', mode), req = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(req ? req.result : undefined);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
const fileGet = key => fdbDo('readonly', st => st.get(key)).catch(() => undefined);
const filePut = rec => fdbDo('readwrite', st => st.put(rec));
const fileDel = key => fdbDo('readwrite', st => st.delete(key)).catch(() => {});
async function fileList() {
  try { return ((await fdbDo('readonly', st => st.getAll())) || []).map(r => ({ key: r.key, name: r.name, title: r.title, type: r.type, size: r.size, parts: (r.parts || []).length, pages: r.pages || null, addedAt: r.addedAt || 0 })); }
  catch (e) { return []; }
}
// 파일(들)의 이름표: 같은 파일이면 어느 기기에서든 같은 값이에요
function fileKeyOf(list) {
  const s = list.map(f => f.name + ':' + f.size).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 'f' + h.toString(36) + '-' + list.reduce((a, f) => a + f.size, 0).toString(36);
}
// 고른 파일(PDF 하나 또는 사진 여러 장)을 내 악보함에 저장하고 이름표를 돌려줘요
async function fileSaveFrom(files) {
  files = [...files];
  const pdf = files.find(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  const use = pdf ? [pdf] : files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(f.name));
  if (!use.length) throw 'PDF나 사진 파일을 골라 주세요.';
  const parts = [];
  for (const f of use) parts.push({ name: f.name, type: f.type || '', buf: await f.arrayBuffer() });
  const rec = { key: fileKeyOf(use), name: use.length > 1 ? `${use[0].name} 외 ${use.length - 1}장` : use[0].name, type: pdf ? 'pdf' : 'img', size: use.reduce((a, f) => a + f.size, 0), parts, addedAt: Date.now() };
  rec.title = rec.name.replace(/\.[^.]+$/, '');
  await filePut(rec);
  return rec;
}
const fmtSize = n => (n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
function fmtWhen(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return `오늘 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ───────── 처음 한 번: 예전 버전 자료 옮기기 ─────────
function libInit() {
  try {
    if (!localStorage.getItem('mh-mig9')) {
      ['guitar', 'piano', 'bass'].forEach(id => {
        const d = lsGet('mh-doc-' + id, null);
        if (d && Array.isArray(d.notes) && (d.notes.length || d.minBars)) libPutScore(d);
      });
      localStorage.setItem('mh-mig9', '1');
    }
    const raw = lsGet('mh-sheets', []);
    if (raw.some(s => s && !(s.ver >= 2))) {
      const out = [];
      raw.forEach(s => {
        if (!s) return;
        if (s.ver >= 2) { out.push(s); return; }
        const { sheet, order } = rsUpgradeSheet(s);
        sheet.id = s.id || rsId('s'); sheet.updatedAt = Date.now();
        out.push(sheet);
        if (order) libPutOrder(Object.assign(order, { sheet: sheet.id }));
      });
      lsSet('mh-sheets', out);
    }
  } catch (e) { console.warn('libInit', e); }
}

// ───────── 처음 화면의 내 악보함 ─────────
const LIB = { filter: 'all', open: null, renaming: null, msg: '' };
const LIB_TYPES = { score: '오선·타브', file: 'PDF·사진' };
async function libRender() {
  const el = $('lib');
  if (!el || $('home').hidden) return;
  const items = [];
  libScores().forEach(e => items.push({ type: 'score', id: e.id, title: e.title, meta: [(INSTRUMENTS[e.instId] || {}).name, `${e.notes}음`], at: e.updatedAt }));
  (await fileList()).filter(f => f.type !== 'audio').forEach(f => items.push({ type: 'file', id: f.key, title: f.title || f.name, meta: [f.type === 'pdf' ? 'PDF' : `사진 ${f.parts}장`, fmtSize(f.size)], at: f.addedAt }));
  if (!$('lib') || $('home').hidden) return;
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  const shown = items.filter(x => LIB.filter === 'all' || x.type === LIB.filter);
  const counts = {}; items.forEach(x => (counts[x.type] = (counts[x.type] || 0) + 1));
  const p = COLLAB.project;
  const proj = [];
  if (p && collabIn()) {
    (typeof NTS !== 'undefined' ? NTS.list : []).forEach(x => proj.push({ type: 'score', id: x.id, title: x.title || '악보', meta: [(INSTRUMENTS[x.inst] || {}).name, nameOf(x.updatedBy, x.updatedName)], at: x.updatedAt, proj: 1 }));
    proj.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  const row = x => {
    const k = (x.proj ? 'p' : 'l') + ':' + x.type + ':' + x.id, open = LIB.open === k;
    const main = x.type === 'file' ? ['악보 실행', 'run'] : ['열기', 'open'];
    let acts = '';
    if (open) {
      const a = [];
      if (x.type === 'file') a.push(['PDF 악보에서 열기', 'open']);
      if (!x.proj) { a.push(['이름 바꾸기', 'rename'], ['복사', 'copy']); if (x.type !== 'file' && p && collabIn() && canCreate()) a.push(['프로젝트에 올리기', 'upload']); a.push(['지우기', 'del']); }
      acts = `<div class="lacts">${LIB.renaming === k ? `<input type="text" id="librn" maxlength="60" value="${escH(x.title)}" aria-label="새 이름"><button class="btn small" data-a="rnok">저장</button>` : a.map(([t, v]) => `<button class="btn sec small${v === 'del' ? ' danger' : ''}" data-a="${v}">${t}</button>`).join('')}</div>`;
    }
    return `<div class="lrow${open ? ' on' : ''}" data-k="${escH(k)}"><span class="lt lt-${x.type}">${LIB_TYPES[x.type]}</span><div class="lmain"><b>${escH(x.title)}</b><span class="meta">${x.meta.filter(Boolean).map(escH).join(' · ')}${x.at ? ' · ' + fmtWhen(x.at) : ''}</span></div><div class="lbtn"><button class="btn small" data-a="${main[1]}">${main[0]}</button><button class="btn sec small" data-a="more" aria-label="더 보기" aria-expanded="${open}">⋯</button></div>${acts}</div>`;
  };
  el.innerHTML = `<div class="libh"><h2>내 악보함</h2><span class="meta">이 기기에 저장돼요</span></div>
    <div class="libf" role="tablist">${[['all', '전체', items.length]].concat(Object.entries(LIB_TYPES).map(([k, t]) => [k, t, counts[k] || 0])).map(([k, t, n]) => `<button role="tab" data-f="${k}" aria-selected="${LIB.filter === k}">${t} <span>${n}</span></button>`).join('')}</div>
    ${LIB.msg ? `<p class="okmsg">${escH(LIB.msg)}</p>` : ''}
    <div class="liblist">${shown.map(row).join('') || `<p class="meta libempty">${items.length ? '이 종류의 악보가 아직 없어요.' : '아직 저장한 악보가 없어요. “악보 편집”에서 악보를 만들면 여기에 모여요.'}</p>`}</div>
    ${proj.length ? `<div class="libh"><h2>프로젝트 <span class="pjname">${escH(p.name)}</span></h2><span class="meta">멤버 모두에게 공유돼요</span></div><div class="liblist">${proj.map(row).join('')}</div>` : ''}`;
  el.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { LIB.filter = b.dataset.f; LIB.open = null; libRender(); }));
  el.querySelectorAll('.lrow').forEach(r => r.querySelectorAll('[data-a]').forEach(b => (b.onclick = () => libAct(r.dataset.k, b.dataset.a, b))));
  if ($('librn')) { $('librn').focus(); $('librn').onkeydown = e => { if (e.key === 'Enter') el.querySelector('[data-a="rnok"]').click(); if (e.key === 'Escape') { LIB.renaming = null; libRender(); } }; }
}
async function libAct(k, a, btn) {
  const [where, type, id] = k.split(':'), proj = where === 'p';
  LIB.msg = '';
  if (a === 'more') { LIB.open = LIB.open === k ? null : k; LIB.renaming = null; return libRender(); }
  if (a === 'rename') { LIB.renaming = k; return libRender(); }
  if (a === 'rnok') {
    const t = ($('librn').value || '').trim().slice(0, 60);
    if (t) {
      if (type === 'score') { const d = libGetScore(id); if (d) { d.title = t; libPutScore(d); if (ED.doc && ED.doc.libId === id) ED.doc.title = t; } }
      if (type === 'sheet') { const s = libGetSheet(id); if (s) { s.title = t; libPutSheet(s); } }
      if (type === 'order') { const o = libGetOrder(id); if (o) { o.name = t; libPutOrder(o); } }
      if (type === 'file') { const f = await fileGet(id); if (f) { f.title = t; await filePut(f); } }
    }
    LIB.renaming = null; return libRender();
  }
  if (a === 'del') {
    if (!btn.dataset.arm) { btn.dataset.arm = '1'; btn.textContent = '정말 지울까요?'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.arm; btn.textContent = '지우기'; } }, 3500); return; }
    if (type === 'score') libDelScore(id);
    if (type === 'sheet') libDelSheet(id);
    if (type === 'order') libDelOrder(id);
    if (type === 'file') await fileDel(id);
    LIB.open = null; LIB.msg = '지웠어요.'; return libRender();
  }
  if (a === 'copy') {
    if (type === 'score') { const d = libGetScore(id); if (d) { d.libId = null; d.title += ' (복사)'; libPutScore(d); } }
    if (type === 'sheet') { const s = libGetSheet(id); if (s) { s.id = null; s.title += ' (복사)'; libPutSheet(s); } }
    if (type === 'order') { const o = libGetOrder(id); if (o) { o.id = null; o.name += ' (복사)'; libPutOrder(o); } }
    LIB.open = null; LIB.msg = '복사했어요.'; return libRender();
  }
  if (a === 'upload') {
    try {
      if (type === 'score') { const d = libGetScore(id); await COLLAB.B.saveItem(COLLAB.pid, 'scores', null, { title: d.title, inst: d.instId, data: JSON.stringify(Object.assign({}, d, { libId: null })) }, isLead()); }
      LIB.msg = '프로젝트에 올렸어요. 멤버 모두가 볼 수 있어요.';
    } catch (e) { LIB.msg = collabErr(e); }
    LIB.open = null; return libRender();
  }
  // 열기 · 실행 · 고치기
  if (type === 'score') {
    if (proj) { openSection('edit', 't-nt'); ntsOpen(id); return; }
    const d = libGetScore(id);
    if (!d) return;
    setInst(d.instId);
    openSection('edit', 't-nt');
    ntOpenDoc(d);
    return;
  }
  if (type === 'file') {
    if (a === 'run') { stgOpenFile(id); return; }
    const f = await fileGet(id);
    if (!f) return;
    if (f.type !== 'pdf') { LIB.msg = '사진 악보는 “악보 실행”으로 열어서 넘기며 볼 수 있어요.'; LIB.open = k; return libRender(); }
    openSection('edit', 't-pdf');
    pdfOpen(new File([f.parts[0].buf], f.parts[0].name, { type: 'application/pdf' }));
  }
}

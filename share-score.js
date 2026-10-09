// 악보 만들기 ↔ 공동 프로젝트: 프로젝트 악보 목록, 지금 악보 올리기, 열어서 함께 고치기, 주최자 잠금
// 공유 악보를 연 동안에는 고친 내용이 바로 멤버 모두에게 저장되고, 다른 사람이 고친 내용도 바로 들어와요.

const NTS = { pid: null, list: [], un: null, bind: null, doc: null, item: null, state: '', note: '', adopting: false, pushed: null };

function ntsSync() {
  const pid = collabIn() && COLLAB.project ? COLLAB.pid : null;
  if (pid !== NTS.pid) {
    if (NTS.un) NTS.un();
    NTS.un = null;
    if (NTS.bind) ntsDetach('프로젝트가 바뀌어서 공유를 끊었어요. 지금 악보는 내 기기에만 남아 있어요.');
    NTS.pid = pid; NTS.list = [];
    if (pid) NTS.un = COLLAB.B.watchItems(pid, 'scores', list => { NTS.list = list.sort((a, b) => b.updatedAt - a.updatedAt); ntsRender(); }, e => { NTS.note = collabErr(e); ntsRender(); });
  }
  if (NTS.bind && ED.doc !== NTS.doc) ntsDetach('다른 악보를 열어서 공유를 끊었어요.');
  ntsRO();
  ntsRender();
}

function ntsRender() {
  const el = $('ntshare');
  if (!el) return;
  const p = COLLAB.project;
  if (!collabIn()) { el.hidden = true; return; }
  el.hidden = false;
  if (!p) { el.innerHTML = '<p class="meta">“프로젝트” 탭에서 프로젝트를 만들거나 연동하면 이 악보를 멤버와 함께 고칠 수 있어요. <button class="btn sec small" id="ntsgo">프로젝트 탭 열기</button></p>'; $('ntsgo').onclick = goProjects; return; }
  const lead = isLead(), it = NTS.item;
  let h = `<div class="shh">공동 프로젝트 <b>${escH(p.name)}</b> ${roleBadge(myRole(p))}</div>`;
  if (NTS.bind) {
    const st = NTS.state === 'saving' ? '저장하는 중…' : NTS.state === 'saved' ? '모두에게 저장했어요' : '';
    h += `<p class="meta">공유 악보 <b>${escH((ED.doc && ED.doc.title) || '악보')}</b>를 함께 고치는 중${it && it.updatedAt ? ` · 마지막으로 고친 사람 ${escH(nameOf(it.updatedBy, it.updatedName))}` : ''}${st ? ' · ' + st : ''}</p>`;
    if (ED.ro) h += `<p class="rolock">${escH(ED.ro)}</p>`;
    const mineLock = it && it.lock && it.lock.by === COLLAB.me.uid && Date.now() - it.lock.at < LOCK_MS;
    h += `<div class="btns"><button class="btn sec small" id="ntsoff">공유 끊기 (내 기기에서만 고치기)</button>${mineLock ? '<button class="btn sec small" id="ntsunlock">조율 끝 (잠금 풀기)</button>' : ''}${lead ? '<button class="btn sec small danger" id="ntsdel">이 공유 악보 지우기</button>' : ''}</div>`;
  } else if (ED.doc && canCreate()) h += '<p class="meta">지금 악보는 내 기기에만 있어요. <button class="btn small" id="ntsup">프로젝트에 올리기</button></p>';
  if (NTS.list.length) {
    h += `<div class="shlist"><label class="lb2" for="ntssel">프로젝트 악보 ${NTS.list.length}개</label><div class="rnrow"><select id="ntssel">${NTS.list.map(x => `<option value="${escH(x.id)}"${NTS.bind && NTS.bind.id === x.id ? ' selected' : ''}>${escH(x.title || '악보')} · ${escH((INSTRUMENTS[x.inst] || {}).name || '')}${x.updatedAt ? ' · ' + escH(nameOf(x.updatedBy, x.updatedName)) : ''}</option>`).join('')}</select><button class="btn sec small" id="ntsopen">열기</button></div></div>`;
  } else h += '<p class="meta">아직 프로젝트에 올린 악보가 없어요.</p>';
  if (NTS.note) h += `<p class="okmsg">${escH(NTS.note)}</p>`;
  el.innerHTML = h;
  if ($('ntsup')) $('ntsup').onclick = ntsUpload;
  if ($('ntsopen')) $('ntsopen').onclick = () => ntsOpen($('ntssel').value);
  if ($('ntsoff')) $('ntsoff').onclick = () => ntsDetach('공유를 끊었어요. 지금 악보는 내 기기에만 남아 있어요.');
  if ($('ntsunlock')) $('ntsunlock').onclick = () => NTS.bind && NTS.bind.release().then(() => { NTS.note = '잠금을 풀었어요. 참가자도 다시 고칠 수 있어요.'; ntsRender(); });
  if ($('ntsdel')) $('ntsdel').onclick = () => {
    const b = $('ntsdel');
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '모두에게서 지워져요. 한 번 더 누르기'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = '이 공유 악보 지우기'; } }, 3500); return; }
    const id = NTS.bind.id;
    ntsDetach('공유 악보를 지웠어요. 지금 화면의 악보는 내 기기에만 남아 있어요.');
    COLLAB.B.deleteItem(COLLAB.pid, 'scores', id).catch(e => { NTS.note = collabErr(e); ntsRender(); });
  };
}

function ntsRO() {
  const before = ED.ro;
  ED.ro = NTS.bind ? whyReadOnly(NTS.item) : '';
  if (before !== ED.ro && $('ntout')) { ntsRender(); if (typeof ntDraw === 'function') ntDraw(); }
}
setInterval(() => { if (NTS.bind) ntsRO(); }, 5000);

// 공유 악보 내용을 편집기에 넣기 (내가 고친 것으로 치지 않아요)
function ntsAdopt(doc, fresh) {
  const sel = ED.sel;
  ED.doc = doc; NTS.doc = doc;
  ED.nextId = Math.max(ED.nextId, 1, ...doc.notes.map(n => (n.id || 0) + 1), ...(doc.marks || []).map(m => (m.id || 0) + 1));
  ED.undo = []; ED.redo = [];
  if (fresh) { ED.sel = null; ED.range = null; ED.anchor = null; }
  else if (!doc.notes.some(n => n.id === sel)) ED.sel = null;
  NTS.pushed = JSON.stringify(doc);
  NTS.adopting = true;
  try { edSave(); } finally { NTS.adopting = false; }
  if (ED.onChange) ED.onChange();
}
// 공유된 악보는 다른 사람이 보낸 것이라, 필요한 값만 알맞은 모양으로 골라 써요
function ntsParse(item) {
  let d = null;
  try { d = JSON.parse(item.data); } catch (e) {}
  if (!d || !Array.isArray(d.notes)) return null;
  const n = cleanNum, ts = d.ts || {};
  const doc = {
    title: String(d.title || item.title || '악보').slice(0, 120),
    bpm: Math.max(20, Math.min(300, n(d.bpm, 90))),
    ts: { num: Math.max(1, Math.min(16, Math.round(n(ts.num, 4)))), den: [2, 4, 8, 16].includes(+ts.den) ? +ts.den : 4 },
    instId: INSTRUMENTS[d.instId] ? d.instId : INST.id,
    fretted: !!d.fretted,
    tuning: Array.isArray(d.tuning) ? d.tuning.slice(0, 12).map(x => n(x, 40)) : null,
    stringNames: Array.isArray(d.stringNames) ? d.stringNames.slice(0, 12).map(x => String(x).slice(0, 3)) : null,
    maxFret: d.maxFret == null ? null : Math.max(1, Math.min(36, n(d.maxFret, 24))),
    key: d.key && typeof d.key === 'object' ? { root: n(d.key.root), minor: !!d.key.minor, flats: !!d.key.flats, name: String(d.key.name || '').slice(0, 30) } : null,
    notes: d.notes.slice(0, 20000).map(x => { const o = { id: n(x.id), t: Math.max(0, n(x.t)), dur: Math.max(0.0625, n(x.dur, 1)), midi: Math.max(0, Math.min(127, Math.round(n(x.midi, 60)))) }; if (x.s != null) { o.s = Math.round(n(x.s)); o.f = Math.round(n(x.f)); } return o; }),
    marks: (Array.isArray(d.marks) ? d.marks : []).filter(m => m && MARK_TYPES[m.type]).map(m => ({ id: n(m.id), type: m.type, a: n(m.a), b: n(m.b), color: cleanColor(m.color), text: String(m.text || '').slice(0, 60) })),
    chords: (Array.isArray(d.chords) ? d.chords : []).map(c => ({ t: n(c && c.t), name: String((c && c.name) || '').slice(0, 16) })),
  };
  if (d.minBars) doc.minBars = Math.max(1, Math.min(512, Math.round(n(d.minBars, 1))));
  if (doc.fretted && (!doc.tuning || !doc.tuning.length)) { doc.fretted = false; doc.notes.forEach(x => { delete x.s; delete x.f; }); }
  if (doc.fretted) doc.notes = doc.notes.filter(x => x.s != null && x.s >= 0 && x.s < doc.tuning.length);
  return doc;
}
function ntsOpen(id) {
  const it = NTS.list.find(x => x.id === id);
  if (!it) return;
  const doc = ntsParse(it);
  if (!doc) { NTS.note = '이 공유 악보를 읽을 수 없어요.'; ntsRender(); return; }
  edStop();
  if (doc.instId && INSTRUMENTS[doc.instId] && doc.instId !== INST.id) setInst(doc.instId);
  if (SCREEN !== 'app' || TAB !== 't-nt') openSection('edit', 't-nt');
  ntsDetach('');
  ntsAdopt(doc, true);
  ntsBind(it);
  NTS.note = `“${it.title || '악보'}”를 열었어요. 고치면 멤버 모두에게 바로 저장돼요.`;
  ntsRender();
}
function ntsBind(it) {
  NTS.item = it;
  NTS.state = '';
  NTS.bind = shareBind('scores', it.id, {
    apply: (item, dropped) => {
      const d = ntsParse(item);
      if (!d) return;
      edStop();
      ntsAdopt(d, false);
      const who = nameOf(item.updatedBy, item.updatedName);
      NTS.note = dropped && item.updatedBy !== COLLAB.me.uid ? `${who}님이 먼저 고쳐서, 방금 내가 고친 내용은 반영되지 않았어요. 다시 고쳐 주세요.` : `${who}님이 고친 내용이 들어왔어요.`;
      ntsRender();
    },
    meta: item => { NTS.item = item; ntsRO(); ntsRender(); },
    gone: () => ntsDetach('이 공유 악보가 지워졌어요. 지금 화면의 악보는 내 기기에만 남아 있어요.'),
    saved: () => { NTS.state = 'saved'; ntsRender(); },
    fail: m => { NTS.state = ''; NTS.note = m; ntsRender(); },
  });
  NTS.bind.shown = it.data;
  NTS.pushed = it.data;
  ntsRO();
}
function ntsDetach(note) {
  if (NTS.bind) NTS.bind.close();
  NTS.bind = null; NTS.item = null; NTS.doc = null; NTS.state = '';
  ED.ro = '';
  if (note != null) NTS.note = note;
  ntsRender();
}
async function ntsUpload() {
  if (!ED.doc || !COLLAB.project) return;
  if (!canCreate()) { NTS.note = whyReadOnly(null); ntsRender(); return; }
  const b = $('ntsup'); if (b) b.disabled = true;
  try {
    const data = JSON.stringify(ED.doc);
    const big = collabTooBig(data);
    if (big) throw big;
    const id = await COLLAB.B.saveItem(COLLAB.pid, 'scores', null, { title: ED.doc.title || '악보', inst: ED.doc.instId, data }, isLead());
    NTS.doc = ED.doc;
    ntsBind({ id, title: ED.doc.title, inst: ED.doc.instId, data, lock: null });
    NTS.note = '프로젝트에 올렸어요. 이제 고치면 멤버 모두에게 바로 저장돼요.';
  } catch (e) { NTS.note = collabErr(e); }
  ntsRender();
}

// 편집기에서 고칠 때마다 불려요 (고른 음만 바뀐 경우처럼 내용이 같으면 저장하지 않아요)
function ntsOnSaved() {
  if (!NTS.bind) { if (ED.doc && collabIn() && COLLAB.project && $('ntshare') && !$('ntsup')) ntsRender(); return; }
  if (NTS.adopting || ED.doc !== NTS.doc) return;
  const s = JSON.stringify(ED.doc);
  if (s === NTS.pushed) return;
  NTS.pushed = s;
  NTS.state = 'saving';
  NTS.bind.push(s, { title: ED.doc.title || '악보', inst: ED.doc.instId });
  ntsRender();
}
ED.onSaved = ntsOnSaved;
ED.onNewDoc = () => { if (NTS.bind) ntsDetach('새로 불러온 악보는 내 기기에만 있어요. 함께 고치려면 “프로젝트에 올리기”를 눌러 주세요.'); };
collabOn('project', ntsSync);
collabOn('logout', ntsSync);
collabOn('names', ntsRender);

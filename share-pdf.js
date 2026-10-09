// PDF 악보 ↔ 공동 프로젝트: 같은 PDF 파일을 각자 열면, 그 위의 표시(형광펜·글자·기호)가 멤버 모두에게 공유돼요.
// PDF 파일 자체는 올리지 않아요 (용량이 커서). 멤버마다 같은 파일을 열어 주세요.

const PDS = { pid: null, key: '', bind: null, item: null, exists: null, list: [], un: null, note: '', state: '', adopting: false, pushed: null };
function pdsKeyOf(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return 'k' + h.toString(36) + '-' + s.length; }

function pdsSync() {
  const pid = collabIn() && COLLAB.project ? COLLAB.pid : null;
  const key = PDFE.pdf ? pdsKeyOf(PDFE.key) : '';
  if (pid !== PDS.pid) {
    if (PDS.un) PDS.un();
    PDS.un = null; PDS.list = [];
    if (pid) PDS.un = COLLAB.B.watchItems(pid, 'pdfs', l => { PDS.list = l.sort((a, b) => b.updatedAt - a.updatedAt); pdsRender(); }, () => {});
  }
  if (pid !== PDS.pid || key !== PDS.key) {
    if (PDS.bind) PDS.bind.close();
    PDS.bind = null; PDS.item = null; PDS.exists = null; PDS.state = ''; PDFE.ro = '';
    PDS.pid = pid; PDS.key = key;
    if (pid && key) pdsBind();
  }
  pdsRO();
  pdsRender();
}
// 공유된 표시는 다른 사람이 보낸 것이라, 필요한 값만 알맞은 모양으로 골라 써요
function pdsClean(list) {
  const n = cleanNum;
  return (Array.isArray(list) ? list : []).filter(a => a && ['range', 'hl', 'pen', 'text', 'stamp', 'cover', 'note', 'chord', 'order', 'otag'].includes(a.type)).slice(0, 3000).map(a => {
    const o = { id: n(a.id), page: Math.max(0, Math.floor(n(a.page))), type: a.type, color: cleanColor(a.color) };
    if (a.type === 'range') Object.assign(o, { x: n(a.x), y: n(a.y), w: n(a.w), h: n(a.h), label: MARK_TYPES[a.label] || a.label === 'none' ? a.label : 'none', text: String(a.text || '').slice(0, 60) });
    else if (a.type === 'hl' || a.type === 'pen') Object.assign(o, { size: Math.max(1, Math.min(8, n(a.size, 3))), pts: (Array.isArray(a.pts) ? a.pts : []).slice(0, 4000).map(p => [n(p && p[0]), n(p && p[1])]) });
    else if (a.type === 'cover') Object.assign(o, { x: n(a.x), y: n(a.y), w: n(a.w), h: n(a.h), top: a.top == null ? null : n(a.top), sp: Math.max(0, Math.min(40, n(a.sp, 0))) });
    else if (a.type === 'note') Object.assign(o, { x: n(a.x), y: n(a.y), sp: Math.max(2, Math.min(40, n(a.sp, 7))), top: a.top == null ? null : n(a.top), kind: PN_KINDS.some(k => k[0] === a.kind) ? a.kind : 'q', dot: !!a.dot, acc: PN_ACCS.some(k => k[0] === a.acc) ? a.acc : '', stem: PN_STEMS.some(k => k[0] === a.stem) ? a.stem : 'auto' });
    else if (a.type === 'otag') Object.assign(o, { x: n(a.x), y: n(a.y), fs: Math.max(4, Math.min(80, n(a.fs, 14))), w: Math.max(0, n(a.w)), sec: Math.round(n(a.sec, -1)), text: String(a.text || '').slice(0, 30) });
    else if (a.type === 'order') {
      Object.assign(o, { x: n(a.x), y: n(a.y), fs: Math.max(4, Math.min(80, n(a.fs, 14))), w: Math.max(0, n(a.w)), text: String(a.text || '').slice(0, 800) });
      if (Array.isArray(a.segs)) o.segs = a.segs.slice(0, 300).map(g => {
        const q = { l: Math.max(0, Math.min(40, Math.round(n(g && g.l)))), x: n(g && g.x), w: Math.max(0, n(g && g.w)), k: Math.round(n(g && g.k, -1)) };
        if (g && Array.isArray(g.ks)) q.ks = g.ks.slice(0, 200).map(v => Math.round(n(v, -1)));
        if (g && g.box) q.box = 1;
        if (g && g.badge) q.badge = 1;
        if (g && typeof g.img === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(g.img) && g.img.length < 40000) q.img = g.img; else q.t = String((g && g.t) || '').slice(0, 30);
        return q;
      });
    }
    else Object.assign(o, { x: n(a.x), y: n(a.y), size: Math.max(1, Math.min(8, n(a.size, 3))), text: String(a.text || '').slice(0, 80) });
    if (typeof TM_PARTS !== 'undefined' && TM_PARTS.some(p => p[0] === a.part)) o.part = a.part; // 파트 메모
    return o;
  });
}
function pdsBind() {
  PDS.bind = shareBind('pdfs', PDS.key, {
    apply: (item, dropped) => {
      let annos = null;
      try { annos = JSON.parse(item.data); } catch (e) {}
      PDS.exists = true;
      if (!Array.isArray(annos) || !PDFE.pdf || pdsKeyOf(PDFE.key) !== PDS.key) return;
      annos = pdsClean(annos);
      PDS.adopting = true;
      PDFE.annos = annos; PDFE.sel = null; PDFE.undo = []; PDFE.redo = [];
      PDFE.nextId = Math.max(PDFE.nextId, 1, ...annos.map(a => (a.id || 0) + 1));
      PDS.pushed = JSON.stringify(annos);
      try { pdfChanged(); } finally { PDS.adopting = false; }
      const who = nameOf(item.updatedBy, item.updatedName);
      PDS.note = item.updatedBy === COLLAB.me.uid ? '프로젝트에 공유된 표시를 불러왔어요.' : dropped ? `${who}님이 먼저 고쳐서, 방금 내가 넣은 표시는 반영되지 않았어요. 다시 넣어 주세요.` : `${who}님이 넣은 표시가 들어왔어요.`;
      pdsRender();
    },
    meta: item => { PDS.item = item; PDS.exists = true; pdsRO(); pdsRender(); },
    gone: () => { PDS.exists = false; PDS.item = null; pdsRO(); pdsRender(); },
    saved: () => { PDS.state = 'saved'; pdsRender(); },
    fail: m => { PDS.state = ''; PDS.note = m; pdsRender(); },
  });
}
function pdsRO() {
  const before = PDFE.ro;
  PDFE.ro = PDS.bind && PDS.exists ? whyReadOnly(PDS.item) : '';
  if (before !== PDFE.ro) pdsRender();
}
setInterval(() => { if (PDS.bind && PDS.exists) pdsRO(); }, 5000);
async function pdsShare() {
  if (!PDS.bind || !canCreate()) return;
  const data = JSON.stringify(PDFE.annos);
  const big = collabTooBig(data);
  if (big) { PDS.note = big; pdsRender(); return; }
  PDS.bind.shown = data; PDS.pushed = data;
  try { await COLLAB.B.createItem(COLLAB.pid, 'pdfs', PDS.key, { title: PDFE.name || 'PDF', data }, isLead()); PDS.exists = true; PDS.note = '이 PDF의 표시를 프로젝트에 공유했어요. 멤버가 같은 PDF 파일을 열면 표시가 보여요.'; }
  catch (e) { PDS.note = collabErr(e); }
  pdsRender();
}
function pdsOnChanged() {
  if (!PDS.bind || !PDS.exists || PDS.adopting) return;
  const s = JSON.stringify(PDFE.annos);
  if (s === PDS.pushed) return;
  PDS.pushed = s; PDS.state = 'saving';
  PDS.bind.push(s, { title: PDFE.name || 'PDF' });
  pdsRender();
}
function pdsRender() {
  const el = $('pdfshare');
  if (!el) return;
  const p = COLLAB.project;
  if (!collabIn() || !p) { el.hidden = true; return; }
  el.hidden = false;
  let h = `<div class="shh">공동 프로젝트 <b>${escH(p.name)}</b> ${roleBadge(myRole(p))}</div>`;
  if (PDFE.pdf && PDS.bind) {
    if (PDS.exists) {
      const it = PDS.item, st = PDS.state === 'saving' ? ' · 저장하는 중…' : PDS.state === 'saved' ? ' · 모두에게 저장했어요' : '';
      h += `<p class="meta">이 PDF의 표시를 멤버와 함께 쓰는 중${it && it.updatedAt ? ` · 마지막으로 고친 사람 ${escH(nameOf(it.updatedBy, it.updatedName))}` : ''}${st}</p>`;
      if (PDFE.ro) h += `<p class="rolock">${escH(PDFE.ro)}</p>`;
      if (it && it.lock && it.lock.by === COLLAB.me.uid && Date.now() - it.lock.at < LOCK_MS) h += '<div class="btns"><button class="btn sec small" id="pdsunlock">조율 끝 (잠금 풀기)</button></div>';
    } else if (PDS.exists === false) {
      h += canCreate() ? '<p class="meta">이 PDF의 표시는 아직 내 기기에만 있어요. <button class="btn small" id="pdsshare">표시를 프로젝트에 공유하기</button></p>' : `<p class="meta">이 PDF의 표시는 공유되어 있지 않아요. ${escH(whyReadOnly(null))}</p>`;
    } else h += '<p class="meta">공유된 표시를 확인하는 중…</p>';
  }
  if (PDS.list.length) h += `<p class="meta">프로젝트에서 표시를 공유 중인 PDF: ${PDS.list.map(x => `<b>${escH(x.title || 'PDF')}</b>`).join(', ')} · 같은 파일을 열면 표시가 보여요.</p>`;
  else if (!PDFE.pdf) h += '<p class="meta">PDF를 열면 그 위의 표시를 멤버와 함께 쓸 수 있어요. (PDF 파일은 멤버마다 각자 열어요)</p>';
  if (PDS.note) h += `<p class="okmsg">${escH(PDS.note)}</p>`;
  el.innerHTML = h;
  if ($('pdsshare')) $('pdsshare').onclick = pdsShare;
  if ($('pdsunlock')) $('pdsunlock').onclick = () => PDS.bind && PDS.bind.release().then(() => { PDS.note = '잠금을 풀었어요.'; pdsRender(); });
}
PDFE.onOpen = () => { PDS.note = ''; pdsSync(); };
PDFE.onChanged = pdsOnChanged;
collabOn('project', pdsSync);
collabOn('logout', pdsSync);
collabOn('names', pdsRender);

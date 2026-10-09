// 악보 편집기: 오선 악보와 타브를 함께 그리고, 음 고치기 · 구간 표시(형광펜) · 표시를 따르는 들어보기
// 악보 문서(doc): { title, bpm, ts, notes:[{id,t,dur,midi,s,f}], marks:[{id,type,a,b,color,text}], chords:[{t,name}],
//                  instId, fretted, tuning, stringNames, maxFret, key:{flats,name} }

const MARK_TYPES = {
  rit: { label: 'rit.', name: '리타르단도 · 점점 느리게', color: '#FFE14D', line: 1 },
  accel: { label: 'accel.', name: '아첼레란도 · 점점 빠르게', color: '#FFB35C', line: 1 },
  brk: { label: 'Break', name: '브레이크 · 멈춤(소리 없음)', color: '#FF8FC7' },
  ferm: { label: '𝄐', name: '페르마타 · 늘여서', color: '#7CC8FF' },
  cresc: { label: 'cresc.', name: '크레셴도 · 점점 세게', color: '#9BE564', hair: 1 },
  dim: { label: 'dim.', name: '디미누엔도 · 점점 여리게', color: '#9BE564', hair: -1 },
  rep: { label: '반복 ×2', name: '구간 반복 · 2번 연주', color: '#7CC8FF' },
  pm: { label: 'P.M.', name: '팜뮤트 · 짧게 막아서', color: '#FFB35C', line: 1, fret: 1 },
  memo: { label: '', name: '메모 · 직접 쓰기', color: '#FFE14D' },
};
const HL_COLORS = [['#FFE14D', '노랑'], ['#9BE564', '연두'], ['#FF8FC7', '분홍'], ['#7CC8FF', '하늘'], ['#FFB35C', '주황'], ['#C9A7FF', '보라']];
const DUR_STEPS = [[0.25, '16분음표'], [0.5, '8분음표'], [0.75, '점8분음표'], [1, '4분음표'], [1.5, '점4분음표'], [2, '2분음표'], [3, '점2분음표'], [4, '온음표']];

const ED = { doc: null, view: 0, mode: 'select', sel: null, range: null, anchor: null, undo: [], redo: [], drag: null, play: null, onChange: null, nextId: 1, ro: '', onBlocked: null, onSaved: null, onNewDoc: null };
// 공동 프로젝트에서 지금 고칠 수 없으면(주최자 잠금 등) ED.ro에 까닭이 들어 있어요
function edRO() { if (!ED.ro) return false; if (ED.onBlocked) ED.onBlocked(ED.ro); return true; }

// ───────── 문서 만들기·저장 ─────────
function edNewDoc(base) {
  if (ED.onNewDoc) ED.onNewDoc();
  const doc = Object.assign({ marks: [], chords: [] }, base);
  doc.notes = base.notes.map(n => ({ ...n, id: ED.nextId++ }));
  doc.marks = (base.marks || []).map(m => ({ ...m, id: ED.nextId++ }));
  ED.doc = doc; ED.sel = null; ED.range = null; ED.anchor = null; ED.undo = []; ED.redo = [];
  edSave();
  return doc;
}
// 고칠 때마다 내 악보함(이 기기)에 저장해요. 프로젝트에 공유된 악보를 고치는 중이면 프로젝트에 저장돼요(ED.onSaved).
function edSave() {
  if (!ED.doc) return;
  const shared = typeof NTS !== 'undefined' && (NTS.adopting || (NTS.bind && NTS.doc === ED.doc));
  if (!shared && typeof libPutScore === 'function') libPutScore(ED.doc);
  if (ED.onSaved) ED.onSaved();
}
function edSnapshot() {
  ED.undo.push(JSON.stringify({ notes: ED.doc.notes, marks: ED.doc.marks, chords: ED.doc.chords }));
  if (ED.undo.length > 150) ED.undo.shift();
  ED.redo = [];
}
function edRestore(from, to) {
  if (!from.length || edRO()) return;
  to.push(JSON.stringify({ notes: ED.doc.notes, marks: ED.doc.marks, chords: ED.doc.chords }));
  const s = JSON.parse(from.pop());
  Object.assign(ED.doc, s);
  if (!ED.doc.notes.some(n => n.id === ED.sel)) ED.sel = null;
  edChanged();
}
function edChanged() { edSave(); if (ED.onChange) ED.onChange(); }

// ───────── 음 이름·위치 ─────────
const SPELL_SHARP = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const SPELL_FLAT = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
function spellM(m, flats) { const [l, a] = (flats ? SPELL_FLAT : SPELL_SHARP)[((m % 12) + 12) % 12]; return { step: (Math.floor(m / 12) - 1) * 7 + l, acc: a }; }
const STEP_PC = [0, 2, 4, 5, 7, 9, 11];
const stepToMidi = st => 12 * (Math.floor(st / 7) + 1) + STEP_PC[((st % 7) + 7) % 7];
function durShape(d) {
  if (d >= 4) return { open: 1, stem: 0, flags: 0, dot: 0 };
  if (d >= 3) return { open: 1, stem: 1, flags: 0, dot: 1 };
  if (d >= 2) return { open: 1, stem: 1, flags: 0, dot: 0 };
  if (d >= 1.5) return { open: 0, stem: 1, flags: 0, dot: 1 };
  if (d >= 1) return { open: 0, stem: 1, flags: 0, dot: 0 };
  if (d >= 0.75) return { open: 0, stem: 1, flags: 1, dot: 1 };
  if (d >= 0.5) return { open: 0, stem: 1, flags: 1, dot: 0 };
  return { open: 0, stem: 1, flags: 2, dot: 0 };
}
const durName = d => { let best = DUR_STEPS[0]; DUR_STEPS.forEach(s => { if (Math.abs(s[0] - d) < Math.abs(best[0] - d)) best = s; }); return Math.abs(best[0] - d) < 0.01 ? best[1] : `${d}박`; };

// ───────── 그리기 ─────────
function edGeom(doc) {
  const g = { rows: [12, 26], chordY: 44 };
  if (!doc.fretted) { g.tTop = 66; g.bTop = g.tTop + 32 + 62; g.h = g.bTop + 32 + 40; return g; }
  let y = 66;
  if (ED.view !== 2) { g.sTop = y; y += 32 + 56; }
  if (ED.view !== 1) { g.tabTop = y === 66 ? 66 : y; g.tabH = (doc.tuning.length - 1) * 11; y = g.tabTop + g.tabH; }
  g.h = y + 28;
  return g;
}
function edLayout(doc, width) {
  const bb = barBeats(doc.ts), PX = bb <= 3 ? 38 : 32, L = 40;
  let end = bb;
  doc.notes.forEach(n => (end = Math.max(end, n.t + n.dur)));
  doc.marks.forEach(m => (end = Math.max(end, m.b)));
  (doc.chords || []).forEach(c => (end = Math.max(end, c.t + 0.5)));
  if (doc.minBars) end = Math.max(end, doc.minBars * bb);
  const bars = Math.max(1, Math.ceil(end / bb - 1e-6));
  const per = Math.max(1, Math.min(4, Math.floor((width - L - 16) / (bb * PX))));
  return { bb, PX, L, bars, per };
}
const restShape = (x, y0, S, d) => {
  const mid = y0 + 2 * S;
  if (d >= 4) return `<rect class="rest" x="${x - 5}" y="${y0 + S}" width="10" height="${S / 2}"/>`;
  if (d >= 2) return `<rect class="rest" x="${x - 5}" y="${mid - S / 2}" width="10" height="${S / 2}"/>`;
  if (d >= 1) return `<path class="rest" d="M${x - 2} ${mid - 11} l5 6 l-5 5 l5 6 q-6 -2 -3 5" fill="none"/>`;
  const one = `<path class="rest" d="M${x + 3} ${mid - 5} l-4 ${d >= 0.5 ? 13 : 17}" fill="none"/><circle class="restd" cx="${x - 1}" cy="${mid - 5}" r="1.8"/>`;
  return d >= 0.5 ? one : one + `<circle class="restd" cx="${x - 2}" cy="${mid}" r="1.8"/>`;
};
function restPieces(a, b, bb) {
  const out = [];
  let c = a;
  while (b - c > 1e-6) {
    const rem = b - c;
    let d = 0.25;
    if (Math.abs(c % 1) < 1e-6 && rem >= 2 && Math.abs(c % 2) < 1e-6 && bb % 2 === 0) d = 2;
    else if (Math.abs(c % 1) < 1e-6 && rem >= 1) d = 1;
    else if (Math.abs(c % 0.5) < 1e-6 && rem >= 0.5) d = 0.5;
    out.push([c, Math.min(d, rem)]);
    c += Math.min(d, rem);
  }
  return out;
}

// 한 보표(오선 5줄)에 음 그리기
function edStaff(o, notes, top, clef, lay, t0, t1, xAt, flats, mutedT, selId) {
  const S = 8, bottomStep = clef === 'treble' ? 30 : 18, midStep = bottomStep + 4;
  const yOf = st => top + 4 * S - (st - bottomStep) * S / 2;
  let s = '';
  for (let i = 0; i < 5; i++) s += `<line class="sl" x1="${lay.L - 30}" y1="${top + i * S}" x2="${xAt(t1) + 2}" y2="${top + i * S}"/>`;
  s += clef === 'treble'
    ? `<text class="clef" x="${lay.L - 29}" y="${top + 3.9 * S}">𝄞</text>`
    : `<text class="clef cb" x="${lay.L - 29}" y="${top + 2.1 * S}">𝄢</text>`;
  if (o.oct8 && clef === 'treble') s += `<text class="c8" x="${lay.L - 22}" y="${top + 4 * S + 16}">8</text>`;
  if (o.oct8 && clef === 'bass') s += `<text class="c8" x="${lay.L - 22}" y="${top + 4 * S + 10}">8</text>`;
  // 같은 시간 음끼리
  const groups = new Map();
  notes.forEach(n => { const k = Math.round(n.t * 1000); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
  // 쉼표
  for (let bar = Math.round(t0 / lay.bb); bar * lay.bb < t1 - 1e-6; bar++) {
    const ba = bar * lay.bb, be = ba + lay.bb;
    const inBar = [...groups.values()].filter(g => g[0].t >= ba - 1e-6 && g[0].t < be - 1e-6).sort((a, b) => a[0].t - b[0].t);
    if (!inBar.length) { s += restShape(xAt(ba) + lay.bb * lay.PX / 2 - 10, top, S, 4); continue; }
    let c = ba;
    inBar.forEach(g => {
      if (g[0].t > c + 1e-6) restPieces(c, g[0].t, lay.bb).forEach(([rt, rd]) => (s += restShape(xAt(rt), top, S, rd)));
      c = Math.max(c, g[0].t + Math.min(...g.map(n => n.dur)));
    });
    if (c < be - 1e-6) restPieces(c, be, lay.bb).forEach(([rt, rd]) => (s += restShape(xAt(rt), top, S, rd)));
  }
  groups.forEach(g => {
    const x = xAt(g[0].t), barEnd = (Math.floor(g[0].t / lay.bb + 1e-6) + 1) * lay.bb;
    const d = Math.min(Math.min(...g.map(n => n.dur)), barEnd - g[0].t);
    const sh = durShape(d);
    const sp = g.map(n => ({ n, ...spellM(n.midi + (o.oct8 ? 12 : 0), flats) }));
    const ys = sp.map(p => yOf(p.step));
    const muted = mutedT(g[0].t);
    sp.forEach((p, i) => {
      const y = ys[i];
      for (let ly = top + 5 * S; ly <= y + 0.1; ly += S) s += `<line class="sl" x1="${x - 7}" y1="${ly}" x2="${x + 7}" y2="${ly}"/>`;
      for (let ly = top - S; ly >= y - 0.1; ly -= S) s += `<line class="sl" x1="${x - 7}" y1="${ly}" x2="${x + 7}" y2="${ly}"/>`;
      if (p.acc) s += `<text class="acc" x="${x - 15}" y="${y + 4}">${p.acc > 0 ? '♯' : '♭'}</text>`;
      const sel = p.n.id === selId;
      s += `<g class="nt${muted ? ' muted' : ''}${sel ? ' sel' : ''}" data-id="${p.n.id}"><circle class="hit" cx="${x}" cy="${y}" r="9"/>${sel ? `<circle class="selr" cx="${x}" cy="${y}" r="8"/>` : ''}<ellipse class="nh${sh.open ? ' ho' : ''}" cx="${x}" cy="${y}" rx="4.6" ry="3.4" transform="rotate(-20 ${x} ${y})"/>${sh.dot ? `<circle class="dotn" cx="${x + 8}" cy="${y - 1}" r="1.4"/>` : ''}</g>`;
    });
    if (sh.stem) {
      const lo = Math.max(...ys), hi = Math.min(...ys), up = (lo + hi) / 2 >= yOf(midStep);
      const sx = up ? x + 4.3 : x - 4.3, y1 = up ? lo : hi, y2 = up ? hi - 3.5 * S : lo + 3.5 * S;
      s += `<line class="stem${muted ? ' muted' : ''}" x1="${sx}" y1="${y1}" x2="${sx}" y2="${y2}"/>`;
      for (let k = 0; k < sh.flags; k++) { const fy = y2 + (up ? k * 5 : -k * 5); s += `<path class="stem" d="M${sx} ${fy} q 7 ${up ? 5 : -5} 5 ${up ? 12 : -12}" fill="none"/>`; }
    }
  });
  return s;
}

function edRender(container) {
  const doc = ED.doc;
  if (!doc) { container.innerHTML = ''; return; }
  const width = Math.max(320, container.clientWidth || 600);
  const lay = edLayout(doc, width), g = edGeom(doc);
  const flats = doc.key ? doc.key.flats : false;
  const inMark = (type, t) => doc.marks.some(m => m.type === type && t >= m.a - 1e-6 && t < m.b - 1e-6);
  const out = [];
  for (let b0 = 0, si = 0; b0 < lay.bars; b0 += lay.per, si++) {
    const nb = Math.min(lay.per, lay.bars - b0), t0 = b0 * lay.bb, t1 = t0 + nb * lay.bb;
    const xAt = t => lay.L + (t - t0) * lay.PX + 10;
    const xb = t => lay.L + (t - t0) * lay.PX;
    const w = lay.L + nb * lay.bb * lay.PX + 14;
    let s = `<svg class="sys" data-sys="${si}" data-t0="${t0}" data-t1="${t1}" data-l="${lay.L}" data-px="${lay.PX}" width="${w}" height="${g.h}" viewBox="0 0 ${w} ${g.h}" role="img" aria-label="${b0 + 1}~${b0 + nb}마디">`;
    // 형광펜 구간
    const vis = doc.marks.filter(m => m.b > t0 + 1e-6 && m.a < t1 - 1e-6);
    const rowEnd = [-1e9, -1e9];
    vis.sort((a, b) => a.a - b.a).forEach(m => {
      const a = Math.max(m.a, t0), b = Math.min(m.b, t1), x1 = xb(a) + 4, x2 = xb(b) + 4;
      s += `<rect class="hl" x="${x1}" y="4" width="${Math.max(3, x2 - x1)}" height="${g.h - 10}" rx="4" fill="${cleanColor(m.color)}"/>`;
      const T = MARK_TYPES[m.type] || MARK_TYPES.memo, label = (m.type === 'memo' ? m.text : T.label) || '메모';
      const row = rowEnd[0] <= x1 ? 0 : rowEnd[1] <= x1 ? 1 : 0;
      const y = g.rows[row], cont = m.a < t0 - 1e-6;
      const lab = cont ? `(${label})` : label;
      s += `<text class="mk${m.type === 'ferm' ? ' mkf' : ''}" x="${x1 + 3}" y="${y}">${escH(lab)}</text>`;
      const lw = lab.length * 6.2 + 8;
      rowEnd[row] = x1 + lw;
      if (T.line && x2 - x1 > lw + 8) s += `<line class="mkl" x1="${x1 + lw}" y1="${y - 4}" x2="${x2 - 4}" y2="${y - 4}"/>`;
      if (T.hair && x2 - x1 > lw + 16) {
        const hx1 = x1 + lw, hx2 = x2 - 6, yy = y - 4, open = T.hair > 0;
        s += `<path class="mkl solid" d="M${open ? hx2 : hx1} ${yy - 4} L${open ? hx1 : hx2} ${yy} L${open ? hx2 : hx1} ${yy + 4}" fill="none"/>`;
      }
      if (m.type === 'rep') {
        const top = g.sTop || g.tTop || g.tabTop, bot = g.h - 26;
        if (m.a >= t0) s += `<line class="rb" x1="${x1 + 1}" y1="${top}" x2="${x1 + 1}" y2="${bot}"/><line class="sb" x1="${x1 + 5}" y1="${top}" x2="${x1 + 5}" y2="${bot}"/>`;
        if (m.b <= t1) s += `<line class="sb" x1="${x2 - 5}" y1="${top}" x2="${x2 - 5}" y2="${bot}"/><line class="rb" x1="${x2 - 1}" y1="${top}" x2="${x2 - 1}" y2="${bot}"/>`;
      }
    });
    // 선택한 구간 (미리보기)
    if (ED.range && ED.range.b > t0 && ED.range.a < t1) {
      const x1 = xb(Math.max(ED.range.a, t0)) + 4, x2 = xb(Math.min(ED.range.b, t1)) + 4;
      s += `<rect class="rng" x="${x1}" y="3" width="${Math.max(3, x2 - x1)}" height="${g.h - 8}" rx="4"/>`;
    }
    if (ED.anchor != null && ED.anchor >= t0 && ED.anchor < t1) s += `<line class="anc" x1="${xb(ED.anchor) + 4}" y1="3" x2="${xb(ED.anchor) + 4}" y2="${g.h - 5}"/>`;
    // 코드 이름
    (doc.chords || []).filter(c => c.t >= t0 - 1e-6 && c.t < t1 - 1e-6).forEach(c => (s += `<text class="chn" x="${xAt(c.t) - 4}" y="${g.chordY}">${escH(c.name)}</text>`));
    // 마디 번호·마디줄
    const top = g.sTop != null ? g.sTop : g.tTop != null ? g.tTop : g.tabTop;
    const bot = doc.fretted ? (g.tabTop != null ? g.tabTop + g.tabH : g.sTop + 32) : g.bTop + 32;
    for (let b = 0; b <= nb; b++) {
      const x = xb(t0 + b * lay.bb);
      if (b < nb) s += `<text class="bnum" x="${x + 3}" y="${top - 8}">${b0 + b + 1}</text>`;
      if (doc.fretted) {
        if (g.sTop != null) s += `<line class="sb" x1="${x}" y1="${g.sTop}" x2="${x}" y2="${g.sTop + 32}"/>`;
        if (g.tabTop != null) s += `<line class="sb" x1="${x}" y1="${g.tabTop}" x2="${x}" y2="${g.tabTop + g.tabH}"/>`;
      } else s += `<line class="sb" x1="${x}" y1="${top}" x2="${x}" y2="${bot}"/>`;
    }
    const sysNotes = doc.notes.filter(n => n.t >= t0 - 1e-6 && n.t < t1 - 1e-6);
    const muted = t => inMark('brk', t);
    if (doc.fretted) {
      if (g.sTop != null) s += edStaff({ oct8: true }, sysNotes, g.sTop, doc.instId === 'bass' ? 'bass' : 'treble', lay, t0, t1, xAt, flats, muted, ED.sel);
      if (g.tabTop != null) {
        const N = doc.tuning.length;
        for (let i = 0; i < N; i++) s += `<line class="sl" x1="${lay.L - 30}" y1="${g.tabTop + i * 11}" x2="${xAt(t1) + 2}" y2="${g.tabTop + i * 11}"/>`;
        ['T', 'A', 'B'].forEach((ch, i) => (s += `<text class="tabl" x="${lay.L - 24}" y="${g.tabTop + g.tabH / 2 - 9 + i * 10}">${ch}</text>`));
        sysNotes.forEach(n => {
          const x = xAt(n.t), y = g.tabTop + (N - 1 - n.s) * 11, sel = n.id === ED.sel, txt = String(n.f), w = txt.length * 6 + 3;
          s += `<g class="nt tn${muted(n.t) ? ' muted' : ''}${sel ? ' sel' : ''}${inMark('pm', n.t) ? ' pmn' : ''}" data-id="${n.id}"><rect class="hit" x="${x - 9}" y="${y - 7}" width="18" height="14"/><rect class="tbg" x="${x - w / 2}" y="${y - 6}" width="${w}" height="12" rx="2"/><text class="tnum" x="${x}" y="${y + 4}" text-anchor="middle">${txt}</text></g>`;
        });
      }
    } else {
      s += `<line class="sb" x1="${lay.L - 30}" y1="${g.tTop}" x2="${lay.L - 30}" y2="${g.bTop + 32}"/>`;
      s += edStaff({}, sysNotes.filter(n => n.midi >= 60), g.tTop, 'treble', lay, t0, t1, xAt, flats, muted, ED.sel);
      s += edStaff({}, sysNotes.filter(n => n.midi < 60), g.bTop, 'bass', lay, t0, t1, xAt, flats, muted, ED.sel);
    }
    s += `<line class="cur" id="cur${si}" x1="0" y1="3" x2="0" y2="${g.h - 5}" visibility="hidden"/>`;
    out.push(s + '</svg>');
  }
  container.innerHTML = `<div class="edsys${ED.mode !== 'select' ? ' edit-' + ED.mode : ''}">${out.join('')}</div>`;
}

// 재생 위치 표시
function edCursor(t) {
  document.querySelectorAll('#ntout svg.sys').forEach(svg => {
    const c = svg.querySelector('line.cur'); if (!c) return;
    const t0 = +svg.dataset.t0, t1 = +svg.dataset.t1;
    if (t != null && t >= t0 && t < t1) {
      const x = +svg.dataset.l + (t - t0) * +svg.dataset.px + 10;
      c.setAttribute('x1', x); c.setAttribute('x2', x); c.setAttribute('visibility', 'visible');
    } else c.setAttribute('visibility', 'hidden');
  });
}

// ───────── 누르기(터치·클릭) ─────────
// 누른 순간의 악보 줄 위치를 기억해 두고 계산 (끄는 동안 악보를 다시 그려도 어긋나지 않게)
function edGeo(svg) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  return { left: r.left, top: r.top, kx: vb.width / (r.width || 1), ky: vb.height / (r.height || 1), t0: +svg.dataset.t0, l: +svg.dataset.l, px: +svg.dataset.px };
}
function edPoint(geo, ev) {
  const x = (ev.clientX - geo.left) * geo.kx, y = (ev.clientY - geo.top) * geo.ky;
  return { t: geo.t0 + (x - geo.l - 10) / geo.px, x, y };
}
function edBindPointer(container) {
  container.onpointerdown = ev => {
    const svg = ev.target.closest && ev.target.closest('svg.sys');
    if (!svg || !ED.doc) return;
    const geo = edGeo(svg), p = edPoint(geo, ev);
    if (ED.mode === 'select') {
      const g = ev.target.closest('g.nt');
      ED.sel = g ? +g.dataset.id : null;
      if (g && ED.onSelect) ED.onSelect(edSelNote());
      edChanged();
      return;
    }
    if (ED.mode === 'add') { edAddAt(p); return; }
    // 구간 표시: 끌어서 또는 두 번 눌러서
    const snap = t => Math.max(0, Math.round(t * 2) / 2);
    ED.drag = { geo, x0: p.x, t0: snap(p.t + 0.25), moved: false };
    try { container.setPointerCapture(ev.pointerId); } catch (e) {}
  };
  container.onpointermove = ev => {
    if (!ED.drag) return;
    const p = edPoint(ED.drag.geo, ev);
    if (Math.abs(p.x - ED.drag.x0) < 8 && !ED.drag.moved) return;
    ED.drag.moved = true;
    const tt = Math.max(0, Math.round((p.t + 0.25) * 2) / 2);
    ED.range = { a: Math.min(ED.drag.t0, tt), b: Math.max(ED.drag.t0, tt) + (tt === ED.drag.t0 ? 0.5 : 0) };
    ED.anchor = null;
    if (!ED.drag.raf) ED.drag.raf = requestAnimationFrame(() => { if (ED.drag) ED.drag.raf = 0; edChanged(); });
  };
  container.onpointerup = () => {
    if (!ED.drag) return;
    const d = ED.drag; ED.drag = null;
    if (!d.moved) {
      if (ED.anchor == null) { ED.anchor = d.t0; ED.range = null; }
      else { const a = Math.min(ED.anchor, d.t0), b = Math.max(ED.anchor, d.t0); ED.range = { a, b: b > a ? b : a + 0.5 }; ED.anchor = null; }
    }
    edChanged();
  };
}

// 빈 곳을 눌러 음 추가
function edAddAt(p) {
  if (edRO()) return;
  const doc = ED.doc, g = edGeom(doc), S = 8;
  const t = Math.max(0, Math.floor(p.t * 4 + 0.5) / 4);
  let midi = null, s = null, f = null;
  if (doc.fretted) {
    if (g.tabTop != null && p.y > g.tabTop - 8) {
      const N = doc.tuning.length;
      s = N - 1 - Math.max(0, Math.min(N - 1, Math.round((p.y - g.tabTop) / 11)));
      const near = ED.doc.notes.find(n => n.id === ED.sel);
      f = near && near.f != null ? Math.min(doc.maxFret, near.f) : 0;
      midi = doc.tuning[s] + f;
    } else if (g.sTop != null) {
      const bottom = doc.instId === 'bass' ? 18 : 30;
      midi = stepToMidi(Math.round((g.sTop + 4 * S - p.y) / (S / 2)) + bottom) - 12;
    }
  } else {
    const useT = Math.abs(p.y - (g.tTop + 16)) < Math.abs(p.y - (g.bTop + 16));
    const top = useT ? g.tTop : g.bTop, bottom = useT ? 30 : 18;
    midi = stepToMidi(Math.round((top + 4 * S - p.y) / (S / 2)) + bottom);
  }
  if (midi == null) return;
  const n = { id: ED.nextId++, t, dur: 1, midi };
  if (doc.fretted) {
    if (s == null) { const pl = edPlace(midi, t, null); if (!pl) return; s = pl.s; f = pl.f; }
    if (doc.notes.some(x => Math.abs(x.t - t) < 1e-6 && x.s === s)) return;
    n.s = s; n.f = f;
  }
  edSnapshot();
  doc.notes.push(n);
  doc.notes.sort((a, b) => a.t - b.t || b.midi - a.midi);
  ED.sel = n.id;
  edChanged();
}

// 줄 악기: 음 하나를 칠 줄·프렛 찾기 (같은 시간 다른 음과 겹치지 않게, 가까운 프렛으로)
function edPlace(midi, t, skipId, prefS) {
  const doc = ED.doc, used = new Set(doc.notes.filter(n => n.id !== skipId && Math.abs(n.t - t) < 1e-6).map(n => n.s));
  const nearby = doc.notes.filter(n => n.id !== skipId && Math.abs(n.t - t) < 4 && n.f > 0);
  const anchor = nearby.length ? nearby.reduce((a, n) => a + n.f, 0) / nearby.length : 3;
  let best = null, bc = 1e9;
  doc.tuning.forEach((open, s) => {
    const f = midi - open;
    if (used.has(s) || f < 0 || f > doc.maxFret) return;
    const c = Math.abs(f - anchor) + (s === prefS ? -0.5 : 0);
    if (c < bc) { bc = c; best = { s, f }; }
  });
  return best;
}

// ───────── 고치기 ─────────
function edSelNote() { return ED.doc && ED.doc.notes.find(n => n.id === ED.sel); }
function edEdit(op) {
  const doc = ED.doc, n = edSelNote();
  if (!n) return;
  if (ED.ro) return ED.ro;
  edSnapshot();
  const reFret = (midi, prefS) => {
    if (!doc.fretted) { n.midi = midi; return true; }
    const f = midi - doc.tuning[n.s];
    if (f >= 0 && f <= doc.maxFret) { n.midi = midi; n.f = f; return true; }
    const pl = edPlace(midi, n.t, n.id, prefS);
    if (!pl) return false;
    n.midi = midi; n.s = pl.s; n.f = pl.f; return true;
  };
  let ok = true;
  if (op === 'up' || op === 'down' || op === 'oup' || op === 'odown') {
    const d = { up: 1, down: -1, oup: 12, odown: -12 }[op];
    const lo = doc.fretted ? doc.tuning[0] : 21, hi = doc.fretted ? doc.tuning[doc.tuning.length - 1] + doc.maxFret : 108;
    ok = n.midi + d >= lo && n.midi + d <= hi && reFret(n.midi + d, n.s);
  } else if (op === 'longer') {
    const nx = DUR_STEPS.find(x => x[0] > n.dur + 1e-6); if (nx) n.dur = nx[0]; else ok = false;
  } else if (op === 'shorter') {
    const pv = DUR_STEPS.slice().reverse().find(x => x[0] < n.dur - 1e-6); if (pv) n.dur = pv[0]; else ok = false;
  } else if (op === 'left' || op === 'right') {
    const nt = Math.max(0, n.t + (op === 'left' ? -0.25 : 0.25));
    if (doc.fretted && doc.notes.some(x => x.id !== n.id && Math.abs(x.t - nt) < 1e-6 && x.s === n.s)) { const pl = edPlace(n.midi, nt, n.id); if (!pl) ok = false; else { n.s = pl.s; n.f = pl.f; } }
    if (ok) n.t = nt;
  } else if (op === 'string') {
    const N = doc.tuning.length;
    ok = false;
    for (let k = 1; k < N; k++) {
      const s = (n.s + k) % N, f = n.midi - doc.tuning[s];
      if (f < 0 || f > doc.maxFret || doc.notes.some(x => x.id !== n.id && Math.abs(x.t - n.t) < 1e-6 && x.s === s)) continue;
      n.s = s; n.f = f; ok = true; break;
    }
  } else if (op === 'copy') {
    const c = { ...n, id: ED.nextId++, t: n.t + n.dur };
    if (doc.fretted) { const pl = edPlace(c.midi, c.t, null, n.s); if (!pl) ok = false; else { c.s = pl.s; c.f = pl.f; } }
    if (ok) { doc.notes.push(c); ED.sel = c.id; }
  } else if (op === 'del') {
    doc.notes = doc.notes.filter(x => x.id !== n.id);
    ED.sel = null;
  }
  if (!ok) { ED.undo.pop(); return op === 'longer' || op === 'shorter' ? '더 바꿀 수 없는 길이예요.' : doc.fretted ? '그렇게 바꿀 수 있는 줄·프렛이 없어요.' : '피아노 음역을 벗어나요.'; }
  doc.notes.sort((a, b) => a.t - b.t || b.midi - a.midi);
  edChanged();
  return '';
}
function edAddMark(type, color, text) {
  if (!ED.range || edRO()) return;
  edSnapshot();
  ED.doc.marks.push({ id: ED.nextId++, type, a: ED.range.a, b: ED.range.b, color, text: text || '' });
  ED.doc.marks.sort((a, b) => a.a - b.a);
  ED.range = null;
  edChanged();
}
function edDelMark(id) { if (edRO()) return; edSnapshot(); ED.doc.marks = ED.doc.marks.filter(m => m.id !== id); edChanged(); }
function edRecolorMark(id) {
  const m = ED.doc.marks.find(x => x.id === id); if (!m || edRO()) return;
  edSnapshot();
  const i = HL_COLORS.findIndex(c => c[0] === m.color);
  m.color = HL_COLORS[(i + 1) % HL_COLORS.length][0];
  edChanged();
}
const posText = (t, bb) => `${Math.floor(t / bb + 1e-6) + 1}마디 ${Math.round((t % bb) * 100) / 100 + 1}박`;

// ───────── 들어보기 (구간 표시를 따라 빠르기·세기·반복·멈춤 반영) ─────────
function edTimeline(doc, from, to) {
  const spb = 60 / doc.bpm, step = 1 / 32;
  const fac = t => {
    let f = 1;
    doc.marks.forEach(m => {
      if (t < m.a || t >= m.b) return;
      const u = (t - m.a) / Math.max(1e-6, m.b - m.a);
      if (m.type === 'rit') f *= 1 - 0.42 * u;
      else if (m.type === 'accel') f *= 1 + 0.35 * u;
      else if (m.type === 'ferm') f *= 0.45;
    });
    return f;
  };
  const K = Math.ceil(to / step) + 2, cum = new Float64Array(K + 1);
  for (let k = 0; k < K; k++) cum[k + 1] = cum[k] + (step * spb) / fac(k * step + step / 2);
  const perf = t => { const k = Math.max(0, Math.min(K - 1, Math.floor(t / step))); return cum[k] + (cum[k + 1] - cum[k]) * ((t - k * step) / step); };
  const vol = t => {
    let v = 1;
    doc.marks.forEach(m => {
      if (t < m.a || t >= m.b) return;
      const u = (t - m.a) / Math.max(1e-6, m.b - m.a);
      if (m.type === 'cresc') v *= 0.55 + 0.75 * u;
      else if (m.type === 'dim') v *= 1.3 - 0.75 * u;
    });
    return v;
  };
  const inM = (type, t) => doc.marks.some(m => m.type === type && t >= m.a - 1e-6 && t < m.b - 1e-6);
  // 반복 구간 펼치기
  const segs = [];
  let pos = from;
  doc.marks.filter(m => m.type === 'rep' && m.a >= from - 1e-6 && m.b <= to + 1e-6 && m.b > m.a).sort((a, b) => a.a - b.a).forEach(m => {
    if (m.a < pos - 1e-6) return;
    segs.push([pos, m.b]); segs.push([m.a, m.b]); pos = m.b;
  });
  segs.push([pos, to]);
  const evs = [], map = [];
  let off = 0;
  segs.forEach(([a, b]) => {
    if (b <= a) return;
    map.push({ off, a, b, pa: perf(a), dur: perf(b) - perf(a) });
    doc.notes.forEach(n => {
      if (n.t < a - 1e-6 || n.t >= b - 1e-6 || inM('brk', n.t)) return;
      const pm = inM('pm', n.t);
      let ring = perf(Math.min(n.t + n.dur, to + 8)) - perf(n.t);
      if (pm) ring = Math.min(ring, spb * 0.3);
      const down = Math.abs(n.t % 1) < 1e-6 ? 1.06 : 0.94;
      evs.push({
        at: off + perf(n.t) - perf(a), score: n.t, ring: Math.max(0.1, ring * 0.97),
        ev: { key: doc.fretted ? 's' + n.s : 'p' + n.midi, midi: n.midi, delay: 0, vel: (doc.fretted ? 0.5 : 0.42) * vol(n.t) * down * (pm ? 0.85 : 1), pan: doc.fretted ? (n.s - (doc.tuning.length - 1) / 2) * 0.09 : (n.midi - 60) / 60 * 0.35 },
      });
    });
    off += perf(b) - perf(a);
  });
  evs.sort((x, y) => x.at - y.at);
  const scoreAt = pt => {
    for (const m of map) {
      if (pt < m.off || pt >= m.off + m.dur) continue;
      const target = m.pa + (pt - m.off);
      let lo = m.a, hi = m.b;
      for (let i = 0; i < 20; i++) { const md = (lo + hi) / 2; if (perf(md) < target) lo = md; else hi = md; }
      return lo;
    }
    return null;
  };
  return { evs, total: off, scoreAt };
}
function edPlay(from, to, loop) {
  edStop();
  const doc = ED.doc;
  if (!doc || !doc.notes.length) return false;
  ensureAC(); AC.resume(); stopLoop();
  const bb = barBeats(doc.ts);
  if (to == null) to = Math.ceil(Math.max(...doc.notes.map(n => n.t + n.dur)) / bb - 1e-6) * bb;
  const TL = edTimeline(doc, from, to);
  const P = ED.play = { TL, i: 0, t0: AC.currentTime + 0.12, loop };
  P.timer = setInterval(() => {
    while (true) {
      if (P.i >= TL.evs.length) { if (P.loop && TL.total > 0) { P.i = 0; P.t0 += TL.total; continue; } break; }
      const e = TL.evs[P.i];
      if (P.t0 + e.at > AC.currentTime + 0.3) break;
      playNote(INST, e.ev, P.t0 + e.at, e.ring);
      P.i++;
    }
    if (!P.loop && P.i >= TL.evs.length && AC.currentTime > P.t0 + TL.total + 1.5) edStop();
  }, 25);
  const anim = () => {
    if (ED.play !== P) return;
    let pt = AC.currentTime - P.t0;
    if (P.loop && TL.total > 0) pt = ((pt % TL.total) + TL.total) % TL.total;
    edCursor(pt >= 0 ? TL.scoreAt(pt) : null);
    P.raf = requestAnimationFrame(anim);
  };
  P.raf = requestAnimationFrame(anim);
  return true;
}
function edStop() {
  const P = ED.play;
  if (P) { clearInterval(P.timer); cancelAnimationFrame(P.raf); ED.play = null; }
  edCursor(null);
  killAll();
}

// ───────── MIDI 파일로 저장 ─────────
function edMidiBytes(doc) {
  const tpq = 480, ev = [];
  const vlq = n => { const b = [n & 0x7f]; n >>= 7; while (n) { b.unshift((n & 0x7f) | 0x80); n >>= 7; } return b; };
  const text = (type, s) => { const u = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(u.length), ...u]; };
  const us = Math.round(60000000 / doc.bpm);
  ev.push({ tk: 0, d: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
  ev.push({ tk: 0, d: [0xff, 0x58, 4, doc.ts.num, Math.round(Math.log2(doc.ts.den)), 24, 8] });
  ev.push({ tk: 0, d: text(3, doc.title || 'score') });
  ev.push({ tk: 0, d: [0xc0, doc.instId === 'bass' ? 33 : doc.instId === 'guitar' ? 25 : 0] });
  doc.marks.forEach(m => { const T = MARK_TYPES[m.type]; ev.push({ tk: Math.round(m.a * tpq), d: text(6, (m.type === 'memo' ? m.text : T.label) || 'memo') }); ev.push({ tk: Math.round(m.b * tpq), d: text(6, 'end ' + ((m.type === 'memo' ? m.text : T.label) || '')) }); });
  (doc.chords || []).forEach(c => ev.push({ tk: Math.round(c.t * tpq), d: text(1, c.name) }));
  doc.notes.forEach(n => { ev.push({ tk: Math.round(n.t * tpq), d: [0x90, n.midi, 90], on: 1 }); ev.push({ tk: Math.round((n.t + n.dur) * tpq) - 1, d: [0x80, n.midi, 0] }); });
  ev.sort((a, b) => a.tk - b.tk || (a.on ? 1 : 0) - (b.on ? 1 : 0));
  const body = [];
  let last = 0;
  ev.forEach(e => { body.push(...vlq(e.tk - last), ...e.d); last = e.tk; });
  body.push(0, 0xff, 0x2f, 0);
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, tpq >> 8, tpq & 255, 0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]);
}

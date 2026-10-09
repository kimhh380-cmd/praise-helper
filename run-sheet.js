// 실행 악보: 악보(글 또는 PDF·사진)와 그 위에 직접 정한 "구간", 그리고 이름 붙인 "실행 순서" 파일
//
// 구간(range): 악보에서 한 번에 넘길 부분. 어디서부터 어디까지인지 내가 정해요.
//   글 악보     { id, name, a, b, bars? }                 ← a~b번째 줄 (0부터)
//   PDF·사진    { id, name, parts:[{p, x, y, w, h}], bars? } ← 쪽 번호 p, 쪽 크기를 1로 본 네모 (여러 조각 가능)
// 실행 순서(order) 파일: { id, name, items:[구간 이름…], sheet? }  ← 구간 "이름"으로 순서를 적어요.
//   이름으로 적기 때문에, 멤버마다 자기 파트 악보를 봐도 주최자가 넘기면 같은 이름의 구간으로 함께 넘어가요.
//
// 글 악보 쓰는 법 (RUN_HELP에도 같은 내용이 있어요)
//   # 1절              ← 부분 이름 (구간 자동 나누기에 써요)
//   [C]가사 [G]가사     ← 코드는 [ ] 안에, 바뀌는 가사 바로 앞에
//   | C | G | Am F |    ← 코드 마디
//   e|--0--2--|        ← 타브 (붙여 쓴 줄은 한 묶음)
//   … @2              ← 자동 넘김 때 이 줄은 2마디 (@3박 = 3박)
//   // 메모            ← 실행 화면에 안 보이는 메모

const RS_CHORD = /^[A-G](?:#|b|♯|♭)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-)?(?:\d{1,2})?(?:(?:sus|add|maj|b|#|♭|♯|\+|-)\d{1,2})*(?:\([^)]*\))?(?:\/[A-G](?:#|b|♯|♭)?)?$/;
const rsIsChord = s => s === 'N.C.' || RS_CHORD.test(s);
const RS_TABLINE = /^\s*[A-Ga-g][#b]?\s*\|[-0-9a-zA-Z|\/\\~^()<>.*=+ ]*$/;
const rsIsTabLine = l => RS_TABLINE.test(l) && (l.match(/-/g) || []).length >= 3;
const RS_TS = { '4/4': 4, '3/4': 3, '2/4': 2, '6/8': 2 }; // 한 마디 박 수 (6/8은 점4분음표 두 박으로 세요)
const RS_NAMES = ['전주', '1절', '2절', '3절', '프리코러스', '후렴', '간주', '브릿지', '솔로', '아웃트로', '엔딩'];
const rsId = p => (p || 'r') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
const rsNorm = s => String(s || '').trim().toLowerCase();

const RUN_HELP = [
  ['# 1절', '부분 이름 (“구간 나누기”에서 부분마다 자동으로 나눌 때 써요)'],
  ['[C]가사 [G]가사', '코드는 [ ] 안에, 바뀌는 가사 바로 앞에'],
  ['| C | G | Am F |', '코드 마디 (마디마다 |)'],
  ['e|--0--2--|', '타브 (붙여 쓴 줄은 한 묶음)'],
  ['… @2', '자동 넘김 때 이 줄은 2마디 (@3박 = 3박)'],
  ['// 메모', '실행 화면에 안 보이는 메모'],
];

// ───────── 글 악보: 줄마다 무엇인지 ─────────
// kind: head(부분 이름) · lyric(코드+가사) · text(글) · bars(코드 마디) · tab(타브 줄) · blank · note(메모) · mark(보이지 않는 표시)
function rsLines(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\t/g, '    '));
  const out = [];
  let inTab = false, grp = 0, last = -1;
  const durOf = m => (/박|beat/i.test(m[2] || '') ? { beats: +m[1] } : { bars: +m[1] });
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i], t = r.trim(), L = { i, raw: r, kind: 'text' };
    out.push(L);
    if (inTab) {
      if (/^\{\s*(\/tab|end_of_tab|eot)\s*\}$/i.test(t)) { L.kind = 'mark'; inTab = false; }
      else { L.kind = 'tab'; L.grp = grp; last = i; }
      continue;
    }
    if (/^\{\s*(tab|start_of_tab|sot)\s*\}$/i.test(t)) { L.kind = 'mark'; inTab = true; grp++; continue; }
    if (!t) { L.kind = 'blank'; continue; }
    if (t.startsWith('//')) { L.kind = 'note'; L.text = t.slice(2).trim(); continue; }
    let m = t.match(/^@\s*(\d+(?:\.\d+)?)\s*(박|beats?)?$/i);
    if (m) { L.kind = 'mark'; if (last >= 0) out[last].dur = durOf(m); continue; }
    m = t.match(/^#+\s*(.*)$/);
    if (m) { L.kind = 'head'; L.name = m[1].trim() || '부분'; continue; }
    m = t.match(/^\[([^\]]+)\]$/);
    if (m && !rsIsChord(m[1].trim())) { L.kind = 'head'; L.name = m[1].trim(); continue; }
    if (rsIsTabLine(r)) { const p = out[i - 1]; L.kind = 'tab'; L.auto = true; L.grp = p && p.kind === 'tab' && p.auto ? p.grp : ++grp; last = i; continue; }
    let body = t;
    const dm = t.match(/\s@\s*(\d+(?:\.\d+)?)\s*(박|beats?)?$/i);
    if (dm) { L.dur = durOf(dm); body = t.slice(0, dm.index).trim(); }
    last = i;
    if (body.startsWith('|')) {
      const parts = body.split('|').map(x => x.trim());
      if (parts[0] === '') parts.shift();
      if (parts.length && parts[parts.length - 1] === '') parts.pop();
      L.kind = 'bars'; L.bars = parts.map(p => p.replace(/^:+|:+$/g, '').trim().split(/\s+/).filter(Boolean));
      continue;
    }
    const segs = [], re = /\[([^\]]*)\]/g;
    let pos = 0, chord = null, mm;
    while ((mm = re.exec(body))) {
      const before = body.slice(pos, mm.index);
      if (before || chord != null) segs.push({ c: chord, t: before });
      chord = mm[1].trim(); pos = re.lastIndex;
    }
    const rest = body.slice(pos);
    if (rest || chord != null) segs.push({ c: chord, t: rest });
    L.segs = segs;
    L.kind = segs.some(s => s.c) ? 'lyric' : 'text';
  }
  return out;
}
const rsIsContent = L => L.kind === 'lyric' || L.kind === 'text' || L.kind === 'bars' || L.kind === 'tab';
function rsTabBars(lines) {
  const l = lines.find(x => RS_TABLINE.test(x)) || lines.find(x => x.includes('|')) || '';
  return l.slice(l.indexOf('|') + 1).split('|').filter(p => /[-0-9A-Za-z]/.test(p)).length;
}
const rsDurBeats = (d, bpb) => Math.max(0.5, d.beats != null ? d.beats : d.bars * bpb);
// 구간 하나의 길이(박) — 자동 넘김에 써요. lineBars 0 = 자동(코드 수만큼 마디)
function rsRangeBeats(sheet, r, lines) {
  const bpb = RS_TS[sheet.ts] || 4;
  if (r.bars) return Math.max(0.5, r.bars * bpb);
  if (sheet.kind !== 'text') return 4 * bpb;
  lines = lines || rsLines(sheet.text);
  const lb = +sheet.lineBars || 0, seen = new Set();
  let beats = 0;
  for (let i = r.a; i <= r.b && i < lines.length; i++) {
    const L = lines[i];
    if (L.kind === 'tab') {
      if (seen.has(L.grp)) continue;
      seen.add(L.grp);
      const g = lines.filter(x => x.kind === 'tab' && x.grp === L.grp), d = g.find(x => x.dur);
      beats += d ? rsDurBeats(d.dur, bpb) : (rsTabBars(g.map(x => x.raw)) || lb || 2) * bpb;
    } else if (L.kind === 'bars') beats += L.dur ? rsDurBeats(L.dur, bpb) : Math.max(1, L.bars.length) * bpb;
    else if (L.kind === 'lyric' || L.kind === 'text') beats += L.dur ? rsDurBeats(L.dur, bpb) : (lb || (L.segs.filter(s => s.c).length || 2)) * bpb;
  }
  return beats || 2 * bpb;
}

// ───────── 구간 ─────────
// 같은 이름이 또 나오면 "후렴 (2)"처럼 번호를 붙여요
function rsUniqueNames(list, taken) {
  const seen = new Set((taken || []).map(rsNorm));
  return list.map(r => {
    let k = r.name, n = 1;
    while (seen.has(rsNorm(k))) k = `${r.name} (${++n})`;
    seen.add(rsNorm(k));
    return Object.assign({}, r, { name: k });
  });
}
// 글 악보를 자동으로 나누기: how = 'head'(# 부분마다) · 'line'(한 줄씩, 타브는 한 묶음씩)
function rsAutoRanges(lines, how) {
  const R = [];
  if (how === 'head') {
    let cur = null;
    lines.forEach(L => {
      if (L.kind === 'head') { cur = { name: L.name, a: L.i, b: L.i }; R.push(cur); return; }
      if (rsIsContent(L)) { if (!cur) { cur = { name: '처음', a: L.i, b: L.i }; R.push(cur); } cur.b = L.i; }
    });
    return rsUniqueNames(R.filter(r => lines.slice(r.a, r.b + 1).some(rsIsContent))).map(r => Object.assign({ id: rsId() }, r));
  }
  let head = '', k = 0;
  lines.forEach(L => {
    if (L.kind === 'head') { head = L.name; k = 0; return; }
    if (!rsIsContent(L)) return;
    const prev = R[R.length - 1];
    if (L.kind === 'tab' && prev && prev.grp === L.grp) { prev.b = L.i; return; }
    k++;
    R.push({ name: head ? `${head}-${k}` : String(R.length + 1), a: L.i, b: L.i, grp: L.kind === 'tab' ? L.grp : null });
  });
  return rsUniqueNames(R.map(({ grp, ...r }) => r)).map(r => Object.assign({ id: rsId() }, r));
}
// 글을 고치면 줄 번호가 밀려요: 바뀌지 않은 줄을 짝지어 구간을 따라 옮겨요 (내용이 통째로 지워진 구간은 빠져요)
function rsRemap(oldText, newText, ranges) {
  const A = String(oldText || '').split('\n'), B = String(newText || '').split('\n');
  const n = A.length, m = B.length, map = new Int32Array(n).fill(-1);
  let p = 0;
  while (p < n && p < m && A[p] === B[p]) { map[p] = p; p++; }
  let q = 0;
  while (q < n - p && q < m - p && A[n - 1 - q] === B[m - 1 - q]) { map[n - 1 - q] = m - 1 - q; q++; }
  const a0 = p, a1 = n - q, b0 = p, b1 = m - q, N = a1 - a0, M = b1 - b0;
  if (N > 0 && M > 0 && N * M <= 1500000) {
    const W = M + 1, dp = new Uint16Array((N + 1) * W);
    for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
      dp[i * W + j] = A[a0 + i] === B[b0 + j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < N && j < M) {
      if (A[a0 + i] === B[b0 + j]) { map[a0 + i] = b0 + j; i++; j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++; else j++;
    }
  }
  const out = [], lost = [];
  ranges.forEach(r => {
    let na = -1, nb = -1;
    for (let i = r.a; i <= r.b && i < n; i++) if (map[i] >= 0) { if (na < 0) na = map[i]; nb = map[i]; }
    if (na < 0) { lost.push(r.name); return; }
    out.push(Object.assign({}, r, { a: na, b: Math.max(na, nb) }));
  });
  return { ranges: out, lost };
}
// 구간의 위치 순서 (글: 줄 번호, PDF·사진: 쪽 → 위에서 아래)
function rsRangePos(sheet, r) {
  if (sheet.kind === 'text') return r.a;
  const p = (r.parts || [])[0] || { p: 0, y: 0 };
  return p.p * 10 + p.y;
}
function rsSortedRanges(sheet) { return (sheet.ranges || []).slice().sort((x, y) => rsRangePos(sheet, x) - rsRangePos(sheet, y)); }
// 실행할 칸 목록: 순서 파일의 이름마다 이 악보의 같은 이름 구간을 찾아요 (없으면 ri = -1)
function rsResolve(sheet, order) {
  const byName = new Map();
  (sheet.ranges || []).forEach((r, i) => { const k = rsNorm(r.name); if (!byName.has(k)) byName.set(k, i); });
  const items = order && Array.isArray(order.items) && order.items.length ? order.items : rsSortedRanges(sheet).map(r => r.name);
  return items.map((name, oi) => ({ name: String(name), ri: byName.has(rsNorm(name)) ? byName.get(rsNorm(name)) : -1, oi }));
}

// ───────── 새로 만들기 · 예전 모양 바꾸기 ─────────
function rsNewSheet(over) {
  return Object.assign({ ver: 2, kind: 'text', title: '새 실행 악보', bpm: 90, ts: '4/4', lineBars: 0, countIn: 1, text: '# 1절\n[C]여기에 가사를 [G]적어 주세요\n\n# 후렴\n| C | G | Am | F |\n', ranges: [] }, over || {});
}
function rsNewOrder(over) { return Object.assign({ name: '새 실행 순서', items: [] }, over || {}); }
// 예전(v8) 실행 악보: "# 부분"을 구간으로, 진행 순서를 순서 파일로 바꿔요
function rsUpgradeSheet(s) {
  if (s && s.ver >= 2) return { sheet: s, order: null };
  const sheet = rsNewSheet({ id: s.id, title: s.title || '실행 악보', bpm: s.bpm || 90, ts: s.ts || '4/4', lineBars: s.lineBars || 0, countIn: s.countIn == null ? 1 : s.countIn, text: s.text || '' });
  sheet.ranges = rsAutoRanges(rsLines(sheet.text), 'head');
  let order = null;
  if (Array.isArray(s.order) && s.order.length) {
    const items = [];
    s.order.forEach(x => { const m = String(x).match(/^(.*?)\s*[x×*]\s*(\d+)$/i); if (m && m[1]) for (let k = 0; k < Math.min(16, +m[2]); k++) items.push(m[1].trim()); else items.push(String(x)); });
    order = rsNewOrder({ name: `${sheet.title} 순서`, items, sheet: s.id });
  }
  return { sheet, order };
}

// 예시 (가사와 곡은 이 앱을 위해 새로 쓴 것이에요)
function rsExample() {
  const sheet = rsNewSheet({
    title: '함께 맞춰 가는 노래 (예시)', bpm: 92, ts: '4/4', lineBars: 0, countIn: 1,
    text: `# 전주
| C | G | Am | F |

# 1절
[C]오늘도 연습실에 [G]모인 우리
[Am]조금씩 맞춰 가는 [F]기타 소리
[C]틀려도 괜찮아 [G]다시 한 번
[F]박자를 세고 [G]함께 시작해

# 후렴
[F]하나 둘 셋 넷 [G]소리를 모아
[Em]우리만의 노래가 [Am]완성돼
[F]떨리는 마음도 [G]리듬에 실어
[C]끝까지 [G]같이 가자 [C] @3

# 간주
// C코드와 G코드를 한 음씩 (8분음표)
e|--------0-------|--------3-------|
B|------1---1-----|------0---0-----|
G|----0-------0---|----0-------0---|
D|--2-----------2-|--0-----------0-|
A|3---------------|----------------|
E|----------------|3---------------|

# 2절
[C]창밖엔 노을이 [G]번져 가고
[Am]손끝은 조금 [F]아파 와도
[C]서로의 눈빛에 [G]박자를 맞춰
[F]마지막 마디까지 [G]힘을 내

# 아웃트로
| C | G | C |
`,
  });
  sheet.ranges = rsAutoRanges(rsLines(sheet.text), 'head');
  const orders = [
    rsNewOrder({ name: '공연 순서', items: ['전주', '1절', '후렴', '간주', '2절', '후렴', '아웃트로'] }),
    rsNewOrder({ name: '후렴만 연습', items: ['후렴', '후렴', '후렴'] }),
  ];
  return { sheet, orders };
}

// ───────── 저장·공유용으로 싸기 / 받은 것을 안전하게 풀기 ─────────
const RS_KEYS = ['ver', 'kind', 'title', 'bpm', 'ts', 'lineBars', 'countIn', 'text', 'file', 'pages', 'ranges'];
function rsPackSheet(s) { return JSON.stringify(Object.fromEntries(RS_KEYS.filter(k => s[k] != null).map(k => [k, s[k]]))); }
function rsCleanRanges(list, kind) {
  const n = cleanNum, c01 = v => Math.max(0, Math.min(1, n(v)));
  return (Array.isArray(list) ? list : []).slice(0, 300).map(r => {
    const o = { id: String(r.id || rsId()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || rsId(), name: String(r.name || '구간').slice(0, 40) };
    if (r.bars) o.bars = Math.max(0.5, Math.min(64, n(r.bars, 0)));
    if (kind === 'text') { o.a = Math.max(0, Math.round(n(r.a))); o.b = Math.max(o.a, Math.round(n(r.b, o.a))); }
    else o.parts = (Array.isArray(r.parts) ? r.parts : []).slice(0, 20).map(q => ({ p: Math.max(0, Math.round(n(q.p))), x: c01(q.x), y: c01(q.y), w: c01(q.w), h: c01(q.h) })).filter(q => q.w > 0 && q.h > 0);
    return o;
  }).filter(r => kind === 'text' || r.parts.length);
}
// 다른 사람이 보낸(공유된) 실행 악보를 필요한 값만 골라 풀어요. 예전(v8) 모양이면 바꿔요.
function rsUnpackSheet(data, title) {
  let o = {};
  try { o = JSON.parse(data) || {}; } catch (e) {}
  if (!(o.ver >= 2)) return rsUpgradeSheet({ title: o.title || title, bpm: o.bpm, ts: o.ts, lineBars: o.lineBars, countIn: o.countIn, text: String(o.text || ''), order: o.order }).sheet;
  const n = cleanNum, kind = o.kind === 'pages' ? 'pages' : 'text';
  const s = rsNewSheet({
    kind, title: String(o.title || title || '실행 악보').slice(0, 60),
    bpm: Math.max(30, Math.min(240, Math.round(n(o.bpm, 90)))), ts: RS_TS[o.ts] ? o.ts : '4/4',
    lineBars: Math.max(0, Math.min(8, Math.round(n(o.lineBars, 0)))), countIn: n(o.countIn, 1) ? 1 : 0,
    text: kind === 'text' ? String(o.text == null ? '' : o.text).slice(0, 100000) : '',
  });
  if (kind === 'pages') {
    const f = o.file || {};
    s.file = { key: String(f.key || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), name: String(f.name || '').slice(0, 120), size: Math.max(0, n(f.size)), type: f.type === 'pdf' ? 'pdf' : 'img' };
    s.pages = (Array.isArray(o.pages) ? o.pages : []).slice(0, 200).map(p => ({ w: Math.max(1, n(p && p.w, 595)), h: Math.max(1, n(p && p.h, 842)) }));
  }
  s.ranges = rsCleanRanges(o.ranges, kind);
  return s;
}
function rsPackOrder(o) { return JSON.stringify({ name: o.name, items: o.items, sheet: o.sheet || null }); }
function rsUnpackOrder(data, title) {
  let o = {};
  try { o = JSON.parse(data) || {}; } catch (e) {}
  return rsNewOrder({ name: String(o.name || title || '실행 순서').slice(0, 60), items: (Array.isArray(o.items) ? o.items : []).slice(0, 200).map(x => String(x).slice(0, 40)), sheet: o.sheet ? String(o.sheet).slice(0, 60) : null });
}
// 오선·타브 악보(악보 만들기) → 글 실행 악보 (2마디씩 한 구간)
function rsSheetFromDoc(doc) {
  const text = rsFromDoc(doc), lines = rsLines(text), bb = barBeats(doc.ts);
  const end = Math.max(bb, ...doc.notes.map(n => n.t + n.dur));
  const bars = Math.max(doc.minBars || 1, Math.ceil(end / bb - 1e-6));
  const blocks = rsAutoRanges(lines, 'line');
  blocks.forEach((r, k) => { const a = k * 2 + 1, b = Math.min(bars, a + 1); r.name = a === b ? `${a}마디` : `${a}~${b}마디`; });
  return rsNewSheet({ title: doc.title || '악보', bpm: Math.round(doc.bpm) || 90, ts: doc.ts && doc.ts.num === 3 ? '3/4' : doc.ts && doc.ts.den === 8 ? '6/8' : '4/4', text, ranges: rsUniqueNames(blocks) });
}

// "악보 만들기"의 악보 → 실행 악보 글 (타브 또는 음 이름, 2마디씩 한 묶음)
function rsFromDoc(doc, per) {
  per = per || 2;
  const bb = barBeats(doc.ts);
  const end = Math.max(bb, ...doc.notes.map(n => n.t + n.dur), ...(doc.chords || []).map(c => c.t + 0.5));
  const bars = Math.max(doc.minBars || 1, Math.ceil(end / bb - 1e-6));
  const out = [`# ${doc.title || '악보'}`];
  const fine = doc.notes.some(n => Math.abs(n.t * 2 - Math.round(n.t * 2)) > 1e-6);
  const q = doc.fretted ? (fine ? 0.25 : 0.5) : 1; // 한 칸 = 몇 박
  const slots = Math.max(1, Math.round(bb / q));
  const inSlot = (t, tt) => t >= tt - 1e-6 && t < tt + q - 1e-6;
  for (let b0 = 0; b0 < bars; b0 += per) {
    const nb = Math.min(per, bars - b0), t0 = b0 * bb, t1 = t0 + nb * bb;
    const ns = doc.notes.filter(n => n.t >= t0 - 1e-6 && n.t < t1 - 1e-6);
    const ch = (doc.chords || []).filter(c => c.t >= t0 - 1e-6 && c.t < t1 - 1e-6);
    out.push('', '{tab}');
    if (doc.fretted) {
      const N = doc.tuning.length, names = (doc.stringNames || []).slice();
      const pre = Math.max(1, ...names.map(x => x.length)) + 1;
      const cols = [];
      for (let b = 0; b < nb; b++) for (let k = 0; k < slots; k++) {
        const tt = t0 + b * bb + k * q, here = ns.filter(n => inSlot(n.t, tt));
        cols.push({ tt, here, k, w: Math.max(2, ...here.map(n => String(n.f).length + 1)) });
      }
      if (ch.length) {
        const starts = [];
        let pos = pre;
        cols.forEach(c => { starts.push(pos); pos += c.w + (c.k === slots - 1 ? 1 : 0); });
        const arr = Array(pos + 12).fill(' ');
        ch.forEach(x => { const j = cols.findIndex(c => inSlot(x.t, c.tt)); if (j >= 0) [...x.name].forEach((cc, i) => (arr[starts[j] + i] = cc)); });
        out.push(arr.join('').replace(/\s+$/, ''));
      }
      for (let s = N - 1; s >= 0; s--) {
        let line = (names[s] || String(N - s)).padEnd(pre - 1) + '|';
        cols.forEach(c => {
          const n = c.here.find(x => x.s === s);
          line += ((n ? String(n.f) : '') + '-'.repeat(c.w)).slice(0, c.w);
          if (c.k === slots - 1) line += '|';
        });
        out.push(line);
      }
    } else {
      if (ch.length) out.push('     ' + ch.map(c => c.name).join('   '));
      [['RH', n => n.midi >= 60], ['LH', n => n.midi < 60]].forEach(([lab, f]) => {
        let line = lab + ' |';
        for (let b = 0; b < nb; b++) {
          const cells = [];
          for (let k = 0; k < slots; k++) {
            const tt = t0 + b * bb + k * q;
            const here = ns.filter(n => f(n) && inSlot(n.t, tt)).sort((a, c) => a.midi - c.midi);
            cells.push(here.length ? here.map(n => midiName(n.midi)).join('+') : '-');
          }
          line += ' ' + cells.map(c => c.padEnd(4)).join(' ') + ' |';
        }
        out.push(line);
      });
    }
    out.push('{/tab}');
  }
  return out.join('\n') + '\n';
}

// 찬양팀 기능 (악보 실행 화면)
//  1. 곡별로 나누기: 여러 곡이 든 PDF(그 주 악보 묶음)를 곡마다 나눠서 한 번에 콘티로 만들어요
//  2. 팀에 콘티 보내기: 인도자가 정한 곡·키·빠르기·순서를 멤버에게 그대로 보내요 (멤버는 “받기”만)
//  3. 인도자 신호: 한 번 더 · 후렴으로 · 브레이크 · 키 업 · 엔딩을 멤버 화면에 크게 띄워요
//  4. 파트 메모: 메모에 파트(보컬·건반·기타…)를 붙이고, 악보 실행에서는 “내 파트” 메모만 보여요
//  5. 키 바꾸기 · 카포: 반음씩 올리고 내리면 앱에서 적은 코드도 같이 바뀌고, 기타 카포 자리를 알려 줘요
//  6. 반주 느리게 듣기: 반주 음원을 0.75배 · 0.9배로 (음 높이는 그대로) — stage.js의 반주 칸
//  7. 예배 기록: 날짜별로 콘티(곡·키·순서)를 남기고, 다시 콘티로 만들거나 표(CSV)로 저장해요

const TM = { split: null, conti: null, contiPid: null, contiUn: null, need: null, sigSeen: '', sigT: 0, sigClr: 0, msg: '', sheet: false };

// ───────── 파트 ─────────
const TM_PARTS = [['vo', '보컬'], ['key', '건반'], ['gt', '기타'], ['bass', '베이스'], ['dr', '드럼'], ['brass', '브라스']];
const tmPartName = k => (TM_PARTS.find(p => p[0] === k) || [0, '모두'])[1];
const tmPartOpts = v => `<option value="">모두</option>` + TM_PARTS.map(([k, n]) => `<option value="${k}"${v === k ? ' selected' : ''}>${n}</option>`).join('');

// ───────── 키 · 코드 옮기기 · 카포 ─────────
// “Bb”, “F#m”, “E♭”, “Am” → {r: 0~11, m: 단조인지}
function tmKey(t) {
  const m = String(t || '').trim().match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(m(?!aj)|min|minor|단조)?\s*(?:major|maj|장조|키|key)?$/i);
  if (!m) return null;
  let r = NATURAL[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') r++;
  if (m[2] === 'b' || m[2] === '♭') r--;
  return { r: (r + 12) % 12, m: !!m[3] };
}
const tmKeyName = (r, m) => (m ? MINOR_KEYS[r] + 'm' : MAJOR_KEYS[r]);
const tmKeyNice = t => { const k = tmKey(t); return k ? tmKeyName(k.r, k.m) : String(t || ''); };
const tmShiftKey = (t, d) => { const k = tmKey(t); return k ? tmKeyName((k.r + d + 120) % 12, k.m) : null; };
// 이 키에서 코드 이름을 ♭으로 쓸지 (F·B♭·E♭… 키와 C·Am은 ♭, 나머지는 ♯)
function tmFlat(t) {
  const k = tmKey(t); if (!k) return true;
  return (k.m ? [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0] : [1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0])[k.r] === 1;
}
const TM_SH = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'], TM_FL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const tmNote = (r, flat) => (flat ? TM_FL : TM_SH)[((r % 12) + 12) % 12];
// 코드 이름의 근음과 슬래시 뒤 베이스만 옮겨요: G/B → A/C♯, E♭maj7 → Emaj7 (m7♭5의 ♭5 같은 건 그대로)
function tmChordShift(text, d, flat) {
  const s = String(text || '');
  if (/^\s*N\.?\s*C\.?\s*$/i.test(s)) return s;
  return s.replace(/(^|[\s/(])([A-G])([#♯b♭]?)/g, (all, pre, L, acc) => {
    let r = NATURAL[L] + (acc === '#' || acc === '♯' ? 1 : acc === 'b' || acc === '♭' ? -1 : 0);
    return pre + tmNote(r + d, flat);
  });
}
// 기타로 쉽게 치는 자리: 카포 몇 번에 어떤 코드 모양 (카포 7까지)
function tmCapo(t) {
  const k = tmKey(t); if (!k) return [];
  const shapes = k.m ? [['Am', 9], ['Em', 4], ['Dm', 2]] : [['G', 7], ['C', 0], ['D', 2], ['A', 9], ['E', 4]];
  return shapes.map(([n, pc]) => ({ capo: (k.r - pc + 12) % 12, shape: n })).filter(x => x.capo <= 7).sort((a, b) => a.capo - b.capo).slice(0, 2);
}
const tmCapoText = t => { const c = tmCapo(t); return c.length ? c.map(x => (x.capo ? `카포 ${x.capo} → ${x.shape} 모양` : `카포 없이 ${x.shape}`)).join(' · ') : ''; };
// 다음 곡 키로 넘어갈 때 치기 좋은 연결 코드 (다음 키의 5도 세븐)
function tmBridge(from, to) {
  const a = tmKey(from), b = tmKey(to);
  if (!b || (a && a.r === b.r && a.m === b.m)) return '';
  return tmNote(b.r + 7, tmFlat(to)) + '7';
}
// 이 곡의 키 설명: 원래 키 → 지금 키, 기타 카포
function tmKeyHint(song) {
  if (!song || !tmKey(song.key)) return '키를 적으면 − + 로 반음씩 옮기고, 기타 카포 자리도 알려 줘요.';
  const out = [];
  if (song.okey && tmKey(song.okey)) {
    const d = (tmKey(song.key).r - tmKey(song.okey).r + 12) % 12;
    out.push(`원래 키 ${tmKeyNice(song.okey)} → 지금 ${tmKeyNice(song.key)}`);
    if (d >= 1 && d <= 7) out.push(`악보의 원래 코드 그대로 치려면 기타 카포 ${d}`);
    out.push('악보에 인쇄된 코드는 그대로예요');
  }
  out.push('기타: ' + tmCapoText(song.key));
  return out.join(' · ');
}
// 반음 올리기(+1)·내리기(-1): 키 글자 + 앱에서 적은 코드(PDF 악보 탭의 “코드”)
function tmKeyStep(song, d) {
  const nk = tmShiftKey(song && song.key, d);
  if (!nk) { stgSay('키를 먼저 적어 주세요. 예: G, Bb, F#m'); return false; }
  if (!song.okey) song.okey = tmKeyNice(song.key);
  song.key = nk;
  const a = tmKey(song.okey), b = tmKey(song.key);
  if (a && b && a.r === b.r && a.m === b.m) delete song.okey; // 원래 키로 돌아왔어요
  const n = tmShiftChords(song, d);
  stgSaveSongs();
  stgSay(`키를 ${nk}(으)로 바꿨어요.${n ? ` 앱에서 적은 코드 ${n}개도 같이 바꿨어요.` : ''}`);
  return true;
}
function tmShiftChords(song, d) {
  if (stgSong() !== song || !STG.doc || STG.doc.kind !== 'pdf' || !STG.annoKey) return 0;
  const off = STG.doc.off || 0, n = STG.doc.pages.length, flat = tmFlat(song.key);
  const list = lsGet(STG.annoKey, []) || [];
  let k = 0;
  list.forEach(a => { if (a.type === 'chord' && a.page >= off && a.page < off + n) { a.text = tmChordShift(a.text, d, flat); k++; } });
  if (!k) return 0;
  lsSet(STG.annoKey, list); STG.annos = list;
  if (typeof PDFE !== 'undefined' && PDFE.key === STG.annoKey) { PDFE.annos = list.map(a => Object.assign({}, a)); if ($('pdfpages')) pdfDrawAll(); }
  document.querySelectorAll('#stv .stpg').forEach(stgDrawAnnos);
  return k;
}

// ───────── 1. 곡별로 나누기 ─────────
// 쪽 그림 한 장: 맨 위 오선이 어디서 시작하는지, 그 위(머리말)에 제목 같은 큰 검은 글씨가 있는지 봐요.
// 색 펜으로 쓴 손글씨(순서 메모)는 빼고 봐요. 곡의 첫 쪽에는 보통 큰 제목이 있고, 다음 쪽들은 오선이 바로 시작해요.
function tmPageHead(c) {
  const W = c.width, H = c.height;
  if (W < 50 || H < 50) return { top: -1, title: null };
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  // 1) 오선: 회색 잉크가 가로로 길게 이어진 줄 (색 펜 글씨는 빼요)
  const rowS = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0, o = y * W * 4; x < W; x++, o += 4) { const R = d[o], G = d[o + 1], B = d[o + 2]; if (R * 0.3 + G * 0.59 + B * 0.11 < 205 && Math.max(R, G, B) - Math.min(R, G, B) < 70) n++; }
    rowS[y] = n;
  }
  const lines = [];
  for (let y = 0; y < H; y++) if (rowS[y] > W * 0.3) { const l = lines[lines.length - 1]; if (l && y - l[1] <= 1) l[1] = y; else lines.push([y, y]); }
  const mid = l => (l[0] + l[1]) / 2;
  let top = -1, sp = 0;
  for (let k = 0; k + 3 < lines.length; k++) { // 간격이 고른 줄 네 개 이상 = 오선
    const g = [1, 2, 3].map(j => mid(lines[k + j]) - mid(lines[k + j - 1])).sort((a, b) => a - b);
    if (g[2] < H * 0.03 && g[2] - g[0] <= Math.max(1.5, g[1] * 0.35)) { top = lines[k][0]; sp = g[1]; break; }
  }
  // 2) 머리말(맨 위 오선과 그 바로 위 코드 줄을 뺀 위쪽, 오선이 없으면 위쪽 30%)의 검은 글씨를 글자 덩어리로 묶어요
  const hb = Math.max(0, Math.floor(Math.min(top >= 0 ? top - sp * 6 : H * 0.3, H * 0.36))); // 오선 위 코드 이름(위첨자·슬래시 코드까지)은 빼요
  if (hb < H * 0.03) return { top: top / H, title: null };
  const M = new Uint8Array(W * hb);
  for (let y = 0, o = 0; y < hb; y++) for (let x = 0; x < W; x++, o++) { const k = o * 4, R = d[k], G = d[k + 1], B = d[k + 2]; if (R * 0.3 + G * 0.59 + B * 0.11 < 150 && Math.max(R, G, B) - Math.min(R, G, B) < 60) M[o] = 1; }
  // 이어진 잉크 조각 (8방향)
  const lab = new Int32Array(W * hb), comps = [], st = [];
  for (let o0 = 0; o0 < M.length && comps.length < 3000; o0++) {
    if (!M[o0] || lab[o0]) continue;
    const id = comps.length + 1, cp = { id, x0: W, y0: hb, x1: -1, y1: -1, n: 0 };
    lab[o0] = id; st.push(o0);
    while (st.length) {
      const o = st.pop(), x = o % W, y = (o - x) / W;
      cp.n++; if (x < cp.x0) cp.x0 = x; if (x > cp.x1) cp.x1 = x; if (y < cp.y0) cp.y0 = y; if (y > cp.y1) cp.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= hb) continue;
        const q = yy * W + xx; if (M[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    comps.push(cp);
  }
  // 글자가 아닌 것: 긴 가로줄(오선·밑줄), 네모 테두리(구간 이름 상자)와 그 안의 글자
  const frames = comps.filter(q => { // 네모 테두리: 어느 정도 크고, 잉크가 테두리에만 있고 안쪽은 비어 있어요 (ㅁ·ㅇ 같은 글자 획과 구별)
    const w = q.x1 - q.x0 + 1, h = q.y1 - q.y0 + 1;
    if (w < W * 0.03 || h < H * 0.012 || q.n > 2 * (w + h) * 1.8) return false;
    let inner = 0, area = 0;
    for (let y = q.y0 + 3; y <= q.y1 - 3; y++) for (let x = q.x0 + 3; x <= q.x1 - 3; x++) { area++; if (lab[y * W + x] === q.id) inner++; }
    return area > 0 && inner <= area * 0.04;
  });
  const inFrame = q => frames.some(f => f !== q && q.x0 >= f.x0 && q.x1 <= f.x1 && q.y0 >= f.y0 && q.y1 <= f.y1);
  const C = comps.filter(q => q.n >= 3 && q.x1 - q.x0 + 1 < W * 0.15 && !frames.includes(q) && !inFrame(q));
  // 같은 글줄에서 가까이 있는 조각끼리 한 덩어리 (위아래가 겹치고, 옆 간격이 좁은 것)
  const par = C.map((_, i) => i), find = i => (par[i] === i ? i : (par[i] = find(par[i])));
  for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
    const a = C[i], b = C[j], ov = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1, mh = Math.min(a.y1 - a.y0, b.y1 - b.y0) + 1;
    const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    if (ov >= mh * 0.4 && gap < W * 0.035) par[find(i)] = find(j);
  }
  const G = {};
  C.forEach((q, i) => { const r = find(i), g = G[r] || (G[r] = { x0: W, y0: hb, x1: -1, y1: -1, n: 0, k: 0 }); g.n += q.n; g.k++; g.x0 = Math.min(g.x0, q.x0); g.x1 = Math.max(g.x1, q.x1); g.y0 = Math.min(g.y0, q.y0); g.y1 = Math.max(g.y1, q.y1); });
  let title = null;
  // 덩어리의 맨 윗줄·맨 아랫줄이 길게 한 줄로 이어져 있으면 네모 상자(끊긴 테두리)예요 (글자는 줄이 글자마다 끊겨요)
  const rowFill = (g, y) => { let r = 0, best = 0; for (let x = g.x0; x <= g.x1; x++) { if (M[y * W + x]) { r++; if (r > best) best = r; } else r = 0; } return best / (g.x1 - g.x0 + 1); };
  Object.values(G).forEach(g => { // 제목 같은 덩어리: 글자가 여러 개이고, 키가 크고(쪽 높이의 1.7% 이상), 잉크가 빽빽해요
    const h = g.y1 - g.y0 + 1, w = g.x1 - g.x0 + 1, dens = g.n / (h * w);
    if (g.k >= 4 && h >= H * 0.017 && w >= W * 0.06 && dens >= 0.1 && g.n >= W * H * 0.0005 && !(rowFill(g, g.y0) > 0.7 && rowFill(g, g.y1) > 0.7) && (!title || g.n > title.n)) title = g;
  });
  return { top: top >= 0 ? top / H : -1, title: title ? { y0: title.y0 / H, y1: (title.y1 + 1) / H, x0: title.x0 / W, x1: (title.x1 + 1) / W } : null };
}
// 글자로 된 PDF면 제목 줄 자리의 글자를 꺼내요 (스캔한 PDF는 글자가 없어서 빈 값)
async function tmTextTitle(doc, i, band) {
  if (!doc.text || !band) return '';
  let items = [];
  try { items = await doc.text(i); } catch (e) { return ''; }
  const P = doc.pages[i], y0 = band.y0 * P.h, y1 = band.y1 * P.h;
  const hit = items.filter(t => t.y >= y0 - 2 && t.y - t.h * 0.3 <= y1 + 2 && t.x >= band.x0 * P.w - 4 && t.x <= band.x1 * P.w + 4).sort((a, b) => a.x - b.x);
  // 글자가 한 자씩 따로 들어 있는 PDF도 있어요: 바로 붙어 있으면 그대로 잇고, 띄어 쓴 자리에만 빈칸을 넣어요
  const s = hit.map((t, k) => { const p = hit[k - 1]; return (p && !(p.w > 0 && t.x - (p.x + p.w) < Math.max(1, p.h * 0.15)) ? ' ' : '') + t.s; }).join('').replace(/\s+/g, ' ').trim();
  return (s.match(/[가-힣A-Za-z]/g) || []).length >= 2 ? s.slice(0, 60) : '';
}
// 쪽마다 그려서 살펴보기 → [{start, thumb, top(위쪽 그림), crop(제목 줄 그림), title}]
async function tmScan(doc, onStep) {
  const n = Math.min(doc.pages.length, 80), out = [], dpr = Math.min(2.5, window.devicePixelRatio || 1);
  for (let i = 0; i < n; i++) {
    if (onStep) onStep(i, n);
    const c = document.createElement('canvas');
    try { await doc.draw(i, c, 520 / dpr); } catch (e) { out.push({ start: i === 0, thumb: '', top: '', crop: '', title: '' }); continue; }
    const hd = tmPageHead(c);
    const cut = (x, y, w, h, maxW, q) => { const k = Math.min(1, maxW / w), t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w * k)); t.height = Math.max(1, Math.round(h * k)); t.getContext('2d').drawImage(c, x, y, w, h, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', q); };
    const W = c.width, H = c.height, b = hd.title;
    const it = { start: i === 0 || !!b, thumb: cut(0, 0, W, H, 120, 0.7), top: cut(0, 0, W, Math.round(H * 0.3), 520, 0.8), crop: '', title: '' };
    if (b) {
      const py = (b.y1 - b.y0) * H * 0.35, x0 = Math.max(0, Math.floor(b.x0 * W - 6)), y0 = Math.max(0, Math.floor(b.y0 * H - py)), x1 = Math.min(W, Math.ceil(b.x1 * W + 6)), y1 = Math.min(H, Math.ceil(b.y1 * H + py));
      it.crop = cut(x0, y0, x1 - x0, y1 - y0, 320, 0.85);
      it.title = await tmTextTitle(doc, i, b);
    }
    out.push(it);
  }
  return out;
}
// 나눌 곡 목록: 새 곡이 시작하는 쪽마다 하나
function tmSplitSongs(S) {
  const st = S.pages.map((p, i) => (i === 0 || p.start ? i : -1)).filter(i => i >= 0);
  return st.map((p0, k) => ({ p0, pn: (st[k + 1] != null ? st[k + 1] : S.pages.length) - p0, title: S.titles[p0] != null ? S.titles[p0] : S.pages[p0].title || '', img: S.pages[p0].crop || S.pages[p0].top, use: S.skip[p0] !== true }));
}
// PDF를 살펴서 나눌 곡 목록 만들기. auto면 곡이 둘 이상일 때만 열어요
async function tmSplitStart(song, auto) {
  if (!song || TM.busySplit) return;
  const key = song.fileKey;
  let doc = null;
  try { doc = await pgOpen(key); } catch (e) { doc = null; }
  if (!doc) { stgSay('이 곡의 악보 파일이 이 기기에 없어요.'); return; }
  if (doc.pages.length < 2) { if (!auto) stgSay('한 쪽짜리 악보는 나눌 것이 없어요.'); return; }
  const rec = await fileGet(key);
  const name = (rec && (rec.title || rec.name.replace(/\.[^.]+$/, ''))) || song.title;
  TM.busySplit = true;
  if (!auto) { TM.split = { key, busy: true, step: 'PDF를 살펴보는 중…' }; STG.panel = ''; stgPanel('split'); }
  let pages = [];
  try {
    pages = await tmScan(doc, (i, n) => {
      const t = `PDF에 곡이 몇 개 있는지 살펴보는 중… (${i + 1}/${n}쪽)`;
      if (TM.split && TM.split.busy) { TM.split.step = t; if (STG.panel === 'split') tmPanelSplit($('stpanel')); } else stgSay(t);
    });
  } catch (e) { pages = []; }
  TM.busySplit = false;
  if (!pages.length) { if (TM.split && TM.split.busy) TM.split = null; stgSay('PDF를 살펴보지 못했어요.'); return; }
  // 이미 나눠 둔 PDF면 지금 나눈 그대로 보여 줘요
  const parts = stgSongsForFile(key).filter(stgRange).sort((a, b) => a.p0 - b.p0);
  const titles = {}, skip = {};
  if (parts.length) { pages.forEach((p, i) => (p.start = i === 0 || parts.some(x => x.p0 === i))); parts.forEach(x => (titles[x.p0] = x.title)); }
  const set = parts.length ? STG.sets.find(x => parts.every(p => x.songs.includes(p.id))) : null;
  const count = pages.filter((p, i) => i === 0 || p.start).length;
  if (auto && count < 2) { stgSay(`“${name}”을(를) 넣었어요. “곡·콘티 관리”에서 키·빠르기를 정할 수 있어요.`); return; }
  TM.split = { key, name, pages, titles, skip, setName: set ? set.name : name, already: parts.length > 0, msg: '' };
  if (STG.panel !== 'split') { STG.panel = ''; stgPanel('split'); } else tmPanelSplit($('stpanel'));
  stgSay(count > 1 ? `이 PDF에서 곡 ${count}개를 찾았어요. 아래에서 확인하고 “나눠서 콘티 만들기”를 눌러 주세요.` : '새 곡이 시작하는 쪽을 눌러 표시해 주세요.');
  soSample().then(S => { const b = $('tmtitles'); if (b && S) b.hidden = false; });
}
// PDF를 처음 넣었을 때: 곡이 여러 개면 나누자고 물어봐요
function tmSplitAuto(song) {
  if (!song) return;
  delete song.fresh; stgSaveSongs();
  if (stgRange(song)) return;
  fileGet(song.fileKey).then(rec => { if (rec && rec.type === 'pdf') tmSplitStart(song, true); });
}
function tmPanelSplit(el) {
  if (!el) return;
  const S = TM.split;
  if (!S) { el.innerHTML = '<p class="meta">나눌 PDF가 없어요. “곡·콘티 관리”에서 “곡별로 나누기”를 눌러 주세요.</p>'; return; }
  if (S.busy) { el.innerHTML = `<div class="tmsplit"><h3>곡별로 나누기</h3><p class="meta">${escH(S.step)}</p></div>`; return; }
  const songs = tmSplitSongs(S), used = songs.filter(g => g.use).length;
  const no = {}; songs.forEach((g, k) => (no[g.p0] = k + 1));
  el.innerHTML = `<div class="tmsplit">
    <h3>곡별로 나누기 <span class="meta">${escH(S.name)} · ${S.pages.length}쪽</span></h3>
    <p class="how">곡이 시작하는 쪽에 <b>번호</b>가 붙어 있어요. 틀렸으면 그 쪽을 눌러 고쳐 주세요. 그림 옆 칸에 제목을 적어 두면 곡 목록과 팀원 화면에 그 이름으로 보여요(안 적어도 돼요).</p>
    <div class="tmpgs">${S.pages.map((p, i) => `<button class="tmpg${no[i] ? ' on' : ''}" data-p="${i}" aria-pressed="${!!no[i]}" title="${i + 1}쪽${no[i] ? ` — ${no[i]}번 곡 시작` : ''}">${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}<span class="tmpgn">${i + 1}</span>${no[i] ? `<span class="tmpgk">${no[i]}</span>` : ''}</button>`).join('')}</div>
    <ol class="tmsongs">${songs.map((g, k) => `<li class="${g.use ? '' : 'off'}"><span class="tmno">${k + 1}</span>${g.img ? `<img src="${g.img}" alt="">` : ''}<input type="text" maxlength="60" data-t="${g.p0}" value="${escH(g.title)}" placeholder="${k + 1}번 곡 제목" aria-label="${k + 1}번 곡 제목"><span class="meta tmrng">${g.p0 + 1}${g.pn > 1 ? '–' + (g.p0 + g.pn) : ''}쪽</span><label class="btck"><input type="checkbox" data-u="${g.p0}"${g.use ? ' checked' : ''}> 넣기</label></li>`).join('')}</ol>
    <div class="strow tmsetrow"><label class="stsel">콘티 이름<input type="text" id="tmsetname" maxlength="40" value="${escH(S.setName)}"></label></div>
    <div class="btns"><button class="btn" id="tmsplitgo">✓ 나눠서 콘티 만들기 (${used}곡)</button><button class="btn sec" id="tmtitles" hidden>✨ 제목 읽기</button><button class="btn sec" id="tmsplitno">${S.already ? '한 곡으로 합치기' : '나누지 않기'}</button></div>
    <p class="meta" id="tmsplitmsg">${escH(S.msg || '')}</p></div>`;
  const keepTitles = () => el.querySelectorAll('[data-t]').forEach(i => (S.titles[+i.dataset.t] = i.value.trim()));
  el.querySelectorAll('.tmpg').forEach(b => (b.onclick = () => {
    const i = +b.dataset.p; if (i === 0) { S.msg = '1쪽은 언제나 첫 곡의 시작이에요.'; return tmPanelSplit(el); }
    keepTitles(); S.pages[i].start = !S.pages[i].start; S.msg = ''; tmPanelSplit(el);
  }));
  el.querySelectorAll('[data-u]').forEach(c => (c.onchange = () => { keepTitles(); S.skip[+c.dataset.u] = !c.checked; tmPanelSplit(el); }));
  $('tmsetname').oninput = e => (S.setName = e.target.value);
  $('tmsplitgo').onclick = () => { keepTitles(); tmSplitApply(); };
  $('tmsplitno').onclick = () => { if (S.already) tmSplitMerge(); else { TM.split = null; stgPanel('split'); stgSay('나누지 않고 한 곡으로 두었어요. 나중에 “곡·콘티 관리”에서 나눌 수 있어요.'); } };
  $('tmtitles').onclick = () => { keepTitles(); tmAskTitles(); };
  soSample().then(Sm => { const b = $('tmtitles'); if (b && Sm) b.hidden = false; });
}
async function tmSplitApply() {
  const S = TM.split; if (!S) return;
  const songs = tmSplitSongs(S).filter(g => g.use);
  if (!songs.length) { S.msg = '넣을 곡을 하나 이상 골라 주세요.'; return tmPanelSplit($('stpanel')); }
  const olds = stgSongsForFile(S.key);
  const made = songs.map((g, k) => {
    let x = olds.find(o => stgRange(o) && o.p0 === g.p0);
    if (x) { if (x.pn !== g.pn) { x.regions = []; x.crop = null; x.cropOn = false; } x.pn = g.pn; if (g.title) x.title = g.title; }
    else { x = stgNewSong(S.key, g.title || `${k + 1}번 곡 (${S.name})`.slice(0, 60)); x.p0 = g.p0; x.pn = g.pn; STG.songs.push(x); }
    return x;
  });
  const keep = new Set(made.map(x => x.id)), drop = new Set(olds.filter(o => !keep.has(o.id)).map(o => o.id));
  // 다른 콘티에 들어 있던 예전 곡(한 덩어리 PDF) 자리는 나눈 곡들로 바꿔요
  STG.sets.forEach(set => {
    if (!set.songs.some(id => drop.has(id) || keep.has(id))) return;
    const out = []; let put = false;
    set.songs.forEach(id => { if (drop.has(id) || keep.has(id)) { if (!put) { out.push(...made.map(m => m.id)); put = true; } } else out.push(id); });
    set.songs = out;
  });
  STG.songs = STG.songs.filter(x => !drop.has(x.id));
  const name = String(S.setName || '').trim().slice(0, 40) || S.name;
  let set = STG.sets.find(x => x.name === name);
  if (!set) { set = { id: rsId('t'), name, songs: [] }; STG.sets.push(set); }
  set.songs = made.map(m => m.id);
  stgSaveSongs(); stgSaveSets();
  TM.split = null;
  STG.setId = set.id; STG.idx = 0; STG.pos = 0; STG.docKey = ''; stgSaveOpts();
  if (STG.panel === 'split') stgPanel('split');
  await stgLoadSong(true);
  stgSay(`곡 ${made.length}개로 나눠서 “${name}” 콘티를 만들었어요. 오른쪽을 누르면 넘어가고, 곡 끝에서는 다음 곡으로 넘어가요. 곡마다 키·순서는 “곡·콘티 관리”와 “☰ 순서”에서 정해요.`);
}
// 나눈 곡들을 다시 한 곡(PDF 전체)으로
async function tmSplitMerge() {
  const S = TM.split; if (!S) return;
  const olds = stgSongsForFile(S.key), ids = new Set(olds.map(o => o.id));
  const s = stgNewSong(S.key, S.name);
  STG.sets.forEach(set => { const out = []; let put = false; set.songs.forEach(id => { if (ids.has(id)) { if (!put) { out.push(s.id); put = true; } } else out.push(id); }); set.songs = out; });
  STG.songs = STG.songs.filter(x => !ids.has(x.id)); STG.songs.unshift(s);
  stgSaveSongs(); stgSaveSets();
  TM.split = null;
  STG.idx = Math.max(0, stgList().indexOf(s)); STG.pos = 0; STG.docKey = '';
  if (STG.panel === 'split') stgPanel('split');
  await stgLoadSong(true);
  stgSay('나눈 곡들을 다시 한 곡으로 합쳤어요.');
}
// Claude 화면에서만: 곡마다 첫 쪽 위쪽 그림을 보여 주고 제목을 읽어 달라고 해요
async function tmAskTitles() {
  const S = TM.split, Sm = await soSample(); if (!S || !Sm) return;
  const msg = t => { S.msg = t; const m = $('tmsplitmsg'); if (m) m.textContent = t; };
  const list = tmSplitSongs(S).map(g => g.p0).slice(0, Math.max(1, Math.min(Sm.max || 8, 20)));
  const b = $('tmtitles'); if (b) b.disabled = true;
  msg('Claude가 제목을 읽는 중…');
  try {
    const imgs = list.map(i => tmBlob(S.pages[i].top));
    const prompt = `Each of the ${imgs.length} attached images is the top part of the FIRST page of a different song's sheet music (church worship songs, mostly Korean), in order.
For each image, read the song TITLE exactly as printed (usually the biggest printed text near the top). Ignore handwritten notes, page numbers, composer credits, keys and tempo marks.
Reply with ONLY one JSON object: {"titles":["title of image 1","title of image 2"]}. Use "" when you cannot read a title.`;
    const r = await Sm.fn.json(prompt, { images: imgs, modelTier: 'default' });
    let k = 0;
    (Array.isArray(r && r.titles) ? r.titles : []).slice(0, list.length).forEach((t, j) => { t = String(t || '').trim().slice(0, 60); if (t) { S.titles[list[j]] = t; k++; } });
    S.msg = k ? `제목 ${k}개를 읽었어요. 틀린 건 고쳐 주세요.` : '제목을 읽지 못했어요. 직접 적어 주세요.';
  } catch (e) { S.msg = soErrText(e); }
  if (TM.split === S && STG.panel === 'split') tmPanelSplit($('stpanel'));
}
function tmBlob(url) {
  const [h, b] = String(url).split(','), bin = atob(b || ''), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: (h.match(/data:([^;]+)/) || [0, 'image/jpeg'])[1] });
}

// ───────── 2. 팀에 콘티 보내기 · 받기 ─────────
// 인도자가 “팀에 보내기”를 누르면 프로젝트의 orders/conti 한 곳에 콘티를 써 두고, 멤버 화면에는 “받기”가 떠요.
// 악보 파일(PDF)은 보내지 않아요 (용량·저작권). 멤버는 같은 파일을 한 번만 고르면 되고, 이름이 달라도 쪽 수가 같으면 돼요.
const TM_ID = /^[A-Za-z0-9_-]{1,64}$/;
function tmSongOut(s) {
  const o = s.order || null, num = v => (Number.isFinite(+v) ? +v : 0);
  return {
    id: s.id, title: s.title, fileKey: s.fileKey, p0: stgRange(s) ? s.p0 | 0 : 0, pn: stgRange(s) ? s.pn | 0 : 0,
    key: s.key || '', okey: s.okey || '', bpm: s.bpm || 90, beats: s.beats || 4, secs: s.secs || 240,
    links: (s.links || []).map(l => ({ fp: l.fp, fx: l.fx, fy: l.fy, tp: l.tp, tx: l.tx, ty: l.ty, label: l.label || '' })),
    regions: (s.regions || []).map(r => ({ p: r.p, x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) })),
    order: o && o.items ? { items: o.items.map(it => ({ t: it.t, s: it.s })), secs: (o.secs || []).map(x => ({ name: x.name, g: x.g, read: !!x.read, auto: !!x.auto, p: x.p, y: x.y, x: x.x, w: x.w, h: x.h, si: x.si })), show: o.show !== false, short: o.short !== false, compact: o.compact !== false, follow: o.follow !== false, from: o.from || 0, to: o.to || 0, written: o.written || '', note: o.note || '' } : null,
  };
}
// 받은 콘티는 다른 사람이 보낸 것이라, 알맞은 모양의 값만 골라 써요
function tmClean(D) {
  const n = (v, d = 0) => (Number.isFinite(+v) ? +v : d), int = (v, a, b, d) => Math.max(a, Math.min(b, Math.round(n(v, d)))), str = (v, k) => String(v == null ? '' : v).slice(0, k);
  if (!D || typeof D !== 'object' || !Array.isArray(D.songs)) return null;
  const files = (Array.isArray(D.files) ? D.files : []).slice(0, 30).filter(f => f && typeof f.key === 'string' && f.key.length <= 80).map(f => ({
    key: f.key, name: str(f.name, 200) || 'score.pdf', title: str(f.title, 120), type: f.type === 'img' ? 'img' : 'pdf', size: int(f.size, 0, 1e9, 0), pages: int(f.pages, 0, 2000, 0), sig: str(f.sig, 40),
    parts: (Array.isArray(f.parts) ? f.parts : []).slice(0, 60).map(p => ({ name: str(p && p.name, 200), type: str(p && p.type, 60), size: int(p && p.size, 0, 1e9, 0) })),
  }));
  const songs = D.songs.slice(0, 60).filter(s => s && TM_ID.test(String(s.id)) && typeof s.fileKey === 'string' && s.fileKey.length <= 80).map(s => {
    const o = s.order && typeof s.order === 'object' ? s.order : null;
    return {
      id: String(s.id), title: str(s.title, 60) || '곡', fileKey: s.fileKey, p0: int(s.p0, 0, 2000, 0), pn: int(s.pn, 0, 2000, 0),
      key: str(s.key, 12), okey: str(s.okey, 12), bpm: int(s.bpm, 30, 260, 90), beats: int(s.beats, 1, 12, 4), secs: int(s.secs, 20, 1800, 240),
      links: (Array.isArray(s.links) ? s.links : []).slice(0, 40).map(l => ({ fp: int(l && l.fp, 0, 2000, 0), fx: n(l && l.fx), fy: n(l && l.fy), tp: int(l && l.tp, 0, 2000, 0), tx: n(l && l.tx), ty: n(l && l.ty), label: str(l && l.label, 16) })),
      regions: (Array.isArray(s.regions) ? s.regions : []).slice(0, 400).map(r => ({ p: int(r && r.p, 0, 2000, 0), x: n(r && r.x), y: n(r && r.y), w: n(r && r.w), h: n(r && r.h) })),
      order: o ? {
        items: (Array.isArray(o.items) ? o.items : []).slice(0, 200).map(it => ({ t: str(it && it.t, 24), s: int(it && it.s, -1, 200, -1) })).filter(it => it.t),
        secs: (Array.isArray(o.secs) ? o.secs : []).slice(0, 120).map(x => ({ name: str(x && x.name, 24), g: x && x.g != null ? int(x.g, 0, 500, 0) : null, read: !!(x && x.read), auto: !!(x && x.auto), p: int(x && x.p, 0, 2000, 0), y: n(x && x.y), x: n(x && x.x), w: n(x && x.w), h: n(x && x.h), si: int(x && x.si, 0, 200, 0) })),
        show: o.show !== false, short: o.short !== false, compact: o.compact !== false, follow: o.follow !== false, from: int(o.from, 0, 2000, 0) || undefined, to: int(o.to, 0, 2000, 0) || undefined, written: str(o.written, 120), note: str(o.note, 200), src: 'team',
      } : null,
    };
  });
  return { v: 1, id: TM_ID.test(String(D.id)) ? String(D.id) : rsId('t'), name: str(D.name, 40) || '받은 콘티', at: n(D.at), songs, files };
}
function tmSync() {
  const pid = collabIn() && COLLAB.project ? COLLAB.pid : null;
  if (pid === TM.contiPid) return;
  if (TM.contiUn) { try { TM.contiUn(); } catch (e) {} }
  TM.contiUn = null; TM.conti = null; TM.need = null; TM.msg = ''; TM.contiPid = pid;
  if (pid) TM.contiUn = COLLAB.B.watchItem(pid, 'orders', 'conti', it => {
    let data = null;
    try { data = it ? tmClean(JSON.parse(it.data)) : null; } catch (e) { data = null; }
    TM.conti = data ? { data, by: it.updatedBy, byName: it.updatedName, at: it.updatedAt } : null;
    if (typeof stgDrawLive === 'function') stgDrawLive();
    tmBadge();
  }, () => {});
  tmBadge();
}
// 처음 화면의 “악보 실행”에 새 콘티 알림 (멤버)
function tmBadge() {
  const b = $('go-run'); if (!b) return;
  const D = TM.conti && TM.conti.data, fresh = !!(D && COLLAB.project && collabIn() && !isLead() && D.at > +(lsGet('mh-conti-got-' + COLLAB.pid, 0) || 0));
  let t = b.querySelector('.tmbadge');
  if (!fresh) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('span'); t.className = 'tmbadge'; b.appendChild(t); }
  t.textContent = `📥 새 콘티: ${D.name}`;
}
collabOn('project', tmSync);
collabOn('logout', tmSync);
async function tmSend() {
  const set = STG.sets.find(s => s.id === STG.setId);
  if (!set || !isLead() || !COLLAB.project) return;
  const songs = set.songs.map(id => STG.songs.find(x => x.id === id)).filter(Boolean);
  if (!songs.length) { TM.msg = '이 콘티에 곡이 없어요.'; return stgDrawLive(); }
  TM.msg = '보내는 중…'; stgDrawLive();
  const files = [];
  for (const s of songs) {
    if (files.some(f => f.key === s.fileKey)) continue;
    const rec = await fileGet(s.fileKey);
    if (!rec || !rec.parts || !rec.parts[0]) continue;
    let pages = 0;
    try { const d = await pgOpen(s.fileKey); pages = d ? d.pages.length : 0; } catch (e) {}
    files.push({ key: rec.key, name: rec.name, title: rec.title || '', type: rec.type, size: rec.size, pages, sig: pdfSig(new Uint8Array(rec.parts[0].buf)), parts: rec.parts.map(p => ({ name: p.name, type: p.type || '', size: p.buf.byteLength })) });
  }
  const data = JSON.stringify({ v: 1, id: set.id, name: set.name, at: Date.now(), songs: songs.map(tmSongOut), files });
  const big = collabTooBig(data);
  if (big) { TM.msg = big; return stgDrawLive(); }
  try {
    await COLLAB.B.createItem(COLLAB.pid, 'orders', 'conti', { title: set.name, data }, false);
    TM.msg = `“${set.name}” 콘티를 팀에 보냈어요 (${songs.length}곡). 멤버 화면에 “받기”가 떠요. 예배 기록에도 남겼어요.`;
    tmLogAdd(set.name, songs);
  } catch (e) { TM.msg = collabErr(e); }
  stgDrawLive();
}
async function tmReceive(later) {
  const C = TM.conti; if (!C || !C.data) return;
  const D = C.data;
  TM.need = null;
  if (!later) for (const f of D.files) { if (!(await fileGet(f.key))) { TM.need = f; break; } }
  if (TM.need) { TM.msg = ''; return stgDrawLive(); }
  tmApply(D);
}
// 멤버가 고른 파일을 인도자의 파일 이름표로 저장해요 → 그다음부터 표시·넘기기가 인도자와 똑같이 맞아요
async function tmProvide(files) {
  const f = TM.need; if (!f || !files || !files.length) return;
  files = [...files];
  const pick = f.type === 'pdf' ? files.filter(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name)).slice(0, 1) : files.filter(x => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(x.name));
  if (!pick.length) { TM.msg = f.type === 'pdf' ? 'PDF 파일을 골라 주세요.' : '사진 파일을 골라 주세요.'; return stgDrawLive(); }
  TM.msg = '파일을 확인하는 중…'; stgDrawLive();
  const parts = [];
  for (let k = 0; k < pick.length; k++) parts.push({ name: (f.parts[k] && f.parts[k].name) || pick[k].name, type: pick[k].type || (f.parts[k] && f.parts[k].type) || '', buf: await pick[k].arrayBuffer() });
  let note = '';
  if (f.type === 'pdf') {
    let n = 0;
    try { const lib = await pdfLibs(); const pdf = await lib.getDocument({ data: new Uint8Array(parts[0].buf.slice(0)) }).promise; n = pdf.numPages; pdf.destroy(); }
    catch (e) { TM.msg = 'PDF 파일을 열 수 없어요. 다른 파일을 골라 주세요.'; return stgDrawLive(); }
    if (f.pages && n !== f.pages) { TM.msg = `고른 PDF는 ${n}쪽인데, 인도자가 쓴 PDF는 ${f.pages}쪽이에요. 같은 파일을 골라 주세요.`; return stgDrawLive(); }
    if (f.sig && pdfSig(new Uint8Array(parts[0].buf)) !== f.sig) note = ' 인도자의 파일과 조금 다른 파일이에요(쪽 수는 같아요). 쪽이 맞는지 한 번 봐 주세요.';
  } else if (f.parts.length && parts.length !== f.parts.length) { TM.msg = `사진 ${f.parts.length}장을 골라 주세요 (지금 ${parts.length}장).`; return stgDrawLive(); }
  try { await filePut({ key: f.key, name: f.name, title: f.title || f.name.replace(/\.[^.]+$/, ''), type: f.type, size: parts.reduce((a, p) => a + p.buf.byteLength, 0), parts, addedAt: Date.now() }); }
  catch (e) { TM.msg = '파일을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요.'; return stgDrawLive(); }
  if (typeof PGS !== 'undefined') PGS.delete(f.key);
  TM.need = null;
  await tmReceive();
  if (note) { TM.msg += note; stgDrawLive(); }
}
function tmApply(D) {
  const ids = [];
  D.songs.forEach(x => {
    let s = STG.songs.find(y => y.id === x.id);
    if (!s) { s = stgNewSong(x.fileKey, x.title); s.id = x.id; STG.songs.push(s); }
    Object.assign(s, { title: x.title, fileKey: x.fileKey, key: x.key, bpm: x.bpm, beats: x.beats, secs: x.secs, links: x.links, regions: x.regions, order: x.order });
    if (x.okey) s.okey = x.okey; else delete s.okey;
    if (x.pn > 0) { s.p0 = x.p0; s.pn = x.pn; } else { delete s.p0; delete s.pn; }
    s.ordPending = 1; // 이 기기의 악보 위에도 순서를 써 둬요 (곡을 열 때)
    ids.push(s.id);
  });
  let set = STG.sets.find(y => y.id === D.id);
  if (!set) { set = { id: D.id, name: D.name, songs: [] }; STG.sets.push(set); }
  set.name = D.name; set.songs = ids; set.team = 1;
  stgSaveSongs(); stgSaveSets();
  lsSet('mh-conti-got-' + COLLAB.pid, D.at);
  tmBadge();
  TM.need = null;
  TM.msg = `“${D.name}” 콘티를 받았어요 (${ids.length}곡). 순서·키·빠르기가 인도자와 같아요.`;
  tmLogAdd(D.name, ids.map(id => STG.songs.find(x => x.id === id)).filter(Boolean));
  STG.setId = set.id; STG.idx = 0; STG.pos = 0; STG.docKey = ''; stgSaveOpts();
  stgLoadSong(true);
  stgDrawLive();
}
// 프로젝트 막대(악보 실행 위쪽)에 붙는 부분
function tmLiveHtml() {
  if (!COLLAB.project || !collabIn()) return '';
  const C = TM.conti, D = C && C.data, got = +(lsGet('mh-conti-got-' + COLLAB.pid, 0) || 0);
  let h = '<div class="tmlive">';
  if (isLead()) {
    const set = STG.sets.find(s => s.id === STG.setId);
    h += `<div class="tmrow"><button class="btn small" id="tmsend"${set ? '' : ' disabled'}>📤 ${set ? `“${escH(set.name)}” 콘티 팀에 보내기` : '콘티를 고르면 팀에 보낼 수 있어요'}</button>${D ? `<span class="meta">마지막으로 보낸 콘티: ${escH(D.name)} · ${fmtWhen(D.at)}</span>` : ''}</div>`;
    h += '<p class="meta tmtip">연주할 때 아래쪽 <b>📣 신호</b>를 누르면 “한 번 더”, “후렴으로” 같은 신호가 멤버 화면에 크게 떠요.</p>';
  } else if (D && !TM.need) {
    const fresh = D.at > got, who = nameOf(C.by, C.byName);
    h += fresh
      ? `<div class="tmrow tmnew"><span>📥 ${escH(who)}님이 보낸 새 콘티 <b>${escH(D.name)}</b> (${D.songs.length}곡)</span><button class="btn small" id="tmget">받기</button></div>`
      : `<div class="tmrow"><span class="meta">✓ 받은 콘티: ${escH(D.name)} (${D.songs.length}곡)</span><button class="btn sec small" id="tmget">다시 받기</button></div>`;
  }
  if (TM.need) {
    const f = TM.need;
    h += `<div class="tmneed"><p>이 콘티의 악보 파일이 필요해요: <b>${escH(f.name)}</b>${f.pages ? ` (${f.pages}쪽)` : ''}. 같은 파일을 <b>한 번만</b> 골라 주세요. 파일 이름은 달라도 돼요.</p>
      <div class="btns"><label class="fpick fsmall"><span class="fpbtn">파일 고르기</span><input class="fpin" type="file" id="tmneedf" accept="${f.type === 'pdf' ? 'application/pdf,.pdf' : 'image/*'}"${f.type === 'pdf' ? '' : ' multiple'}></label><button class="btn sec small" id="tmlater">파일 없이 받기</button></div></div>`;
  }
  if (TM.msg) h += `<p class="okmsg">${escH(TM.msg)}</p>`;
  return h + '</div>';
}
function tmLiveBind() {
  if ($('tmsend')) $('tmsend').onclick = tmSend;
  if ($('tmget')) $('tmget').onclick = () => tmReceive();
  if ($('tmneedf')) $('tmneedf').onchange = e => tmProvide(e.target.files);
  if ($('tmlater')) $('tmlater').onclick = () => { TM.need = null; tmReceive(true); };
  const b = $('stsigb');
  if (b) b.hidden = !(COLLAB.project && collabIn() && isLead());
}

// ───────── 3. 인도자 신호 ─────────
const TM_SIGS = [['again', '한 번 더', '🔁'], ['chorus', '후렴으로', '↩️'], ['break', '브레이크', '✋'], ['up', '키 업', '⬆️'], ['end', '엔딩', '🏁']];
function tmSigSheet(open) {
  TM.sheet = open == null ? !TM.sheet : open;
  let el = $('tmsigs');
  if (!TM.sheet) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'tmsigs'; el.className = 'tmsigs'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '신호 보내기'); document.body.appendChild(el); }
  el.innerHTML = `<p class="meta">멤버 화면에 크게 떠요</p><div class="tmsigg">${TM_SIGS.map(([k, n, i]) => `<button class="tmsigbtn tms-${k}" data-k="${k}"><span>${i}</span>${n}</button>`).join('')}</div><button class="btn sec small" id="tmsigx">닫기</button>`;
  el.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { tmSigSend(b.dataset.k); tmSigSheet(false); }));
  $('tmsigx').onclick = () => tmSigSheet(false);
}
function tmSigSend(k) {
  if (!COLLAB.project || !collabIn() || !isLead()) return;
  STG.sig = { k, n: newSid(), at: Date.now() };
  stgBroadcast(false, true);
  tmSigShow(k, true);
  clearTimeout(TM.sigClr); TM.sigClr = setTimeout(() => { STG.sig = null; }, 20000);
}
function tmOnSig(st) {
  const g = st && st.sig, p = COLLAB.project;
  if (!g || !p || !g.n || g.n === TM.sigSeen || !TM_SIGS.some(x => x[0] === g.k)) return;
  const okHost = COLLAB.kind === 'firebase' || roleOf(p, st.by) === 'host' || (COLLAB.B.ownerId && st.by === COLLAB.B.ownerId) || (p.members && p.members[st.by] === 'dev');
  if (!okHost) return;
  TM.sigSeen = g.n;
  if (Math.abs(Date.now() - (+g.at || 0)) > 60000) return; // 오래된 신호는 띄우지 않아요
  tmSigShow(g.k, false, nameOf(st.by, st.byName));
}
function tmSigShow(k, mine, by) {
  const S = TM_SIGS.find(x => x[0] === k); if (!S) return;
  if (typeof SCREEN !== 'undefined' && (SCREEN !== 'app' || TAB !== 't-run')) return;
  let el = $('tmsigban');
  if (!el) { el = document.createElement('div'); el.id = 'tmsigban'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  el.className = `tmsigban tms-${k}${mine ? ' mine' : ''}`;
  el.innerHTML = `<span class="tmsi">${S[2]}</span><b>${S[1]}</b>${mine ? '<small>멤버에게 보냈어요</small>' : by ? `<small>${escH(by)}</small>` : ''}`;
  el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  clearTimeout(TM.sigT); TM.sigT = setTimeout(() => { el.hidden = true; }, mine ? 1600 : 4500);
  if (!mine && navigator.vibrate) { try { navigator.vibrate(150); } catch (e) {} }
}

// ───────── 7. 예배 기록 ─────────
const tmLogs = () => (lsGet('mh-worship-log', []) || []).filter(x => x && x.id && Array.isArray(x.songs));
const tmToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function tmLogAdd(name, songs) {
  const date = tmToday();
  const L = tmLogs().filter(x => !(x.date === date && x.name === name));
  L.unshift({ id: rsId('w'), date, name: String(name || '콘티').slice(0, 40), at: Date.now(), songs: songs.map(s => ({ id: s.id, title: s.title, key: s.key || '', bpm: s.bpm || 0, order: s.order && s.order.items && s.order.items.length ? soOrderLine(s.order.items.map(it => it.t)) : '' })) });
  lsSet('mh-worship-log', L.slice(0, 300));
}
function tmLogHtml() {
  const L = tmLogs();
  return `<details class="tmlog" id="tmlog"${TM.logOpen ? ' open' : ''}><summary>예배 기록 <span class="meta">${L.length}개</span></summary>
    <p class="meta">팀에 보낸 콘티는 저절로 남아요. 날짜는 눌러서 예배 날짜로 고칠 수 있어요. 표(CSV)는 저작권 사용 보고나 지난 콘티 찾기에 써요.</p>
    <div class="btns"><button class="btn sec small" id="tmlogadd">지금 콘티를 오늘 기록으로 남기기</button>${L.length ? '<button class="btn sec small" id="tmlogcsv">표(CSV)로 저장</button>' : ''}</div>
    <ul class="tmlogl">${L.slice(0, 30).map(x => `<li><input type="date" value="${escH(x.date)}" data-ld="${x.id}" aria-label="예배 날짜"><b>${escH(x.name)}</b><span class="meta">${x.songs.map(s => escH(s.title) + (s.key ? ` (${escH(s.key)})` : '')).join(' · ')}</span><span class="tmlogb"><button class="btn sec small" data-lre="${x.id}">콘티로 다시 만들기</button><button class="btn sec small danger" data-ldel="${x.id}" aria-label="기록 지우기">✕</button></span></li>`).join('') || '<li class="meta">아직 기록이 없어요.</li>'}</ul></details>`;
}
function tmLogBind(el) {
  const d = $('tmlog'); if (!d) return;
  d.ontoggle = () => (TM.logOpen = d.open);
  const redo = () => stgPanel('manage', true);
  if ($('tmlogadd')) $('tmlogadd').onclick = () => {
    const set = STG.sets.find(s => s.id === STG.setId), list = stgList();
    if (!list.length) return stgSay('기록할 곡이 없어요.');
    tmLogAdd(set ? set.name : '모든 곡', list); TM.logOpen = true; stgSay('오늘 날짜로 예배 기록을 남겼어요.'); redo();
  };
  if ($('tmlogcsv')) $('tmlogcsv').onclick = tmLogCsv;
  el.querySelectorAll('[data-ld]').forEach(i => (i.onchange = () => { const L = tmLogs(), x = L.find(y => y.id === i.dataset.ld); if (x && /^\d{4}-\d{2}-\d{2}$/.test(i.value)) { x.date = i.value; L.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.at - a.at)); lsSet('mh-worship-log', L); } }));
  el.querySelectorAll('[data-ldel]').forEach(b => (b.onclick = () => {
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '지울까요?'; return; }
    lsSet('mh-worship-log', tmLogs().filter(y => y.id !== b.dataset.ldel)); redo();
  }));
  el.querySelectorAll('[data-lre]').forEach(b => (b.onclick = () => {
    const x = tmLogs().find(y => y.id === b.dataset.lre); if (!x) return;
    const ids = [], miss = [];
    x.songs.forEach(s => { const g = STG.songs.find(y => y.id === s.id) || STG.songs.find(y => y.title === s.title); if (g) ids.push(g.id); else miss.push(s.title); });
    if (!ids.length) return stgSay('이 기록의 곡이 이 기기에 없어요.');
    const set = { id: rsId('t'), name: `${x.name} (${x.date.slice(5).replace('-', '/')})`.slice(0, 40), songs: ids };
    STG.sets.push(set); stgSaveSets(); STG.setId = set.id; STG.idx = 0; STG.pos = 0; stgSaveOpts(); stgLoadSong(true);
    stgSay(`“${set.name}” 콘티를 만들었어요.${miss.length ? ` 이 기기에 없는 곡: ${miss.join(', ')}` : ''}`);
  }));
}
async function tmLogCsv() {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['날짜', '콘티', '번호', '곡 제목', '키', '빠르기', '연주 순서']];
  tmLogs().forEach(x => x.songs.forEach((s, k) => rows.push([x.date, x.name, k + 1, s.title, s.key, s.bpm || '', s.order])));
  const text = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
  const r = await saveFile(new TextEncoder().encode(text), `예배 기록 ${tmToday()}.csv`, 'text/csv');
  stgSay(r === 'saved' ? '예배 기록을 표(CSV)로 저장했어요. 엑셀·구글 시트에서 열 수 있어요.' : r === 'declined' ? '저장을 취소했어요.' : '여기서는 저장하지 못했어요.');
}

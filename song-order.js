// 악보 순서 자동으로 만들기: 악보의 구간 표시(Intro·A1·Chorus·Inter …)와 도돌이표를 보고 연주 순서를 만들어요.
//  - 기기 안에서 찾기(soDetectLocal): 네모 칸 표시(구간 이름이 든 상자)와 도돌이표(𝄆 𝄇)를 그림에서 찾아요.
//    글자는 읽지 못해서, 찾은 상자 그림을 보여 주고 이름은 한 번만 적어 주면 돼요.
//  - Claude로 읽기(soAskClaude, Claude 화면에서만): 이름·도돌이표·D.S.·Coda·×2까지 읽어서 순서를 만들어요.
// 만든 순서는 song.order = { items: [{t: 이름, s: 구간 번호 | -1}], secs: [{name, p, y, x, img}], show, src } 에 저장해요.

// 순서 칸에 바로 넣을 수 있는 흔한 이름 (순서대로 버튼이 나와요)
const SO_COMMON = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Inter', 'Outro', 'Ending', 'A', 'B', 'C', '전주', '1절', '2절', '후렴', '간주', '후주'];
// 악보 위에 쓸 때 이름 사이에 넣는 글자
const SO_JOIN = ' - ';

// ───────── 기기 안에서 찾기 ─────────
// 쪽 그림 한 장에서: 오선(5줄) 자리, 네모 칸 표시, 도돌이표
function soScanPage(d, W, H) {
  const lum = k => d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11;
  const gray = k => { const a = d[k], b = d[k + 1], c = d[k + 2]; return Math.max(a, b, c) - Math.min(a, b, c) < 70; };
  // 1) 오선 줄: 회색 잉크가 가로로 길게 이어진 줄 (이웃한 두 줄을 합쳐서 봐요)
  const row = new Float32Array(H + 1);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0, k = y * W * 4; x < W; x++, k += 4) { const L = lum(k); if (L < 245 && gray(k)) n += (245 - L) / 245; }
    row[y] = n;
  }
  const lines = [];
  for (let y = 0; y < H; y++) if (row[y] + row[y + 1] > W * 0.4) { const l = lines[lines.length - 1]; if (l && y - l.y1 <= 2) l.y1 = y; else lines.push({ y0: y, y1: y }); }
  const mid = l => (l.y0 + l.y1) / 2;
  const gaps = lines.slice(1).map((l, k) => mid(l) - mid(lines[k])).filter(g => g > 3 && g < H * 0.03).sort((a, b) => a - b);
  const sp0 = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const staves = [];
  if (sp0) {
    let cur = [lines[0]];
    for (let k = 1; k <= lines.length; k++) {
      const l = lines[k];
      if (l && mid(l) - mid(cur[cur.length - 1]) < sp0 * 1.5) cur.push(l);
      else { if (cur.length >= 5) staves.push(cur.slice(0, 5).map(mid)); if (l) cur = [l]; }
    }
  }
  const out = { staves: [], boxes: [], marks: [] };
  staves.forEach((L, si) => {
    const sp = (L[4] - L[0]) / 4;
    // 오선의 가로 범위
    const ym = Math.round(L[2]);
    // 가운데 줄에서 가장 길게 이어진 부분 = 오선 (줄 앞의 이름 상자는 빼고)
    let xa = 0, xb = W - 1, best = 0;
    for (let x = 0; x < W;) {
      if (lum((ym * W + x) * 4) > 205) { x++; continue; }
      // 옅은 오선은 군데군데 끊겨 보여서, 짧게 끊긴 곳(칸 반 정도)은 이어서 봐요
      let e = x, gap = 0;
      for (let k = x + 1; k < W && gap <= sp * 0.6; k++) { if (lum((ym * W + k) * 4) <= 205) { e = k; gap = 0; } else gap++; }
      if (e - x > best) { best = e - x; xa = x; }
      x = e + 1;
    }
    while (xb > 0 && lum((ym * W + xb) * 4) > 205) xb--; // 오른쪽 끝은 마지막 잉크까지
    out.staves.push({ L, sp, xa, xb });
    // 2) 도돌이표: 굵은 세로줄 + 가는 세로줄 + 가운데 두 칸의 점
    const ya = Math.floor(L[0]) - 1, yb = Math.ceil(L[4]) + 1, rows = yb - ya + 1;
    const dark = new Uint8Array(W);
    for (let x = Math.max(0, xa - 2); x <= Math.min(W - 1, xb + 2); x++) {
      let n = 0;
      for (let y = ya; y <= yb; y++) if (lum((y * W + x) * 4) < 150) n++;
      dark[x] = n >= rows * 0.92 ? 1 : 0;
    }
    const runs = [];
    for (let x = 0; x < W; x++) if (dark[x]) { const r = runs[runs.length - 1]; if (r && x - r.x1 <= 1) r.x1 = x; else runs.push({ x0: x, x1: x }); }
    runs.forEach(r => (r.w = r.x1 - r.x0 + 1));
    const thick = r => r.w >= Math.max(3, sp * 0.3), thin = r => r.w <= Math.max(2, sp * 0.22);
    const blob = (x0, x1, yc) => { // 점 하나가 있을 만큼 잉크가 모였는지 (줄은 피해서 칸 가운데만)
      let n = 0, a = 0;
      for (let y = Math.round(yc - sp * 0.25); y <= Math.round(yc + sp * 0.25); y++) for (let x = Math.max(0, Math.round(x0)); x <= Math.min(W - 1, Math.round(x1)); x++) { a++; if (lum((y * W + x) * 4) < 150) n++; }
      return a ? n / a : 0;
    };
    const dots = (x0, x1) => blob(x0, x1, L[1] + sp / 2) > 0.12 && blob(x0, x1, L[2] + sp / 2) > 0.12 && blob(x0, x1, L[0] + sp / 2) < 0.08 && blob(x0, x1, L[3] + sp / 2) < 0.08;
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k]; if (!thick(r)) continue;
      const left = runs[k - 1], right = runs[k + 1];
      if (left && thin(left) && r.x0 - left.x1 <= sp * 1.0 && dots(left.x0 - sp * 1.2, left.x0 - sp * 0.15)) out.marks.push({ type: 'end', si, x: r.x1 / W });
      if (right && thin(right) && right.x0 - r.x1 <= sp * 1.0 && dots(right.x1 + sp * 0.15, right.x1 + sp * 1.2)) out.marks.push({ type: 'start', si, x: r.x0 / W });
    }
    // 3) 네모 칸 표시(구간 이름이 든 상자): 오선 위쪽에서 위아래 가로선 + 양옆 세로선
    const top = Math.max(si > 0 ? out.staves[si - 1].L[4] + sp : 0, Math.round(L[0] - sp * 11)), bot = Math.round(L[0] - sp * 0.3);
    const ink = (x, y) => lum((y * W + x) * 4) < 200;
    const findBoxes = (yA, yB, xA, xB) => {
    const hr = [];
    for (let y = Math.max(0, Math.round(yA)); y < Math.min(H, Math.round(yB)); y++) { // 정수 자리만 (소수면 엉뚱한 점을 읽어요)
      let x = Math.max(0, xA);
      while (x <= xB) {
        if (!ink(x, y)) { x++; continue; }
        let e = x; while (e + 1 <= xB && ink(e + 1, y)) e++;
        const len = e - x + 1;
        if (len >= sp * 1.5 && len <= sp * 12) hr.push({ y, x0: x, x1: e }); // 글자 속 작은 네모(ㅁ 같은 것)보다 커야 해요
        x = e + 1;
      }
    }
    hr.forEach(a => {
      hr.forEach(b => {
        if (b.y - a.y < sp * 0.9 || b.y - a.y > sp * 6 || Math.abs(a.x0 - b.x0) > 2 || Math.abs(a.x1 - b.x1) > 2) return;
        const x0 = Math.min(a.x0, b.x0), x1 = Math.max(a.x1, b.x1), y0 = a.y, y1 = b.y;
        if (out.boxes.some(q => q.si === si && Math.abs(q.px0 - x0) < sp && Math.abs(q.py0 - y0) < sp)) return;
        const col = x => { let n = 0; for (let y = y0; y <= y1; y++) if (ink(x, y) || ink(Math.min(W - 1, x + 1), y) || ink(Math.max(0, x - 1), y)) n++; return n / (y1 - y0 + 1); };
        if (col(x0) < 0.85 || col(x1) < 0.85) return;
        // 테두리 두께를 재고 (굵은 테두리도 있어요), 그 안쪽만 봐요
        const frac = (y, a, b) => { let n = 0; for (let x = a; x <= b; x++) if (ink(x, y)) n++; return n / Math.max(1, b - a + 1); };
        const fracC = (x, a, b) => { let n = 0; for (let y = a; y <= b; y++) if (ink(x, y)) n++; return n / Math.max(1, b - a + 1); };
        const lim = Math.floor((y1 - y0) / 3), limx = Math.floor((x1 - x0) / 3);
        let t = 0, bt = 0, l = 0, r = 0;
        while (t < lim && frac(y0 + t, x0, x1) > 0.6) t++;
        while (bt < lim && frac(y1 - bt, x0, x1) > 0.6) bt++;
        while (l < limx && fracC(x0 + l, y0, y1) > 0.6) l++;
        while (r < limx && fracC(x1 - r, y0, y1) > 0.6) r++;
        const ix0 = x0 + l + 1, ix1 = x1 - r - 1, iy0 = y0 + t + 1, iy1 = y1 - bt - 1;
        if (ix1 - ix0 < sp * 0.8 || iy1 - iy0 < sp * 0.5) return;
        let n = 0, ar = 0;
        for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) { ar++; if (ink(x, y)) n++; }
        const f = ar ? n / ar : 0;
        if (f < 0.04 || f > 0.6) return; // 속이 비었거나 꽉 찬 건 글자 상자가 아니에요
        // 테두리 바로 안쪽은 비어 있어야 해요 (글자와 테두리 사이 여백)
        if (frac(iy0, ix0, ix1) > 0.35 && frac(iy1, ix0, ix1) > 0.35) return;
        // 상자는 둘레가 비어 있어요 (글자 획이 우연히 네모 모양이 된 것과 구별)
        const o = Math.max(2, Math.round(sp * 0.25));
        let on = 0, oa = 0;
        for (let x = x0 - o; x <= x1 + o; x++) [y0 - o, y1 + o].forEach(y => { if (x >= 0 && x < W && y >= 0 && y < H) { oa++; if (ink(x, y)) on++; } });
        for (let y = y0 - o; y <= y1 + o; y++) [x0 - o, x1 + o].forEach(x => { if (x >= 0 && x < W && y >= 0 && y < H) { oa++; if (ink(x, y)) on++; } });
        if (oa && on / oa > 0.15) return;
        out.boxes.push({ si, px0: x0, py0: y0, px1: x1, py1: y1 });
      });
    });
    };
    findBoxes(top, bot, 0, W - 1);
    // 오선 왼쪽 여백에 붙은 이름 상자 (Solo, C, Outro 처럼 줄 앞에 쓴 것)
    if (xa > sp * 3) findBoxes(Math.max(top, Math.round(L[0] - sp * 2)), Math.round(L[4] + sp * 2), 0, xa + 2);
  });
  return out;
}
// 모든 쪽 찾기 → 구간(상자)과 도돌이표 목록. onStep(i, n)으로 진행을 알려 줘요
async function soDetectLocal(doc, onStep) {
  const secs = [], marks = [], groups = [];
  const n = Math.min(doc.pages.length, 30);
  for (let i = 0; i < n; i++) {
    if (onStep) onStep(i, n);
    const c = document.createElement('canvas');
    await doc.draw(i, c, 1100 / Math.min(2.5, window.devicePixelRatio || 1));
    const W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const r = soScanPage(d, W, H);
    // 상자가 있으면 글자를 읽으려고 쪽을 두 배로 크게 한 번 더 그려요 (작은 글자도 또렷하게)
    let hi = null, hk = 1;
    if (r.boxes.length) { hi = document.createElement('canvas'); await doc.draw(i, hi, 2400 / Math.min(2.5, window.devicePixelRatio || 1)); hk = hi.width / W; }
    r.boxes.forEach(b => {
      // 상자 그림을 잘라 두어서, 이름을 적을 때 어떤 표시인지 보이게 해요
      const t = document.createElement('canvas'), bw = b.px1 - b.px0 + 9, bh = b.py1 - b.py0 + 9, k = Math.min(1, 40 / bh);
      t.width = Math.max(1, Math.round(bw * k)); t.height = Math.max(1, Math.round(bh * k));
      t.getContext('2d').drawImage(c, b.px0 - 4, b.py0 - 4, bw, bh, 0, 0, t.width, t.height);
      // 같은 글자의 상자끼리 묶어요 (B, B, B … → 이름을 한 번만 적으면 다 바뀌게)
      // 테두리 안쪽 글자만 떠서, 글자 테두리(잉크가 있는 곳)에 맞춰 24×16으로 줄여 잉크 점이 얼마나 겹치는지 봐요
      const bw0 = b.px1 - b.px0, bh0 = b.py1 - b.py0, ix = Math.round(bw0 * 0.16), iy = Math.round(bh0 * 0.2);
      const cx0 = b.px0 + ix, cy0 = b.py0 + iy, cw = Math.max(1, bw0 - 2 * ix), ch = Math.max(1, bh0 - 2 * iy);
      const cd = c.getContext('2d', { willReadFrequently: true }).getImageData(cx0, cy0, cw, ch).data;
      let gx0 = cw, gy0 = ch, gx1 = -1, gy1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const k = (y * cw + x) * 4; if (cd[k] * 0.3 + cd[k + 1] * 0.59 + cd[k + 2] * 0.11 < 170) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y; } }
      const q = document.createElement('canvas'); q.width = 24; q.height = 16;
      const qg = q.getContext('2d', { willReadFrequently: true });
      qg.fillStyle = '#fff'; qg.fillRect(0, 0, 24, 16);
      if (gx1 >= gx0) qg.drawImage(c, cx0 + gx0, cy0 + gy0, gx1 - gx0 + 1, gy1 - gy0 + 1, 0, 0, 24, 16);
      const qd = qg.getImageData(0, 0, 24, 16).data, sig = [];
      for (let k = 0; k < qd.length; k += 4) sig.push(qd[k] * 0.3 + qd[k + 1] * 0.59 + qd[k + 2] * 0.11 < 190 ? 1 : 0);
      const ar = bw0 / Math.max(1, bh0);
      const same = G => {
        if (Math.abs(G.ar - ar) / ar > 0.15) return false;
        let u = 0, x = 0;
        for (let k = 0; k < sig.length; k++) { if (sig[k] || G.sig[k]) u++; if (sig[k] !== G.sig[k]) x++; }
        return u > 0 && x / u < 0.27; // 같은 글자(B·B)는 0.1~0.26, 비슷한 다른 글자(A1·A2)는 0.29쯤이었어요
      };
      let g = groups.findIndex(same);
      if (g < 0) { groups.push({ sig, ar, name: soReadBox(hi || c, hi ? { px0: b.px0 * hk, py0: b.py0 * hk, px1: b.px1 * hk, py1: b.py1 * hk } : b) }); g = groups.length - 1; } // 처음 보는 모양이면 글자를 읽어 봐요
      secs.push({ name: groups[g].name || '', g, read: !!groups[g].name, p: i, y: b.py0 / H, x: b.px0 / W, w: (b.px1 - b.px0) / W, h: (b.py1 - b.py0) / H, si: b.si, img: t.toDataURL('image/png') });
    });
    r.marks.forEach(m => marks.push({ type: m.type, p: i, si: m.si, x: m.x, y: (r.staves[m.si].L[2]) / H }));
  }
  // 이름 없는 상자는 모양(묶음)마다 ①②③… (나중에 이름을 적으면 바뀌어요)
  // 글자를 못 읽은 상자 묶음에는 숫자 대신 새 문자(X, Y, Z …)를 붙여요 — 악보에 이미 있는 이름과 겹치지 않게.
  // 이 문자는 악보에 없는 것이라, 악보 위에 그 부분이 어디인지 따로 표시해요(stgOrdWrite의 이름표)
  const used = new Set(secs.filter(x => x.read).map(x => x.name.toUpperCase()));
  const newOf = {}; let ni = 0;
  secs.forEach(x => {
    if (x.read) return;
    if (newOf[x.g] == null) { while (ni < SO_NEW.length && used.has(SO_NEW[ni])) ni++; newOf[x.g] = SO_NEW[ni++] || '?'; }
    x.name = newOf[x.g]; x.auto = true;
  });
  return { secs, marks, order: soBuildOrder(secs, marks) };
}
// 못 읽은 부분에 붙이는 새 문자 (악보에 흔한 A·B·C·D·E와 V(Verse)·I(Intro)는 피해서)
const SO_NEW = ['X', 'Y', 'Z', 'W', 'Q', 'R', 'S', 'T', 'U', 'K', 'L', 'M', 'N', 'P', 'J', 'H', 'G', 'F', '★', '◆', '▲', '■', '●', '♣', '♠', '♥'];
// 자리 → 읽는 순서 값 (쪽 → 줄 → 왼쪽부터)
const soPos = o => o.p * 100000 + (o.si || 0) * 100 + o.x * 99;
// 구간 목록 + 도돌이표 → 연주 순서 (구간 번호 목록)
function soBuildOrder(secs, marks) {
  const S = secs.map((s, k) => ({ k, pos: soPos(s) })).sort((a, b) => a.pos - b.pos);
  if (!S.length) return [];
  const M = marks.map(m => ({ type: m.type, pos: soPos(m) })).sort((a, b) => a.pos - b.pos);
  const reps = [], twice = new Set();
  let start = -Infinity;
  M.forEach(m => {
    if (m.type === 'start') { start = m.pos; return; }
    // 도돌이 끝: 시작 표시(없으면 지난 도돌이 끝, 그것도 없으면 처음)부터 여기까지 다시
    const inside = S.filter(s => s.pos >= start - 6 && s.pos < m.pos).map(s => s.k);
    if (inside.length) reps.push(inside);
    else { const host = S.filter(s => s.pos < m.pos).pop(); if (host) twice.add(host.k); }
    start = m.pos;
  });
  const out = [];
  S.forEach(s => {
    out.push(s.k);
    if (twice.has(s.k)) out.push(s.k);
    reps.filter(r => r[r.length - 1] === s.k).forEach(r => out.push(...r));
  });
  return out;
}

// ───────── Claude로 읽기 (Claude 화면에서만) ─────────
let SO_SAMPLE;
async function soSample() {
  if (SO_SAMPLE !== undefined) return SO_SAMPLE;
  SO_SAMPLE = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const s = await window.claude.use('sample');
      const lim = s ? await s.limits().catch(() => null) : null;
      if (s && lim && lim.images) SO_SAMPLE = { fn: s, max: lim.images.maxCount };
    }
  } catch (e) { SO_SAMPLE = null; }
  return SO_SAMPLE;
}
async function soAskClaude(doc, title, onStep) {
  const S = await soSample(); if (!S) throw { code: 'unavailable' };
  const n = Math.min(doc.pages.length, S.max, 8), imgs = [];
  for (let i = 0; i < n; i++) {
    if (onStep) onStep(i, n);
    const c = document.createElement('canvas');
    await doc.draw(i, c, 1500 / Math.min(2.5, window.devicePixelRatio || 1));
    imgs.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)));
  }
  const prompt = `The ${n} attached image(s) are pages 1-${n} of the sheet music for one song${title ? ` ("${String(title).slice(0, 80)}")` : ''}, in page order.
Work out the PERFORMANCE ORDER: the order in which the sections are actually played, by following the printed navigation:
section labels (e.g. Intro, In, Verse, V1, A, A1, B, Pre-Chorus, Chorus, Cho, Bridge, Inter, Interlude, Outro, Ending, Coda, Tag, 전주, 1절, 2절, 후렴, 간주, 브릿지, 후주),
repeat barlines, 1st/2nd endings, "x2"/"×2" marks, D.S., D.C., Segno, To Coda, Coda and Fine.
Use each section name exactly as printed. If some music before the first label has no name, call it "Intro".
Reply with ONLY one JSON object, no other text:
{"order":["Intro","A1","A1","B"],"sections":[{"name":"A1","page":1,"y":0.55}],"written":"","note":""}
- "order": the section names in playing order (a name may repeat).
- "sections": every distinct labelled section once, where it starts: page number (1-based) and y from 0 (top of page) to 1 (bottom).
- "written": if an order is already written on the page by hand or typed (e.g. "In - A1 - A1"), copy it exactly; otherwise "".
- "note": one short sentence in Korean about anything you were unsure of, or "".`;
  const r = await S.fn.json(prompt, { images: imgs, modelTier: 'default' });
  const secs = (Array.isArray(r && r.sections) ? r.sections : []).slice(0, 60).map(s => ({ name: String((s && s.name) || '').trim().slice(0, 24), p: Math.max(0, Math.min(n - 1, Math.round(Number(s && s.page) || 1) - 1)), y: Math.max(0, Math.min(1, Number(s && s.y) || 0)), x: 0.05 })).filter(s => s.name);
  const order = (Array.isArray(r && r.order) ? r.order : []).slice(0, 80).map(t => String(t || '').trim().slice(0, 24)).filter(Boolean);
  return { secs, order, written: String((r && r.written) || '').slice(0, 120), note: String((r && r.note) || '').slice(0, 200) };
}
const soErrText = e => {
  const c = e && e.code;
  if (c === 'unavailable' || c === 'not_granted' || c === 'sampling_disabled' || c === 'images_unavailable') return 'Claude로 읽기를 쓸 수 없어요. “기기에서 찾기”를 써 주세요.';
  if (c === 'rate_limited') return '지금은 Claude를 너무 많이 불렀어요. 조금 뒤에 다시 해 주세요.';
  if (c === 'cancelled') return '그만뒀어요.';
  if (c === 'invalid_json' || c === 'empty_completion') return 'Claude의 답을 읽지 못했어요. 한 번 더 눌러 주세요.';
  return '악보를 읽지 못했어요. 잠시 뒤에 다시 해 주세요.';
};

// ───────── 악보 위에 쓸 짧은 이름 ─────────
// 손으로 쓰듯 앞부분만: Intro → In, Interlude → Int, Chorus 2 → Cho2 … (이 표에 없는 긴 이름은 앞 세 글자)
const SO_SHORT = { intro: 'In', interlude: 'Int', inter: 'Int', chorus: 'Cho', 'pre-chorus': 'Pre', prechorus: 'Pre', 'pre chorus': 'Pre', verse: 'V', bridge: 'Br', outro: 'Out', ending: 'End', break: 'Brk', solo: 'Solo', coda: 'Coda', tag: 'Tag', 전주: '전주', 간주: '간주', 후주: '후주', 후렴: '후렴', 브릿지: '브릿지' };
function soShort(name) {
  const t = String(name || '').trim();
  const m = t.match(/^(.*?)[\s.]*(\d+)$/); // 끝 숫자는 살려요 (Verse 2 → V2)
  const base = (m ? m[1] : t).trim(), num = m ? m[2] : '';
  if (!base) return t;
  const hit = SO_SHORT[base.toLowerCase()];
  if (hit) return hit + num;
  if (/^[A-Za-z]/.test(base) && base.length > 4) return base.slice(0, 3) + num;
  if (/^[가-힣]/.test(base) && base.length > 3) return base.slice(0, 2) + num;
  return base + num;
}
const soUnnamed = t => /^[①-⑳]$|^\(\d+\)$/.test(String(t || '')); // 예전에 저장한 ①②③ 이름

// ───────── 반복 묶어 쓰기 ─────────
// 같은 칸(또는 같은 칸 묶음)이 연달아 나오면 묶어서 짧게: A1 - A1 → A1 x2, Int - B - Int - B → (Int - B) x2
// keys: 칸마다 비교할 이름. 돌려주는 조각: {type:'item', j(칸 번호), ks(이 조각이 맡는 칸들)} · {type:'open'} · {type:'close'} · {type:'rep', n, ks}
function soCompress(keys) {
  const out = [], n = keys.length;
  let i = 0;
  while (i < n) {
    let best = { L: 1, k: 1, save: 0 };
    for (let L = 1; L <= Math.floor((n - i) / 2); L++) {
      let k = 1;
      while (i + (k + 1) * L <= n && keys.slice(i + k * L, i + (k + 1) * L).every((v, m) => v === keys[i + m])) k++;
      const save = (k - 1) * L;
      if (save > best.save) best = { L, k, save };
    }
    const { L, k } = best;
    const ksOf = m => Array.from({ length: k }, (_, r) => i + m + r * L);
    if (k > 1 && L > 1) out.push({ type: 'open' });
    for (let m = 0; m < L; m++) out.push({ type: 'item', j: i + m, ks: ksOf(m) });
    if (k > 1 && L > 1) out.push({ type: 'close' });
    if (k > 1) out.push({ type: 'rep', n: k, ks: Array.from({ length: (k - 1) * L }, (_, r) => i + L + r) }); // 두 번째부터 하는 동안 x2도 색이 바뀌어요
    i += L * k;
  }
  return out;
}

// ───────── 순서를 한 줄 글로 쓰고 읽기 ─────────
// 우리 팀이 손으로 쓰던 그대로: In · (V · C1 · C2)x2 · Int · C1 · C2 · Out
// 괄호 ( ) [ ] 묶음 뒤 x2 · ×2 · *2 · 2x · 2번, 이름 바로 뒤 x2(Cx2)도 알아들어요. 이음표는 · . - , → > / | 띄어쓰기 아무거나.
function soParseOrder(txt) {
  const s = String(txt || '').replace(/[×✕✖＊*]/g, 'x').replace(/[（［｛]/g, '(').replace(/[）］｝]/g, ')').replace(/pre[\s-]*chorus/gi, 'PreChorus').slice(0, 600);
  let i = 0;
  const rep = () => { // 묶음·이름 뒤의 반복 수
    const m = s.slice(i).match(/^\s*(?:x\s*(\d+)|(\d+)\s*(?:x|번|회)(?![a-z가-힣]))/i);
    if (!m) return 1;
    i += m[0].length;
    return Math.max(1, Math.min(9, +(m[1] || m[2])));
  };
  const nice = t => {
    if (/^prechorus$/i.test(t)) return 'Pre-Chorus';
    return /^[a-z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t;
  };
  const seq = depth => {
    const out = [];
    while (i < s.length) {
      const c = s[i];
      if (c === '(' || c === '[' || c === '{') { i++; const inner = seq(depth + 1); const n = rep(); for (let k = 0; k < n; k++) out.push(...inner); continue; }
      if (c === ')' || c === ']' || c === '}') { i++; if (depth) return out; continue; }
      const m = s.slice(i).match(/^(?:[0-9]+절|[A-Za-z가-힣][A-Za-z가-힣0-9'’#♯♭]*)/);
      if (!m) { i++; continue; }
      i += m[0].length;
      let t = m[0], n = 1;
      const xm = t.match(/^(.*[^xX])[xX](\d)$/); // Cx2 → C 두 번
      if (xm && !/^[0-9]/.test(xm[1])) { t = xm[1]; n = +xm[2]; }
      if (/^x\d*$/i.test(t)) continue; // 혼자 떨어진 x
      // 띄어 쓴 번호는 이름에 붙여요 (Verse 1 → Verse 1). 뒤에 x가 오면 반복 수예요 (C 2x)
      const num = !/\d$/.test(t) && s.slice(i).match(/^ ?(\d{1,2})(?!\d|\s*(?:x|번|회|절))/i);
      if (num) { t += (t.length > 1 ? ' ' : '') + num[1]; i += num[0].length; }
      n *= rep();
      for (let k = 0; k < Math.min(9, n); k++) out.push(nice(t).slice(0, 24));
    }
    return out;
  };
  return seq(0).slice(0, 200);
}
// 순서 칸 → 한 줄 글 (반복은 묶어서): In · (A1 · B)x2 · Int
function soOrderLine(names) {
  const toks = soCompress(names);
  return soUnits(toks).map(u => {
    const inner = u.items.map(t => names[t.j]).join(' · ');
    return u.n > 1 ? (u.items.length > 1 ? `(${inner})x${u.n}` : `${inner}${inner.length > 3 ? ' ' : ''}x${u.n}`) : inner;
  }).join(' · ');
}
// 적은 이름 → 악보에서 찾은 구간 번호 (못 찾으면 -1). 같은 이름 → 짧은 이름(Intro = In) → 흔한 줄임말(C = Chorus) 순서로 봐요
const SO_ALIAS = { c: 'chorus', cho: 'chorus', v: 'verse', pc: 'pre-chorus', pre: 'pre-chorus', prechorus: 'pre-chorus', br: 'bridge', in: 'intro', int: 'interlude', inter: 'interlude', i: 'interlude', out: 'outro', end: 'ending', o: 'outro' };
function soMatchSec(name, secs) {
  const low = t => String(t || '').trim().toLowerCase().replace(/[\s._]+/g, ''); // Int 2 = Int2, Verse 1 = Verse1
  const split = t => { const m = low(t).match(/^(.*?)(\d*)$/); return { base: m[1], num: m[2] }; };
  const n = low(name);
  let k = secs.findIndex(x => low(x.name) === n);
  if (k < 0) k = secs.findIndex(x => low(soShort(x.name)) === n);
  if (k < 0) {
    const a = split(name), want = SO_ALIAS[a.base] || (Object.values(SO_ALIAS).includes(a.base) ? a.base : '');
    if (want) k = secs.findIndex(x => { const b = split(x.name), bb = SO_ALIAS[b.base] || b.base; return bb === want && (b.num === a.num || (!a.num && b.num === '1')); });
  }
  return k;
}

// 묶음 단위로 바꾸기: [{items:[{j, ks}], n(반복 수, 1이면 그냥 칸), repKs}] — 그리기 좋게
function soUnits(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'open') {
      const items = [];
      while (toks[++k] && toks[k].type === 'item') items.push(toks[k]);
      const r = toks[k + 1] && toks[k + 1].type === 'rep' ? toks[++k] : null;
      out.push({ items, n: r ? r.n : 1, repKs: r ? r.ks : [] });
    } else if (t.type === 'item') {
      const r = toks[k + 1] && toks[k + 1].type === 'rep' ? toks[++k] : null;
      out.push({ items: [t], n: r ? r.n : 1, repKs: r ? r.ks : [] });
    }
  }
  return out;
}

// ───────── 상자 글자 읽기 (기기 안에서) ─────────
// 자주 쓰는 구간 이름을 여러 글꼴로 그려 두고, 상자 안 글자 모양과 가장 닮은 것을 골라요(인터넷·Claude 없이).
// 목록에 없는 이름이나 손글씨는 못 읽어요 → ①②③으로 두고 직접 적어 주세요. 이름을 더하려면 SO_VOCAB에 한 줄.
const SO_VOCAB = ['Intro', 'In', 'Verse', 'V1', 'V2', 'V3', 'Pre-Chorus', 'Pre', 'Chorus', 'Cho', 'Bridge', 'Br', 'Inter', 'Interlude', 'Int', 'Outro', 'Out', 'Ending', 'End', 'Coda', 'Tag', 'Solo', 'Break', 'Vamp', 'Hook', 'Fine',
  'A', 'A1', 'A2', 'A3', 'A4', 'B', 'B1', 'B2', 'B3', 'C', 'C1', 'C2', 'C3', 'D', 'D1', 'D2', 'E',
  '전주', '간주', '후주', '후렴', '1절', '2절', '3절', '브릿지', '엔딩', '섹션', '키업', 'BREAK', 'INTRO', 'VERSE', 'CHORUS', 'BRIDGE', 'OUTRO', 'INTERLUDE', 'ENDING'];
const SO_FONTS = ['bold 60px Arial, Helvetica, sans-serif', '60px Arial, Helvetica, sans-serif', 'bold 60px "Times New Roman", Times, serif', 'bold 60px "IBM Plex Sans KR", "Noto Sans KR", sans-serif'];
const SO_GW = 48, SO_GH = 16;
// 글자 그림 → 잉크 테두리에 맞춰 48×16 흑백 점 + 가로세로 비율
function soGlyph(src, sx, sy, sw, sh) {
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(sx, sy, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const k = (y * sw + x) * 4; if (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11 < 170) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < x0 || y1 - y0 < 3) return null;
  const q = document.createElement('canvas'); q.width = SO_GW; q.height = SO_GH;
  const g = q.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, SO_GW, SO_GH);
  g.drawImage(src, sx + x0, sy + y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, SO_GW, SO_GH);
  const qd = g.getImageData(0, 0, SO_GW, SO_GH).data, bits = new Uint8Array(SO_GW * SO_GH);
  for (let k = 0; k < bits.length; k++) bits[k] = qd[k * 4] * 0.3 + qd[k * 4 + 1] * 0.59 + qd[k * 4 + 2] * 0.11 < 190 ? 1 : 0;
  return { bits, ar: (x1 - x0 + 1) / (y1 - y0 + 1) };
}
let SO_TPL = null;
function soTemplates() {
  if (SO_TPL) return SO_TPL;
  SO_TPL = [];
  const c = document.createElement('canvas'); c.width = 900; c.height = 100;
  const g = c.getContext('2d', { willReadFrequently: true });
  SO_VOCAB.forEach(name => SO_FONTS.forEach(font => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000'; g.font = font; g.textBaseline = 'middle'; g.fillText(name, 10, 50);
    const gl = soGlyph(c, 0, 0, c.width, c.height);
    if (gl) SO_TPL.push({ name, bits: gl.bits, ar: gl.ar });
  }));
  return SO_TPL;
}
// 글자 하나씩 읽기용: 영문·숫자를 여러 글꼴로 그려 둔 것 (글자 높이 비율도 같이)
const SO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let SO_CTPL = null;
function soCharTemplates() {
  if (SO_CTPL) return SO_CTPL;
  SO_CTPL = [];
  const c = document.createElement('canvas'); c.width = 120; c.height = 120;
  const g = c.getContext('2d', { willReadFrequently: true });
  SO_FONTS.forEach(font => {
    // 이 글꼴의 대문자 높이 (글자 높이 비율의 기준)
    g.fillStyle = '#fff'; g.fillRect(0, 0, 120, 120); g.fillStyle = '#000'; g.font = font; g.textBaseline = 'alphabetic'; g.fillText('H', 20, 90);
    const capH = (soBox(c) || { h: 43 }).h;
    [...SO_CHARS].forEach(ch => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 120, 120); g.fillStyle = '#000'; g.fillText(ch, 20, 90);
      const bb = soBox(c); if (!bb) return;
      SO_CTPL.push({ ch, bits: soNorm(c, bb.x, bb.y, bb.w, bb.h), ar: bb.w / bb.h, rh: bb.h / capH, top: (90 - bb.y - bb.h) / capH });
    });
  });
  return SO_CTPL;
}
function soBox(c) {
  const W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const SO_CW = 16, SO_CH = 22;
function soNorm(src, sx, sy, sw, sh) {
  const q = document.createElement('canvas'); q.width = SO_CW; q.height = SO_CH;
  const g = q.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, SO_CW, SO_CH);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, SO_CW, SO_CH);
  const d = g.getImageData(0, 0, SO_CW, SO_CH).data, bits = new Uint8Array(SO_CW * SO_CH);
  for (let k = 0; k < bits.length; k++) bits[k] = d[k * 4] * 0.3 + d[k * 4 + 1] * 0.59 + d[k * 4 + 2] * 0.11 < 170 ? 1 : 0;
  return bits;
}
// 상자 안 글자를 빈 세로줄로 나눠 한 글자씩 맞혀 봐요 → 'A1', 'lntro' 같은 글자 줄
function soReadChars(c, sx, sy, sw, sh) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(sx, sy, sw, sh).data;
  const ink = (x, y) => { const k = (y * sw + x) * 4; return d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11 < 170; };
  const cols = []; for (let x = 0; x < sw; x++) { let n = 0; for (let y = 0; y < sh; y++) if (ink(x, y)) n++; cols.push(n); }
  const pieces = [];
  for (let x = 0; x < sw; x++) if (cols[x]) { const p = pieces[pieces.length - 1]; if (p && x - p.x1 <= 1) p.x1 = x; else pieces.push({ x0: x, x1: x }); }
  if (!pieces.length || pieces.length > 12) return null;
  const vspan = p => { let y0 = sh, y1 = -1; for (let y = 0; y < sh; y++) for (let x = p.x0; x <= p.x1; x++) if (ink(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; } p.y0 = y0; p.y1 = y1; };
  pieces.forEach(vspan);
  // 글자 두 개가 아래쪽에서 붙어 버린 것(A2처럼)은 잉크가 가장 적은 세로줄에서 나눠요
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k], w = p.x1 - p.x0 + 1, h = p.y1 - p.y0 + 1;
    if (w < h * 1.25) continue;
    let mx = -1, mv = Infinity;
    for (let x = p.x0 + Math.round(w * 0.3); x <= p.x1 - Math.round(w * 0.3); x++) if (cols[x] < mv) { mv = cols[x]; mx = x; }
    if (mx < 0 || mv > h * 0.3) continue;
    const a = { x0: p.x0, x1: mx - 1 }, b = { x0: mx + 1, x1: p.x1 };
    vspan(a); vspan(b);
    pieces.splice(k, 1, a, b); k++;
  }
  const capH = Math.max(...pieces.map(p => p.y1 - p.y0 + 1)), base = Math.max(...pieces.map(p => p.y1));
  if (capH < 6) return null;
  const T = soCharTemplates();
  let text = '', worst = 0;
  const out = [];
  for (const p of pieces) {
    const w = p.x1 - p.x0 + 1, h = p.y1 - p.y0 + 1;
    if (h < capH * 0.2) continue; // 점·티끌
    const bits = soNorm(c, sx + p.x0, sy + p.y0, w, h), ar = w / h, rh = h / capH, top = (base - p.y1) / capH;
    let best = null, digit = null;
    T.forEach(t => {
      let u = 0, x = 0;
      for (let k = 0; k < bits.length; k++) { if (bits[k] || t.bits[k]) u++; if (bits[k] !== t.bits[k]) x++; }
      const dd = (u ? x / u : 1) + 0.35 * Math.abs(Math.log(ar / t.ar)) + 0.6 * Math.abs(rh - t.rh) + 0.4 * Math.abs(top - Math.max(0, t.top));
      if (!best || dd < best.d) best = { ch: t.ch, d: dd };
      if (/[0-9]/.test(t.ch) && (!digit || dd < digit.d)) digit = { ch: t.ch, d: dd };
    });
    // 가는 세로 획 하나가 거의 끝까지 내려오면 숫자 1로 봐요 (글꼴마다 1의 모양이 달라서)
    if (ar < 0.6) { let full = 0; for (let x = p.x0; x <= p.x1; x++) { let n = 0; for (let y = p.y0; y <= p.y1; y++) if (ink(x, y)) n++; if (n >= h * 0.85) full++; } if (full >= 1 && (!digit || digit.d > 0.35)) digit = { ch: '1', d: 0.35 }; }
    if (!best) return null;
    out.push({ best, digit });
  }
  // 두 글자이고 앞이 대문자면 뒤는 숫자일 때가 많아요 (A1, B2 …): 뒤 글자는 숫자 중에서 골라요
  // 단, 읽은 그대로 숫자 없는 흔한 이름(In, Br …)이면 그대로 둬요 (In이 I0으로 바뀌지 않게)
  const asRead = out.map(o => o.best.ch).join('');
  if (out.length === 2 && /[A-Z]/.test(out[0].best.ch) && out[1].digit && out[1].digit.d < 0.65 && !/[0-9]/.test(out[1].best.ch) && !SO_VOCAB.some(v => !/[0-9]/.test(v) && soLoose(v) === soLoose(asRead))) out[1].best = out[1].digit;
  out.forEach(o => { text += o.best.ch; worst = Math.max(worst, o.best.d); });
  return text ? { text, worst } : null;
}
// 두 글자 줄이 얼마나 다른지 (편집 거리)
function soEdit(a, b) {
  const m = a.length, n = b.length, D = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return D[m][n];
}
// 비슷하게 생긴 글자는 같은 것으로 보고 비교 (l·I·1, O·0)
const soLoose = t => t.toLowerCase().replace(/[il|]/g, '1').replace(/o/g, '0');
function soReadBox(c, b) {
  try {
    const bw = b.px1 - b.px0, bh = b.py1 - b.py0, m = Math.ceil(bh * 0.18); // 테두리를 피해 안쪽만
    const sx = Math.round(b.px0 + m), sy = Math.round(b.py0 + m), sw = Math.max(2, Math.round(bw - 2 * m)), sh = Math.max(2, Math.round(bh - 2 * m));
    // 1) 한 글자씩 읽기 (A1, B2처럼 숫자가 붙은 이름에 좋아요) → 목록의 이름과 거의 같으면 그 이름으로
    const r = soReadChars(c, sx, sy, sw, sh);
    if (r && r.worst < 0.55) {
      const L = soLoose(r.text);
      const near = SO_VOCAB.filter(v => /^[A-Za-z0-9 .-]+$/.test(v)).map(v => ({ v, e: soEdit(L, soLoose(v)) })).sort((x, y) => x.e - y.e)[0];
      if (near && (near.e === 0 || (near.e === 1 && near.v.length >= 4))) {
        // 대소문자는 상자에 쓰인 대로 (BREAK / Break)
        const same = SO_VOCAB.filter(v => soLoose(v) === soLoose(near.v));
        const up = r.text.replace(/[^A-Za-z]/g, '').length > 1 && r.text.replace(/[^A-Za-z]/g, '') === r.text.replace(/[^A-Za-z]/g, '').toUpperCase();
        return same.find(v => (v === v.toUpperCase()) === up) || near.v;
      }
      if (/^[A-Z][0-9]?$/.test(r.text) && r.worst < 0.62) return r.text; // 한두 글자 이름(A, B3 …)
    }
    // 2) 이름 통째로 맞혀 보기 (한글 이름, 글자가 붙어 있는 이름)
    const gl = soGlyph(c, sx, sy, sw, sh);
    if (!gl) return '';
    let best = null, second = null;
    soTemplates().forEach(t => {
      let u = 0, x = 0;
      for (let k = 0; k < t.bits.length; k++) { if (gl.bits[k] || t.bits[k]) u++; if (gl.bits[k] !== t.bits[k]) x++; }
      const d = (u ? x / u : 1) + 0.5 * Math.abs(Math.log(gl.ar / t.ar));
      if (!best || d < best.d) { if (best && best.name !== t.name) second = best; best = { name: t.name, d }; }
      else if (t.name !== best.name && (!second || d < second.d)) second = { name: t.name, d };
    });
    return best && best.d < 0.5 ? best.name : '';
  } catch (e) { return ''; }
}

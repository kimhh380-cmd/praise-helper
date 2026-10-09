// PDF 악보 고치기: 음표를 흰색으로 가리고(가리기), 새 음표·쉼표를 찍고(음표), 코드 이름을 찍어요(코드).
// 음표는 글꼴 없이 선·면으로 직접 그려서, 화면과 저장한 PDF가 똑같이 나와요.
// 음표를 찍으면 그 자리의 오선 5줄을 찾아 줄·칸에 맞춰 붙이고, 크기도 그 악보의 오선 간격에 맞춰요.

const PN_KINDS = [['w', '온음표'], ['h', '2분음표'], ['q', '4분음표'], ['8', '8분음표'], ['16', '16분음표'], ['r1', '온쉼표'], ['r2', '2분쉼표'], ['r4', '4분쉼표'], ['r8', '8분쉼표'], ['r16', '16분쉼표']];
const PN_ACCS = [['', '없음'], ['#', '♯'], ['b', '♭'], ['n', '♮']];
const PN_STEMS = [['auto', '자동'], ['up', '위'], ['down', '아래']];
const PN = { kind: 'q', dot: false, acc: '', stem: 'auto', chord: '' };

const pnF = v => (Math.round(v * 100) / 100).toString();
// 줄 위치: 0 = 맨 윗줄, 8 = 맨 아랫줄 (반 칸마다 1)
const pnPos = a => (a.top == null ? null : Math.round((a.y - a.top) / (a.sp / 2)));
function pnStemUp(a) { if (a.stem === 'up') return true; if (a.stem === 'down') return false; const p = pnPos(a); return p == null || p >= 4; }

// 모양 목록: [{d: SVG 경로, fill: 1(채우기) | 0(선), w: 선 굵기, eo: 구멍 뚫기}]
function pnShapes(a) {
  const s = a.sp, x = a.x, y = a.y, out = [], k = a.kind;
  const ell = (cx, cy, rx, ry, rot) => {
    const c = Math.cos(rot), sn = Math.sin(rot), d = pnF(rot * 180 / Math.PI);
    const p1 = [cx - rx * c, cy - rx * sn], p2 = [cx + rx * c, cy + rx * sn];
    return `M${pnF(p1[0])} ${pnF(p1[1])} A${pnF(rx)} ${pnF(ry)} ${d} 1 0 ${pnF(p2[0])} ${pnF(p2[1])} A${pnF(rx)} ${pnF(ry)} ${d} 1 0 ${pnF(p1[0])} ${pnF(p1[1])} Z`;
  };
  const rect = (x0, y0, w, h) => `M${pnF(x0)} ${pnF(y0)} h${pnF(w)} v${pnF(h)} h${pnF(-w)} Z`;
  const quad = (x1, y1, x2, y2, t) => `M${pnF(x1)} ${pnF(y1)} L${pnF(x2)} ${pnF(y2)} L${pnF(x2)} ${pnF(y2 + t)} L${pnF(x1)} ${pnF(y1 + t)} Z`;
  const line = (x1, y1, x2, y2, w) => out.push({ d: `M${pnF(x1)} ${pnF(y1)} L${pnF(x2)} ${pnF(y2)}`, fill: 0, w });
  const pos = pnPos(a);
  if (k[0] === 'r') {
    if (k === 'r1') out.push({ d: rect(x - 0.6 * s, y, 1.2 * s, 0.5 * s), fill: 1 });
    else if (k === 'r2') out.push({ d: rect(x - 0.6 * s, y - 0.5 * s, 1.2 * s, 0.5 * s), fill: 1 });
    else if (k === 'r4') out.push({ d: `M${pnF(x - 0.2 * s)} ${pnF(y - 1.5 * s)} L${pnF(x + 0.45 * s)} ${pnF(y - 0.75 * s)} L${pnF(x - 0.25 * s)} ${pnF(y - 0.05 * s)} L${pnF(x + 0.4 * s)} ${pnF(y + 0.6 * s)} Q${pnF(x - 0.55 * s)} ${pnF(y + 0.35 * s)} ${pnF(x + 0.05 * s)} ${pnF(y + 1.35 * s)}`, fill: 0, w: 0.28 * s });
    else {
      const n = k === 'r8' ? 1 : 2;
      line(x + 0.5 * s, y - 0.75 * s, x - 0.05 * s, y + (n === 1 ? 1 : 1.6) * s, 0.13 * s);
      for (let i = 0; i < n; i++) {
        const dx = -0.22 * i * s, dy = 0.75 * i * s;
        out.push({ d: ell(x - 0.25 * s + dx, y - 0.5 * s + dy, 0.24 * s, 0.24 * s, 0), fill: 1 });
        out.push({ d: `M${pnF(x - 0.25 * s + dx)} ${pnF(y - 0.32 * s + dy)} Q${pnF(x + 0.15 * s + dx)} ${pnF(y - 0.18 * s + dy)} ${pnF(x + 0.5 * s - 0.15 * i * s)} ${pnF(y - 0.75 * s + dy)}`, fill: 0, w: 0.11 * s });
      }
    }
    if (a.dot) out.push({ d: ell(x + 1.0 * s, y - 0.3 * s, 0.17 * s, 0.17 * s, 0), fill: 1 });
    return out;
  }
  const rx = k === 'w' ? 0.78 * s : 0.62 * s, ry = 0.44 * s, rot = k === 'w' ? -0.12 : -0.35;
  // 덧줄: 오선 밖이면 짧은 가로줄
  if (pos != null) {
    const lw = rx * 2 + 0.7 * s;
    for (let p = -2; p >= pos; p -= 2) out.push({ d: rect(x - lw / 2, a.top + p * s / 2 - 0.06 * s, lw, 0.12 * s), fill: 1 });
    for (let p = 10; p <= pos; p += 2) out.push({ d: rect(x - lw / 2, a.top + p * s / 2 - 0.06 * s, lw, 0.12 * s), fill: 1 });
  }
  // 머리 (온음표·2분음표는 속이 빈 모양)
  if (k === 'w' || k === 'h') out.push({ d: ell(x, y, rx, ry, rot) + ' ' + ell(x, y, k === 'w' ? rx * 0.42 : rx * 0.66, k === 'w' ? ry * 0.7 : ry * 0.4, k === 'w' ? 1.0 : rot), fill: 1, eo: 1 });
  else out.push({ d: ell(x, y, rx, ry, rot), fill: 1 });
  // 기둥·꼬리
  if (k !== 'w') {
    const up = pnStemUp(a), ex = rx * Math.cos(rot), ey = rx * Math.sin(rot), sw = 0.12 * s, L = 3.4 * s;
    const sx = up ? x + ex - sw / 2 : x - ex + sw / 2, sy = up ? y + ey : y - ey;
    const tip = up ? sy - L : sy + L;
    line(sx, sy, sx, tip, sw);
    const nf = k === '8' ? 1 : k === '16' ? 2 : 0, g = up ? 1 : -1;
    for (let i = 0; i < nf; i++) {
      const y0 = tip + g * i * 0.8 * s;
      out.push({ d: `M${pnF(sx)} ${pnF(y0)} C${pnF(sx + 0.1 * s)} ${pnF(y0 + g * 0.9 * s)} ${pnF(sx + 1.1 * s)} ${pnF(y0 + g * 1.0 * s)} ${pnF(sx + 0.8 * s)} ${pnF(y0 + g * 2.3 * s)}`, fill: 0, w: 0.2 * s });
    }
  }
  // 점: 머리가 줄 위에 있으면 반 칸 위로
  if (a.dot) out.push({ d: ell(x + rx + 0.45 * s, y - (pos != null && pos % 2 === 0 ? 0.5 * s : 0), 0.17 * s, 0.17 * s, 0), fill: 1 });
  // 임시표
  const xa = x - rx - 0.85 * s;
  if (a.acc === '#') {
    line(xa - 0.22 * s, y - 1.3 * s, xa - 0.22 * s, y + 1.45 * s, 0.1 * s);
    line(xa + 0.22 * s, y - 1.45 * s, xa + 0.22 * s, y + 1.3 * s, 0.1 * s);
    out.push({ d: quad(xa - 0.55 * s, y - 0.25 * s, xa + 0.55 * s, y - 0.6 * s, 0.24 * s), fill: 1 });
    out.push({ d: quad(xa - 0.55 * s, y + 0.45 * s, xa + 0.55 * s, y + 0.1 * s, 0.24 * s), fill: 1 });
  } else if (a.acc === 'b') {
    line(xa - 0.3 * s, y - 2.1 * s, xa - 0.3 * s, y + 0.5 * s, 0.11 * s);
    out.push({ d: `M${pnF(xa - 0.3 * s)} ${pnF(y + 0.5 * s)} C${pnF(xa + 0.75 * s)} ${pnF(y - 0.1 * s)} ${pnF(xa + 0.6 * s)} ${pnF(y - 0.95 * s)} ${pnF(xa - 0.3 * s)} ${pnF(y - 0.3 * s)}`, fill: 0, w: 0.17 * s });
  } else if (a.acc === 'n') {
    line(xa - 0.28 * s, y - 1.5 * s, xa - 0.28 * s, y + 0.55 * s, 0.1 * s);
    line(xa + 0.28 * s, y - 0.55 * s, xa + 0.28 * s, y + 1.5 * s, 0.1 * s);
    out.push({ d: quad(xa - 0.28 * s, y - 0.3 * s, xa + 0.28 * s, y - 0.55 * s, 0.22 * s), fill: 1 });
    out.push({ d: quad(xa - 0.28 * s, y + 0.55 * s, xa + 0.28 * s, y + 0.3 * s, 0.22 * s), fill: 1 });
  }
  return out;
}
function pnSvg(a, opacity) {
  return pnShapes(a).map(p => p.fill
    ? `<path d="${p.d}" fill="${a.color}"${p.eo ? ' fill-rule="evenodd"' : ''}${opacity ? ` fill-opacity="${opacity}"` : ''}/>`
    : `<path d="${p.d}" fill="none" stroke="${a.color}" stroke-width="${pnF(p.w)}" stroke-linecap="round" stroke-linejoin="round"${opacity ? ` stroke-opacity="${opacity}"` : ''}/>`).join('');
}
function pnCanvas(ctx, a) {
  pnShapes(a).forEach(p => {
    const path = new Path2D(p.d);
    if (p.fill) { ctx.fillStyle = a.color; ctx.fill(path, p.eo ? 'evenodd' : 'nonzero'); }
    else { ctx.strokeStyle = a.color; ctx.lineWidth = p.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path); }
  });
}
function pnBBox(a) { const s = a.sp; return [a.x - 2.4 * s, a.y - 4.2 * s, 4.6 * s, 8.4 * s]; }
// 도구 막대의 작은 그림
function pnIcon(kind) {
  const a = { kind, x: 14, y: kind[0] === 'r' ? 20 : 24, sp: 6, top: null, color: 'currentColor', stem: 'up' };
  return `<svg viewBox="0 0 28 40" width="22" height="32" aria-hidden="true">${pnSvg(a)}</svg>`;
}

// ───────── 오선 찾기: 누른 자리 둘레에서 가로로 긴 어두운 줄 5개(같은 간격)를 찾아요 ─────────
function pnDetect(page, x, y) {
  const c = $('pdfc' + page), P = PDFE.pages[page];
  if (!c || !c.width || !P) return null;
  const k = c.width / P.w;
  const halfW = Math.round(20 * k), halfH = Math.round(42 * k);
  const x0 = Math.max(0, Math.round(x * k) - halfW), x1 = Math.min(c.width, Math.round(x * k) + halfW);
  const y0 = Math.max(0, Math.round(y * k) - halfH), y1 = Math.min(c.height, Math.round(y * k) + halfH);
  const w = x1 - x0, h = y1 - y0;
  if (w < 10 || h < 10) return null;
  let data;
  try { data = c.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data; } catch (e) { return null; }
  // 줄마다 “회색·검정” 점이 얼마나 많은지 (오선은 연한 회색일 때가 많아요. 빨강 손글씨 같은 색은 빼요)
  const rows = [];
  for (let r = 0; r < h; r++) {
    let n = 0;
    for (let q = 0; q < w; q++) {
      const i = (r * w + q) * 4, R = data[i], G = data[i + 1], B = data[i + 2];
      if ((R + G + B) / 3 < 205 && Math.max(R, G, B) - Math.min(R, G, B) < 70) n++;
    }
    rows.push(n / w);
  }
  // 가로로 길게 이어진 줄 후보 (c = 높이, f = 얼마나 꽉 찼는지)
  const cands = [];
  for (let r = 0; r < h; r++) {
    if (rows[r] < 0.5) continue;
    let e = r, f = 0; while (e + 1 < h && rows[e + 1] >= 0.5) e++;
    for (let q = r; q <= e; q++) f = Math.max(f, rows[q]);
    if (e - r <= 4 * k) cands.push({ c: (y0 + (r + e) / 2) / k, f }); // 너무 두꺼운 것(빔 등)은 빼요
    r = e;
  }
  if (cands.length < 5) return null;
  const nearest = v => cands.reduce((b2, c2) => (Math.abs(c2.c - v) < Math.abs(b2.c - v) ? c2 : b2), cands[0]);
  let best = null;
  // 두 후보 사이를 1~4칸으로 보고 같은 간격의 다섯 줄이 있는지 찾아요 (화면 픽셀 때문에 간격이 조금씩 달라도 돼요)
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) for (let m = 1; m <= 4; m++) {
    const g = (cands[j].c - cands[i].c) / m;
    if (g < 2.5 || g > 16) continue;
    const top = cands[i].c, tol = Math.max(0.8, g * 0.25);
    const ls = [0, 1, 2, 3, 4].map(q => nearest(top + q * g));
    if (ls.some((l, q) => Math.abs(l.c - (top + q * g)) > tol) || new Set(ls).size < 5) continue;
    const sp = (ls[4].c - ls[0].c) / 4;
    if (y < ls[0].c - 6 * sp || y > ls[4].c + 6 * sp) continue;
    const err = ls.reduce((t, l, q) => t + Math.abs(l.c - (ls[0].c + q * sp)), 0) / sp;
    const full = ls.reduce((t, l) => t + l.f, 0) / 5; // 오선은 창 끝까지 꽉 찬 줄
    const score = err * 4 - full * 3 + Math.abs(y - (ls[0].c + 2 * sp)) / sp * 0.15;
    if (!best || score < best.score) best = { top: ls[0].c, sp, score };
  }
  return best;
}
// 찍을 음표 만들기 (오선을 찾으면 줄·칸에 맞춰요)
function pnMake(page, x, y) {
  const st = pnDetect(page, x, y);
  const a = { page, type: 'note', x, y, kind: PN.kind, dot: PN.dot, acc: PN.kind[0] === 'r' ? '' : PN.acc, stem: PN.stem, color: PDFE.color, top: null, sp: PDFE.lastSp || 7 };
  if (st) {
    a.top = st.top; a.sp = st.sp;
    let pos = Math.round((y - st.top) / (st.sp / 2));
    if (PN.kind === 'r1' || PN.kind === 'r2') pos = Math.round(pos / 2) * 2; // 온쉼표·2분쉼표는 줄에
    a.y = st.top + Math.max(-10, Math.min(18, pos)) * st.sp / 2;
  }
  return { a, found: !!st };
}
// 옮긴 음표를 새 자리 오선에 다시 맞춰요
function pnResnap(a) {
  const st = pnDetect(a.page, a.x, a.y);
  if (!st) { a.top = null; return; }
  a.top = st.top; a.sp = st.sp;
  let pos = Math.round((a.y - st.top) / (st.sp / 2));
  if (a.kind === 'r1' || a.kind === 'r2') pos = Math.round(pos / 2) * 2;
  a.y = st.top + Math.max(-10, Math.min(18, pos)) * st.sp / 2;
}
// 코드 이름 글자: Eb → E♭, F# → F♯, m7b5 → m7♭5
const pnChordText = s => String(s || '').trim().replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭').replace(/b(?=\d)/g, '♭');

// ───────── 가리기: 흰 네모 안에도 오선은 다시 그려요 ─────────
// 가리는 자리의 오선을 찾아 두면(a.top, a.sp) 네모 안에 그 다섯 줄을 다시 그어요
function pnCoverStaff(a) {
  const st = pnDetect(a.page, a.x + a.w / 2, a.y + a.h / 2);
  if (!st) return;
  const bottom = st.top + 4 * st.sp;
  if (bottom < a.y - 1 || st.top > a.y + a.h + 1) return; // 네모와 겹치지 않는 오선
  a.top = st.top; a.sp = st.sp;
}
function pnCoverLines(a) {
  if (a.top == null) return [];
  const out = [];
  for (let q = 0; q < 5; q++) { const y = a.top + q * a.sp; if (y >= a.y - 0.3 && y <= a.y + a.h + 0.3) out.push(y); }
  return out;
}
const PN_STAFF_INK = '#5A5F66', PN_STAFF_W = 0.8;

// ───────── 코드 이름: ♭·♯은 작게 위로 붙여요 ─────────
function pnChordParts(t) { return String(t).split(/([♭♯])/).filter(Boolean).map(x => ({ t: x, acc: x === '♭' || x === '♯' })); }
function pnChordSvg(a) {
  const fs = a.size * 3 + 10;
  const sp = pnChordParts(a.text).map(p => p.acc ? `<tspan font-size="${(fs * 0.72).toFixed(1)}" dy="${(-fs * 0.32).toFixed(1)}" font-family="serif">${p.t}</tspan><tspan dy="${(fs * 0.32).toFixed(1)}"></tspan>` : `<tspan>${escX(p.t)}</tspan>`).join('');
  return `<text x="${a.x}" y="${a.y}" font-size="${fs}" fill="${a.color}" class="pchord">${sp}</text>`;
}
function pnChordCanvas(ctx, a) {
  const fs = a.size * 3 + 10;
  let x = a.x;
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.fillStyle = a.color; ctx.textAlign = 'left';
  pnChordParts(a.text).forEach(p => {
    ctx.font = p.acc ? `bold ${fs * 0.72}px serif` : `bold ${fs}px "IBM Plex Sans KR", sans-serif`;
    const y = p.acc ? a.y - fs * 0.32 : a.y;
    ctx.strokeText(p.t, x, y); ctx.fillText(p.t, x, y);
    x += ctx.measureText(p.t).width;
  });
}

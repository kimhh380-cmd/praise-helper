// PDF·사진 실행 악보의 쪽: 내 악보함(IndexedDB)의 파일을 열어 쪽마다 그리고, 악보 줄(단)을 자동으로 찾아요.
// 구간 네모는 쪽 크기를 1로 본 값(x, y, w, h: 0~1)이라 화면 크기가 달라도 같은 자리에 그려져요.

const PGS = new Map(); // 파일 이름표 → 연 문서 (다시 열지 않게)

// 파일 이름표로 문서 열기: { key, kind, pages:[{w,h}], draw(i, canvas, cssWidth) } 또는 null(이 기기에 파일이 없음)
async function pgOpen(key) {
  if (!key) return null;
  if (PGS.has(key)) return PGS.get(key);
  const rec = await fileGet(key);
  if (!rec) return null;
  const doc = await pgFromRecord(rec);
  PGS.set(key, doc);
  return doc;
}
// 실행 악보의 파일 열기: 이 기기에 같은 파일이 없으면, 이 기기에서 대신 연결해 둔 파일(별칭)로 열어요
// (공유 악보는 멤버마다 파일 이름이 다를 수 있어서, 악보 자체는 바꾸지 않고 이 기기에만 기억해요)
async function pgOpenFor(sheet) {
  const k = sheet && sheet.file && sheet.file.key;
  if (!k) return null;
  const d = await pgOpen(k).catch(() => null);
  if (d) return d;
  const a = (lsGet('mh-filealias', {}) || {})[k];
  return a ? pgOpen(a).catch(() => null) : null;
}
function pgSetAlias(from, to) {
  const a = lsGet('mh-filealias', {}) || {};
  if (!from || from === to) delete a[from]; else a[from] = to;
  lsSet('mh-filealias', a);
}
async function pgFromRecord(rec) {
  if (rec.type === 'pdf') {
    const lib = await pdfLibs();
    const pdf = await lib.getDocument({ data: new Uint8Array(rec.parts[0].buf.slice(0)) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1 }); pages.push({ w: vp.width, h: vp.height }); }
    return {
      key: rec.key, kind: 'pdf', pages,
      async draw(i, canvas, cssW) {
        const page = await pdf.getPage(i + 1), P = pages[i], dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const scale = Math.min(3000 / P.w, (cssW * dpr) / P.w), vp = page.getViewport({ scale });
        const off = document.createElement('canvas');
        off.width = Math.round(vp.width); off.height = Math.round(vp.height);
        const c = off.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, off.width, off.height);
        await page.render({ canvasContext: c, viewport: vp, intent: 'print' }).promise;
        canvas.width = off.width; canvas.height = off.height;
        canvas.getContext('2d').drawImage(off, 0, 0);
      },
      // 쪽의 글자(글자로 된 PDF만): [{s, x, y(글자 바닥), h(글자 크기), w(글자 폭)}] — 쪽 크기 기준(왼쪽 위가 0)
      async text(i) {
        const page = await pdf.getPage(i + 1), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
        return tc.items.filter(t => t.str && t.str.trim()).map(t => { const [x, y] = vp.convertToViewportPoint(t.transform[4], t.transform[5]); return { s: t.str, x, y, h: Math.hypot(t.transform[2], t.transform[3]) || t.height || 0, w: t.width || 0 }; });
      },
    };
  }
  const imgs = [];
  for (const p of rec.parts) {
    const blob = new Blob([p.buf], { type: p.type || 'image/jpeg' });
    let bmp = null;
    try { bmp = await createImageBitmap(blob); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej('img'); im.src = URL.createObjectURL(blob); });
    }
    imgs.push(bmp);
  }
  const pages = imgs.map(b => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight }));
  return {
    key: rec.key, kind: 'img', pages,
    async draw(i, canvas, cssW) {
      const P = pages[i], dpr = Math.min(2.5, window.devicePixelRatio || 1), k = Math.min(1, Math.min(3000, cssW * dpr) / P.w);
      canvas.width = Math.round(P.w * k); canvas.height = Math.round(P.h * k);
      const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(imgs[i], 0, 0, canvas.width, canvas.height);
    },
  };
}

// 쪽들을 화면에 그리기: 쪽마다 캔버스 + 표시용 SVG(구간 네모). 그린 뒤 onPage(i, svg)로 알려 줘요
async function pgRenderInto(box, doc, onPage) {
  const tok = (box._tok = (box._tok || 0) + 1);
  box.innerHTML = doc.pages.map((p, i) => `<div class="rpg" data-p="${i}"><div class="rpgin" style="aspect-ratio:${p.w} / ${p.h}"><canvas></canvas><svg class="rpov" viewBox="0 0 1000 ${Math.round(1000 * p.h / p.w)}" preserveAspectRatio="none" data-p="${i}"></svg></div><div class="pgn">${i + 1} / ${doc.pages.length}</div></div>`).join('');
  box.querySelectorAll('svg.rpov').forEach(svg => onPage && onPage(+svg.dataset.p, svg));
  for (let i = 0; i < doc.pages.length; i++) {
    if (box._tok !== tok) return;
    const w = box.querySelectorAll('.rpg')[i];
    if (!w) return;
    try { await doc.draw(i, w.querySelector('canvas'), w.clientWidth || 600); } catch (e) { console.warn('page', i, e); }
  }
}
// 구간 조각(0~1) → SVG 좌표
const pgRect = (svg, q) => { const H = svg.viewBox.baseVal.height; return { x: q.x * 1000, y: q.y * H, w: q.w * 1000, h: q.h * H }; };

// ───────── 악보 줄(단) 자동으로 찾기 ─────────
// 오선·타브 줄이 모인 단을 찾아 위아래 여백까지 나눠 가져요. 오선이 없는 글 악보면 글 덩어리(문단)로 나눠요.
// th: 이 밝기보다 어두우면 잉크 (회색 오선이 옅은 스캔 악보는 205 정도로 올려요)
async function pgDetect(doc, i, th) {
  const P = doc.pages[i], W = 700, H = Math.max(50, Math.round(W * P.h / P.w));
  const cv = document.createElement('canvas');
  await doc.draw(i, cv, W / Math.min(2.5, window.devicePixelRatio || 1));
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(cv, 0, 0, W, H);
  return pgDetectData(x.getImageData(0, 0, W, H).data, W, H, th);
}
function pgDetectData(px, W, H, th) {
  const ink = new Float32Array(H), T = th || 150;
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let xx = 0, o = y * W * 4; xx < W; xx++, o += 4) if (px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11 < T && (T <= 150 || Math.max(px[o], px[o + 1], px[o + 2]) - Math.min(px[o], px[o + 1], px[o + 2]) < 70)) n++;
    ink[y] = n / W;
  }
  // 긴 가로줄(오선·타브 줄)
  const runs = [];
  for (let y = 0; y < H; y++) if (ink[y] > 0.3) { const r = runs[runs.length - 1]; if (r && y - r.y1 <= 1) r.y1 = y; else runs.push({ y0: y, y1: y }); }
  const mid = r => (r.y0 + r.y1) / 2;
  // 줄 간격이 비슷하게 4개 이상 모이면 보표 하나
  const staves = [];
  if (runs.length >= 4) {
    const gaps = runs.slice(1).map((r, k) => mid(r) - mid(runs[k])).filter(g => g < H * 0.04).sort((a, b) => a - b);
    const sp = gaps.length ? gaps[Math.floor(gaps.length / 2)] : H * 0.012;
    let cur = [runs[0]];
    for (let k = 1; k <= runs.length; k++) {
      const r = runs[k];
      if (r && mid(r) - mid(cur[cur.length - 1]) < sp * 1.6) cur.push(r);
      else { if (cur.length >= 4) staves.push({ y0: cur[0].y0, y1: cur[cur.length - 1].y1 }); if (r) cur = [r]; }
    }
  }
  const inkTop = ink.findIndex(v => v > 0.004), inkBot = H - 1 - [...ink].reverse().findIndex(v => v > 0.004);
  if (inkTop < 0) return [];
  let groups = [];
  if (staves.length) {
    // 보표 사이 간격이 두 종류(단 안 / 단 사이)로 나뉘면 가까운 보표끼리 한 단
    const g = staves.slice(1).map((s, k) => s.y0 - staves[k].y1);
    let th = Infinity;
    if (g.length >= 2) {
      const sg = g.slice().sort((a, b) => a - b);
      let best = 1, at = -1;
      for (let k = 1; k < sg.length; k++) { const ratio = sg[k] / Math.max(1, sg[k - 1]); if (ratio > best) { best = ratio; at = k; } }
      if (best > 1.6) th = (sg[at] + sg[at - 1]) / 2;
      else { const sh = staves.reduce((acc, st) => acc + st.y1 - st.y0, 0) / staves.length; if (sg[Math.floor(sg.length / 2)] > sh * 0.5) th = 0; } // 간격이 모두 비슷하고 넉넉하면 보표마다 한 단
    }
    let cur = { y0: staves[0].y0, y1: staves[0].y1 };
    for (let k = 1; k < staves.length; k++) {
      if (g[k - 1] < th) cur.y1 = staves[k].y1;
      else { groups.push(cur); cur = { y0: staves[k].y0, y1: staves[k].y1 }; }
    }
    groups.push(cur);
    // 단 사이 여백을 반씩 나눠 가져서 코드 이름·가사까지 담아요
    const bounds = groups.map((s, k) => {
      const h = s.y1 - s.y0;
      const top = k === 0 ? Math.max(inkTop, s.y0 - Math.max(h * 0.9, H * 0.02)) : (groups[k - 1].y1 + s.y0) / 2;
      const bot = k === groups.length - 1 ? Math.min(inkBot, s.y1 + Math.max(h * 0.9, H * 0.02)) : (s.y1 + groups[k + 1].y0) / 2;
      return { y0: Math.max(0, top - 2), y1: Math.min(H - 1, bot + 2) };
    });
    groups = bounds;
  } else {
    // 글 악보: 글줄을 모아 문단으로
    const lines = [];
    for (let y = inkTop; y <= inkBot; y++) if (ink[y] > 0.004) { const l = lines[lines.length - 1]; if (l && y - l.y1 <= 2) l.y1 = y; else lines.push({ y0: y, y1: y }); }
    const lg = lines.slice(1).map((l, k) => l.y0 - lines[k].y1).sort((a, b) => a - b);
    const med = lg.length ? lg[Math.floor(lg.length / 2)] : 10;
    let cur = lines[0] ? { y0: lines[0].y0, y1: lines[0].y1 } : null;
    for (let k = 1; k < lines.length; k++) {
      if (lines[k].y0 - cur.y1 > Math.max(med * 1.8, H * 0.015)) { groups.push(cur); cur = { y0: lines[k].y0, y1: lines[k].y1 }; }
      else cur.y1 = lines[k].y1;
    }
    if (cur) groups.push(cur);
    groups = groups.map(gp => ({ y0: Math.max(0, gp.y0 - 4), y1: Math.min(H - 1, gp.y1 + 4) }));
  }
  return groups.filter(gp => gp.y1 - gp.y0 > H * 0.01).map(gp => ({ x: 0.02, y: gp.y0 / H, w: 0.96, h: (gp.y1 - gp.y0) / H }));
}

// 내 악보함의 PDF·사진 파일로 실행 악보 만들기 (단을 자동으로 찾아 구간으로 나눠 둬요)
async function rsSheetFromFile(rec, onProgress) {
  const doc = await pgFromRecord(rec);
  PGS.set(rec.key, doc);
  const s = rsNewSheet({ kind: 'pages', title: rec.title || rec.name.replace(/\.[^.]+$/, ''), text: '', file: { key: rec.key, name: rec.name, size: rec.size, type: rec.type }, pages: doc.pages.map(p => ({ w: p.w, h: p.h })), ranges: [] });
  let k = 0;
  for (let i = 0; i < doc.pages.length && i < 40; i++) {
    if (onProgress) onProgress(i, doc.pages.length);
    let found = [];
    try { found = await pgDetect(doc, i); } catch (e) {}
    found.forEach(q => s.ranges.push({ id: rsId(), name: `${++k}단`, parts: [Object.assign({ p: i }, q)] }));
  }
  return s;
}

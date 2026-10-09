// PDF 악보 탭: PDF 악보를 올려서 형광펜(구간 표시 + rit. 같은 글자), 펜, 글자, 음악 기호를 덧그리고 PDF로 다시 저장해요
// 음표를 알아내는 것은 아니고, 악보 위에 겹쳐 그려요. 음표를 바꾸려면 “가리기”로 덮고 “음표”로 새로 찍어요(pdf-notes.js).

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const PDF_INKS = [['#1B2230', '검정'], ['#D2413A', '빨강'], ['#2F5FBF', '파랑']];
const PDF_STAMPS = ['𝄐', '𝄋', '𝄌', '𝄆', '𝄇', '♯', '♭', '♮', '>', '𝆏', '𝆐𝆏', '𝆐𝆑', '𝆑', ',', '✓', '①', '②', '③', '④'];
const PDF_TOOLS = [['view', '보기·넘기기'], ['cover', '가리기'], ['note', '음표'], ['chord', '코드'], ['range', '구간 형광펜'], ['hl', '형광펜'], ['pen', '펜'], ['text', '글자'], ['stamp', '기호'], ['select', '고르기·옮기기'], ['erase', '지우개']];

const PDFE = { pdf: null, name: '', key: '', pages: [], annos: [], tool: 'range', color: '#FFE14D', size: 3, label: 'rit', stamp: '𝄐', text: '', zoom: 1, sel: null, undo: [], redo: [], drawing: null, drag: null, nextId: 1, renderTok: 0, ro: '', onOpen: null, onChanged: null, part: (() => { try { return localStorage.getItem('mh-pdf-part') || ''; } catch (e) { return ''; } })() };
// 파트 메모: 새로 넣는 표시에 고른 파트를 붙여요 (모두 = 붙이지 않음). 악보 실행에서는 “내 파트” 메모만 보여요
const pdfMk = a => (PDFE.part && typeof TM_PARTS !== 'undefined' && TM_PARTS.some(p => p[0] === PDFE.part) ? Object.assign(a, { part: PDFE.part }) : a);
// 공동 프로젝트에서 지금 표시를 고칠 수 없으면(주최자 잠금 등) PDFE.ro에 까닭이 들어 있어요
function pdfRO() { if (!PDFE.ro) return false; const e = $('pdferr'); if (e) e.textContent = PDFE.ro; return true; }

async function pdfLibs() {
  // 작업용 파일(worker)을 먼저 불러 두면 따로 작업 창을 만들지 않고 이 화면에서 바로 그려요
  await loadScriptOnce(PDFJS_WORKER_URL);
  await loadScriptOnce(PDFJS_URL);
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!lib) throw 'lib';
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return lib;
}

function renderPdfPage() {
  $('p-pdf').innerHTML = `
    <p class="how">받은 PDF 악보나 스캔한 악보를 올리면 그 위에서 고칠 수 있어요. <b>음표 바꾸기</b>: “가리기”로 원래 음표를 흰색으로 덮고, “음표”로 새 음표를 찍으면 오선 줄·칸에 맞춰 붙어요. <b>코드</b>로 코드 이름을, <b>구간 형광펜</b>(rit., Break 같은 글자와 함께)·형광펜·펜·글자·음악 기호도 넣을 수 있어요. 고친 내용은 이 기기에 자동으로 저장되고, “PDF로 저장”으로 고친 그대로 PDF를 만들 수 있어요. 저장한 PDF를 여기서 다시 열면 고친 표시가 그대로 살아 있어서 <b>지우개</b>(누른 채로 쓱 지나가기)로 지우거나 옮길 수 있어요.</p>
    <div id="pdfshare" class="sharebar" hidden></div>
    <div style="margin-top:10px">${filePickHtml('pdff', 'PDF 악보 고르기', 'application/pdf,.pdf')}${pasteBoxHtml('pdfpa')}</div>
    <div class="err" id="pdferr"></div><p class="meta" id="pdfinfo"></p>
    <div class="pdfbar" id="pdfbar" hidden>
      <div class="seg pdftools" id="pdftool"></div>
      <div class="pdfrow" id="pdfopts"></div>
      <div class="pdfrow">
        <button class="btn sec small" id="pdfundo">↶ 되돌리기</button><button class="btn sec small" id="pdfredo">↷ 다시</button>
        <span class="zoomc"><button class="btn sec small" id="pdfzo" aria-label="작게">−</button><output id="pdfzv">100%</output><button class="btn sec small" id="pdfzi" aria-label="크게">+</button></span>
        <button class="btn sec small danger" id="pdfdelsel" hidden>고른 표시 지우기</button>
        <button class="btn sec small danger" id="pdfclear">이 PDF 표시 모두 지우기</button>
        <button class="btn small" id="pdfsave">PDF로 저장</button>
        <button class="btn sec small" id="pdfrun">악보 실행으로 열기</button>
      </div>
    </div>
    <p class="how" id="pdfhow"></p>
    <div id="pdfpages"></div>`;
  onFilePick('pdff', pdfOpen);
  if (!PASTE_TARGETS.some(t => t[0] === 'p-pdf')) onPasteFile('p-pdf', pdfOpen);
  $('pdfundo').onclick = () => pdfHist(PDFE.undo, PDFE.redo);
  $('pdfredo').onclick = () => pdfHist(PDFE.redo, PDFE.undo);
  $('pdfzo').onclick = () => pdfZoom(-1);
  $('pdfzi').onclick = () => pdfZoom(1);
  $('pdfdelsel').onclick = () => { if (PDFE.sel && !pdfRO()) { pdfSnap(); PDFE.annos = PDFE.annos.filter(a => a.id !== PDFE.sel); PDFE.sel = null; pdfChanged(); } };
  $('pdfclear').onclick = () => {
    const b = $('pdfclear');
    if (pdfRO()) return;
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '정말 모두 지울까요? 한 번 더 누르기'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = '이 PDF 표시 모두 지우기'; } }, 3500); return; }
    delete b.dataset.arm; b.textContent = '이 PDF 표시 모두 지우기';
    pdfSnap(); PDFE.annos = []; PDFE.sel = null; pdfChanged();
  };
  $('pdfsave').onclick = pdfExport;
  $('pdfrun').onclick = pdfToStage;
  pdfToolbar();
  if (typeof pdsSync === 'function') pdsSync();
  if (PDFE.pdf) { $('pdfbar').hidden = false; $('pdfinfo').textContent = `${PDFE.name} · ${PDFE.pages.length}쪽`; pdfBuildPages(); }
}

function pdfToolbar() {
  seg($('pdftool'), PDF_TOOLS.map(t => t[1]), PDF_TOOLS.findIndex(t => t[0] === PDFE.tool), i => {
    PDFE.tool = PDF_TOOLS[i][0]; PDFE.sel = null;
    const ink = PDF_INKS.some(c => c[0] === PDFE.color);
    if (['pen', 'text', 'stamp', 'note', 'chord'].includes(PDFE.tool) && !ink) PDFE.color = PDF_INKS[0][0];
    if (['range', 'hl'].includes(PDFE.tool) && ink) PDFE.color = HL_COLORS[0][0];
    pdfToolbar(); pdfDrawAll();
  });
  const t = PDFE.tool, o = [];
  if (!['view', 'select', 'erase'].includes(t) && typeof tmPartOpts === 'function') o.push(`<label class="lb" for="pdfpart">누구 메모</label><select id="pdfpart" title="고른 파트의 사람만 악보 실행에서 이 표시를 봐요">${tmPartOpts(PDFE.part)}</select>`);
  const colors = t === 'view' || t === 'select' || t === 'erase' || t === 'cover' ? null : t === 'note' || t === 'chord' ? PDF_INKS : (t === 'range' || t === 'hl' ? HL_COLORS.concat(PDF_INKS) : PDF_INKS.concat(HL_COLORS));
  if (colors) o.push(`<span class="lb">색</span>${colors.map(([c, n]) => `<button class="cchip${PDFE.color === c ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${n}" title="${n}"></button>`).join('')}`);
  if (['hl', 'pen', 'text', 'stamp', 'chord'].includes(t)) o.push(`<label class="lb" for="pdfsize">크기</label><input type="range" id="pdfsize" min="1" max="8" value="${PDFE.size}">`);
  if (t === 'range') o.push(`<label class="lb" for="pdflabel">표시 글자</label><select id="pdflabel">${Object.entries(MARK_TYPES).map(([k, T]) => `<option value="${k}"${PDFE.label === k ? ' selected' : ''}>${k === 'memo' ? '메모 (아래 글자)' : T.label + ' · ' + T.name.split(' · ')[0]}</option>`).join('')}<option value="none"${PDFE.label === 'none' ? ' selected' : ''}>글자 없이 형광펜만</option></select>`);
  if (t === 'text' || (t === 'range' && PDFE.label === 'memo')) o.push(`<label class="lb" for="pdftext">글자</label><input type="text" id="pdftext" value="${PDFE.text.replace(/"/g, '&quot;')}" placeholder="예: 여기서 숨 쉬기">`);
  if (t === 'note') {
    o.push(`<span class="lb">모양</span>${PN_KINDS.map(([k, n]) => `<button class="stampb pnk${PN.kind === k ? ' on' : ''}" data-k="${k}" aria-label="${n}" title="${n}">${pnIcon(k)}</button>`).join('')}`);
    o.push(`<button class="stampb pnd${PN.dot ? ' on' : ''}" aria-pressed="${PN.dot}" title="점음표">점 ·</button>`);
    o.push(`<span class="lb">임시표</span>${PN_ACCS.map(([v, n]) => `<button class="stampb pna${PN.acc === v ? ' on' : ''}" data-v="${v}">${n}</button>`).join('')}`);
    o.push(`<span class="lb">기둥</span>${PN_STEMS.map(([v, n]) => `<button class="stampb pns${PN.stem === v ? ' on' : ''}" data-v="${v}">${n}</button>`).join('')}`);
  }
  if (t === 'chord') o.push(`<label class="lb" for="pdfchord">코드</label><input type="text" id="pdfchord" value="${escX(PN.chord).replace(/"/g, '&quot;')}" placeholder="예: Eb, Bb/F, Gm7" autocomplete="off" spellcheck="false">`);
  if (t === 'stamp') o.push(`<span class="lb">기호</span>${PDF_STAMPS.map(s => `<button class="stampb${PDFE.stamp === s ? ' on' : ''}" data-s="${s}">${s}</button>`).join('')}`);
  $('pdfopts').innerHTML = o.join('');
  $('pdfopts').classList.toggle('wrap', t === 'note'); // 음표 도구는 고를 것이 많아서 여러 줄로
  $('pdfopts').hidden = !o.length;
  $('pdfopts').querySelectorAll('.cchip').forEach(b => (b.onclick = () => { PDFE.color = b.dataset.c; pdfToolbar(); }));
  $('pdfopts').querySelectorAll('.stampb').forEach(b => (b.onclick = () => { PDFE.stamp = b.dataset.s; pdfToolbar(); }));
  if ($('pdfsize')) $('pdfsize').oninput = e => (PDFE.size = +e.target.value);
  if ($('pdfpart')) $('pdfpart').onchange = e => { PDFE.part = e.target.value; try { localStorage.setItem('mh-pdf-part', PDFE.part); } catch (er) {} pdfDrawAll(); $('pdfinfo').textContent = PDFE.part ? `지금부터 넣는 표시는 ${tmPartName(PDFE.part)} 파트 메모예요. 다른 파트 메모는 흐리게 보여요.` : '지금부터 넣는 표시는 모두가 봐요.'; };
  if ($('pdflabel')) $('pdflabel').onchange = e => { PDFE.label = e.target.value; pdfToolbar(); };
  if ($('pdftext')) $('pdftext').oninput = e => (PDFE.text = e.target.value);
  if ($('pdfchord')) $('pdfchord').oninput = e => (PN.chord = e.target.value);
  $('pdfopts').querySelectorAll('.pnk').forEach(b => (b.onclick = () => { PN.kind = b.dataset.k; pdfToolbar(); }));
  $('pdfopts').querySelectorAll('.pna').forEach(b => (b.onclick = () => { PN.acc = b.dataset.v; pdfToolbar(); }));
  $('pdfopts').querySelectorAll('.pns').forEach(b => (b.onclick = () => { PN.stem = b.dataset.v; pdfToolbar(); }));
  $('pdfopts').querySelectorAll('.pnd').forEach(b => (b.onclick = () => { PN.dot = !PN.dot; pdfToolbar(); }));
  $('pdfhow').textContent = {
    view: '손가락으로 쪽을 넘기며 볼 수 있어요. 고치려면 위에서 도구를 고르세요.',
    cover: '바꿀 음표(또는 지울 부분)를 네모로 끌면 흰색으로 덮여요. 덮은 다음 “음표”로 새 음표를 찍어요.',
    note: '모양을 고르고 악보를 누르면 그 자리 오선에 맞춰 음표가 붙어요. 누른 채로 위아래로 움직이면 줄·칸을 바꿀 수 있고, 손을 떼면 찍혀요.',
    chord: '“코드” 칸에 코드 이름(예: Eb, Bb/F)을 적고 악보에서 넣을 자리를 눌러요. b·#은 ♭·♯로 바뀌어요.',
    range: '표시할 부분을 네모로 끌어 주세요. 형광펜으로 칠해지고 위에 고른 글자(rit., Break 등)가 붙어요.',
    hl: '손가락이나 마우스로 문질러 형광펜을 칠해요.',
    pen: '손가락이나 마우스로 선이나 글씨를 써요.',
    text: '“글자” 칸에 쓴 뒤 악보에서 넣을 자리를 눌러 주세요.',
    stamp: '기호를 고른 뒤 악보에서 넣을 자리를 눌러 주세요.',
    select: '표시를 누르면 골라지고, 끌어서 옮길 수 있어요.',
    erase: '지울 표시를 누르거나, 누른 채로 쓱 지나가면 닿은 표시가 지워져요.',
  }[t];
  const bar = $('pdfdelsel'); if (bar) bar.hidden = !PDFE.sel;
  document.querySelectorAll('#pdfpages .pov').forEach(s => s.classList.toggle('active', t !== 'view'));
}

async function pdfOpen(file) {
  $('pdferr').textContent = ''; $('pdfinfo').textContent = 'PDF를 여는 중…';
  let lib;
  try { lib = await pdfLibs(); } catch (e) { $('pdfinfo').textContent = ''; $('pdferr').textContent = 'PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'; return; }
  // 이 앱에서 “PDF로 저장”한 파일이면: 원래 악보 + 고친 표시로 되돌려서, 저장한 뒤에도 지우고 고칠 수 있게 열어요
  let restored = null;
  try { restored = await pdfUnwrap(file); } catch (e) { restored = null; }
  if (restored) file = restored.file;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-' && !String.fromCharCode(...bytes.subarray(0, 1024)).includes('%PDF-')) throw 'notpdf';
    PDFE.pdf = await lib.getDocument({ data: bytes.slice() }).promise;
    PDFE.name = file.name.replace(/\.pdf$/i, '');
    PDFE.key = 'mh-pdf-' + file.name + '-' + bytes.length;
    PDFE.pages = [];
    for (let i = 1; i <= PDFE.pdf.numPages; i++) { const pg = await PDFE.pdf.getPage(i); const vp = pg.getViewport({ scale: 1 }); PDFE.pages.push({ w: vp.width, h: vp.height }); }
    PDFE.annos = []; PDFE.undo = []; PDFE.redo = []; PDFE.sel = null;
    try { const s = localStorage.getItem(PDFE.key); if (s) PDFE.annos = JSON.parse(s); } catch (e) {}
    if (restored) { PDFE.annos = restored.annos; try { localStorage.setItem(PDFE.key, JSON.stringify(PDFE.annos)); } catch (e) {} }
    PDFE.nextId = Math.max(1, ...PDFE.annos.map(a => a.id + 1));
    $('pdfinfo').textContent = `${PDFE.name} · ${PDFE.pages.length}쪽` + (restored ? ` · 저장한 PDF에서 고친 표시 ${PDFE.annos.length}개를 다시 꺼냈어요. 지우개로 지우거나 옮길 수 있어요` : PDFE.annos.length ? ` · 지난번 표시 ${PDFE.annos.length}개를 불러왔어요` : '');
    // 연 PDF는 내 악보함(이 기기)에도 넣어 둬요
    PDFE.libKey = '';
    try { const k = fileKeyOf([file]); if (!(await fileGet(k))) await fileSaveFrom([file]); PDFE.libKey = k; } catch (e) {}
    $('pdfbar').hidden = false;
    pdfToolbar();
    pdfBuildPages();
    if (PDFE.onOpen) PDFE.onOpen();
  } catch (e) {
    PDFE.pdf = null; $('pdfinfo').textContent = '';
    $('pdferr').textContent = e === 'notpdf' ? 'PDF 파일이 아니에요. 사진으로 찍은 악보는 먼저 PDF로 바꿔 주세요(휴대폰 “스캔” 기능이나 사진 → 인쇄 → PDF로 저장).' : e && e.name === 'PasswordException' ? '암호가 걸린 PDF는 열 수 없어요.' : 'PDF 파일을 열 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.';
  }
}

// 지금 PDF를 “악보 실행”에서 열어요 (표시한 가리기·음표·코드도 함께 보여요)
async function pdfToStage() {
  const rec = PDFE.libKey ? await fileGet(PDFE.libKey) : null;
  if (!rec) { $('pdferr').textContent = '이 PDF를 내 악보함에 저장하지 못해서 악보 실행으로 열 수 없어요.'; return; }
  stgOpenFile(PDFE.libKey);
}

function pdfBuildPages() {
  const box = $('pdfpages');
  box.innerHTML = PDFE.pages.map((p, i) => `<div class="pgw" style="width:${PDFE.zoom * 100}%"><div class="pg" style="aspect-ratio:${p.w} / ${p.h}"><canvas id="pdfc${i}"></canvas><svg class="pov${PDFE.tool !== 'view' ? ' active' : ''}" id="pdfo${i}" data-p="${i}" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="none"></svg></div><div class="pgn">${i + 1} / ${PDFE.pages.length}</div></div>`).join('');
  PDFE.pages.forEach((_, i) => pdfBindOverlay($('pdfo' + i)));
  $('pdfzv').textContent = Math.round(PDFE.zoom * 100) + '%';
  pdfDrawAll();
  pdfRenderCanvases();
}
async function pdfRenderCanvases() {
  const tok = ++PDFE.renderTok, dpr = Math.min(2.5, window.devicePixelRatio || 1);
  for (let i = 0; i < PDFE.pages.length; i++) {
    if (tok !== PDFE.renderTok) return;
    const c = $('pdfc' + i); if (!c) return;
    const cssW = c.parentElement.clientWidth || 600;
    const page = await PDFE.pdf.getPage(i + 1);
    const scale = Math.min(3200 / PDFE.pages[i].w, (cssW * dpr) / PDFE.pages[i].w);
    const vp = page.getViewport({ scale });
    const off = document.createElement('canvas');
    off.width = Math.round(vp.width); off.height = Math.round(vp.height);
    const octx = off.getContext('2d'); octx.fillStyle = '#fff'; octx.fillRect(0, 0, off.width, off.height);
    // 'print' 방식은 화면이 가려져 있어도 멈추지 않고 끝까지 그려요
    await page.render({ canvasContext: octx, viewport: vp, intent: 'print' }).promise;
    if (tok !== PDFE.renderTok || !c.isConnected) return;
    c.width = off.width; c.height = off.height;
    c.getContext('2d').drawImage(off, 0, 0);
  }
}
function pdfZoom(d) {
  const z = [0.75, 1, 1.25, 1.5, 2, 2.5], i = z.findIndex(v => v >= PDFE.zoom - 1e-6);
  PDFE.zoom = z[Math.max(0, Math.min(z.length - 1, i + d))];
  pdfBuildPages();
}

// ───────── 표시 그리기 ─────────
const pathOf = pts => pts.length ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') : '';
const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function pdfLabelOf(a) { if (a.label === 'none') return ''; if (a.label === 'memo') return a.text || ''; return (MARK_TYPES[a.label] || {}).label || ''; }
function pdfAnnoSvg(a, sel) {
  let s = '';
  if (a.type === 'range') {
    s += `<rect class="hit2" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="3" fill="${a.color}" fill-opacity="0.35"/>`;
    const lab = pdfLabelOf(a);
    if (lab) {
      const fs = Math.max(9, Math.min(16, a.h * 0.5 + 6));
      s += `<text class="plab${a.label === 'ferm' ? ' mf' : ''}" x="${a.x + 2}" y="${a.y - 3}" font-size="${fs}">${escX(lab)}</text>`;
      const T = MARK_TYPES[a.label];
      const lw = lab.length * fs * 0.55 + 6;
      if (T && T.line && a.w > lw + 10) s += `<line x1="${a.x + lw}" y1="${a.y - 3 - fs * 0.3}" x2="${a.x + a.w}" y2="${a.y - 3 - fs * 0.3}" stroke="#1B2230" stroke-width="0.9" stroke-dasharray="4 3"/>`;
      if (T && T.hair && a.w > lw + 14) { const x1 = a.x + lw, x2 = a.x + a.w, y = a.y - 3 - fs * 0.3, o = T.hair > 0; s += `<path d="M${o ? x2 : x1} ${y - 4} L${o ? x1 : x2} ${y} L${o ? x2 : x1} ${y + 4}" fill="none" stroke="#1B2230" stroke-width="0.9"/>`; }
    }
  } else if (a.type === 'hl' || a.type === 'pen') {
    const w = a.type === 'hl' ? a.size * 4 + 4 : a.size * 0.7 + 0.5;
    s += `<path class="hit2" d="${pathOf(a.pts)}" stroke-width="${w + 10}"/><path d="${pathOf(a.pts)}" fill="none" stroke="${a.color}" stroke-opacity="${a.type === 'hl' ? 0.4 : 1}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (a.type === 'text') {
    const fs = a.size * 3 + 8;
    s += `<text x="${a.x}" y="${a.y}" font-size="${fs}" fill="${a.color}" class="ptxt">${escX(a.text)}</text><rect class="hit2" x="${a.x - 2}" y="${a.y - fs}" width="${a.text.length * fs * 0.62 + 4}" height="${fs + 4}"/>`;
  } else if (a.type === 'cover') {
    s += `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#fff"/>` + pnCoverLines(a).map(y => `<line x1="${a.x}" y1="${y}" x2="${a.x + a.w}" y2="${y}" stroke="${PN_STAFF_INK}" stroke-width="${PN_STAFF_W}"/>`).join('') + `<rect class="hit2" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/>`;
  } else if (a.type === 'note') {
    const [bx, by, bw, bh] = pnBBox(a);
    s += pnSvg(a, a.ghost ? 0.45 : 0) + `<rect class="hit2" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
  } else if (a.type === 'chord') {
    const fs = a.size * 3 + 10;
    s += pnChordSvg(a) + `<rect class="hit2" x="${a.x - 2}" y="${a.y - fs}" width="${a.text.length * fs * 0.62 + 4}" height="${fs + 4}"/>`;
  } else if (a.type === 'otag') { // 순서에 쓴 새 이름이 가리키는 부분 (빨간 이름표)
    const [bx, by, bw, bh] = pdfBBox(a);
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${a.fs * 0.25}" fill="#fff" stroke="${a.color}" stroke-width="${a.fs * 0.12}"/><text x="${a.x}" y="${a.y}" font-size="${a.fs}" fill="${a.color}" class="ptxt">${escX(a.text)}</text><rect class="hit2" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
  } else if (a.type === 'order') { // 악보 순서 (악보 실행 → 순서에서 써 넣은 것)
    const [bx, by, bw, bh] = pdfBBox(a);
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${a.fs * 0.3}" fill="#fff" fill-opacity="0.92" stroke="${a.color}" stroke-width="${Math.max(0.8, a.fs * 0.07)}"/>`;
    if (Array.isArray(a.segs)) { // 조각마다: 글자(짧은 이름) 또는 악보에서 뜬 표시 그림. 지금 하는 조각(a.cur)은 다른 색
      a.segs.forEach(g => {
        const y = a.y + g.l * a.fs * 1.3, on = a.cur != null && (Array.isArray(g.ks) ? g.ks.includes(a.cur) : g.k === a.cur && g.k >= 0), col = on ? a.hc || '#1C7ED6' : a.color;
        if (g.box) { s += `<rect x="${a.x + g.x}" y="${y - a.fs * 1.08}" width="${g.w}" height="${a.fs * 1.46}" rx="${a.fs * 0.3}" fill="${a.color}" fill-opacity="0.06" stroke="${a.color}" stroke-width="${a.fs * 0.09}"/>`; return; } // 반복 범위
        if (g.badge) { s += `<rect x="${a.x + g.x}" y="${y - a.fs * 0.86}" width="${g.w}" height="${a.fs * 1.08}" rx="${a.fs * 0.54}" fill="${on ? col : a.color}"/><text x="${a.x + g.x + g.w / 2}" y="${y - a.fs * 0.06}" font-size="${a.fs * 0.82}" fill="#fff" text-anchor="middle" class="ptxt">${escX(g.t)}</text>`; return; } // ×2 딱지
        if (on) s += `<rect x="${a.x + g.x - a.fs * 0.15}" y="${y - a.fs * 0.98}" width="${g.w + a.fs * 0.3}" height="${a.fs * 1.28}" rx="${a.fs * 0.2}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="${a.fs * 0.08}"/>`;
        if (g.img) s += `<image href="${g.img}" x="${a.x + g.x}" y="${y - a.fs * 0.9}" width="${g.w}" height="${a.fs * 1.1}" preserveAspectRatio="none"/>`;
        else s += `<text x="${a.x + g.x}" y="${y}" font-size="${a.fs}" fill="${col}" class="ptxt">${escX(g.t)}</text>`;
      });
    } else {
      const ls = String(a.text).split('\n');
      s += `<text x="${a.x}" y="${a.y}" font-size="${a.fs}" fill="${a.color}" class="ptxt">${ls.map((l, k) => `<tspan x="${a.x}" dy="${k ? a.fs * 1.3 : 0}">${escX(l)}</tspan>`).join('')}</text>`;
    }
    s += `<rect class="hit2" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
  } else if (a.type === 'stamp') {
    const fs = a.size * 4 + 12;
    s += `<text x="${a.x}" y="${a.y}" font-size="${fs}" fill="${a.color}" class="pstamp" text-anchor="middle">${escX(a.text)}</text><rect class="hit2" x="${a.x - fs * 0.5}" y="${a.y - fs * 0.9}" width="${fs}" height="${fs}"/>`;
  }
  return `<g class="an${sel ? ' sel' : ''}" data-id="${a.id}">${s}${sel ? pdfSelBox(a) : ''}</g>`;
}
function pdfBBox(a) {
  if (a.type === 'range') return [a.x, a.y - 16, a.w, a.h + 16];
  if (a.type === 'cover') return [a.x, a.y, a.w, a.h];
  if (a.type === 'note') return pnBBox(a);
  if (a.type === 'otag') return [a.x - a.fs * 0.3, a.y - a.fs * 0.98, (a.w || a.text.length * a.fs * 0.6) + a.fs * 0.6, a.fs * 1.3];
  if (a.type === 'order') { const n = Array.isArray(a.segs) && a.segs.length ? Math.max(...a.segs.map(g => g.l)) + 1 : String(a.text).split('\n').length; return [a.x - a.fs * 0.45, a.y - a.fs * 1.05, (a.w || a.text.length * a.fs * 0.6) + a.fs * 0.9, a.fs * (1.45 + (n - 1) * 1.3)]; }
  if (a.type === 'chord') { const fs = a.size * 3 + 10; return [a.x - 2, a.y - fs, a.text.length * fs * 0.62 + 4, fs + 4]; }
  if (a.pts) { const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]); return [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8]; }
  const fs = a.type === 'stamp' ? a.size * 4 + 12 : a.size * 3 + 8;
  return a.type === 'stamp' ? [a.x - fs / 2, a.y - fs, fs, fs + 4] : [a.x - 2, a.y - fs, a.text.length * fs * 0.62 + 4, fs + 4];
}
function pdfSelBox(a) { const [x, y, w, h] = pdfBBox(a); return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="#2F5FBF" stroke-width="1.2" stroke-dasharray="4 3"/>`; }
function pdfDrawAll() { PDFE.pages.forEach((_, i) => pdfDrawPage(i)); const b = $('pdfdelsel'); if (b) b.hidden = !PDFE.sel; }
function pdfDrawPage(i) {
  const svg = $('pdfo' + i); if (!svg) return;
  // 가리기(흰 네모)를 먼저 그려서, 그 위에 찍은 음표가 가려지지 않게 해요
  const pa = PDFE.annos.filter(a => a.page === i);
  // 파트를 골라 두었으면 다른 파트 메모는 흐리게
  let s = pa.filter(a => a.type === 'cover').concat(pa.filter(a => a.type !== 'cover')).map(a => { const g = pdfAnnoSvg(a, a.id === PDFE.sel); return PDFE.part && a.part && a.part !== PDFE.part ? `<g opacity="0.3">${g}</g>` : g; }).join('');
  const d = PDFE.drawing;
  if (d && d.page === i) {
    if (d.type === 'range') s += `<rect x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}" fill="${PDFE.color}" fill-opacity="0.35" stroke="#2F5FBF" stroke-dasharray="4 3"/>`;
    else if (d.type === 'cover') s += `<rect x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}" fill="#fff" stroke="#2F5FBF" stroke-dasharray="4 3"/>`;
    else if (d.type === 'note') s += pdfAnnoSvg({ ...d.a, id: -1, ghost: 1 }, false);
    else s += pdfAnnoSvg({ ...d, id: -1 }, false);
  }
  const hv = PDFE.hover;
  if (hv && hv.page === i && PDFE.tool === 'note' && !d) s += pdfAnnoSvg({ ...hv.a, id: -2, ghost: 1 }, false);
  svg.innerHTML = s;
}

// ───────── 누르기 ─────────
function pdfPt(svg, ev) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  return [((ev.clientX - r.left) * vb.width) / r.width, ((ev.clientY - r.top) * vb.height) / r.height];
}
function pdfBindOverlay(svg) {
  const page = +svg.dataset.p;
  svg.onpointerdown = ev => {
    const t = PDFE.tool; if (t === 'view' || pdfRO()) return;
    const [x, y] = pdfPt(svg, ev), g = ev.target.closest('g.an'), id = g ? +g.dataset.id : null;
    if (t === 'select') {
      PDFE.sel = id;
      if (id) { const a = PDFE.annos.find(q => q.id === id); PDFE.drag = { id, x, y, orig: JSON.stringify(a), snap: false }; try { svg.setPointerCapture(ev.pointerId); } catch (e) {} }
      pdfDrawAll(); return;
    }
    if (t === 'erase') { // 삼성 노트처럼: 누른 채로 쓱 지나가면 닿은 표시가 다 지워져요
      PDFE.erasing = { snap: false };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      pdfEraseAt(ev); ev.preventDefault(); return;
    }
    if (t === 'note') { // 누르는 동안 미리 보여 주고, 손을 떼면 찍어요
      const m = pnMake(page, x, y);
      PDFE.drawing = { type: 'note', page, a: m.a, found: m.found };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      pdfDrawPage(page); ev.preventDefault(); return;
    }
    if (t === 'text' || t === 'stamp' || t === 'chord') {
      const txt = t === 'text' ? (PDFE.text || '').trim() : t === 'chord' ? pnChordText(PN.chord) : PDFE.stamp;
      if (!txt) { $('pdferr').textContent = t === 'chord' ? '“코드” 칸에 먼저 코드 이름을 적어 주세요.' : '“글자” 칸에 먼저 넣을 글자를 적어 주세요.'; return; }
      $('pdferr').textContent = '';
      pdfSnap(); PDFE.annos.push(pdfMk({ id: PDFE.nextId++, page, type: t, x, y, text: txt, color: PDFE.color, size: PDFE.size })); pdfChanged(); return;
    }
    if (t === 'range' || t === 'cover') PDFE.drawing = { type: t, page, x0: x, y0: y, x1: x, y1: y };
    else PDFE.drawing = { type: t, page, pts: [[x, y]], color: PDFE.color, size: PDFE.size };
    try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
    ev.preventDefault();
  };
  svg.onpointermove = ev => {
    if (PDFE.erasing) { pdfEraseAt(ev); return; }
    const [x, y] = pdfPt(svg, ev);
    // 마우스: 누르기 전에도 음표가 어디 붙을지 미리 보여 줘요
    if (PDFE.tool === 'note' && !PDFE.drawing && ev.pointerType === 'mouse' && !ev.buttons) { PDFE.hover = { page, a: pnMake(page, x, y).a }; pdfDrawPage(page); return; }
    if (PDFE.drag) {
      const a = PDFE.annos.find(q => q.id === PDFE.drag.id); if (!a) return;
      if (!PDFE.drag.snap) { PDFE.undo.push(JSON.stringify(PDFE.annos.map(q => (q.id === a.id ? JSON.parse(PDFE.drag.orig) : q)))); PDFE.redo = []; PDFE.drag.snap = true; }
      const o = JSON.parse(PDFE.drag.orig), dx = x - PDFE.drag.x, dy = y - PDFE.drag.y;
      if (a.pts) a.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]); else { a.x = o.x + dx; a.y = o.y + dy; if (o.top != null) a.top = o.top + dy; }
      pdfDrawPage(page); return;
    }
    const d = PDFE.drawing; if (!d || d.page !== page) return;
    if (d.type === 'note') { const m = pnMake(page, x, y); d.a = m.a; d.found = m.found; pdfDrawPage(page); return; }
    if (d.type === 'range' || d.type === 'cover') { d.x1 = x; d.y1 = y; }
    else { const l = d.pts[d.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > 1.2) d.pts.push([x, y]); }
    pdfDrawPage(page);
  };
  svg.onpointerleave = () => { if (PDFE.hover && PDFE.hover.page === page) { PDFE.hover = null; pdfDrawPage(page); } };
  svg.onpointerup = svg.onpointercancel = () => {
    if (PDFE.erasing) { const e = PDFE.erasing; PDFE.erasing = null; if (e.snap) pdfChanged(); return; }
    if (PDFE.drag) {
      const moved = PDFE.drag.snap, a = PDFE.annos.find(q => q.id === PDFE.drag.id); PDFE.drag = null;
      if (moved && a && a.type === 'note') pnResnap(a); // 옮긴 음표는 새 자리 오선에 다시 맞춰요
      if (moved && a && a.type === 'cover') { a.top = null; pnCoverStaff(a); }
      if (moved) pdfChanged(); return;
    }
    const d = PDFE.drawing; PDFE.drawing = null; if (!d) return;
    if (d.type === 'note') {
      pdfSnap();
      const a = pdfMk(Object.assign({}, d.a, { id: PDFE.nextId++ })); delete a.ghost;
      PDFE.annos.push(a);
      if (d.found) PDFE.lastSp = a.sp;
      $('pdferr').textContent = '';
      $('pdfinfo').textContent = d.found ? '오선 줄·칸에 맞춰 찍었어요. “고르기·옮기기”로 옮기면 다시 맞춰져요.' : '여기서는 오선을 찾지 못해서 누른 자리에 그대로 찍었어요.';
      pdfChanged(); return;
    }
    if (d.type === 'cover') {
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w < 2 || h < 2) { pdfDrawPage(page); return; }
      const cv = pdfMk({ id: PDFE.nextId++, page, type: 'cover', x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h, color: '#FFFFFF', top: null, sp: 0 });
      pnCoverStaff(cv); // 가린 자리에도 오선은 남겨요
      pdfSnap(); PDFE.annos.push(cv);
      pdfChanged(); return;
    }
    if (d.type === 'range') {
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w < 4 || h < 4) { pdfDrawPage(page); return; }
      if (PDFE.label === 'memo' && !(PDFE.text || '').trim()) { $('pdferr').textContent = '메모 표시는 “글자” 칸에 먼저 글자를 적어 주세요.'; pdfDrawPage(page); return; }
      $('pdferr').textContent = '';
      pdfSnap();
      PDFE.annos.push(pdfMk({ id: PDFE.nextId++, page, type: 'range', x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h, color: PDFE.color, label: PDFE.label, text: PDFE.label === 'memo' ? PDFE.text.trim() : '' }));
    } else {
      if (d.pts.length < 2) d.pts.push([d.pts[0][0] + 0.5, d.pts[0][1]]);
      pdfSnap();
      PDFE.annos.push(pdfMk({ id: PDFE.nextId++, page, type: d.type, pts: d.pts, color: d.color, size: d.size }));
    }
    pdfChanged();
  };
}

// 지우개: 손가락(펜) 아래와 둘레의 표시를 찾아 지워요
function pdfEraseAt(ev) {
  const E = PDFE.erasing; if (!E) return;
  const hit = new Set();
  [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]].forEach(([dx, dy]) => {
    document.elementsFromPoint(ev.clientX + dx, ev.clientY + dy).forEach(el => { const g = el.closest && el.closest('#pdfpages g.an'); if (g) hit.add(+g.dataset.id); });
  });
  if (!hit.size) return;
  if (!E.snap) { pdfSnap(); E.snap = true; }
  PDFE.annos = PDFE.annos.filter(a => !hit.has(a.id));
  if (PDFE.sel && hit.has(PDFE.sel)) PDFE.sel = null;
  pdfDrawAll();
}

// ───────── 저장한 PDF를 다시 고칠 수 있게 ─────────
// “PDF로 저장”할 때 원래 악보와 표시 목록을 PDF 안에 첨부 파일로 같이 넣어요(삼성 노트처럼 저장해도 다시 지우고 고칠 수 있게).
// 다른 PDF 앱에서는 고친 그대로 보이고, 이 앱으로 다시 열면 원래 악보 + 표시로 나뉘어 열려요.
const PDF_ORIG = 'mh-original.pdf', PDF_ANNOS = 'mh-annos.json';
// 같은 기기에서는 첨부가 없어도 알아보게: 저장한 파일의 지문 → 원래 파일
function pdfSig(b) {
  let h = 0x811c9dc5;
  const take = (a, z) => { for (let i = a; i < z; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; } };
  take(0, Math.min(b.length, 4096)); take(Math.max(0, b.length - 4096), b.length);
  return 's' + h.toString(36) + '-' + b.length.toString(36);
}
async function pdfUnwrap(file) {
  if (!file || !(/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name))) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lib = await pdfLibs();
  let att = null;
  try { const doc = await lib.getDocument({ data: bytes.slice() }).promise; att = await doc.getAttachments(); doc.destroy(); } catch (e) { att = null; }
  if (att && att[PDF_ORIG] && att[PDF_ANNOS]) {
    let info = {};
    try { info = JSON.parse(new TextDecoder().decode(att[PDF_ANNOS].content)); } catch (e) { info = {}; }
    const name = String(info.name || file.name.replace(/ \(표시\)\.pdf$/i, '.pdf')).slice(0, 120);
    return { file: new File([att[PDF_ORIG].content], name, { type: 'application/pdf' }), annos: pdsClean(info.annos || []) };
  }
  const map = lsGet('mh-pdfsaved', {}) || {}, m = map[pdfSig(bytes)];
  if (m) {
    const rec = await fileGet(m.libKey);
    if (rec && rec.parts && rec.parts[0]) {
      let annos = m.annos || [];
      return { file: new File([rec.parts[0].buf], rec.parts[0].name, { type: 'application/pdf' }), annos: pdsClean(annos) };
    }
  }
  return null;
}
// 그린 쪽들(캔버스)로 PDF 파일 만들기 + 원래 악보·표시 첨부. pages: [{canvas, w, h}]
async function pdfWriteFile(pages, keep) {
  await loadScriptOnce(PDFLIB_URL);
  const out = await PDFLib.PDFDocument.create();
  for (const p of pages) {
    const blob = await new Promise(r => p.canvas.toBlob(r, 'image/jpeg', 0.9));
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    out.addPage([p.w, p.h]).drawImage(img, { x: 0, y: 0, width: p.w, height: p.h });
  }
  let attached = false;
  if (keep && keep.orig && typeof out.attach === 'function') {
    try {
      await out.attach(keep.orig, PDF_ORIG, { mimeType: 'application/pdf', description: '원래 악보 (악보 편집 앱에서 다시 고칠 때 써요)' });
      await out.attach(new TextEncoder().encode(JSON.stringify({ v: 1, name: keep.name, annos: keep.annos })), PDF_ANNOS, { mimeType: 'application/json', description: '고친 표시 목록' });
      attached = true;
    } catch (e) { attached = false; }
  }
  const bytes = await out.save();
  if (keep && keep.libKey) { // 같은 기기에서는 첨부가 없어도 다시 고칠 수 있게 기억해 둬요
    const map = lsGet('mh-pdfsaved', {}) || {};
    map[pdfSig(bytes)] = { libKey: keep.libKey, annos: keep.annos, at: Date.now() };
    const ks = Object.keys(map).sort((a, b) => (map[b].at || 0) - (map[a].at || 0));
    ks.slice(30).forEach(k => delete map[k]);
    lsSet('mh-pdfsaved', map);
  }
  return { bytes, attached };
}

// ───────── 되돌리기·저장 ─────────
function pdfSnap() { PDFE.undo.push(JSON.stringify(PDFE.annos)); if (PDFE.undo.length > 150) PDFE.undo.shift(); PDFE.redo = []; }
function pdfHist(from, to) { if (!from.length || pdfRO()) return; to.push(JSON.stringify(PDFE.annos)); PDFE.annos = JSON.parse(from.pop()); PDFE.sel = null; pdfChanged(); }
function pdfChanged() {
  try { localStorage.setItem(PDFE.key, JSON.stringify(PDFE.annos)); } catch (e) {}
  pdfDrawAll();
  if (PDFE.onChanged) PDFE.onChanged();
}

// 캔버스에 표시 그리기 (PDF 저장용)
// 표시 안의 그림(악보에서 뜬 순서 표시) — 한 번 불러 두고 다시 써요. 저장 전에 pdfImgsReady로 다 불러와요
const PDF_IMGS = new Map();
function pdfImg(url) { let im = PDF_IMGS.get(url); if (!im) { im = new Image(); im.src = url; PDF_IMGS.set(url, im); } return im; }
async function pdfImgsReady(annos) {
  const urls = [];
  (annos || []).forEach(a => (a.segs || []).forEach(g => g.img && urls.push(g.img)));
  await Promise.all(urls.map(u => { const im = pdfImg(u); return im.complete ? null : (im.decode ? im.decode().catch(() => {}) : new Promise(r => { im.onload = im.onerror = r; })); }));
}
function pdfAnnoCanvas(ctx, a, k) {
  ctx.save(); ctx.scale(k, k);
  const trace = pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  if (a.type === 'range') {
    ctx.globalAlpha = 0.35; ctx.fillStyle = a.color; ctx.fillRect(a.x, a.y, a.w, a.h); ctx.globalAlpha = 1;
    const lab = pdfLabelOf(a);
    if (lab) {
      const fs = Math.max(9, Math.min(16, a.h * 0.5 + 6));
      ctx.font = `${a.label === 'ferm' ? '' : 'bold '}${fs}px ${a.label === 'ferm' ? '"Noto Music",' : ''}"IBM Plex Sans KR", sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(lab, a.x + 2, a.y - 3);
      ctx.fillStyle = '#1B2230'; ctx.fillText(lab, a.x + 2, a.y - 3);
      const T = MARK_TYPES[a.label], lw = ctx.measureText(lab).width + 6, y = a.y - 3 - fs * 0.3;
      if (T && T.line && a.w > lw + 10) { ctx.setLineDash([4, 3]); ctx.lineWidth = 0.9; ctx.strokeStyle = '#1B2230'; ctx.beginPath(); ctx.moveTo(a.x + lw, y); ctx.lineTo(a.x + a.w, y); ctx.stroke(); ctx.setLineDash([]); }
      if (T && T.hair && a.w > lw + 14) { const x1 = a.x + lw, x2 = a.x + a.w, o = T.hair > 0; ctx.lineWidth = 0.9; ctx.strokeStyle = '#1B2230'; ctx.beginPath(); ctx.moveTo(o ? x2 : x1, y - 4); ctx.lineTo(o ? x1 : x2, y); ctx.lineTo(o ? x2 : x1, y + 4); ctx.stroke(); }
    }
  } else if (a.type === 'cover') {
    ctx.fillStyle = '#fff'; ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = PN_STAFF_INK; ctx.lineWidth = PN_STAFF_W;
    pnCoverLines(a).forEach(y => { ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); ctx.stroke(); });
  } else if (a.type === 'note') {
    pnCanvas(ctx, a);
  } else if (a.type === 'chord') {
    pnChordCanvas(ctx, a);
  } else if (a.type === 'otag') {
    const [bx, by, bw, bh] = pdfBBox(a);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = a.color; ctx.lineWidth = a.fs * 0.12;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, a.fs * 0.25); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.fillStyle = a.color; ctx.font = `bold ${a.fs}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'left'; ctx.fillText(a.text, a.x, a.y);
  } else if (a.type === 'order') {
    const [bx, by, bw, bh] = pdfBBox(a), r = a.fs * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = a.color; ctx.lineWidth = Math.max(0.8, a.fs * 0.07);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
    ctx.fillStyle = a.color; ctx.font = `bold ${a.fs}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'left';
    if (Array.isArray(a.segs)) a.segs.forEach(g => {
      const y = a.y + g.l * a.fs * 1.3;
      const rr = (x, yy, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, yy, w, h, r); else ctx.rect(x, yy, w, h); };
      if (g.box) { ctx.save(); ctx.strokeStyle = a.color; ctx.lineWidth = a.fs * 0.09; rr(a.x + g.x, y - a.fs * 1.08, g.w, a.fs * 1.46, a.fs * 0.3); ctx.stroke(); ctx.restore(); return; }
      if (g.badge) { ctx.save(); ctx.fillStyle = a.color; rr(a.x + g.x, y - a.fs * 0.86, g.w, a.fs * 1.08, a.fs * 0.54); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `bold ${a.fs * 0.82}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.fillText(g.t, a.x + g.x + g.w / 2, y - a.fs * 0.06); ctx.restore(); return; }
      if (g.img) { const im = pdfImg(g.img); if (im.complete && im.naturalWidth) ctx.drawImage(im, a.x + g.x, y - a.fs * 0.9, g.w, a.fs * 1.1); }
      else ctx.fillText(g.t, a.x + g.x, y);
    });
    else String(a.text).split('\n').forEach((l, k) => ctx.fillText(l, a.x, a.y + k * a.fs * 1.3));
  } else if (a.type === 'hl' || a.type === 'pen') {
    ctx.globalAlpha = a.type === 'hl' ? 0.4 : 1; ctx.strokeStyle = a.color; ctx.lineWidth = a.type === 'hl' ? a.size * 4 + 4 : a.size * 0.7 + 0.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; trace(a.pts); ctx.stroke();
  } else {
    const fs = a.type === 'stamp' ? a.size * 4 + 12 : a.size * 3 + 8;
    ctx.fillStyle = a.color;
    ctx.font = a.type === 'stamp' ? `${fs}px "Noto Music", serif` : `bold ${fs}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = a.type === 'stamp' ? 'center' : 'left';
    ctx.fillText(a.text, a.x, a.y);
  }
  ctx.restore();
}
async function pdfExport() {
  if (!PDFE.pdf) return;
  const info = $('pdfinfo'), btn = $('pdfsave');
  btn.disabled = true;
  try {
    try { await document.fonts.load('20px "Noto Music"'); } catch (e) {}
    await pdfImgsReady(PDFE.annos);
    const pages = [];
    for (let i = 0; i < PDFE.pages.length; i++) {
      info.textContent = `PDF 만드는 중… ${i + 1} / ${PDFE.pages.length}쪽`;
      const page = await PDFE.pdf.getPage(i + 1), P = PDFE.pages[i];
      const k = Math.min(2.6, 2200 / P.w), vp = page.getViewport({ scale: k });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      // 가리기를 먼저 칠하고 그 위에 다른 표시를 그려요 (가린 자리에 찍은 음표가 보이게)
      const pa = PDFE.annos.filter(a => a.page === i);
      pa.filter(a => a.type === 'cover').concat(pa.filter(a => a.type !== 'cover')).forEach(a => pdfAnnoCanvas(ctx, a, c.width / P.w));
      pages.push({ canvas: c, w: P.w, h: P.h });
    }
    const rec = PDFE.libKey ? await fileGet(PDFE.libKey) : null;
    const { bytes, attached } = await pdfWriteFile(pages, { orig: rec && rec.parts[0] ? new Uint8Array(rec.parts[0].buf) : null, name: rec ? rec.parts[0].name : PDFE.name + '.pdf', annos: PDFE.annos, libKey: PDFE.libKey });
    const r = await saveFile(bytes, PDFE.name + ' (표시).pdf', 'application/pdf');
    info.textContent = r === 'saved' ? `“${PDFE.name} (표시).pdf”로 저장했어요. ${attached ? '이 파일을 다시 열면 고친 표시를 지우거나 고칠 수 있어요.' : '이 기기에서 다시 열면 고친 표시를 지우거나 고칠 수 있어요.'}` : r === 'declined' ? '저장을 취소했어요.' : '';
    if (r === 'failed') $('pdferr').textContent = '여기서는 저장하지 못했어요. 브라우저나 설치한 앱에서 해 주세요.';
  } catch (e) {
    info.textContent = '';
    $('pdferr').textContent = e === 'lib' ? 'PDF 저장 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' : 'PDF로 저장하지 못했어요.';
  }
  btn.disabled = false;
}

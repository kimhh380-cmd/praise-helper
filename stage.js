// 악보 실행 (무대 화면): PDF·사진 악보를 바로 열어 넘기며 연주해요.
// 보기: 한 쪽 · 반 쪽 넘김 · 두 쪽 · 이어 보기(자동 스크롤)
// 점프 링크(반복·D.S.), 콘티(세트리스트), 곡마다 빠르기·박자·키, 메트로놈(카운트인·화면 깜빡임),
// 구간 표시(지금 하는 줄: 테두리만 반짝 · 가사만 반짝 · 형광펜), 반주 음원(A-B 반복), 공연 잠금, 밤 모드, 크게 보기, 악보 확대(두 손가락·버튼·여백 자르기), 리더가 넘기면 모두 함께(프로젝트)
// PDF 악보 탭에서 고친 표시(가리기·음표·코드·형광펜 등)도 그대로 보여요.

// 지금 구간 표시 방법
const STG_HLS = [['outline', '테두리'], ['lyrics', '가사·코드 색'], ['fill', '형광펜'], ['off', '끄기']];
// 지금 구간 색 (반짝이지 않고 색만 바뀌어요)
const STG_HLC = [['#E8590C', '주황'], ['#D6336C', '분홍'], ['#1C7ED6', '파랑'], ['#2B8A3E', '초록'], ['#7048E8', '보라']];
const stgHlColor = () => (STG_HLC.some(c => c[0] === STG.hlc) ? STG.hlc : STG_HLC[0][0]);
// “가사·코드 색”의 색: 코드 이름은 파랑, 가사는 빨강
const STG_CHORD_INK = '#1C64F2', STG_LYRIC_INK = '#E03131';
const stgHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const STG_MODES = [['one', '한 쪽'], ['half', '반 쪽 넘김'], ['two', '두 쪽'], ['scroll', '이어 보기']];
const STG = {
  songs: [], sets: [], setId: 'all', idx: 0, play: -1, ordCur: -1, reg: -1, regSel: -1, hl: 'outline', mode: 'one', pos: 0, night: false, lock: false, focus: false, part: '',
  doc: null, docKey: '', annos: [], missing: false, panel: '', link: null, msg: '', flashT: 0,
  metro: { on: false, count: false, sound: true, flash: true, timer: null, next: 0, beat: 0, left: 0 },
  scroll: { on: false, raf: 0, last: 0 },
  audio: { el: null, url: '', key: '', loop: false },
  wake: null, swipe: null,
  // 리더 넘기기 (프로젝트)
  pid: null, unLive: null, live: null, lead: false, follow: true, sid: newSid(), seq: 0, ep: 0, lw: null, lwNext: null,
};

// ───────── 저장 (이 기기) ─────────
function stgLoadData() {
  STG.songs = (lsGet('mh-stage-songs', []) || []).filter(s => s && s.id && s.fileKey);
  STG.sets = (lsGet('mh-stage-sets', []) || []).filter(s => s && s.id && Array.isArray(s.songs));
  const o = lsGet('mh-stage-opts', {}) || {};
  if (STG_MODES.some(m => m[0] === o.mode)) STG.mode = o.mode;
  STG.night = !!o.night;
  STG.hl = STG_HLS.some(h => h[0] === o.hl) ? o.hl : 'outline';
  STG.hlc = STG_HLC.some(c => c[0] === o.hlc) ? o.hlc : STG_HLC[0][0];
  STG.part = typeof TM_PARTS !== 'undefined' && TM_PARTS.some(p => p[0] === o.part) ? o.part : '';
  if (o.setId && (o.setId === 'all' || STG.sets.some(s => s.id === o.setId))) STG.setId = o.setId;
}
const stgSaveSongs = () => lsSet('mh-stage-songs', STG.songs);
const stgSaveSets = () => lsSet('mh-stage-sets', STG.sets);
const stgSaveOpts = () => lsSet('mh-stage-opts', { mode: STG.mode, night: STG.night, setId: STG.setId, hl: STG.hl, hlc: STG.hlc, part: STG.part });
const stgList = () => (STG.setId === 'all' ? STG.songs : ((STG.sets.find(s => s.id === STG.setId) || { songs: [] }).songs.map(id => STG.songs.find(x => x.id === id)).filter(Boolean)));
const stgSong = () => stgList()[STG.idx] || null;
const stgNewSong = (fileKey, title) => ({ id: rsId('g'), title: title || '새 곡', fileKey, bpm: 90, beats: 4, key: '', secs: 240, links: [], audio: null });
function stgSay(t) { STG.msg = t; const m = $('stmsg'); if (m) m.textContent = t; }

// 곡 하나 = 파일 하나, 또는 여러 곡이 든 PDF의 몇 쪽 (song.p0 = 첫 쪽 번호(0부터), song.pn = 쪽 수)
const stgRange = s => (s && s.pn > 0 ? { a: Math.max(0, s.p0 | 0), n: s.pn | 0 } : null);
const stgDocKeyOf = s => (s ? s.fileKey + (stgRange(s) ? `#${s.p0 | 0}+${s.pn | 0}` : '') : '');
const stgSongsForFile = key => STG.songs.filter(x => x.fileKey === key);
// 연 문서에서 이 곡의 쪽만 보이게 (쪽 번호는 곡 안에서 0부터, 파일에서의 자리는 off)
function stgSlice(d, s) {
  const r = stgRange(s);
  if (!d || !r) return d;
  const a = Math.min(r.a, Math.max(0, d.pages.length - 1)), n = Math.max(1, Math.min(r.n, d.pages.length - a));
  return { key: d.key, kind: d.kind, full: d, off: a, pages: d.pages.slice(a, a + n), draw: (i, c, w) => d.draw(i + a, c, w), text: d.text ? i => d.text(i + a) : null };
}
// 파일(내 악보함)로 곡 만들기 — 이미 있으면 그 곡 (여러 곡으로 나눈 파일이면 첫 곡)
function stgSongForFile(rec) {
  let s = STG.songs.find(x => x.fileKey === rec.key && !stgRange(x)) || STG.songs.find(x => x.fileKey === rec.key);
  if (!s) { s = stgNewSong(rec.key, rec.title || rec.name.replace(/\.[^.]+$/, '')); s.fresh = 1; STG.songs.unshift(s); stgSaveSongs(); }
  return s;
}
// 다른 화면(PDF 악보 탭·내 악보함)에서 “악보 실행으로 열기”
async function stgOpenFile(key) {
  const rec = await fileGet(key);
  if (!rec) return;
  if (!STG.songs.length && !STG.sets.length) stgLoadData();
  const s = stgSongForFile(rec);
  // 나눠 둔 곡이면 그 곡이 든 콘티로 열어요
  const set = stgRange(s) ? STG.sets.find(x => x.songs.includes(s.id)) : null;
  STG.setId = set ? set.id : 'all'; STG.pos = 0;
  STG.idx = Math.max(0, stgList().indexOf(s));
  stgSaveOpts();
  openSection('run');
  stgLoadSong(true);
  if (s.fresh && typeof tmSplitAuto === 'function') tmSplitAuto(s);
}

// ───────── 화면 ─────────
function renderStagePage() {
  stgLoadData();
  $('p-run').innerHTML = `
    <div class="sttop" id="sttop">
      <div class="strow">
        <label class="stsel"><span>콘티</span><select id="stset"></select></label>
        <label class="stsel stsong"><span>곡</span><select id="stsong"></select></label>
        <label class="stsel stpart" title="파트 메모는 내 파트 것만 보여요"><span>내 파트</span><select id="stpart">${tmPartOpts(STG.part)}</select></label>
        <button class="btn sec small" id="stmanage">곡·콘티 관리</button>
      </div>
      <div class="strow">
        <div class="seg" id="stmode"></div>
        <span class="stzoom" role="group" aria-label="악보 확대">
          <span class="fw"><button id="stzo" aria-label="작게">−</button><output id="stzv">쪽 맞춤</output><button id="stzi" aria-label="크게">+</button></span>
          <button class="btn sec small" id="stzw">폭 맞춤</button>
          <button class="btn sec small" id="stcropb" aria-pressed="false">여백 자르기</button>
        </span>
        <span class="sttools">
          <button class="btn sec small sttool" data-p="metro" aria-pressed="false">♩ 메트로놈</button>
          <button class="btn sec small sttool" data-p="audio" aria-pressed="false">♫ 반주</button>
          <button class="btn sec small sttool" data-p="order" aria-pressed="false">☰ 순서</button>
          <button class="btn sec small sttool" data-p="reg" aria-pressed="false">▣ 구간 표시</button>
          <button class="btn sec small sttool" data-p="link" aria-pressed="false">↪ 점프 링크</button>
          <button class="btn sec small" id="stnight" aria-pressed="false">밤 모드</button>
          <button class="btn sec small" id="stlockb">🔒 공연 잠금</button>
          <button class="btn small" id="stfocusb">크게 보기</button>
        </span>
      </div>
      <div id="stlive" class="rnlive" hidden></div>
      <div class="stpanel" id="stpanel" hidden></div>
      <p class="meta stmsg" id="stmsg" role="status"></p>
    </div>
    <div class="stordbar" id="stordbar" hidden></div>
    <div class="stv" id="stv" tabindex="-1" aria-label="악보 (오른쪽을 누르면 다음, 왼쪽을 누르면 이전)"></div>
    <div class="stnav" id="stnav">
      <button class="rnb" id="stprev" aria-label="이전">◀</button>
      <div class="rnnow" aria-live="polite"><b id="stnow">—</b><span class="meta" id="stnowm"></span></div>
      <button class="stunlock" id="stunlock" hidden>🔒 길게 눌러 잠금 풀기</button>
      <button class="rnb stsigb" id="stsigb" hidden aria-label="멤버에게 신호 보내기">📣<small>신호</small></button>
      <button class="rnb next" id="stnext" aria-label="다음">다음 ▶</button>
      <button class="btn sec small rnfocusx" id="stfocusx">작게 보기</button>
      <span class="stzoomf" aria-label="악보 확대"><button id="stzof" aria-label="작게">−</button><button id="stzif" aria-label="크게">+</button></span>
    </div>`;
  seg($('stmode'), STG_MODES.map(m => m[1]), STG_MODES.findIndex(m => m[0] === STG.mode), i => stgSetMode(STG_MODES[i][0]));
  $('stset').onchange = e => { STG.setId = e.target.value; STG.idx = 0; STG.pos = 0; stgSaveOpts(); stgLoadSong(true); };
  $('stsong').onchange = e => { if (stgFollowing()) return stgFollowMsg(); STG.idx = +e.target.value; STG.pos = 0; stgLoadSong(true); stgBroadcast(); };
  $('stmanage').onclick = () => stgPanel('manage');
  $('stpart').onchange = e => { STG.part = e.target.value; stgSaveOpts(); stgDraw(); stgSay(STG.part ? `${tmPartName(STG.part)} 파트 메모와 모두에게 쓴 메모만 보여요.` : '모든 파트의 메모를 보여요.'); };
  document.querySelectorAll('.sttool').forEach(b => (b.onclick = () => stgPanel(b.dataset.p)));
  $('stnight').onclick = () => { STG.night = !STG.night; stgSaveOpts(); stgApplyClasses(); };
  $('stlockb').onclick = () => { STG.lock = true; stgPanel(''); stgApplyClasses(); stgSay('공연 잠금을 켰어요. 넘기기만 돼요. 아래 🔒을 길게 누르면 풀려요.'); };
  $('stfocusb').onclick = () => stgFocus(true);
  $('stfocusx').onclick = () => stgFocus(false);
  $('stzo').onclick = $('stzof').onclick = () => stgZoomStep(-1);
  $('stzi').onclick = $('stzif').onclick = () => stgZoomStep(1);
  $('stzw').onclick = () => stgZoomTo(stgZoom() > 1.01 ? 1 : stgWidthZoom());
  $('stcropb').onclick = stgCropToggle;
  stgPinchBind();
  $('stprev').onclick = () => stgStep(-1);
  $('stnext').onclick = () => stgStep(1);
  $('stsigb').onclick = () => tmSigSheet();
  stgUnlockBind();
  stgBindView();
  stgApplyClasses();
  stgSyncProject();
  stgLoadSong(true);
}
function stgShown() { stgApplyClasses(); stgFillPickers(); stgLayout(); }
// 탭을 떠날 때
function stgStop() { stgMetroStop(); stgScrollStop(); if (STG.audio.el) STG.audio.el.pause(); if (STG.focus) stgFocus(false); if (typeof tmSigSheet === 'function') tmSigSheet(false); }

function stgApplyClasses() {
  const b = document.body;
  b.style.setProperty('--sthl', stgHlColor());
  b.classList.toggle('stnight', STG.night);
  b.classList.toggle('stlock', STG.lock);
  b.classList.toggle('stfocus', STG.focus);
  if ($('stnight')) $('stnight').setAttribute('aria-pressed', STG.night);
  if ($('stunlock')) $('stunlock').hidden = !STG.lock;
  document.querySelectorAll('.sttool').forEach(x => x.setAttribute('aria-pressed', STG.panel === x.dataset.p));
}
function stgFocus(on) {
  STG.focus = on; stgApplyClasses();
  stgWake(on);
  setTimeout(stgLayout, 30);
}
async function stgWake(on) {
  if (NATIVE) { try { window.MHNative.keepAwake(!!on); } catch (e) {} return; }
  try {
    if (on && navigator.wakeLock && !STG.wake) STG.wake = await navigator.wakeLock.request('screen');
    if (!on && STG.wake) { STG.wake.release(); STG.wake = null; }
  } catch (e) { STG.wake = null; }
}
function stgUnlockBind() {
  const b = $('stunlock'); let t = null;
  const go = () => { STG.lock = false; stgApplyClasses(); stgSay('공연 잠금을 풀었어요.'); };
  b.onpointerdown = () => { b.classList.add('hold'); t = setTimeout(go, 800); };
  const no = () => { b.classList.remove('hold'); clearTimeout(t); };
  b.onpointerup = no; b.onpointerleave = no; b.onpointercancel = no;
}

function stgFillPickers() {
  const s = $('stset'); if (!s) return;
  s.innerHTML = `<option value="all">모든 곡 (${STG.songs.length})</option>` + STG.sets.map(x => `<option value="${x.id}">${escH(x.name)} (${x.songs.length}곡)</option>`).join('');
  s.value = STG.setId;
  const L = stgList();
  $('stsong').innerHTML = L.length ? L.map((x, i) => `<option value="${i}">${i + 1}. ${escH(x.title)}${x.key ? ' · ' + escH(x.key) : ''}</option>`).join('') : '<option>곡이 없어요</option>';
  $('stsong').value = String(STG.idx);
  $('stsong').disabled = !L.length;
  if (COLLAB.project && collabIn()) stgDrawLive(); // 콘티가 바뀌면 “팀에 보내기” 버튼도 바뀌어요
}

// ───────── 곡 불러오기 · 그리기 ─────────
async function stgLoadSong(reset) {
  stgFillPickers();
  stgScrollStop();
  const song = stgSong();
  STG.missing = false;
  if (!song) { STG.doc = null; STG.docKey = ''; stgDraw(); return; }
  if (reset) { STG.link = null; stgMetroReset(); }
  const dk = stgDocKeyOf(song);
  if (STG.docKey !== dk) {
    STG.doc = null; STG.docKey = dk; stgDraw();
    let d = null;
    try { d = await pgOpen(song.fileKey); } catch (e) { d = null; }
    if (STG.docKey !== dk) return;
    STG.doc = stgSlice(d, song); STG.missing = !d;
    STG.annos = []; STG.annoKey = '';
    if (d && d.kind === 'pdf') {
      const rec = await fileGet(song.fileKey);
      if (STG.docKey !== dk) return;
      if (rec) { STG.annoKey = 'mh-pdf-' + rec.parts[0].name + '-' + rec.parts[0].buf.byteLength; STG.annos = lsGet(STG.annoKey, []) || []; }
    }
  }
  STG.pos = Math.max(0, Math.min(STG.pos, stgMaxPos()));
  if (reset) { STG.regSel = -1; STG.reg = stgRegOn() ? stgRegs().findIndex(r => r.p === stgPage()) : -1; STG.regAt = Date.now(); stgPlayReset(); }
  stgAudioLoad(song);
  if (STG.panel) stgPanel(STG.panel, true);
  stgDraw();
  // 팀에서 받은 콘티의 순서: 이 기기의 악보 위에도 한 번 써 둬요
  if (song.ordPending && STG.doc) { delete song.ordPending; stgSaveSongs(); if (song.order && song.order.items && song.order.items.length) stgOrdWrite(song); }
}
const stgPages = () => (STG.doc ? STG.doc.pages.length : 0);
function stgMaxPos() {
  const n = stgPages(); if (!n) return 0;
  return STG.mode === 'half' ? 2 * (n - 1) : STG.mode === 'scroll' ? 0 : n - 1;
}
// 지금 보이는 쪽 (0부터)
function stgPage() { return STG.mode === 'half' ? Math.floor(STG.pos / 2) : STG.pos; }
function stgSetMode(m) {
  const p = stgPage();
  STG.mode = m; stgSaveOpts();
  STG.pos = m === 'half' ? 2 * p : m === 'scroll' ? 0 : p;
  stgScrollStop();
  stgDraw();
  if (m === 'scroll') setTimeout(() => stgScrollToPage(p, false), 60);
}
// 보이는 크기: 화면에 쪽 전체가 들어오게
function stgArea() {
  const v = $('stv'); if (!v) return { W: 600, H: 800 };
  const top = v.getBoundingClientRect().top, nav = $('stnav') ? $('stnav').offsetHeight : 80;
  const W = Math.max(240, v.clientWidth), H = Math.max(260, window.innerHeight - Math.max(0, top) - nav - 18);
  return { W, H: STG.focus ? Math.max(260, window.innerHeight - nav - 12) : H };
}
// w = 화면에 보이는 폭(여백을 자르면 자른 부분의 폭)
function stgPageBox(i, w) {
  const P = STG.doc.pages[i], vh = Math.round(1000 * P.h / P.w), c = stgCrop();
  const fw = c ? w / c.w : w, fh = fw * P.h / P.w;
  const inner = `<canvas></canvas>`
    + `<svg class="stann" viewBox="0 0 ${P.w} ${P.h}" preserveAspectRatio="none" data-p="${i}"></svg>`
    + `<svg class="stov" viewBox="0 0 1000 ${vh}" preserveAspectRatio="none" data-p="${i}"></svg>`;
  if (!c) return `<div class="stpg" data-p="${i}" style="width:${fw.toFixed(1)}px;height:${fh.toFixed(1)}px">${inner}</div>`;
  return `<div class="stcrop" style="width:${w.toFixed(1)}px;height:${(fh * c.h).toFixed(1)}px"><div class="stpg" data-p="${i}" style="width:${fw.toFixed(1)}px;height:${fh.toFixed(1)}px;left:${(-c.x * fw).toFixed(1)}px;top:${(-c.y * fh).toFixed(1)}px">${inner}</div></div>`;
}
// 보이는 부분의 세로/가로 비율 (여백 자르기 포함)
function stgAR(i) { const P = STG.doc.pages[i], c = stgCrop(); return c ? (P.h * c.h) / (P.w * c.w) : P.h / P.w; }
function stgDraw() {
  const v = $('stv'); if (!v) return;
  const song = stgSong();
  STG.drawTok = (STG.drawTok || 0) + 1;
  if (!song) {
    v.innerHTML = `<div class="rnempty"><p class="how">${STG.songs.length ? '이 콘티에 곡이 없어요. “곡·콘티 관리”에서 곡을 넣어 주세요.' : '아직 곡이 없어요. PDF나 악보 사진을 올리면 바로 넘기며 연주할 수 있어요.'}</p><div class="btns"><button class="btn" id="stadd0">PDF·사진 악보 올리기</button><button class="btn sec" id="stex0">예시 넣어 보기</button></div><input type="file" id="stf0" accept="application/pdf,.pdf,image/*" multiple hidden></div>`;
    $('stadd0').onclick = () => $('stf0').click();
    $('stf0').onchange = e => stgAddFiles(e.target.files);
    $('stex0').onclick = stgAddExample;
    stgNav(); return;
  }
  if (STG.missing) {
    v.innerHTML = `<div class="rnempty"><p class="how">“${escH(song.title)}”의 악보 파일이 이 기기에 없어요. 같은 파일을 다시 골라 주세요.</p><div class="btns"><button class="btn" id="strelink">파일 다시 고르기</button></div><input type="file" id="strf" accept="application/pdf,.pdf,image/*" multiple hidden></div>`;
    $('strelink').onclick = () => $('strf').click();
    $('strf').onchange = async e => { try { const rec = await fileSaveFrom(e.target.files), old = song.fileKey; STG.songs.forEach(x => { if (x.fileKey === old) x.fileKey = rec.key; }); stgSaveSongs(); STG.docKey = ''; stgLoadSong(false); } catch (er) { stgSay(String(er)); } };
    stgNav(); return;
  }
  if (!STG.doc) { v.innerHTML = '<p class="how stload">악보를 여는 중…</p>'; stgNav(); return; }
  const { W, H } = stgArea(), n = stgPages(), z = stgZoom();
  const fit = i => Math.min(W, H / stgAR(i)) * z;
  let h = '';
  if (STG.mode === 'one') h = `<div class="stview">${stgPageBox(STG.pos, fit(STG.pos))}</div>`;
  else if (STG.mode === 'half') {
    const p = Math.floor(STG.pos / 2), odd = STG.pos % 2 === 1, w = fit(p);
    h = `<div class="stview sthalf" style="width:${w}px">${stgPageBox(p, w)}${odd && p + 1 < n ? `<div class="sttophalf">${stgPageBox(p + 1, w)}</div><div class="sthalfline"></div>` : ''}</div>`;
  } else if (STG.mode === 'two') {
    const w = Math.min(W / 2 - 4, H / stgAR(0)) * z;
    h = `<div class="stview sttwo">${stgPageBox(STG.pos, w)}${STG.pos + 1 < n ? stgPageBox(STG.pos + 1, w) : ''}</div>`;
  } else {
    const w = Math.min(W, 1100) * z;
    h = `<div class="stscroll" id="stscroll" style="height:${H}px">${STG.doc.pages.map((_, i) => stgPageBox(i, w)).join('')}</div>`;
  }
  // 새로 그리는 동안 하얗게 깜빡이지 않게: 같은 쪽의 예전 그림을 먼저 늘려서 보여 줘요
  const old = {};
  v.querySelectorAll('.stpg').forEach(b => { const c = b.querySelector('canvas'); if (c && c.width > 1 && !old[b.dataset.p]) old[b.dataset.p] = c; });
  v.classList.toggle('stfixed', STG.mode !== 'scroll');
  v.style.height = STG.mode !== 'scroll' ? H + 'px' : '';
  v.innerHTML = h;
  v.querySelectorAll('.stpg').forEach(b => { const o = old[b.dataset.p], c = b.querySelector('canvas'); if (o && c) { c.width = o.width; c.height = o.height; c.getContext('2d').drawImage(o, 0, 0); } });
  stgZoomUI();
  v.querySelectorAll('.stpg').forEach(box => { stgDrawOverlay(box); stgDrawAnnos(box); });
  if (STG.scrollAfter) { v.scrollTop = STG.scrollAfter === 'bottom' ? v.scrollHeight : 0; STG.scrollAfter = ''; }
  stgPaint(STG.drawTok);
  stgNav();
}
// 쪽 그림(캔버스)
async function stgPaint(tok) {
  const boxes = [...document.querySelectorAll('#stv .stpg')];
  for (const box of boxes) {
    if (tok !== STG.drawTok) return;
    const c = box.querySelector('canvas'), i = +box.dataset.p;
    try { await STG.doc.draw(i, c, box.clientWidth); } catch (e) { console.warn('stage page', i, e); }
    if (tok === STG.drawTok) stgRegInk(box);
  }
}
// 그릴 표시: PDF는 PDF 악보 탭의 표시(순서 글자 포함), 사진 악보는 써 넣은 순서 글자
// 여러 곡이 든 PDF에서 나눈 곡이면 이 곡의 쪽만, 쪽 번호는 곡 안의 번호로 바꿔요. 내 파트가 아닌 파트 메모는 빼요
function stgAnnosAll() {
  const s = stgSong(), o = s && s.order, off = (STG.doc && STG.doc.off) || 0, n = stgPages();
  let A = STG.annos;
  if (STG.doc && STG.doc.full) A = A.filter(a => a.page >= off && a.page < off + n).map(a => Object.assign({}, a, { page: a.page - off }));
  if (STG.part) A = A.filter(a => !a.part || a.part === STG.part);
  if (STG.doc && STG.doc.kind !== 'pdf' && o && o.show && o.anno) return A.concat([o.anno], o.tags || []);
  return A;
}
// PDF 악보 탭에서 넣은 표시
function stgDrawAnnos(box) {
  const svg = box.querySelector('.stann'), i = +box.dataset.p;
  const all = stgAnnosAll();
  if (!all.length || typeof pdfAnnoSvg !== 'function') { svg.innerHTML = ''; return; }
  const pa = all.filter(a => a.page === i);
  // 순서 글자: 지금 하는 칸만 고른 색으로
  const live = a => (a.type === 'order' && STG.ordCur >= 0 ? Object.assign({}, a, { cur: STG.ordCur, hc: stgHlColor() }) : a);
  try { svg.innerHTML = pa.filter(a => a.type === 'cover').concat(pa.filter(a => a.type !== 'cover')).map(a => pdfAnnoSvg(live(a), false)).join(''); } catch (e) { svg.innerHTML = ''; }
}
// 점프 링크 점 (파란 점 = 누르면 이동, 편집 중에는 도착점도 보여요)
function stgDrawOverlay(box) {
  const svg = box.querySelector('.stov'), i = +box.dataset.p, H = svg.viewBox.baseVal.height, song = stgSong();
  const editing = STG.panel === 'link' && !STG.lock;
  let s = '';
  const R = stgRegs();
  if (STG.panel === 'reg' && !STG.lock) { // 구간 고치는 중: 모든 구간을 점선과 번호로
    R.forEach((r, k) => { if (r.p === i) s += `<g class="stre${k === STG.regSel ? ' sel' : ''}"><rect x="${r.x * 1000}" y="${r.y * H}" width="${r.w * 1000}" height="${r.h * H}" rx="8"/><text x="${r.x * 1000 + 10}" y="${r.y * H + 30}">${k + 1}</text></g>`; });
  } else if (stgRegOn()) {
    // 칠할 줄: 순서대로 넘길 때는 지금 칸(부분) 전체, 아니면 지금 줄 하나. 이 쪽에 있는 것을 한 네모로 묶어요
    const ks = stgHlRegs().filter(k => R[k] && R[k].p === i);
    const rs = (STG.hl === 'lyrics' ? ks.filter(k => STG.inkNone && STG.inkNone.has(k)) : ks).map(k => R[k]);
    if (rs.length) {
      const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
      s += `<rect class="strg ${STG.hl === 'fill' ? 'fill' : 'outline'}" x="${x0 * 1000}" y="${y0 * H}" width="${(x1 - x0) * 1000}" height="${(y1 - y0) * H}" rx="10"/>`;
    }
  }
  (song.links || []).forEach((l, k) => {
    if (l.fp === i) s += `<g class="stlk" data-l="${k}"><circle cx="${l.fx * 1000}" cy="${l.fy * H}" r="26" class="stlkb"/><text x="${l.fx * 1000}" y="${l.fy * H + 9}" text-anchor="middle" class="stlkt">↪</text>${l.label ? `<text x="${l.fx * 1000}" y="${l.fy * H - 34}" text-anchor="middle" class="stlkl">${escH(l.label)}</text>` : ''}</g>`;
    if (editing && l.tp === i) s += `<circle cx="${l.tx * 1000}" cy="${l.ty * H}" r="20" class="stlkto"/><text x="${l.tx * 1000}" y="${l.ty * H + 7}" text-anchor="middle" class="stlkt2">${k + 1}</text>`;
  });
  if (editing && STG.link && STG.link.fp === i) s += `<circle cx="${STG.link.fx * 1000}" cy="${STG.link.fy * H}" r="26" class="stlkb pend"/>`;
  if (STG.flash && STG.flash.p === i) s += `<circle cx="${STG.flash.x * 1000}" cy="${STG.flash.y * H}" r="34" class="stflash"/>`;
  svg.innerHTML = s;
}
function stgRedrawOverlays() { document.querySelectorAll('#stv .stpg').forEach(stgDrawOverlay); }
function stgNav() {
  const song = stgSong(), n = stgPages(), L = stgList();
  const next = L[STG.idx + 1];
  $('stnow').textContent = song ? `${song.title}` : '—';
  let m = '';
  if (song && n) {
    if (STG.mode === 'scroll') m = `${n}쪽 · 이어 보기${STG.scroll.on ? ' · 자동 스크롤 중' : ''}`;
    else if (STG.mode === 'half') { const p = Math.floor(STG.pos / 2); m = STG.pos % 2 ? `${p + 1}→${p + 2}쪽 (반 쪽) / ${n}` : `${p + 1} / ${n}쪽`; }
    else if (STG.mode === 'two') m = `${STG.pos + 1}${STG.pos + 1 < n ? '–' + (STG.pos + 2) : ''} / ${n}쪽`;
    else m = `${STG.pos + 1} / ${n}쪽`;
    if (song.key || song.bpm) m += ` · ${[song.key, song.bpm ? '♩=' + song.bpm : '', song.beats ? song.beats + '박' : ''].filter(Boolean).join(' ')}`;
    if (STG.part === 'gt' && tmCapo(song.key).length) m += ` · ${tmCapo(song.key).map(x => (x.capo ? `카포 ${x.capo}(${x.shape})` : x.shape))[0]}`;
  }
  const PL = song && n ? stgPlaylist() : null;
  if (PL && STG.play >= 0) { const it = song.order.items[PL[STG.play].i]; m += ` · 순서 ${PL[STG.play].i + 1}/${song.order.items.length} ${it ? it.t : ''}`; }
  else if (song && n && stgRegOn() && STG.reg >= 0) m += ` · 구간 ${STG.reg + 1}/${stgRegs().length}`;
  if (next) { const br = song && song.key && next.key ? tmBridge(song.key, next.key) : ''; m += ` · 다음 곡: ${next.title}${next.key ? ` (${next.key}${br ? ` · 연결 ${br}` : ''})` : ''}`; }
  $('stnowm').textContent = m;
  stgOrdBar();
  if (PL) { // 순서대로 넘기기
    const last = STG.play >= PL.length - 1;
    $('stnext').disabled = last && !next;
    $('stprev').disabled = STG.play <= 0 && STG.idx <= 0;
    $('stnext').textContent = last && next ? '다음 곡 ▶' : '다음 ▶';
    return;
  }
  if (song && stgRegOn()) { // 구간이 있으면 구간 기준
    const last = STG.reg >= stgRegs().length - 1;
    $('stnext').disabled = last && !next;
    $('stprev').disabled = STG.reg <= 0 && STG.idx <= 0;
    $('stnext').textContent = last && next ? '다음 곡 ▶' : '다음 ▶';
    return;
  }
  const atEnd = !song || (STG.mode !== 'scroll' && STG.pos >= stgMaxPos() && !next);
  $('stnext').disabled = atEnd && STG.mode !== 'scroll';
  $('stprev').disabled = !song || (STG.pos <= 0 && STG.idx <= 0 && STG.mode !== 'scroll');
  $('stnext').textContent = song && STG.mode !== 'scroll' && STG.pos >= stgMaxPos() && next ? '다음 곡 ▶' : '다음 ▶';
}
function stgLayout() { if (STG.doc && $('stv')) stgDraw(); }
addEventListener('resize', () => { clearTimeout(STG.rz); STG.rz = setTimeout(() => { if (TAB === 't-run' && SCREEN === 'app') stgLayout(); }, 150); });

// ───────── 넘기기 ─────────
function stgStep(d) {
  if (stgFollowing()) return stgFollowMsg();
  const song = stgSong(); if (!song) return;
  // 순서가 있으면: 순서를 따라 구간을 옮겨 가요 (A1 - A1이면 다시 A1 처음으로)
  const PL = stgPlaylist();
  if (PL) {
    const L = stgList();
    let i = STG.play + d;
    if (STG.play < 0) i = d > 0 ? 0 : -1;
    if (i >= PL.length) { if (STG.idx + 1 < L.length) { STG.idx++; STG.pos = 0; STG.scrollAfter = 'top'; stgLoadSong(true).then(() => stgBroadcast()); stgFlashTurn(1); } return; }
    if (i < 0) {
      if (STG.idx > 0) { STG.idx--; STG.pos = 0; stgLoadSong(true).then(() => { const P2 = stgPlaylist(); if (P2) stgPlayGo(P2.length - 1); else { STG.pos = stgMaxPos(); stgDraw(); stgBroadcast(); } }); stgFlashTurn(-1); }
      return;
    }
    if (stgPlayGo(i)) stgFlashTurn(d);
    return;
  }
  // 구간을 정해 두었으면: 구간 하나씩 옮겨 가고, 필요할 때만 쪽을 넘겨요
  if (stgRegOn()) {
    const R = stgRegs(), L = stgList();
    let i = STG.reg + d;
    if (STG.reg < 0) { const k = R.findIndex(r => r.p >= stgPage()); i = d > 0 ? (k < 0 ? R.length : k) : -1; }
    if (i >= R.length) { if (STG.idx + 1 < L.length) { STG.idx++; STG.pos = 0; STG.scrollAfter = 'top'; stgLoadSong(true); stgBroadcast(); stgFlashTurn(1); } return; }
    if (i < 0) {
      if (STG.idx > 0) {
        STG.idx--; STG.pos = 0;
        stgLoadSong(true).then(() => { const R2 = stgRegs(); if (stgRegOn()) stgRegGo(R2.length - 1); else { STG.pos = stgMaxPos(); stgDraw(); stgBroadcast(); } });
        stgFlashTurn(-1);
      }
      return;
    }
    if (stgRegGo(i)) stgFlashTurn(d);
    return;
  }
  if (STG.mode === 'scroll') { const sc = $('stscroll'); if (sc) sc.scrollBy({ top: d * sc.clientHeight * 0.8, behavior: 'smooth' }); return; }
  // 확대해서 쪽이 화면보다 크면: 먼저 쪽 안에서 아래(위)로 내려가고, 끝에 닿으면 넘겨요
  const v = $('stv');
  if (v && v.scrollHeight > v.clientHeight + 4) {
    const room = d > 0 ? v.scrollHeight - v.clientHeight - v.scrollTop : v.scrollTop;
    if (room > 4) { v.scrollBy({ top: d * Math.min(room, v.clientHeight * 0.85), behavior: 'smooth' }); return; }
    STG.scrollAfter = d > 0 ? 'top' : 'bottom';
  }
  const step = STG.mode === 'two' ? 2 : 1, max = stgMaxPos();
  const np = STG.pos + d * step;
  const L = stgList();
  if (np > max) {
    if (STG.idx + 1 < L.length) { STG.idx++; STG.pos = 0; stgLoadSong(true); stgBroadcast(); stgFlashTurn(1); }
    return;
  }
  if (np < 0) {
    if (STG.idx > 0) { STG.idx--; STG.pos = 1e9; stgLoadSong(true).then(() => { STG.pos = stgMaxPos(); stgDraw(); stgBroadcast(); }); stgFlashTurn(-1); }
    return;
  }
  STG.pos = np;
  stgDraw(); stgBroadcast(); stgFlashTurn(d);
}
function stgFlashTurn(d) {
  const v = $('stv'); if (!v) return;
  const f = document.createElement('div'); f.className = 'rnflash ' + (d > 0 ? 'r' : 'l'); f.textContent = d > 0 ? '▶' : '◀';
  document.body.appendChild(f); setTimeout(() => f.remove(), 320);
}
// 점프: 링크의 도착점으로
function stgJump(l) {
  if (stgFollowing()) return stgFollowMsg();
  const PL = stgPlaylist();
  const rk = stgRegOn() || PL ? stgRegAt(l.tp, l.ty) : -1;
  if (rk >= 0 && PL) { // 순서 안에서 그 구간이 나오는 곳 (지금 다음으로 가장 가까운 곳)
    let j = PL.findIndex((e, k) => k > STG.play && e.r === rk); if (j < 0) j = PL.findIndex(e => e.r === rk);
    if (j >= 0) stgPlayGo(j, true); else stgRegGo(rk, true);
  } else if (rk >= 0) stgRegGo(rk, true);
  else if (STG.mode === 'scroll') { stgScrollToPage(l.tp, true, l.ty); }
  else {
    STG.pos = STG.mode === 'half' ? 2 * l.tp : STG.mode === 'two' ? l.tp - (l.tp % 2 && l.tp > 0 && false ? 1 : 0) : l.tp;
    STG.pos = Math.max(0, Math.min(STG.pos, stgMaxPos()));
    stgDraw();
    // 확대해 둔 상태면 도착점이 화면 위쪽에 오게 내려 줘요
    const v = $('stv'), pg = v && v.querySelector(`.stpg[data-p="${l.tp}"]`);
    if (pg && v.scrollHeight > v.clientHeight + 4) {
      const r = pg.getBoundingClientRect(), vr = v.getBoundingClientRect();
      v.scrollTop += r.top - vr.top + l.ty * r.height - v.clientHeight * 0.2;
      v.scrollLeft += r.left - vr.left + l.tx * r.width - v.clientWidth * 0.3;
    }
  }
  STG.flash = { p: l.tp, x: l.tx, y: l.ty };
  stgRedrawOverlays();
  clearTimeout(STG.flashT); STG.flashT = setTimeout(() => { STG.flash = null; stgRedrawOverlays(); }, 1300);
  stgBroadcast();
  stgSay(`“${l.label || '점프'}” → ${l.tp + 1}쪽으로 넘어갔어요.`);
}
function stgScrollToPage(p, smooth, y) {
  const sc = $('stscroll'); if (!sc) return;
  const pg = sc.querySelector(`.stpg[data-p="${p}"]`); if (!pg) return;
  const box = pg.closest('.stcrop') || pg;
  const top = box.offsetTop + (y ? Math.max(0, y * box.clientHeight - sc.clientHeight * 0.25) : 0);
  sc.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

// 누르기·밀기: 왼쪽 30% = 이전, 나머지 = 다음. 링크 점은 점프. 점프 링크 편집 중에는 점 찍기
function stgBindView() {
  const v = $('stv');
  v.onpointerdown = e => { if (STG.panel === 'reg' && !STG.lock) return stgRegDown(e); STG.swipe = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  v.onpointermove = e => { if (STG.rdrag) stgRegMove(e); };
  v.onpointerup = e => {
    if (STG.rdrag) return stgRegUp(e);
    const sw = STG.swipe; STG.swipe = null; if (!sw || Date.now() - (STG.pinchAt || 0) < 400) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    const lk = e.target.closest && e.target.closest('g.stlk');
    if (STG.panel === 'link' && !STG.lock) return stgLinkTap(e, lk);
    if (lk) { const song = stgSong(); const l = song && song.links[+lk.dataset.l]; if (l) stgJump(l); return; }
    if (STG.mode === 'scroll') return; // 이어 보기는 손가락으로 위아래로 밀어요
    const panX = v.scrollWidth > v.clientWidth + 4; // 확대해서 옆으로 밀 수 있으면 밀기는 넘기기가 아니에요
    if (!panX && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) return stgStep(dx < 0 ? 1 : -1); // 밀기
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    if (!stgSong()) return;
    const r = v.getBoundingClientRect();
    stgStep(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
  };
}
// 키보드 · 블루투스 페달
document.addEventListener('keydown', e => {
  if (SCREEN !== 'app' || TAB !== 't-run' || !$('stv')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  const k = e.key;
  if (['ArrowRight', 'PageDown', ' ', 'ArrowDown', 'Enter'].includes(k)) { e.preventDefault(); stgStep(1); }
  else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(k)) { e.preventDefault(); stgStep(-1); }
  else if (k === '+' || k === '=') { e.preventDefault(); stgZoomStep(1); }
  else if (k === '-') { e.preventDefault(); stgZoomStep(-1); }
  else if (k === '0') { e.preventDefault(); stgZoomTo(1); }
  else if (k === 'Home') { e.preventDefault(); if (!stgFollowing()) { if (stgPlaylist()) stgPlayGo(0); else if (stgRegOn()) stgRegGo(0); else { STG.pos = 0; stgDraw(); stgBroadcast(); } } }
});

// ───────── 구간 표시: 지금 하는 부분을 반짝 ─────────
// song.regions = [{p, x, y, w, h}] (쪽 번호, 0~1 비율). 쪽 순서 → 위에서 아래 순서로 정렬해 둬요.
const stgRegs = () => { const s = stgSong(); return (s && s.regions) || []; };
const stgRegOn = () => STG.hl !== 'off' && !!STG.doc && stgRegs().length > 0;
const stgRegSort = s => s.regions.sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
// 쪽 p의 높이 y에 있는 구간 (없으면 그 아래 첫 구간, 그것도 없으면 그 쪽 첫 구간)
function stgRegAt(p, y) {
  const R = stgRegs();
  let k = R.findIndex(r => r.p === p && y >= r.y && y <= r.y + r.h);
  if (k < 0) k = R.findIndex(r => r.p === p && r.y >= y);
  if (k < 0) k = R.findIndex(r => r.p === p);
  return k;
}
// 구간 i로: 그 구간이 보이게 쪽을 맞추고 반짝. 쪽이 바뀌었으면 true
function stgRegGo(i, quiet) {
  const r = stgRegs()[i]; if (!r) return false;
  STG.reg = i; STG.regAt = Date.now(); STG.inkNone = new Set();
  let np = STG.pos;
  if (STG.mode === 'one') np = r.p;
  else if (STG.mode === 'half') np = r.p > 0 && r.y + r.h / 2 < 0.5 ? 2 * r.p - 1 : 2 * r.p; // 위쪽 반이면 반 쪽만 먼저 넘겨요
  else if (STG.mode === 'two') np = r.p - (r.p % 2);
  else np = 0;
  np = Math.max(0, Math.min(np, stgMaxPos()));
  const turned = np !== STG.pos;
  STG.pos = np;
  if (turned) { STG.scrollAfter = ''; stgDraw(); } else { stgRedrawOverlays(); stgRegInkAll(); stgNav(); }
  stgRegReveal();
  if (!quiet) stgBroadcast();
  return turned;
}
// 확대했거나 이어 보기일 때: 지금 구간이 화면에 들어오게 밀어 줘요
function stgRegReveal() {
  const r = stgRegs()[STG.reg]; if (!r) return;
  const sc = STG.mode === 'scroll' ? $('stscroll') : $('stv');
  if (!sc || sc.scrollHeight <= sc.clientHeight + 4) return;
  const pg = sc.querySelector(`.stpg[data-p="${r.p}"]`); if (!pg) return;
  const pr = pg.getBoundingClientRect(), cr = sc.getBoundingClientRect();
  const top = pr.top + r.y * pr.height - cr.top, bot = top + r.h * pr.height;
  if (top >= 0 && bot <= sc.clientHeight) return;
  sc.scrollBy({ top: top - Math.min(sc.clientHeight * 0.15, Math.max(0, sc.clientHeight - (bot - top)) / 2), behavior: 'smooth' });
  const left = pr.left + r.x * pr.width - cr.left;
  if (left < 0 || left > sc.clientWidth * 0.6) sc.scrollBy({ left: left - 8 });
}
function stgRegInkAll() { document.querySelectorAll('#stv .stpg').forEach(stgRegInk); }
// “가사만 반짝”: 구간 안에서 오선 아래(가사 줄)의 글자만 색을 입혀 반짝여요
// 가사 찾기용 선명한 쪽 그림 (화면 그림은 작아서 가는 오선이 흐려질 수 있어요). 최근 3쪽만 기억해요
const STG_INK = new Map();
function stgInkSrc(p) {
  const k = STG.docKey + ':' + p, doc = STG.doc;
  if (!STG_INK.has(k)) {
    STG_INK.set(k, (async () => { const c = document.createElement('canvas'); await doc.draw(p, c, 1100 / Math.min(2.5, window.devicePixelRatio || 1)); return c; })());
    while (STG_INK.size > 3) STG_INK.delete(STG_INK.keys().next().value);
  }
  return STG_INK.get(k);
}
// 지금 칠할 줄들 (구간 번호): 순서대로 넘기면 지금 칸(부분)의 줄 전체, 아니면 지금 줄
function stgHlRegs() {
  const PL = stgPlaylist();
  if (PL && STG.play >= 0 && PL[STG.play]) {
    const i = PL[STG.play].i;
    let a = STG.play, b = STG.play;
    while (a > 0 && PL[a - 1].i === i) a--;
    while (b < PL.length - 1 && PL[b + 1].i === i) b++;
    return PL.slice(a, b + 1).map(e => e.r);
  }
  return STG.reg >= 0 ? [STG.reg] : [];
}
// “가사·코드 색”: 칠할 줄마다 오선 위 코드 줄과 아래 가사 줄의 글자만 고른 색으로
async function stgRegInk(box) {
  box.querySelectorAll('canvas.stlyr').forEach(c => c.remove());
  if (STG.hl !== 'lyrics' || !stgRegOn() || (STG.panel === 'reg' && !STG.lock)) return;
  const p = +box.dataset.p, R = stgRegs(), ks = stgHlRegs().filter(k => R[k] && R[k].p === p), key = STG.regAt;
  if (!ks.length) return;
  let src;
  try { src = await stgInkSrc(p); } catch (e) { return; }
  if (STG.regAt !== key || !box.isConnected || STG.hl !== 'lyrics') return;
  box.querySelectorAll('canvas.stlyr').forEach(c => c.remove());
  if (!src || src.width < 2) return;
  if (!STG.inkNone) STG.inkNone = new Set();
  let changed = false;
  ks.forEach(k => {
    const res = stgInkCanvas(src, R[k]);
    const none = !res;
    if (STG.inkNone.has(k) !== none) { if (none) STG.inkNone.add(k); else STG.inkNone.delete(k); changed = true; }
    if (res) box.insertBefore(res, box.querySelector('svg'));
  });
  if (changed) stgDrawOverlay(box); // 가사·코드가 없는 줄은 테두리로
}
function stgInkCanvas(src, r) {
  const W = src.width, H = src.height;
  const x0 = Math.max(0, Math.floor(r.x * W)), y0 = Math.max(0, Math.floor(r.y * H));
  const w = Math.min(W - x0, Math.ceil(r.w * W)), h = Math.min(H - y0, Math.ceil(r.h * H));
  if (w < 4 || h < 4) return null;
  let d;
  try { d = src.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data; } catch (e) { return null; }
  // 오선(긴 가로줄) 찾기: 줄마다 회색 잉크의 진하기를 더해요. 작게 그려져 흐릿한 선은 두 줄에 나뉘니까 이웃한 두 줄을 합쳐서 봐요
  const row = new Float32Array(h + 1);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
      const R = d[o], G = d[o + 1], B = d[o + 2], lum = R * 0.3 + G * 0.59 + B * 0.11;
      if (lum < 245 && Math.max(R, G, B) - Math.min(R, G, B) < 70) n += (245 - lum) / 245;
    }
    row[y] = n;
  }
  // 오선 줄 자리들 (가까운 줄은 하나로)
  const lines = [];
  for (let y = 0; y < h; y++) if (row[y] + row[y + 1] > w * 0.5) { const l = lines[lines.length - 1]; if (l != null && y - l <= 2) lines[lines.length - 1] = y; else lines.push(y); }
  const gaps = lines.slice(1).map((y, k) => y - lines[k]).filter(g => g > 2).sort((a, b) => a - b);
  const sp = gaps.length ? gaps[Math.floor(gaps.length / 2)] : h * 0.05;
  // 칠할 띠: 코드 줄(첫 오선 위) + 가사 줄(마지막 오선 아래). 오선이 없으면(글 악보) 구간 전체
  const bands = [];
  if (lines.length) {
    const top = Math.round(lines[0] - sp * 1.3), bot = Math.round(lines[lines.length - 1] + Math.max(3, h * 0.03));
    if (top > sp * 0.8) bands.push([0, top, STG_CHORD_INK]);
    if (h - bot > h * 0.1) bands.push([bot, h, STG_LYRIC_INK]);
  } else bands.push([0, h, STG_LYRIC_INK]);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = 'stlyr';
  const g = c.getContext('2d'), out = g.createImageData(w, h), q = out.data;
  let inkN = 0, area = 0;
  bands.forEach(([b0, b1, hex]) => {
    const col = stgHex(hex); // 코드 줄은 파랑, 가사 줄은 빨강
    area += (b1 - b0) * w;
    for (let y = b0; y < b1; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, lum = d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11;
      if (lum < 190) { q[k] = col[0]; q[k + 1] = col[1]; q[k + 2] = col[2]; q[k + 3] = Math.min(255, (210 - lum) * 1.6); if (q[k + 3] > 120) inkN++; }
    }
  });
  // 가사·코드가 거의 없는 줄이면 null (그 줄은 테두리로 보여 줘요)
  if (!area || inkN < area * 0.012) return null;
  g.putImageData(out, 0, 0);
  c.style.left = (x0 / W * 100) + '%'; c.style.top = (y0 / H * 100) + '%';
  c.style.width = (w / W * 100) + '%'; c.style.height = (h / H * 100) + '%';
  return c;
}
// 구간 고치기: 끌어서 네모 그리기 · 눌러서 고르기
function stgRegPt(e, pg) { const r = pg.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
function stgRegDown(e) {
  const pg = e.target.closest && e.target.closest('.stpg'); if (!pg || !stgSong()) return;
  const a = stgRegPt(e, pg);
  STG.rdrag = { pg, p: +pg.dataset.p, x0: a.x, y0: a.y, x1: a.x, y1: a.y };
  try { $('stv').setPointerCapture(e.pointerId); } catch (er) {}
}
function stgRegMove(e) {
  const D = STG.rdrag, b = stgRegPt(e, D.pg); D.x1 = b.x; D.y1 = b.y;
  const svg = D.pg.querySelector('.stov'), H = svg.viewBox.baseVal.height;
  let el = svg.querySelector('.strenew');
  if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); el.setAttribute('class', 'strenew'); svg.appendChild(el); }
  el.setAttribute('x', Math.min(D.x0, D.x1) * 1000); el.setAttribute('y', Math.min(D.y0, D.y1) * H);
  el.setAttribute('width', Math.abs(D.x1 - D.x0) * 1000); el.setAttribute('height', Math.abs(D.y1 - D.y0) * H);
}
function stgRegUp(e) {
  const D = STG.rdrag; STG.rdrag = null;
  const s = stgSong(); if (!s) return;
  const x = Math.min(D.x0, D.x1), y = Math.min(D.y0, D.y1), w = Math.abs(D.x1 - D.x0), h = Math.abs(D.y1 - D.y0);
  s.regions = s.regions || [];
  if (w > 0.04 && h > 0.015) {
    const r = { p: D.p, x, y, w, h };
    s.regions.push(r); stgRegSort(s); stgSaveSongs();
    STG.regSel = s.regions.indexOf(r);
  } else STG.regSel = s.regions.findIndex(r => r.p === D.p && D.x0 >= r.x && D.x0 <= r.x + r.w && D.y0 >= r.y && D.y0 <= r.y + r.h);
  stgPanel('reg', true);
}
// 악보 줄(단) 자동으로 찾기 → 줄마다 구간 하나
async function stgRegAuto() {
  const s = stgSong(), doc = STG.doc; if (!s || !doc) return;
  const b = $('stregauto'); if (b) b.disabled = true;
  const out = [];
  for (let i = 0; i < doc.pages.length && i < 40; i++) {
    stgSay(`악보 줄을 찾는 중… (${i + 1}/${doc.pages.length}쪽)`);
    let f = [];
    try { f = await pgDetect(doc, i, 205); } catch (er) { f = []; } // 205: 옅은 회색 오선도 찾아요
    f.forEach(q => out.push({ p: i, x: q.x, y: q.y, w: q.w, h: q.h }));
  }
  if (stgSong() !== s) return;
  s.regions = out; stgRegSort(s); stgSaveSongs();
  STG.regSel = -1; STG.reg = -1; stgPlayReset();
  stgSay(out.length ? `악보 줄 ${out.length}개를 찾아 구간으로 나눴어요. 틀린 건 눌러서 고른 뒤 지우고, 끌어서 다시 그려 주세요.` : '악보 줄을 찾지 못했어요. 악보 위를 끌어서 직접 네모를 그려 주세요.');
  stgPanel('reg', true);
}
function stgPanelReg(el, song) {
  if (!song) { el.innerHTML = '<p class="meta">곡을 먼저 넣어 주세요.</p>'; return; }
  const R = stgRegs();
  el.innerHTML = `<div class="stregp">
    <p class="how">지금 연주하는 부분(구간)을 화면에 표시해요. 구간을 정해 두면 <b>다음</b>을 누를 때마다 다음 구간의 색이 바뀌고, 그 쪽의 마지막 구간이 끝나면 쪽이 넘어가요. <b>가사·코드 색</b>은 오선 위 코드 이름은 <b style="color:#1C64F2">파랑</b>, 아래 가사 글자는 <b style="color:#E03131">빨강</b>으로 바꿔요(아래 색 고르기는 테두리·형광펜에 써요).</p>
    <div class="strow"><span class="meta">표시 방법</span><div class="seg" id="sthlseg"></div></div>
    <div class="strow"><span class="meta">색</span><span class="sthlc">${STG_HLC.map(([c, n]) => `<button class="sthlcb" data-c="${c}" style="--c:${c}" aria-pressed="${stgHlColor() === c}" aria-label="${n}" title="${n}"></button>`).join('')}</span></div>
    <p class="meta">악보 위를 <b>끌어서 네모</b>를 그리면 구간이 생겨요(한 줄 = 한 구간이 보기 좋아요). 구간을 누르면 골라져요. 지금 구간 <b>${R.length}</b>개.</p>
    <div class="btns">
      <button class="btn small" id="stregauto">악보 줄 자동으로 나누기</button>
      ${STG.regSel >= 0 ? `<button class="btn sec small danger" id="stregdel">${STG.regSel + 1}번 구간 지우기</button>` : ''}
      ${R.length ? '<button class="btn sec small danger" id="stregclr">구간 모두 지우기</button>' : ''}
      <button class="btn sec small" id="strpv">◀ 이전 쪽</button><button class="btn sec small" id="strnx">다음 쪽 ▶</button>
      <button class="btn small" id="stregdone">다 했어요</button>
    </div></div>`;
  seg($('sthlseg'), STG_HLS.map(h => h[1]), STG_HLS.findIndex(h => h[0] === STG.hl), i => { STG.hl = STG_HLS[i][0]; stgSaveOpts(); STG.regAt = Date.now(); stgNav(); });
  el.querySelectorAll('.sthlcb').forEach(b => (b.onclick = () => { STG.hlc = b.dataset.c; stgSaveOpts(); stgApplyClasses(); el.querySelectorAll('.sthlcb').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  $('stregauto').onclick = stgRegAuto;
  if ($('stregdel')) $('stregdel').onclick = () => { song.regions.splice(STG.regSel, 1); STG.regSel = -1; if (STG.reg >= song.regions.length) STG.reg = song.regions.length - 1; stgSaveSongs(); stgPanel('reg', true); };
  if ($('stregclr')) { const c = $('stregclr'); c.onclick = () => { if (!c.dataset.arm) { c.dataset.arm = '1'; c.textContent = '한 번 더 누르면 모두 지워요'; return; } song.regions = []; STG.reg = -1; STG.regSel = -1; stgSaveSongs(); stgPanel('reg', true); }; }
  const turn = d => { if (STG.mode === 'scroll') return; const step = STG.mode === 'two' ? 2 : 1; STG.pos = Math.max(0, Math.min(stgMaxPos(), STG.pos + d * step)); stgDraw(); };
  $('strpv').onclick = () => turn(-1); $('strnx').onclick = () => turn(1);
  $('stregdone').onclick = () => { stgPanel('reg'); if (stgRegOn()) stgRegGo(Math.max(0, stgRegAt(stgPage(), 0)), true); };
}

// ───────── 악보 순서 ─────────
// 도돌이표·구간 표시로 자동으로 만들고, 더하거나 빼고, 악보 위 빈 곳에 써서 저장해요 (song.order)
const stgOrd = s => (s.order = s.order || { items: [], secs: [], show: true, src: '' });
const stgOrdText = s => stgOrd(s).items.map(x => x.t).join(SO_JOIN);
const STG_ORD_INK = '#D2413A'; // 악보 위에 쓰는 순서 글자 색
function stgOrdSave(song) { stgSaveSongs(); stgOrdWrite(song); stgNav(); }
// 1쪽 위쪽에서 가장 넓은 빈 줄(흰 띠)을 찾아 글자 자리를 정해요
async function stgOrdPlace(pg) {
  const P = STG.doc.pages[pg];
  let c = null; try { c = await stgInkSrc(pg); } catch (e) { c = null; }
  const dflt = { x: P.w * 0.06, y: P.h * 0.03, fs: P.h * 0.016 };
  if (!c || c.width < 2) return dflt;
  const W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, Math.round(H * 0.32)).data, R = Math.round(H * 0.32);
  const k = P.h / H;
  let best = null, run = null, left = W;
  for (let y = 0; y <= R; y++) {
    let n = 0;
    if (y < R) for (let x = 0, o = y * W * 4; x < W; x++, o += 4) if (d[o] * 0.3 + d[o + 1] * 0.59 + d[o + 2] * 0.11 < 200) { n++; if (x < left) left = x; }
    const blank = y < R && n < W * 0.004;
    if (blank) { if (!run) run = { y0: y, y1: y }; else run.y1 = y; }
    else if (run) { // 맨 위쪽부터: 글자가 들어갈 만한(쪽 높이의 2.5%) 첫 빈 띠, 없으면 가장 넓은 띠
      const h = run.y1 - run.y0;
      if (h >= H * 0.018) { if (!best) best = run; else if (!(best.y1 - best.y0 >= H * 0.025) && h > best.y1 - best.y0) best = run; }
      run = null;
    }
  }
  if (!best) return dflt;
  const fs = Math.max(P.h * 0.009, Math.min((best.y1 - best.y0) * k * 0.55, P.h * 0.022));
  return { x: Math.max(P.w * 0.04, (left < W ? left : W * 0.06) * k) + fs * 0.45, y: ((best.y0 + best.y1) / 2) * k + fs * 0.36, fs };
}
// 순서 글자를 악보에 써요 (PDF: PDF 악보 탭의 표시로 저장 → PDF로 저장할 때도 들어가요 / 사진: 곡에 저장)
async function stgOrdWrite(song) {
  if (!song || !STG.doc || stgSong() !== song) return;
  const o = stgOrd(song), body = stgOrdText(song), isPdf = STG.doc.kind === 'pdf';
  // PDF 표시는 파일 전체의 쪽 번호로 저장돼요. 나눈 곡이면 이 곡의 쪽(off ~ off+n)에 있는 것만 이 곡의 것
  const off = isPdf ? STG.doc.off || 0 : 0, nP = STG.doc.pages.length, mine = a => !isPdf || (a.page >= off && a.page < off + nP);
  let annos = isPdf ? (lsGet(STG.annoKey, []) || []) : null;
  let cur = isPdf ? annos.find(a => a.type === 'order' && mine(a)) : o.anno;
  if (!o.show || !body) {
    if (isPdf) annos = annos.filter(a => !(a.type === 'order' && mine(a))); else o.anno = null;
  } else {
    const pg0 = Math.max(0, Math.min(STG.doc.pages.length - 1, (o.from || 1) - 1)); // 순서를 쓰는 쪽 = 찾은 쪽 범위의 첫 쪽
    if (cur && cur.page !== pg0 + off) { if (isPdf) annos = annos.filter(a => a !== cur); else o.anno = null; cur = null; }
    const P = STG.doc.pages[pg0];
    if (!cur) {
      const pl = await stgOrdPlace(pg0);
      if (stgSong() !== song) return;
      if (isPdf) annos = lsGet(STG.annoKey, []) || []; // 기다리는 동안 바뀌었을 수 있어요
      cur = { id: (isPdf ? Math.max(0, ...annos.map(a => a.id || 0)) : 0) + 1, page: pg0 + off, type: 'order', x: pl.x, y: pl.y, fs: pl.fs, color: STG_ORD_INK, text: '', w: 0 };
      if (isPdf) { annos = annos.filter(a => !(a.type === 'order' && mine(a))); annos.push(cur); } else o.anno = cur;
    }
    // 칸마다 글자로: 짧은 이름(Intro → In, Interlude → Int). 못 읽은 칸은 새 문자(X, Y …) 그대로
    const parts = o.items.map(it => { const sec = it.s >= 0 ? o.secs[it.s] : null; return { t: o.short === false || (sec && sec.auto) ? it.t : soShort(it.t) }; });
    if (stgSong() !== song) return;
    // 한 줄에 다 안 들어가면 조금 줄이고, 그래도 길면 여러 줄로 나눠 써요
    const g = document.createElement('canvas').getContext('2d');
    const meas = t => { g.font = `bold ${cur.fs}px "IBM Plex Sans KR", sans-serif`; return g.measureText(t).width; };
    const pw = p => (p.img ? cur.fs * 1.1 * p.ar : meas(p.t));
    const room = Math.max(P.w * 0.3, P.w * 0.97 - cur.x - cur.fs * 0.45);
    if (!cur.fs0) cur.fs0 = cur.fs;
    cur.fs = cur.fs0;
    // 반복 묶어 쓰기(기본): 반복되는 칸을 네모로 둘러싸고 바로 뒤에 ×2 딱지 (A1 - A1 → [A1]×2, Int - B - Int - B → [Int - B]×2)
    const toks = o.compact === false ? parts.map((p, j) => ({ type: 'item', j, ks: [j] })) : soCompress(o.items.map(it => it.t));
    const units = soUnits(toks);
    const jw = meas(SO_JOIN), dash = SO_JOIN.trim() || '-', dw = meas(dash);
    const pad = cur.fs * 0.28, gap = cur.fs * 0.12;
    const badgeW = n => meas('×' + n) * 0.82 + cur.fs * 0.36;
    const unitW = u => {
      const inner = u.items.reduce((a, t, m) => a + pw(parts[t.j]) + (m ? jw : 0), 0);
      return u.n > 1 ? inner + pad * 2 + gap + badgeW(u.n) : inner;
    };
    const total = () => meas('순서  ') + units.reduce((a, u, k) => a + unitW(u) + (k ? jw : 0), 0);
    if (total() > room) cur.fs = Math.max(cur.fs0 * 0.8, cur.fs * room / total());
    const segs = [{ l: 0, x: 0, w: meas('순서'), t: '순서', k: -1 }];
    let x = meas('순서  '), l = 0, maxw = x;
    units.forEach((u, k) => {
      const w = unitW(u);
      if (k) { // 이음표(-)는 칸 사이 가운데에. 묶음은 줄을 나누지 않아요
        if (x + jw + w > room) { segs.push({ l, x: x + (jw - dw) / 2, w: dw, t: dash, k: -1 }); l++; x = 0; }
        else { segs.push({ l, x: x + (jw - dw) / 2, w: dw, t: dash, k: -1 }); x += jw; }
      }
      const x0 = x, all = [].concat(...u.items.map(t => t.ks));
      if (u.n > 1) x += pad;
      u.items.forEach((t, m) => {
        if (m) { segs.push({ l, x: x + (jw - dw) / 2, w: dw, t: dash, k: -1 }); x += jw; }
        const p = parts[t.j], iw = pw(p);
        segs.push(Object.assign({ l, x, w: iw, k: t.j, ks: t.ks }, p.img ? { img: p.img } : { t: p.t }));
        x += iw;
      });
      if (u.n > 1) {
        x += pad;
        segs.unshift({ l, x: x0, w: x - x0, box: 1, k: -1, ks: all }); // 반복되는 범위 네모 (먼저 그려요)
        x += gap;
        segs.push({ l, x, w: badgeW(u.n), t: '×' + u.n, badge: 1, k: -1, ks: u.repKs });
        x += badgeW(u.n);
      }
      maxw = Math.max(maxw, x);
    });
    cur.segs = segs;
    cur.text = '순서  ' + units.map(u => (u.n > 1 ? '[' : '') + u.items.map(t => parts[t.j].t || '□').join(SO_JOIN) + (u.n > 1 ? ']×' + u.n : '')).join(SO_JOIN); // 다른 앱·예전 화면용 글자
    cur.w = maxw;
  }
  // 악보에 없는 이름(새 문자·직접 적은 이름)은 그 부분이 어디인지 악보 위에 빨간 이름표로 표시해요
  {
    const P = STG.doc.pages, g = document.createElement('canvas').getContext('2d');
    const want = o.show && body ? [...new Set(o.items.map(it => it.s).filter(k => k >= 0 && o.secs[k] && !o.secs[k].read))] : [];
    const old = isPdf ? annos.filter(a => a.type === 'otag' && mine(a)) : o.tags || [];
    const tags = want.map(k => {
      const x = o.secs[k], pg = Math.max(0, Math.min(P.length - 1, x.p)), PP = P[pg];
      const text = o.short === false || x.auto ? x.name : soShort(x.name);
      const keep = old.find(a => a.sec === k); // 옮겨 둔 이름표는 그 자리 그대로
      const fs = keep ? keep.fs : Math.max(PP.h * 0.011, Math.min(PP.h * 0.02, (x.h || 0.02) * PP.h * 0.7));
      g.font = `bold ${fs}px "IBM Plex Sans KR", sans-serif`;
      return { id: 0, page: pg + off, type: 'otag', sec: k, text, fs, w: g.measureText(text).width, color: STG_ORD_INK,
        x: keep ? keep.x : ((x.x || 0.02) + (x.w || 0)) * PP.w + fs * 0.6, y: keep ? keep.y : (x.y || 0) * PP.h + fs * 1.05 };
    });
    if (isPdf) {
      annos = annos.filter(a => !(a.type === 'otag' && mine(a)));
      let id = Math.max(0, ...annos.map(a => a.id || 0));
      tags.forEach(t => { t.id = ++id; annos.push(t); });
    } else o.tags = tags;
  }
  if (isPdf) {
    lsSet(STG.annoKey, annos); STG.annos = annos;
    if (typeof PDFE !== 'undefined' && PDFE.key === STG.annoKey) { PDFE.annos = annos.map(a => Object.assign({}, a)); PDFE.nextId = Math.max(1, ...PDFE.annos.map(a => (a.id || 0) + 1)); if ($('pdfpages')) pdfDrawAll(); }
  } else stgSaveSongs();
  document.querySelectorAll('#stv .stpg').forEach(stgDrawAnnos);
}
function stgPanelOrder(el, song) {
  if (!song) { el.innerHTML = '<p class="meta">곡을 먼저 넣어 주세요.</p>'; return; }
  const o = stgOrd(song), sel = STG.ordSel != null && STG.ordSel < o.items.length ? STG.ordSel : -1;
  const chip = (it, k) => {
    const sec = it.s >= 0 ? o.secs[it.s] : null, img = sec && sec.img && !sec.read ? `<img src="${sec.img}" alt="">` : '';
    return `<button class="stordc${k === sel ? ' on' : ''}${k === STG.ordCur ? ' cur' : ''}" data-k="${k}" aria-pressed="${k === sel}">${img}<span>${escH(it.t)}</span></button>`;
  };
  const names = [...new Set(o.secs.map(x => x.name).filter(Boolean))];
  el.innerHTML = `<div class="stordp">
    <div class="stordline"><label for="stordtxt"><b>순서를 한 줄로 적기</b> <span class="meta">우리 팀이 쓰는 그대로 적고 “순서로 넣기”</span></label>
      <div class="stordlin"><input type="text" id="stordtxt" maxlength="300" value="${escH(soOrderLine(o.items.map(it => it.t)))}" placeholder="예: In · (V · C1 · C2)x2 · Int · C1 · C2 · Out" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small" id="stordtxtb">순서로 넣기</button></div></div>
    <p class="how">또는 악보의 <b>구간 표시</b>(Intro, A1, Chorus 같은 네모 칸)와 <b>도돌이표</b>를 보고 자동으로 만들 수 있어요. 만든 순서는 <b>악보 위 빈 곳</b>에 써져요.</p>
    ${STG.doc && STG.doc.pages.length > 1 ? `<div class="strow stordrng"><span class="meta">찾을 쪽</span><input type="number" id="stordfrom" min="1" max="${STG.doc.pages.length}" value="${o.from || 1}" aria-label="처음 쪽"><span>~</span><input type="number" id="stordto" min="1" max="${STG.doc.pages.length}" value="${o.to || STG.doc.pages.length}" aria-label="마지막 쪽"><span class="meta">쪽</span></div>` : ''}
    <div class="btns">
      <button class="btn small" id="stordai" hidden>✨ Claude로 악보 읽어서 만들기</button>
      <button class="btn ${'sec '}small" id="stordloc">기기에서 찾아 만들기</button>
    </div>
    ${o.note || o.written ? `<p class="meta">${o.written ? `악보에 적혀 있던 순서: <b>${escH(o.written)}</b>. ` : ''}${escH(o.note || '')}</p>` : ''}
    <div class="stordrow" aria-label="연주 순서">${o.items.map(chip).join('<span class="stordar" aria-hidden="true">›</span>') || '<span class="meta">아직 순서가 없어요. 위에서 자동으로 만들거나, 아래에서 이름을 눌러 하나씩 넣어 주세요.</span>'}</div>
    ${sel >= 0 ? `<div class="stordsel">
      <button class="btn sec small" id="stordl" aria-label="앞으로">◀</button><button class="btn sec small" id="stordr" aria-label="뒤로">▶</button>
      <label class="stordnm">이름 <input type="text" id="stordname" maxlength="24" value="${escH(o.items[sel].t)}"></label><button class="btn sec small" id="stordren">바꾸기</button>
      ${o.items[sel].s >= 0 && o.secs[o.items[sel].s] && o.secs[o.items[sel].s].g != null ? `<label class="btck"><input type="checkbox" id="stordall" checked> 같은 모양 상자도 함께</label>` : ''}
      ${o.items[sel].s >= 0 ? '<button class="btn sec small" id="stordgo">악보에서 보기</button>' : ''}
      <button class="btn sec small danger" id="storddel">✕ 빼기</button>
    </div>` : ''}
    <div class="stordadd"><span class="meta">${sel >= 0 ? `${sel + 1}번 뒤에` : '맨 뒤에'} 넣기</span>
      ${names.map(n => `<button class="stordn found" data-n="${escH(n)}">${escH(n)}</button>`).join('')}
      ${SO_COMMON.filter(n => !names.includes(n)).map(n => `<button class="stordn" data-n="${escH(n)}">${escH(n)}</button>`).join('')}
      <span class="stordnew"><input type="text" id="stordin" maxlength="24" placeholder="다른 이름" aria-label="넣을 이름"><button class="btn sec small" id="stordinb">넣기</button></span>
    </div>
    <div class="btns">
      <button class="btn sec small" id="stordshow" aria-pressed="${!!o.show}">${o.show ? '✓ 악보 위에 쓰는 중' : '악보 위에 쓰기'}</button>
      <span class="fw"><button id="stordfm" aria-label="글자 작게">−</button><output>글자 크기</output><button id="stordfp" aria-label="글자 크게">+</button></span>
      <button class="btn sec small" id="stordshort" aria-pressed="${o.short !== false}">${o.short !== false ? '✓ 짧게 쓰기 (Intro → In)' : '짧게 쓰기'}</button>
      <button class="btn sec small" id="stordcmp" aria-pressed="${o.compact !== false}">${o.compact !== false ? '✓ 반복은 묶어 쓰기 ([A1]×2)' : '반복은 묶어 쓰기 ([A1]×2)'}</button>
      <button class="btn sec small" id="stordfol" aria-pressed="${o.follow !== false}">${o.follow !== false ? '✓ 순서대로 넘기기' : '순서대로 넘기기'}</button>
      <button class="btn small" id="stordpdf">PDF로 저장 (순서 포함)</button>
      ${o.items.length ? '<button class="btn sec small danger" id="stordclr">순서 모두 지우기</button>' : ''}
    </div>
    <p class="meta" id="stordmsg">${o.items.length ? '악보 위 글자는 PDF 악보 탭의 “고르기·옮기기”로 옮기거나 지우개로 지울 수 있어요.' : ''}</p>
  </div>`;
  const msg = t => { const m = $('stordmsg'); if (m) m.textContent = t; };
  const redo = () => { const pl = stgPlaylist(); if (!pl || STG.play >= pl.length) stgPlayReset(); else STG.ordCur = pl[Math.max(0, STG.play)].i; stgOrdSave(song); stgPanel('order', true); };
  // 찾을 쪽 범위 → 그 쪽만 보이는 악보처럼 넘겨요 (찾은 쪽 번호는 다시 원래 번호로)
  const rng = () => {
    const n = STG.doc.pages.length, f = $('stordfrom'), t = $('stordto');
    let a = Math.max(1, Math.min(n, Math.round(+(f ? f.value : 1) || 1))), b = Math.max(a, Math.min(n, Math.round(+(t ? t.value : n) || n)));
    o.from = a; o.to = b; stgSaveSongs();
    const d = STG.doc;
    return { off: a - 1, doc: { pages: d.pages.slice(a - 1, b), draw: (i, c, w) => d.draw(i + a - 1, c, w) } };
  };
  soSample().then(S => { const b = $('stordai'); if (b && S) { b.hidden = false; $('stordloc').classList.add('sec'); } });
  $('stordai').onclick = async () => {
    const b = $('stordai'); b.disabled = true; $('stordloc').disabled = true; msg('Claude가 악보를 읽는 중… (보통 20초~1분)');
    try {
      const R = rng();
      const r = await soAskClaude(R.doc, song.title, (i, n) => msg(`악보를 준비하는 중… (${i + 1}/${n}쪽)`));
      r.secs.forEach(x => (x.p += R.off));
      if (stgSong() !== song) return;
      r.secs.forEach(x => (x.read = true)); // Claude가 악보에서 읽은 이름
      o.secs = r.secs; o.items = r.order.map(t => ({ t, s: r.secs.findIndex(x => x.name === t) }));
      o.written = r.written; o.note = r.note; o.src = 'claude'; o.show = true; STG.ordSel = -1;
      await stgRegEnsure(song); stgPlayReset();
      if (STG.hl === 'off') { STG.hl = 'fill'; stgSaveOpts(); } // 순서대로 넘길 때 지금 부분이 보이게
      stgOrdSave(song); stgDraw(); stgPanel('order', true);
      msg(o.items.length ? `순서를 만들었어요: 구간 ${o.items.length}칸. 틀린 곳은 눌러서 고쳐 주세요.` : '순서를 찾지 못했어요. 아래에서 직접 만들어 주세요.');
    } catch (e) { msg(soErrText(e)); if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled' || e.code === 'images_unavailable')) b.hidden = true; }
    b.disabled = false; if ($('stordloc')) $('stordloc').disabled = false;
  };
  $('stordloc').onclick = async () => {
    const b = $('stordloc'); b.disabled = true;
    try {
      const R = rng();
      const r = await soDetectLocal(R.doc, (i, n) => msg(`악보를 살펴보는 중… (${i + R.off + 1}쪽)`));
      r.secs.forEach(x => (x.p += R.off));
      if (stgSong() !== song) return;
      o.secs = r.secs; o.items = r.order.map(k => ({ t: r.secs[k].name, s: k })); o.src = 'local'; o.written = ''; o.note = ''; o.show = true; STG.ordSel = -1;
      await stgRegEnsure(song); stgPlayReset();
      if (STG.hl === 'off') { STG.hl = 'fill'; stgSaveOpts(); } // 순서대로 넘길 때 지금 부분이 보이게
      stgOrdSave(song); stgDraw(); stgPanel('order', true);
      const unread = r.secs.filter(x => !x.read).length;
      msg(r.secs.length ? `구간 표시 상자 ${r.secs.length}개, 도돌이표 ${r.marks.length}개를 찾아 순서를 만들었어요. 상자 글자는 ${r.secs.length - unread}개 읽었어요.${unread ? ` 못 읽은 상자는 X·Y·Z 같은 새 문자로 쓰고, 악보의 그 자리에 빨간 이름표를 붙였어요. 칸을 눌러 이름을 바꿀 수 있어요 — 같은 칸은 한꺼번에 바뀌어요.` : ' 틀린 이름은 눌러서 고쳐 주세요.'}` : `구간 표시 상자를 찾지 못했어요${r.marks.length ? ` (도돌이표 ${r.marks.length}개는 찾았어요)` : ''}. 아래에서 이름을 눌러 직접 순서를 만들어 주세요.`);
    } catch (e) { msg('악보를 살펴보지 못했어요.'); }
    if ($('stordloc')) $('stordloc').disabled = false;
  };
  // 한 줄로 적은 순서 → 칸들. 악보의 구간 표시를 아직 안 찾았으면 먼저 찾아서, 같은 이름(In = Intro, C = Chorus)의 구간과 이어요
  const typeIn = async () => {
    const names = soParseOrder($('stordtxt').value);
    if (!names.length) { msg('순서를 적어 주세요. 예: In · (V · C)x2 · Out'); return; }
    const b = $('stordtxtb'); b.disabled = true;
    if ((!o.secs || !o.secs.length) && STG.doc) {
      msg('악보의 구간 표시를 찾는 중… (순서대로 넘기기에 써요)');
      try { const R = rng(); const r = await soDetectLocal(R.doc, () => {}); r.secs.forEach(x => (x.p += R.off)); if (stgSong() !== song) return; o.secs = r.secs; o.src = 'local'; } catch (e) {}
    }
    if (stgSong() !== song) return;
    o.secs = o.secs || [];
    o.items = names.map(t => ({ t, s: soMatchSec(t, o.secs) }));
    o.show = true; o.written = ''; o.note = ''; STG.ordSel = -1;
    if (o.items.some(it => it.s >= 0)) { await stgRegEnsure(song); if (STG.hl === 'off') { STG.hl = 'fill'; stgSaveOpts(); } }
    stgPlayReset(); stgOrdSave(song); stgDraw(); stgPanel('order', true);
    const hit = o.items.filter(it => it.s >= 0).length;
    msg(`순서 ${o.items.length}칸을 넣고 악보 위에 썼어요.` + (!o.secs.length ? '' : hit === o.items.length ? ' 칸마다 악보의 구간을 찾아서, “다음”을 누르면 순서대로 넘어가요.' : hit ? ` 악보의 구간과 이은 칸은 ${hit}개예요. 안 이어진 칸은 눌러서 악보에 적힌 이름으로 바꾸면 이어져요.` : ' 악보의 구간 이름과 달라서 순서대로 넘기기는 꺼져 있어요. 칸을 눌러 악보에 적힌 이름으로 바꾸면 돼요.'));
  };
  $('stordtxtb').onclick = typeIn;
  $('stordtxt').onkeydown = e => { if (e.key === 'Enter') typeIn(); };
  el.querySelectorAll('.stordc').forEach(b => (b.onclick = () => { const k = +b.dataset.k; STG.ordSel = STG.ordSel === k ? -1 : k; stgPanel('order', true); }));
  const ins = t => { t = String(t || '').trim().slice(0, 24); if (!t) return; const at = sel >= 0 ? sel + 1 : o.items.length; o.items.splice(at, 0, { t, s: o.secs.findIndex(x => x.name === t) }); STG.ordSel = at; redo(); };
  el.querySelectorAll('.stordn').forEach(b => (b.onclick = () => ins(b.dataset.n)));
  $('stordinb').onclick = () => ins($('stordin').value);
  $('stordin').onkeydown = e => { if (e.key === 'Enter') ins($('stordin').value); };
  if (sel >= 0) {
    const mv = d => { const j = sel + d; if (j < 0 || j >= o.items.length) return; [o.items[sel], o.items[j]] = [o.items[j], o.items[sel]]; STG.ordSel = j; redo(); };
    $('stordl').onclick = () => mv(-1); $('stordr').onclick = () => mv(1);
    $('storddel').onclick = () => { o.items.splice(sel, 1); STG.ordSel = Math.min(sel, o.items.length - 1); redo(); };
    const ren = () => {
      const t = $('stordname').value.trim().slice(0, 24); if (!t) return;
      const it = o.items[sel], old = it.t;
      if (it.s >= 0) { // 같은 구간(같은 모양의 상자 묶음)은 한꺼번에
        const all = !$('stordall') || $('stordall').checked;
        const g = o.secs[it.s].g, same = k => k === it.s || (all && g != null && o.secs[k] && o.secs[k].g === g && o.secs[k].name === old);
        if (!all) o.secs[it.s].g = null; // 따로 떼어 낸 상자는 묶음에서 빼요
        const hit = new Set(o.secs.map((x, k) => k).filter(same)); // 먼저 고를 것을 다 정한 뒤에 바꿔요
        o.secs.forEach((x, k) => { if (hit.has(k)) { x.name = t; x.auto = false; } });
        o.items.forEach(x => { if (hit.has(x.s)) x.t = t; });
      }
      else it.t = t;
      if (old !== t) redo();
    };
    $('stordren').onclick = ren;
    $('stordname').onkeydown = e => { if (e.key === 'Enter') ren(); };
    if ($('stordgo')) $('stordgo').onclick = () => { const sc = o.secs[o.items[sel].s]; if (sc) stgJump({ tp: sc.p, ty: sc.y, tx: sc.x || 0.1, label: o.items[sel].t }); };
  }
  $('stordshow').onclick = () => { o.show = !o.show; redo(); };
  const font = f => {
    const isPdf = STG.doc && STG.doc.kind === 'pdf', off = (STG.doc && STG.doc.off) || 0, nP = stgPages();
    const mine = x => x.type === 'order' && (!isPdf || (x.page >= off && x.page < off + nP));
    const list = isPdf ? lsGet(STG.annoKey, []) || [] : null, a = isPdf ? list.find(mine) : o.anno;
    if (!a) return;
    a.fs0 = Math.max(4, (a.fs0 || a.fs) * f);
    if (isPdf) lsSet(STG.annoKey, list);
    stgOrdWrite(song);
  };
  $('stordfm').onclick = () => font(1 / 1.15); $('stordfp').onclick = () => font(1.15);
  $('stordpdf').onclick = () => stgOrdExport(song);
  $('stordshort').onclick = () => { o.short = o.short === false; redo(); };
  $('stordcmp').onclick = () => { o.compact = o.compact === false; redo(); };
  $('stordfol').onclick = () => { o.follow = o.follow === false; stgSaveSongs(); stgPlayReset(); stgDraw(); stgPanel('order', true); };
  if ($('stordclr')) { const c = $('stordclr'); c.onclick = () => { if (!c.dataset.arm) { c.dataset.arm = '1'; c.textContent = '한 번 더 누르면 모두 지워요'; return; } o.items = []; o.written = ''; o.note = ''; STG.ordSel = -1; redo(); }; }
}
// 곡 전체를 PDF로: 쪽마다 그림 + 표시 + 순서 글자. PDF 곡은 원래 악보·표시를 같이 넣어 다시 고칠 수 있게 해요
async function stgOrdExport(song) {
  if (!song || !STG.doc || typeof pdfWriteFile !== 'function') return;
  const b = $('stordpdf'), msg = t => { const m = $('stordmsg'); if (m) m.textContent = t; };
  if (b) b.disabled = true;
  try {
    await stgOrdWrite(song);
    const doc = STG.doc, all = stgAnnosAll(), pages = [], dpr = Math.min(2.5, window.devicePixelRatio || 1);
    await pdfImgsReady(all);
    for (let i = 0; i < doc.pages.length; i++) {
      msg(`PDF 만드는 중… ${i + 1} / ${doc.pages.length}쪽`);
      const P = doc.pages[i], c = document.createElement('canvas');
      await doc.draw(i, c, Math.min(2200, P.w * 2.6) / dpr);
      const ctx = c.getContext('2d'), pa = all.filter(a => a.page === i);
      pa.filter(a => a.type === 'cover').concat(pa.filter(a => a.type !== 'cover')).forEach(a => pdfAnnoCanvas(ctx, a, c.width / P.w));
      pages.push({ canvas: c, w: P.w, h: P.h });
    }
    let keep = null;
    if (doc.kind === 'pdf' && !doc.full) { const rec = await fileGet(song.fileKey); if (rec) keep = { orig: new Uint8Array(rec.parts[0].buf), name: rec.parts[0].name, annos: lsGet(STG.annoKey, []) || [], libKey: song.fileKey }; }
    const { bytes } = await pdfWriteFile(pages, keep);
    const name = (song.title || '악보') + ' (순서).pdf';
    const r = await saveFile(bytes, name, 'application/pdf');
    msg(r === 'saved' ? `“${name}”로 저장했어요.${keep ? ' 이 파일을 이 앱에서 다시 열면 순서 글자와 표시를 지우거나 고칠 수 있어요.' : ''}` : r === 'declined' ? '저장을 취소했어요.' : '여기서는 저장하지 못했어요.');
  } catch (e) { msg('PDF로 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  if (b) b.disabled = false;
}

// ───────── 순서대로 넘기기 ─────────
// 순서(예: In - A1 - A1 - B …)와 구간(악보 줄)이 있으면, 다음을 누를 때 순서를 따라 구간을 옮겨 가요.
// 같은 A1이 두 번이면 A1 끝에서 다시 A1 처음으로 돌아가요. 지금 칸은 악보 위 순서 글자에서 색이 바뀌어요.
function stgPlaylist() {
  const s = stgSong(), o = s && s.order, R = stgRegs();
  if (!o || o.follow === false || !o.items || !o.items.length || !R.length || !o.secs || !o.secs.length) return null;
  const secs = o.secs.map((x, k) => ({ k, p: x.p, y: x.y, x: x.x || 0 })).sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
  // 구간 이름 상자 바로 아래의 악보 줄 = 그 구간의 첫 줄
  const first = {};
  secs.forEach(x => { let k = R.findIndex(r => r.p === x.p && r.y + r.h / 2 > x.y); if (k < 0) k = R.findIndex(r => r.p > x.p); first[x.k] = k; });
  // 찾을 쪽 범위의 끝 쪽까지만 (여러 곡이 든 PDF)
  const endReg = o.to ? (k => (k < 0 ? R.length : k))(R.findIndex(r => r.p >= o.to)) : R.length;
  const range = k => {
    const a = first[k]; if (a == null || a < 0 || a >= endReg) return [];
    let b = endReg;
    const j = secs.findIndex(x => x.k === k);
    for (let m = j + 1; m < secs.length; m++) { const f = first[secs[m].k]; if (f != null && f > a) { b = Math.min(b, f); break; } }
    return Array.from({ length: b - a }, (_, i) => a + i);
  };
  const list = [];
  o.items.forEach((it, i) => {
    let k = it.s >= 0 && o.secs[it.s] ? it.s : o.secs.findIndex(x => x.name === it.t);
    if (k < 0) return;
    range(k).forEach(r => list.push({ r, i }));
  });
  return list.length ? list : null;
}
// 순서대로 넘기려면 악보 줄(구간)이 있어야 해요: 없으면 조용히 자동으로 나눠 둬요
async function stgRegEnsure(song) {
  if (!song || stgSong() !== song || !STG.doc || (song.regions && song.regions.length)) return;
  const doc = STG.doc, out = [];
  for (let i = 0; i < doc.pages.length && i < 40; i++) {
    let f = [];
    try { f = await pgDetect(doc, i, 205); } catch (e) { f = []; }
    f.forEach(q => out.push({ p: i, x: q.x, y: q.y, w: q.w, h: q.h }));
  }
  if (stgSong() !== song || !out.length) return;
  song.regions = out; stgRegSort(song); stgSaveSongs();
}
// 악보 위쪽 순서 막대: 어느 쪽을 보고 있어도 지금 순서 칸이 색으로 보여요. 칸을 누르면 그 칸으로 가요
function stgOrdBar() {
  const el = $('stordbar'); if (!el) return;
  const s = stgSong(), o = s && s.order;
  if (!o || !o.items || !o.items.length || o.show === false) { el.hidden = true; el.innerHTML = ''; return; }
  const PL = stgPlaylist();
  const toks = o.compact === false ? o.items.map((_, j) => ({ type: 'item', j, ks: [j] })) : soCompress(o.items.map(it => it.t));
  const itemHtml = t => {
    const it = o.items[t.j], sec = it.s >= 0 ? o.secs[it.s] : null;
    const body = escH(o.short === false || (sec && sec.auto) ? it.t : soShort(it.t));
    return `<button class="stob${t.ks.includes(STG.ordCur) ? ' cur' : ''}" data-k="${t.j}" title="${escH(it.t)}">${body}</button>`;
  };
  const J = '<span class="stobj">-</span>';
  const html = soUnits(toks).map(u => {
    const inner = u.items.map(itemHtml).join(J);
    if (u.n < 2) return inner;
    const on = [].concat(...u.items.map(t => t.ks)).includes(STG.ordCur);
    return `<span class="stobg${on ? ' on' : ''}">${inner}</span><span class="stobn${u.repKs.includes(STG.ordCur) ? ' cur' : ''}" title="${u.n}번 반복">×${u.n}</span>`;
  }).join(J);
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = '<span class="stobl">순서</span>' + html; }
  el.hidden = false;
  el.querySelectorAll('.stob').forEach(b => (b.onclick = () => {
    if (stgFollowing()) return stgFollowMsg();
    const k = +b.dataset.k, P = stgPlaylist();
    const j = P ? P.findIndex(e => e.i === k) : -1;
    if (j >= 0) stgPlayGo(j);
    else { const sec = o.items[k].s >= 0 ? o.secs[o.items[k].s] : null; if (sec) stgJump({ tp: sec.p, ty: sec.y, tx: sec.x || 0.1, label: o.items[k].t }); }
  }));
  // 지금 칸이 안 보이면 막대를 밀어 보여 줘요 (크게 보기에서는 양옆 버튼 자리를 빼고)
  const c = el.querySelector('.stob.cur');
  if (c) {
    const cs = getComputedStyle(el), r = c.getBoundingClientRect(), er = el.getBoundingClientRect();
    const L = er.left + (parseFloat(cs.paddingLeft) || 0), R = er.right - (parseFloat(cs.paddingRight) || 0);
    if (r.left < L || r.right > R) el.scrollLeft += r.left - L - (R - L) / 3;
  }
}
function stgPlayGo(i, quiet) {
  const pl = stgPlaylist(), e = pl && pl[i]; if (!e) return false;
  STG.play = i; STG.ordCur = e.i;
  const turned = stgRegGo(e.r, true);
  if (!turned) document.querySelectorAll('#stv .stpg').forEach(stgDrawAnnos);
  stgNav();
  if (STG.panel === 'order') document.querySelectorAll('.stordc').forEach(b => b.classList.toggle('cur', +b.dataset.k === e.i));
  if (!quiet) stgBroadcast();
  return turned;
}
// 노래를 처음 열 때: 순서의 첫 칸
function stgPlayReset() {
  const pl = stgPlaylist();
  STG.play = pl ? 0 : -1; STG.ordCur = pl ? pl[0].i : -1;
  if (pl) STG.reg = pl[0].r;
}

// ───────── 악보 확대 ─────────
// 곡마다 기억해요: song.zoom (1 = 쪽 전체가 화면에 맞게), song.cropOn + song.crop (여백 자르기)
const STG_ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const STG_ZMAX = 4;
function stgZoom() { const s = stgSong(); return s && s.zoom > 1 ? Math.min(STG_ZMAX, s.zoom) : 1; }
function stgCrop() { const s = stgSong(); return s && s.cropOn && s.crop && s.crop.fk === s.fileKey ? s.crop : null; }
// 폭 맞춤: 쪽의 가로가 화면 가로에 꽉 차는 배율
function stgWidthZoom() {
  if (!STG.doc) return 1;
  const { W, H } = stgArea(), i = STG.mode === 'half' ? Math.floor(STG.pos / 2) : STG.mode === 'scroll' ? 0 : STG.pos;
  if (STG.mode === 'scroll') return Math.max(1, W / Math.min(W, 1100));
  const base = STG.mode === 'two' ? Math.min(W / 2 - 4, H / stgAR(i)) : Math.min(W, H / stgAR(i));
  return Math.max(1, Math.min(STG_ZMAX, (STG.mode === 'two' ? W / 2 - 4 : W) / base));
}
// 확대 바꾸기. at = {x, y}: 화면에서 이 점이 그대로 있게 (두 손가락 가운데, 마우스 위치)
function stgZoomTo(z, at) {
  const s = stgSong(); if (!s || !STG.doc) return;
  z = Math.max(1, Math.min(STG_ZMAX, Math.round(z * 100) / 100));
  const z0 = stgZoom(); if (Math.abs(z - z0) < 0.005) return stgZoomUI();
  const sc = STG.mode === 'scroll' ? $('stscroll') : $('stv');
  const r = sc ? sc.getBoundingClientRect() : null;
  const ax = at && r ? at.x - r.left : (sc ? sc.clientWidth / 2 : 0), ay = at && r ? at.y - r.top : (sc ? sc.clientHeight / 2 : 0);
  const cx = sc ? (sc.scrollLeft + ax) / (sc.scrollWidth || 1) : 0, cy = sc ? (sc.scrollTop + ay) / (sc.scrollHeight || 1) : 0;
  s.zoom = z; stgSaveSongs();
  stgDraw();
  const sc2 = STG.mode === 'scroll' ? $('stscroll') : $('stv');
  if (sc2) { sc2.scrollLeft = cx * sc2.scrollWidth - ax; sc2.scrollTop = cy * sc2.scrollHeight - ay; }
}
function stgZoomStep(d) {
  const z = stgZoom();
  const next = d > 0 ? STG_ZOOMS.find(x => x > z + 0.01) : [...STG_ZOOMS].reverse().find(x => x < z - 0.01);
  stgZoomTo(next || (d > 0 ? STG_ZMAX : 1));
}
function stgZoomUI() {
  const z = stgZoom(), s = stgSong();
  if ($('stzv')) $('stzv').textContent = z <= 1.001 ? '쪽 맞춤' : Math.round(z * 100) + '%';
  if ($('stzo')) $('stzo').disabled = z <= 1.001;
  if ($('stzi')) $('stzi').disabled = z >= STG_ZMAX - 0.001;
  if ($('stzw')) $('stzw').textContent = z > 1.01 ? '쪽 맞춤으로' : '폭 맞춤';
  if ($('stcropb')) $('stcropb').setAttribute('aria-pressed', !!(s && s.cropOn));
}
// 여백 자르기: 모든 쪽에서 악보가 있는 부분을 찾아(작게 그려서), 그 바깥 흰 여백을 잘라 크게 보여요
async function stgCropToggle() {
  const s = stgSong(); if (!s || !STG.doc) return;
  if (s.cropOn) { s.cropOn = false; stgSaveSongs(); stgDraw(); stgSay('여백 자르기를 껐어요.'); return; }
  if (!s.crop || s.crop.fk !== s.fileKey) {
    const b = $('stcropb'); if (b) b.disabled = true;
    stgSay('악보 둘레의 흰 여백을 찾는 중…');
    try { s.crop = await stgFindCrop(STG.doc, s.fileKey); } catch (e) { s.crop = null; }
    if (b) b.disabled = false;
    if (!s.crop) { stgSay('잘라낼 여백이 거의 없어요.'); return; }
  }
  s.cropOn = true; stgSaveSongs(); stgDraw();
  stgSay('여백을 잘라서 악보를 크게 보여요. 다시 누르면 원래대로 돌아가요.');
}
async function stgFindCrop(doc, fk) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  const n = Math.min(doc.pages.length, 40);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    await doc.draw(i, c, 260 / Math.min(2.5, window.devicePixelRatio || 1));
    const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11 < 200) { rows[y]++; cols[x]++; }
    }
    // 먼지 같은 점 몇 개는 무시해요
    const ry = rows.findIndex(v => v > 1), ry2 = h - 1 - [...rows].reverse().findIndex(v => v > 1);
    const cx = cols.findIndex(v => v > 1), cx2 = w - 1 - [...cols].reverse().findIndex(v => v > 1);
    if (ry < 0 || cx < 0) continue;
    x0 = Math.min(x0, cx / w); x1 = Math.max(x1, (cx2 + 1) / w); y0 = Math.min(y0, ry / h); y1 = Math.max(y1, (ry2 + 1) / h);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 0.015;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(1, x1 + pad); y1 = Math.min(1, y1 + pad);
  if ((x1 - x0) * (y1 - y0) > 0.94) return null; // 거의 안 잘리면 그대로
  return { fk, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// 두 손가락으로 벌리고 오므리기 (휴대폰·태블릿), Ctrl + 마우스 휠 (컴퓨터)
function stgPinchBind() {
  const v = $('stv');
  let P = null;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  v.addEventListener('touchstart', e => {
    if (e.touches.length !== 2 || !STG.doc) return;
    const sc = STG.mode === 'scroll' ? $('stscroll') : v, inner = sc && sc.firstElementChild;
    if (!sc || !inner) return;
    STG.swipe = null;
    const m = mid(e.touches), r = inner.getBoundingClientRect();
    inner.style.transformOrigin = `${m.x - r.left}px ${m.y - r.top}px`;
    P = { d0: dist(e.touches), z0: stgZoom(), z: stgZoom(), m, inner };
  }, { passive: true });
  v.addEventListener('touchmove', e => {
    if (!P || e.touches.length !== 2) return;
    e.preventDefault(); // 화면 전체가 확대되지 않게
    P.z = Math.max(1, Math.min(STG_ZMAX, P.z0 * dist(e.touches) / P.d0));
    P.m = mid(e.touches);
    P.inner.style.transform = `scale(${P.z / P.z0})`;
  }, { passive: false });
  const end = e => {
    if (!P || (e.touches && e.touches.length >= 2)) return;
    const p = P; P = null; STG.pinchAt = Date.now();
    p.inner.style.transform = ''; p.inner.style.transformOrigin = '';
    stgZoomTo(p.z, p.m);
  };
  v.addEventListener('touchend', end); v.addEventListener('touchcancel', end);
  v.addEventListener('wheel', e => {
    if (!e.ctrlKey || !STG.doc) return;
    e.preventDefault();
    clearTimeout(STG.wheelT);
    STG.wheelZ = (STG.wheelZ || stgZoom()) * Math.exp(-e.deltaY * 0.01);
    STG.wheelZ = Math.max(1, Math.min(STG_ZMAX, STG.wheelZ));
    const at = { x: e.clientX, y: e.clientY };
    STG.wheelT = setTimeout(() => { const z = STG.wheelZ; STG.wheelZ = 0; stgZoomTo(z, at); }, 90);
  }, { passive: false });
}

// ───────── 패널: 곡·콘티 관리 · 메트로놈 · 반주 · 점프 링크 ─────────
function stgPanel(p, keep) {
  if (STG.lock) return;
  if (!keep) STG.panel = STG.panel === p ? '' : p;
  const el = $('stpanel'); if (!el) return;
  const h0 = el.hidden ? 0 : el.offsetHeight;
  el.hidden = !STG.panel;
  stgApplyClasses();
  if (STG.panel !== 'link') STG.link = null;
  if (STG.panel !== 'reg') STG.regSel = -1;
  if ($('stv')) $('stv').classList.toggle('stregedit', STG.panel === 'reg');
  const song = stgSong();
  if (STG.panel === 'manage') stgPanelManage(el, song);
  else if (STG.panel === 'metro') stgPanelMetro(el, song);
  else if (STG.panel === 'audio') stgPanelAudio(el, song);
  else if (STG.panel === 'link') stgPanelLink(el, song);
  else if (STG.panel === 'reg') stgPanelReg(el, song);
  else if (STG.panel === 'order') stgPanelOrder(el, song);
  else if (STG.panel === 'split' && typeof tmPanelSplit === 'function') tmPanelSplit(el);
  else el.innerHTML = '';
  stgRedrawOverlays();
  stgRegInkAll();
  stgNav();
  // 도구 칸을 열거나 닫으면 악보가 들어갈 자리가 바뀌어요: 새 크기에 맞춰 다시 그려요
  if (!keep && (el.hidden ? 0 : el.offsetHeight) !== h0) { clearTimeout(STG.plT); STG.plT = setTimeout(stgLayout, 30); }
}
function stgPanelManage(el, song) {
  const set = STG.sets.find(s => s.id === STG.setId);
  el.innerHTML = `
    <div class="stcols">
      <div class="stcol">
        <h3>이 곡</h3>
        ${song ? `<div class="stform">
          <label>제목<input type="text" id="stft" maxlength="60" value="${escH(song.title)}"></label>
          <label>키<span class="stkey"><button type="button" id="stfkd" aria-label="반음 내리기">−</button><input type="text" id="stfk" maxlength="12" value="${escH(song.key || '')}" placeholder="예: Bb"><button type="button" id="stfku" aria-label="반음 올리기">+</button></span></label>
          <label>빠르기 (BPM)<input type="number" id="stfb" min="30" max="260" value="${song.bpm || 90}"></label>
          <label>한 마디 박 수<input type="number" id="stfn" min="1" max="12" value="${song.beats || 4}"></label>
          <label>곡 길이 (초, 자동 스크롤)<input type="number" id="stfs" min="20" max="1800" value="${song.secs || 240}"></label>
        </div>
        <p class="meta stkeyh" id="stfkh">${escH(tmKeyHint(song))}</p>
        <div class="btns">${STG.doc && STG.doc.kind === 'pdf' && ((STG.doc.full || STG.doc).pages.length > 1) ? `<button class="btn sec small" id="stsplit">${stgRange(song) ? '곡 나눈 것 고치기' : '여러 곡이 든 PDF면: 곡별로 나누기'}</button>` : ''}<button class="btn sec small danger" id="stdel">이 곡 지우기</button></div>` : '<p class="meta">곡을 먼저 넣어 주세요.</p>'}
      </div>
      <div class="stcol">
        <h3>콘티 ${set ? '“' + escH(set.name) + '”' : ''}</h3>
        <div class="btns"><button class="btn small" id="stadd">+ PDF·사진 악보 올리기</button><button class="btn sec small" id="stfromlib">+ 내 악보함에서</button><button class="btn sec small" id="stex">예시 넣기</button></div>
        <input type="file" id="stfile" accept="application/pdf,.pdf,image/*" multiple hidden>
        <div id="stlibpick" hidden></div>
        <div class="stsetbar"><button class="btn sec small" id="stnewset">새 콘티 만들기</button>${set ? `<button class="btn sec small" id="strnset">콘티 이름 바꾸기</button><button class="btn sec small danger" id="stdelset">콘티 지우기</button>` : ''}</div>
        <ol class="stsl">${stgList().map((x, i, L) => `${i && set && L[i - 1].key && x.key && tmBridge(L[i - 1].key, x.key) ? `<li class="stbr" aria-hidden="true">↳ 연결 코드 ${tmBridge(L[i - 1].key, x.key)} (${escH(L[i - 1].key)} → ${escH(x.key)})</li>` : ''}<li class="${i === STG.idx ? 'on' : ''}"><button class="stslt" data-i="${i}">${escH(x.title)}</button><span class="meta">${[x.key, x.bpm ? '♩=' + x.bpm : ''].filter(Boolean).join(' ')}</span>${set ? `<span class="stslb"><button data-up="${i}" aria-label="위로">▲</button><button data-dn="${i}" aria-label="아래로">▼</button><button data-rm="${i}" aria-label="콘티에서 빼기">✕</button></span>` : `<span class="stslb">${STG.sets.length ? `<select data-to="${i}" aria-label="콘티에 넣기"><option value="">콘티에 넣기…</option>${STG.sets.map(s => `<option value="${s.id}">${escH(s.name)}</option>`).join('')}</select>` : ''}</span>`}</li>`).join('') || '<p class="meta">곡이 없어요.</p>'}</ol>
        ${tmLogHtml()}
      </div>
    </div>`;
  tmLogBind(el);
  if (song) {
    const up = () => { song.title = $('stft').value.trim() || song.title; song.key = $('stfk').value.trim(); song.bpm = Math.max(30, Math.min(260, +$('stfb').value || 90)); song.beats = Math.max(1, Math.min(12, +$('stfn').value || 4)); song.secs = Math.max(20, Math.min(1800, +$('stfs').value || 240)); stgSaveSongs(); stgFillPickers(); stgNav(); };
    ['stft', 'stfk', 'stfb', 'stfn', 'stfs'].forEach(id => ($(id).onchange = up));
    const kstep = d => { up(); if (tmKeyStep(song, d)) { $('stfk').value = song.key; $('stfkh').textContent = tmKeyHint(song); stgFillPickers(); stgNav(); } };
    $('stfkd').onclick = () => kstep(-1); $('stfku').onclick = () => kstep(1);
    $('stfk').oninput = () => { $('stfkh').textContent = tmKeyHint(Object.assign({}, song, { key: $('stfk').value })); };
    if ($('stsplit')) $('stsplit').onclick = () => tmSplitStart(song, false);
    const del = $('stdel');
    del.onclick = () => {
      if (!del.dataset.arm) { del.dataset.arm = '1'; del.textContent = '한 번 더 누르면 지워요 (악보 파일은 내 악보함에 남아요)'; return; }
      STG.songs = STG.songs.filter(x => x.id !== song.id); STG.sets.forEach(s => (s.songs = s.songs.filter(id => id !== song.id)));
      stgSaveSongs(); stgSaveSets(); STG.idx = Math.max(0, STG.idx - 1); STG.docKey = ''; stgLoadSong(true);
    };
  }
  $('stadd').onclick = () => $('stfile').click();
  $('stfile').onchange = e => stgAddFiles(e.target.files);
  $('stex').onclick = stgAddExample;
  $('stfromlib').onclick = async () => {
    const box = $('stlibpick'), files = (await fileList()).filter(f => f.type !== 'audio');
    box.hidden = false;
    box.innerHTML = files.length ? `<div class="stlibl">${files.map(f => `<button class="btn sec small" data-k="${escH(f.key)}">${escH(f.title || f.name)}</button>`).join('')}</div>` : '<p class="meta">내 악보함에 PDF·사진 악보가 없어요.</p>';
    box.querySelectorAll('[data-k]').forEach(b => (b.onclick = async () => {
      const rec = await fileGet(b.dataset.k); if (!rec) return;
      const parts = stgSongsForFile(rec.key).filter(stgRange).sort((x, y) => x.p0 - y.p0);
      if (parts.length) { stgAddManyToSet(parts); stgSay(`나눠 둔 곡 ${parts.length}개를 넣었어요.`); stgPanel('manage', true); return; }
      const s = stgSongForFile(rec); stgAddToSet(s); stgPanel('manage', true);
      if (s.fresh && typeof tmSplitAuto === 'function') tmSplitAuto(s);
    }));
  };
  $('stnewset').onclick = () => {
    const s = { id: rsId('t'), name: `콘티 ${STG.sets.length + 1}`, songs: song && STG.setId === 'all' ? [] : [] };
    STG.sets.push(s); stgSaveSets(); STG.setId = s.id; STG.idx = 0; stgSaveOpts(); stgFillPickers(); stgLoadSong(true);
    stgSay('새 콘티를 만들었어요. 위에서 곡을 올리거나 “모든 곡”에서 “콘티에 넣기”로 넣어 주세요.');
  };
  if (set) {
    $('strnset').onclick = () => { const box = $('stlibpick'); box.hidden = false; box.innerHTML = `<div class="pjform"><input type="text" id="stsetname" maxlength="40" value="${escH(set.name)}"><button class="btn small" id="stsetok">저장</button></div>`; $('stsetok').onclick = () => { set.name = $('stsetname').value.trim() || set.name; stgSaveSets(); stgFillPickers(); stgPanel('manage', true); }; };
    const ds = $('stdelset');
    ds.onclick = () => { if (!ds.dataset.arm) { ds.dataset.arm = '1'; ds.textContent = '한 번 더 누르면 콘티를 지워요 (곡은 남아요)'; return; } STG.sets = STG.sets.filter(x => x.id !== set.id); stgSaveSets(); STG.setId = 'all'; STG.idx = 0; stgSaveOpts(); stgLoadSong(true); };
  }
  el.querySelectorAll('.stslt').forEach(b => (b.onclick = () => { if (stgFollowing()) return stgFollowMsg(); STG.idx = +b.dataset.i; STG.pos = 0; stgLoadSong(true); stgBroadcast(); }));
  el.querySelectorAll('[data-up],[data-dn]').forEach(b => (b.onclick = () => {
    const i = +(b.dataset.up ?? b.dataset.dn), j = b.dataset.up != null ? i - 1 : i + 1;
    if (!set || j < 0 || j >= set.songs.length) return;
    [set.songs[i], set.songs[j]] = [set.songs[j], set.songs[i]];
    if (STG.idx === i) STG.idx = j; else if (STG.idx === j) STG.idx = i;
    stgSaveSets(); stgFillPickers(); stgPanel('manage', true); stgNav();
  }));
  el.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { const i = +b.dataset.rm; set.songs.splice(i, 1); if (STG.idx >= set.songs.length) STG.idx = Math.max(0, set.songs.length - 1); stgSaveSets(); stgLoadSong(true); }));
  el.querySelectorAll('[data-to]').forEach(sel => (sel.onchange = () => { const s = STG.sets.find(x => x.id === sel.value), song2 = stgList()[+sel.dataset.to]; if (s && song2) { s.songs.push(song2.id); stgSaveSets(); stgFillPickers(); stgSay(`“${song2.title}”을(를) “${s.name}”에 넣었어요.`); } sel.value = ''; }));
}
function stgAddToSet(s) { stgAddManyToSet([s]); }
// 여러 곡을 지금 콘티 끝에 넣고 첫 곡을 열어요
function stgAddManyToSet(list) {
  if (!list.length) return;
  const set = STG.sets.find(x => x.id === STG.setId);
  if (set) { list.forEach(s => { if (!set.songs.includes(s.id)) set.songs.push(s.id); }); stgSaveSets(); }
  STG.idx = Math.max(0, stgList().findIndex(x => x.id === list[0].id)); STG.pos = 0;
  stgLoadSong(true);
}
async function stgAddFiles(files) {
  if (!files || !files.length) return;
  try {
    files = [...files];
    // 이 앱에서 저장한 PDF면 원래 악보 + 고친 표시로 되돌려 넣어요 (저장한 뒤에도 지우고 고칠 수 있게)
    if (files.length === 1 && typeof pdfUnwrap === 'function') {
      try { const u = await pdfUnwrap(files[0]); if (u) { files = [u.file]; lsSet('mh-pdf-' + u.file.name + '-' + u.file.size, u.annos); } } catch (er) {}
    }
    const rec = await fileSaveFrom(files);
    // 이미 곡별로 나눠 둔 PDF면 나눈 곡들을 그대로 넣어요
    const parts = stgSongsForFile(rec.key).filter(stgRange).sort((x, y) => x.p0 - y.p0);
    if (parts.length) { stgAddManyToSet(parts); stgSay(`이 PDF는 곡 ${parts.length}개로 나눠 두었어요. 나눈 곡을 넣었어요.`); if (STG.panel === 'manage') stgPanel('manage', true); return; }
    const s = stgSongForFile(rec);
    stgAddToSet(s);
    stgSay(`“${s.title}”을(를) 넣었어요. “곡·콘티 관리”에서 키·빠르기를 정할 수 있어요.`);
    if (STG.panel === 'manage') stgPanel('manage', true);
    if (s.fresh && typeof tmSplitAuto === 'function') tmSplitAuto(s); // 여러 곡이 든 PDF인지 살펴봐요
  } catch (e) { stgSay(typeof e === 'string' ? e : '파일을 넣지 못했어요.'); }
}

// 메트로놈: 곡의 빠르기·박자 / 카운트인(1마디) / 소리 · 화면 깜빡임
function stgPanelMetro(el, song) {
  if (!song) { el.innerHTML = '<p class="meta">곡을 먼저 넣어 주세요.</p>'; return; }
  const M = STG.metro;
  el.innerHTML = `<div class="stmetro">
    <span class="fw"><button id="stbm" aria-label="느리게">−</button><output id="stbpm">♩ = ${song.bpm || 90}</output><button id="stbp" aria-label="빠르게">+</button></span>
    <span class="meta">${song.beats || 4}박</span>
    <button class="btn" id="stmgo">${M.on && !M.count ? '■ 멈추기' : '▶ 메트로놈'}</button>
    <button class="btn sec" id="stmcount">카운트인 (1마디)</button>
    <label class="btck"><input type="checkbox" id="stmsnd"${M.sound ? ' checked' : ''}> 소리</label>
    <label class="btck"><input type="checkbox" id="stmfl"${M.flash ? ' checked' : ''}> 화면 깜빡임</label>
    <span class="stdots" id="stdots">${Array.from({ length: song.beats || 4 }, (_, i) => `<i data-b="${i}"></i>`).join('')}</span></div>`;
  const bpm = d => { song.bpm = Math.max(30, Math.min(260, (song.bpm || 90) + d)); stgSaveSongs(); $('stbpm').textContent = `♩ = ${song.bpm}`; stgNav(); };
  $('stbm').onclick = () => bpm(-2); $('stbp').onclick = () => bpm(2);
  $('stmgo').onclick = () => { if (M.on && !M.count) stgMetroStop(); else stgMetroStart(false); stgPanel('metro', true); };
  $('stmcount').onclick = () => { stgMetroStart(true); };
  $('stmsnd').onchange = e => (M.sound = e.target.checked);
  $('stmfl').onchange = e => (M.flash = e.target.checked);
}
function stgMetroStart(count) {
  const song = stgSong(); if (!song) return;
  stgMetroStop();
  ensureAC(); AC.resume();
  const M = STG.metro;
  M.on = true; M.count = count; M.beat = 0; M.left = count ? (song.beats || 4) : -1; M.next = AC.currentTime + 0.08;
  const tick = () => {
    const s = stgSong(); if (!s) return stgMetroStop();
    const sd = 60 / (s.bpm || 90), n = s.beats || 4;
    while (M.next < AC.currentTime + 0.15) {
      const b = M.beat % n, t = M.next;
      if (M.sound) stgClick(t, b === 0);
      const wait = Math.max(0, (t - AC.currentTime) * 1000);
      setTimeout(() => stgBeatFlash(b), wait);
      M.next += sd; M.beat++;
      if (M.left > 0 && --M.left === 0) { setTimeout(() => { stgMetroStop(); stgSay('카운트인 끝 — 시작!'); }, wait + sd * 1000 * 0.6); M.next = Infinity; break; }
    }
  };
  tick(); M.timer = setInterval(tick, 30);
}
function stgMetroStop() { const M = STG.metro; if (M.timer) clearInterval(M.timer); M.timer = null; M.on = false; M.count = false; if ($('stmgo')) $('stmgo').textContent = '▶ 메트로놈'; }
function stgMetroReset() { if (STG.metro.on) stgMetroStop(); }
function stgClick(t, down) {
  const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = down ? 2600 : 1900;
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(down ? 0.3 : 0.18, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  o.connect(g); g.connect(MASTER); o.start(t); o.stop(t + 0.05);
}
function stgBeatFlash(b) {
  if (!STG.metro.on && !STG.metro.count) return;
  document.querySelectorAll('#stdots i').forEach((d, i) => d.classList.toggle('now', i === b));
  if (!STG.metro.flash) return;
  const v = $('stv'); if (!v) return;
  v.classList.remove('beat', 'beat1'); void v.offsetWidth; v.classList.add(b === 0 ? 'beat1' : 'beat');
  setTimeout(() => v.classList.remove('beat', 'beat1'), 130);
}

// 반주 음원: 곡마다 하나. A-B 구간 반복
function stgPanelAudio(el, song) {
  if (!song) { el.innerHTML = '<p class="meta">곡을 먼저 넣어 주세요.</p>'; return; }
  const a = song.audio, A = STG.audio;
  el.innerHTML = `<div class="staudio">
    ${a ? `<b>${escH(a.name)}</b>` : '<span class="meta">이 곡의 반주 음원(MR·연습 음원)을 붙이면 여기서 틀 수 있어요.</span>'}
    <label class="fpick fsmall"><span class="fpbtn">${a ? '음원 바꾸기' : '음원 파일 고르기'}</span><input class="fpin" type="file" id="staf" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"></label>
    ${a ? `<div class="strow"><span class="meta">빠르기</span><div class="seg" id="starate"></div><span class="meta">느리게 해도 음 높이는 그대로예요</span></div>
    <div class="btns"><button class="btn" id="stap">${A.el && !A.el.paused ? '■ 멈추기' : '▶ 재생'}</button><button class="btn sec small" id="staa">A 지점 = 지금 (${a.a != null ? stgTime(a.a) : '없음'})</button><button class="btn sec small" id="stab">B 지점 = 지금 (${a.b != null ? stgTime(a.b) : '없음'})</button><label class="btck"><input type="checkbox" id="stal"${A.loop ? ' checked' : ''}> A-B 반복</label><button class="btn sec small" id="staclr">A-B 지우기</button><button class="btn sec small danger" id="stadel">음원 떼기</button></div>
    <input type="range" id="stapos" min="0" max="1000" value="0" aria-label="재생 위치"><span class="meta" id="statime"></span>` : ''}</div>`;
  $('staf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const rec = { key: 'aud-' + fileKeyOf([f]), name: f.name, title: f.name, type: 'audio', size: f.size, parts: [{ name: f.name, type: f.type || 'audio/mpeg', buf: await f.arrayBuffer() }], addedAt: Date.now() };
    try { await filePut(rec); } catch (er) { stgSay('음원을 저장하지 못했어요.'); return; }
    song.audio = { key: rec.key, name: f.name, a: null, b: null }; stgSaveSongs();
    STG.audio.key = ''; await stgAudioLoad(song); stgPanel('audio', true);
  };
  if (!a) return;
  const RATES = [0.75, 0.9, 1];
  seg($('starate'), ['0.75배', '0.9배', '보통'], Math.max(0, RATES.indexOf(a.rate || 1)), i => { a.rate = RATES[i]; stgSaveSongs(); stgAudioRate(); });
  $('stap').onclick = () => { const el2 = STG.audio.el; if (!el2) return; if (el2.paused) { if (STG.audio.loop && song.audio.a != null) el2.currentTime = song.audio.a; el2.play().catch(() => stgSay('재생하지 못했어요.')); } else el2.pause(); };
  $('staa').onclick = () => { if (STG.audio.el) { song.audio.a = STG.audio.el.currentTime; stgSaveSongs(); stgPanel('audio', true); } };
  $('stab').onclick = () => { if (STG.audio.el) { song.audio.b = STG.audio.el.currentTime; stgSaveSongs(); stgPanel('audio', true); } };
  $('stal').onchange = e => (STG.audio.loop = e.target.checked);
  $('staclr').onclick = () => { song.audio.a = null; song.audio.b = null; stgSaveSongs(); stgPanel('audio', true); };
  $('stadel').onclick = () => { if (STG.audio.el) STG.audio.el.pause(); song.audio = null; stgSaveSongs(); STG.audio.key = ''; stgPanel('audio', true); };
  $('stapos').oninput = e => { const el2 = STG.audio.el; if (el2 && el2.duration) el2.currentTime = (+e.target.value / 1000) * el2.duration; };
}
const stgTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
async function stgAudioLoad(song) {
  const A = STG.audio, key = song && song.audio ? song.audio.key : '';
  if (A.key === key) return;
  if (A.el) { A.el.pause(); A.el = null; }
  if (A.url) { URL.revokeObjectURL(A.url); A.url = ''; }
  A.key = key;
  if (!key) return;
  const rec = await fileGet(key);
  if (!rec || A.key !== key) return;
  A.url = URL.createObjectURL(new Blob([rec.parts[0].buf], { type: rec.parts[0].type || 'audio/mpeg' }));
  const el = new Audio(A.url); A.el = el;
  el.ontimeupdate = () => {
    const s = stgSong(), au = s && s.audio;
    if (au && A.loop && au.a != null && au.b != null && au.b > au.a && el.currentTime >= au.b) el.currentTime = au.a;
    if ($('stapos') && el.duration) $('stapos').value = Math.round(el.currentTime / el.duration * 1000);
    if ($('statime')) $('statime').textContent = `${stgTime(el.currentTime)} / ${el.duration ? stgTime(el.duration) : '-'}`;
  };
  el.onplay = el.onpause = () => { if ($('stap')) $('stap').textContent = el.paused ? '▶ 재생' : '■ 멈추기'; };
  stgAudioRate();
}
// 반주 느리게 듣기: 0.75배 · 0.9배 (음 높이는 그대로)
function stgAudioRate() {
  const el = STG.audio.el, s = stgSong(), r = (s && s.audio && s.audio.rate) || 1;
  if (!el) return;
  try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch (e) {}
  el.playbackRate = r; el.defaultPlaybackRate = r;
}

// 점프 링크 편집: 출발점(반복표·D.S. 자리) → 도착점(돌아갈 곳)
function stgPanelLink(el, song) {
  if (!song) { el.innerHTML = '<p class="meta">곡을 먼저 넣어 주세요.</p>'; return; }
  const st = STG.link;
  el.innerHTML = `<div class="stlink">
    <p class="how">${st ? `<b>도착점</b>을 눌러 주세요 (돌아갈 곳). 다른 쪽이면 아래 ◀ ▶로 넘긴 뒤 눌러요.` : '<b>출발점</b>(반복표·D.S.·Coda 자리)을 악보에서 눌러 주세요. 연주할 때 그 점을 누르면 도착점으로 바로 넘어가요.'}</p>
    <label class="lb2">이름 <input type="text" id="stlname" maxlength="16" value="${escH(STG.linkName || '')}" placeholder="예: 반복, D.S., Coda"></label>
    <div class="btns"><button class="btn sec small" id="stlpv">◀ 이전 쪽</button><button class="btn sec small" id="stlnx">다음 쪽 ▶</button>${st ? '<button class="btn sec small" id="stlcan">취소</button>' : ''}<button class="btn small" id="stldone">다 했어요</button></div>
    <ol class="stll">${(song.links || []).map((l, k) => `<li>${k + 1}. <b>${escH(l.label || '점프')}</b> ${l.fp + 1}쪽 → ${l.tp + 1}쪽 <button class="btn sec small danger" data-del="${k}">지우기</button></li>`).join('') || '<p class="meta">아직 링크가 없어요.</p>'}</ol></div>`;
  $('stlname').oninput = e => (STG.linkName = e.target.value);
  const turn = d => { const step = STG.mode === 'two' ? 2 : 1; if (STG.mode === 'scroll') return; STG.pos = Math.max(0, Math.min(stgMaxPos(), STG.pos + d * step)); stgDraw(); };
  $('stlpv').onclick = () => turn(-1); $('stlnx').onclick = () => turn(1);
  if ($('stlcan')) $('stlcan').onclick = () => { STG.link = null; stgPanel('link', true); };
  $('stldone').onclick = () => stgPanel('link');
  el.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => { song.links.splice(+b.dataset.del, 1); stgSaveSongs(); stgPanel('link', true); }));
}
function stgLinkTap(e, lk) {
  const box = e.target.closest && e.target.closest('.stpg'); if (!box) return;
  // 반 쪽 넘김의 위쪽 반은 다음 쪽이에요
  const r = box.getBoundingClientRect(), p = +box.dataset.p;
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  const song = stgSong();
  if (!STG.link) { STG.link = { fp: p, fx: x, fy: y }; stgPanel('link', true); return; }
  song.links = song.links || [];
  song.links.push(Object.assign({}, STG.link, { tp: p, tx: x, ty: y, label: (STG.linkName || '').trim() || '반복' }));
  STG.link = null; stgSaveSongs();
  stgSay('점프 링크를 만들었어요. 연주할 때 파란 ↪ 점을 누르면 넘어가요.');
  stgPanel('link', true);
}

// ───────── 자동 스크롤 (이어 보기) ─────────
function stgScrollStart() {
  const sc = $('stscroll'), song = stgSong(); if (!sc || !song) return;
  STG.scroll.on = true; STG.scroll.last = performance.now(); STG.scroll.y = sc.scrollTop;
  const go = now => {
    if (!STG.scroll.on || !$('stscroll')) return;
    const s2 = $('stscroll'), dist = s2.scrollHeight - s2.clientHeight, sp = dist / Math.max(20, stgSong().secs || 240);
    if (Math.abs(s2.scrollTop - STG.scroll.y) > 3) STG.scroll.y = s2.scrollTop; // 손으로 밀었으면 거기서부터
    STG.scroll.y += sp * (now - STG.scroll.last) / 1000; // 소수점까지 모아서 움직여요
    s2.scrollTop = STG.scroll.y;
    STG.scroll.last = now;
    if (s2.scrollTop >= dist - 1) { stgScrollStop(); stgSay('곡 끝까지 내려왔어요.'); return; }
    STG.scroll.raf = requestAnimationFrame(go);
  };
  STG.scroll.raf = requestAnimationFrame(go);
  stgNav(); stgScrollBtn();
}
function stgScrollStop() { STG.scroll.on = false; cancelAnimationFrame(STG.scroll.raf); stgScrollBtn(); if ($('stnowm')) stgNav(); }
function stgScrollBtn() {
  let b = $('stscrollb');
  const show = STG.mode === 'scroll' && $('stnav');
  if (!show) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = 'stscrollb'; b.className = 'btn sec small stscrollb'; $('stnav').insertBefore(b, $('stnext')); b.onclick = () => (STG.scroll.on ? stgScrollStop() : stgScrollStart()); }
  b.textContent = STG.scroll.on ? '■ 자동 스크롤 멈추기' : '▼ 자동 스크롤';
}

// ───────── 예시: 연습용 악보 두 곡 + 예시 콘티 (직접 그린 그림) ─────────
async function stgExamplePages(title, seed, pages, mark) {
  const parts = [];
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let pg = 0; pg < pages; pg++) {
    const c = document.createElement('canvas'); c.width = 1240; c.height = 1754;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#1B2230'; g.textAlign = 'center';
    if (pg === 0) { g.font = 'bold 54px sans-serif'; g.fillText(title, 620, 120); g.font = '28px sans-serif'; g.fillText('연습용 예시 악보 (앱이 그린 그림)', 620, 170); }
    else { g.font = '28px sans-serif'; g.fillText(`${title} — ${pg + 1}쪽`, 620, 90); }
    const sys = pg === 0 ? 6 : 7, top0 = pg === 0 ? 260 : 170, gap = 210, sp = 14;
    // 도돌이표 그리기: 'end' = 점 · 가는 줄 · 굵은 줄(x), 'start' = 굵은 줄(x) · 가는 줄 · 점
    const repeatBar = (x, y0, kind) => {
      const d = kind === 'end' ? -1 : 1;
      g.save(); g.strokeStyle = '#1B2230'; g.fillStyle = '#1B2230';
      g.lineWidth = 7; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 4 * sp); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(x + d * 12, y0); g.lineTo(x + d * 12, y0 + 4 * sp); g.stroke();
      [1.5, 2.5].forEach(k => { g.beginPath(); g.arc(x + d * 26, y0 + k * sp, 5, 0, 7); g.fill(); });
      g.restore();
    };
    const chords = ['G', 'D', 'Em', 'C', 'Am', 'D7', 'G/B', 'C'];
    const words = ['노', '래', '해', '요', '기', '쁘', '게', '함', '께', '해', '요', '오', '늘', '도', '랄', '라']; // 연습용 가사 (지어낸 말)
    for (let s = 0; s < sys; s++) {
      const y0 = top0 + s * gap;
      g.strokeStyle = '#555'; g.lineWidth = 2;
      for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(90, y0 + l * sp); g.lineTo(1150, y0 + l * sp); g.stroke(); }
      for (let m = 0; m <= 4; m++) { const x = 90 + m * 265; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 4 * sp); g.stroke(); }
      g.textAlign = 'left'; g.font = 'bold 30px sans-serif'; g.fillStyle = '#1B2230';
      for (let m = 0; m < 4; m++) {
        g.fillText(chords[Math.floor(rnd() * chords.length)], 100 + m * 265, y0 - 22);
        for (let q = 0; q < 4; q++) {
          if (pg === 0 && s === 3 && m === 0 && q === 0) continue; // 도돌이 시작 자리는 비워 둬요
          const x = 125 + m * 265 + q * 60, pos = Math.floor(rnd() * 9), y = y0 + 4 * sp - pos * sp / 2;
          g.beginPath(); g.ellipse(x, y, 10, 7, -0.35, 0, Math.PI * 2); g.fill();
          g.lineWidth = 2.4; g.beginPath(); g.moveTo(x + 9, y - 2); g.lineTo(x + 9, y - 52); g.stroke();
          g.font = '27px sans-serif'; g.fillText(words[(s * 16 + m * 4 + q + pg * 5) % words.length], x - 12, y0 + 4 * sp + 50); g.font = 'bold 30px sans-serif';
        }
      }
      g.font = '20px sans-serif'; g.fillStyle = '#5C6776'; g.fillText(String(pg * sys + s * 4 + 1), 70, y0 - 8); g.fillStyle = '#1B2230';
      if (s === 0 && pg === 0) { g.font = 'bold 34px sans-serif'; g.strokeStyle = '#1B2230'; g.strokeRect(34, y0 - 70, 46, 42); g.fillText('A', 45, y0 - 37); }
      if (s === 3 && pg === 0) { g.font = 'bold 34px sans-serif'; g.strokeRect(34, y0 - 70, 46, 42); g.fillText('B', 45, y0 - 37); }
      if (s === 0 && pg === 1) { g.font = 'bold 34px sans-serif'; g.strokeRect(34, y0 - 70, 46, 42); g.fillText('C', 45, y0 - 37); }
      // 도돌이표: B 줄 처음 ‖: 부터 B 마지막 줄 끝 :‖ 까지 (악보 순서 “기기에서 찾기” 연습용)
      if (pg === 0 && s === 3) repeatBar(96, y0, 'start');
      if (pg === 0 && s === 5) repeatBar(1150, y0, 'end');
    }
    if (mark && pg === pages - 1) { // 반복표 (끝 마디)
      const y0 = top0 + 2 * gap;
      repeatBar(1150, y0, 'end');
      g.font = 'italic bold 30px serif'; g.textAlign = 'right'; g.fillText('D.S. al Fine', 1150, y0 - 56);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    parts.push(new File([blob], `${title}-${pg + 1}.png`, { type: 'image/png' }));
  }
  return parts;
}
async function stgAddExample() {
  stgSay('예시 악보를 만드는 중…');
  // 예시 그림의 줄 자리 (stgExamplePages와 같은 계산): 한 줄 = 한 구간
  const regs = pages => { const out = []; for (let pg = 0; pg < pages; pg++) { const sys = pg === 0 ? 6 : 7, top0 = pg === 0 ? 260 : 170; for (let k = 0; k < sys; k++) { const y0 = top0 + k * 210; out.push({ p: pg, x: 24 / 1240, y: (y0 - 64) / 1754, w: 1150 / 1240, h: 190 / 1754 }); } } return out; };
  const make = async (title, seed, pages, info) => {
    info.regions = regs(pages);
    const files = await stgExamplePages(title, seed, pages, true);
    const rec = await fileSaveFrom(files); rec.title = title; await filePut(rec);
    const s = stgSongForFile(rec); delete s.fresh; Object.assign(s, { title }, info); stgSaveSongs(); return s;
  };
  const a = await make('예시 곡 1 (연습용)', 11, 3, { key: 'G', bpm: 84, beats: 4, secs: 180, links: [{ fp: 2, fx: 0.9, fy: 0.37, tp: 0, tx: 0.08, ty: 0.13, label: 'D.S.' }] });
  const b = await make('예시 곡 2 (연습용)', 29, 2, { key: 'D', bpm: 120, beats: 3, secs: 150, links: [{ fp: 1, fx: 0.9, fy: 0.37, tp: 0, tx: 0.08, ty: 0.37, label: '반복' }] });
  let set = STG.sets.find(x => x.name === '예시 콘티');
  if (!set) { set = { id: rsId('t'), name: '예시 콘티', songs: [] }; STG.sets.push(set); }
  set.songs = [a.id, b.id]; stgSaveSets();
  STG.setId = set.id; STG.idx = 0; STG.pos = 0; stgSaveOpts();
  stgSay('예시 곡 2개와 “예시 콘티”를 넣었어요. 악보 오른쪽을 누르면 다음 줄(구간)에 색이 칠해지고, 쪽 끝에서는 쪽이 넘어가요. 마지막 쪽의 파란 ↪ 점은 D.S. 자리로 돌아가요.');
  if (STG.panel) stgPanel(STG.panel, true);
  stgLoadSong(true);
}

// ───────── 리더가 넘기면 모두 함께 (프로젝트) ─────────
// 보내는 것: 곡 제목·콘티 이름·지금 쪽. 멤버는 자기 기기의 같은 제목 곡을 같은 쪽으로 넘겨요.
function stgFollowing() { return !!(STG.follow && STG.live && STG.live.on && !STG.lead && COLLAB.project && collabIn()); }
function stgFollowMsg() { stgSay(`${nameOf(STG.live.by, STG.live.byName)}님이 모두의 악보를 넘기는 중이에요. 혼자 넘기려면 위의 “혼자 보기”를 눌러 주세요.`); }
// sig: 인도자 신호(한 번 더 · 후렴으로 …)만 보낼 때 — 모두의 악보 넘기기를 켜지 않았어도 보내요
function stgBroadcast(off, sig) {
  if (!COLLAB.project || !collabIn() || !(STG.lead || off || (sig && isLead()))) return;
  const song = stgSong(), now = Date.now();
  const st = off || !STG.lead ? { on: false, v: 3, sid: STG.sid, seq: ++STG.seq, ep: STG.ep, at: now }
    : { on: true, v: 3, title: song ? song.title : '', gid: song ? song.id : '', set: STG.setId === 'all' ? '' : ((STG.sets.find(s => s.id === STG.setId) || {}).name || ''), page: stgPage(), half: STG.mode === 'half' && STG.pos % 2 === 1, reg: stgRegOn() ? STG.reg : -1, play: stgPlaylist() ? STG.play : -1, sid: STG.sid, seq: ++STG.seq, ep: STG.ep, at: now };
  if (STG.sig && now - STG.sig.at < 20000) st.sig = STG.sig;
  if (COLLAB.B.emitLive) COLLAB.B.emitLive(COLLAB.pid, st);
  stgLiveWrite(COLLAB.pid, st);
  stgDrawLive();
}
function stgLiveWrite(pid, st) {
  if (STG.lw) { STG.lwNext = [pid, st]; return; }
  STG.lw = Promise.resolve(COLLAB.B.setLive(pid, st)).catch(e => { if (STG.lead) stgSay(collabErr(e)); }).then(() => {
    STG.lw = null;
    if (STG.lwNext) { const [p2, s2] = STG.lwNext; STG.lwNext = null; stgLiveWrite(p2, s2); }
  });
}
function stgLeadToggle(on) {
  if (!isLead()) return;
  if (!on) { if (!STG.lead) return; STG.lead = false; stgBroadcast(true); stgSay('모두의 악보 넘기기를 껐어요.'); return stgDrawLive(); }
  STG.lead = true; STG.follow = true; STG.ep = Date.now(); STG.live = null;
  stgSay('모두의 악보 넘기기를 켰어요. 내가 넘기는 대로 멤버들의 악보도 넘어가요.');
  stgBroadcast();
}
function stgOnLive(st) {
  const p = COLLAB.project; if (!p) return;
  if (!st) { STG.live = null; stgDrawLive(); return; }
  if (st.sid === STG.sid) return;
  if (st.sig && typeof tmOnSig === 'function') tmOnSig(st); // 인도자 신호는 따라가기와 상관없이 띄워요
  if (st.on && st.v !== 3) return; // 예전 방식(구간 이름)은 무시
  const cur = STG.live, same = !!(cur && cur.sid === st.sid);
  if (same && (st.seq || 0) <= (cur.seq || 0)) return;
  if (st.on) {
    const okHost = COLLAB.kind === 'firebase' || roleOf(p, st.by) === 'host' || (COLLAB.B.ownerId && st.by === COLLAB.B.ownerId) || (p.members && p.members[st.by] === 'dev');
    if (!okHost || Date.now() - (st.at || 0) > 30 * 60000) return;
    if (STG.lead) { if ((st.ep || 0) <= STG.ep) return; STG.lead = false; stgSay(`${nameOf(st.by, st.byName)}님이 모두의 악보 넘기기를 시작해서, 내가 넘기던 것은 멈췄어요.`); }
  } else if (!same) return;
  const wasOn = !!(cur && cur.on);
  STG.live = st;
  if (!st.on) { if (wasOn) stgSay('주최자가 모두의 악보 넘기기를 껐어요. 이제 각자 넘겨요.'); return stgDrawLive(); }
  if (!wasOn) { STG.follow = true; stgSay(`${nameOf(st.by, st.byName)}님이 모두의 악보 넘기기를 켰어요. 인도자가 넘기는 곡·쪽으로 같이 넘어가요.`); }
  if (STG.follow) stgApplyLive(st);
  stgDrawLive();
}
function stgApplyLive(st) {
  const title = String(st.title || '').slice(0, 60), page = Math.max(0, Math.round(cleanNum(st.page, 0))), gid = String(st.gid || '');
  const L = stgList();
  // 팀에서 받은 콘티의 곡은 번호(gid)가 같아요. 없으면 같은 제목으로 찾아요
  let i = gid ? L.findIndex(s => s.id === gid) : -1;
  if (i < 0 && gid) { const j = STG.songs.findIndex(s => s.id === gid); if (j >= 0) { STG.setId = 'all'; i = j; } }
  if (i < 0) i = L.findIndex(s => s.title === title);
  if (i < 0) { const j = STG.songs.findIndex(s => s.title === title); if (j >= 0) { STG.setId = 'all'; i = j; } }
  if (i < 0) { stgSay(`주최자: “${title}” ${page + 1}쪽 — 이 기기에 이 곡이 없어요. 위의 “받기”로 인도자의 콘티를 받거나, 같은 제목으로 곡을 넣어 주세요.`); return; }
  const changed = i !== STG.idx || stgList() !== L;
  STG.idx = i;
  const setPos = () => {
    const pi = Math.round(cleanNum(st.play, -1)), PL = stgPlaylist();
    if (pi >= 0 && PL && pi < PL.length) { stgPlayGo(pi, true); return; }
    const rg = Math.round(cleanNum(st.reg, -1));
    if (rg >= 0 && stgRegOn() && rg < stgRegs().length) { stgRegGo(rg, true); return; }
    const n = stgPages();
    const p = Math.min(page, Math.max(0, n - 1));
    if (STG.mode === 'half') STG.pos = Math.min(stgMaxPos(), 2 * p + (st.half ? 1 : 0));
    else if (STG.mode === 'two') STG.pos = p - (p % 2);
    else if (STG.mode === 'scroll') { stgScrollToPage(p, true); return; }
    else STG.pos = p;
    stgDraw();
  };
  if (changed || STG.docKey !== (stgSong() || {}).fileKey) stgLoadSong(true).then(setPos); else setPos();
}
function stgDrawLive() {
  const el = $('stlive'); if (!el) return;
  const inProj = !!(COLLAB.project && collabIn());
  if ($('stsigb')) $('stsigb').hidden = !(inProj && isLead());
  if (!inProj) { el.hidden = true; if (typeof tmSigSheet === 'function') tmSigSheet(false); return; }
  const lead = isLead(), L = STG.live, on = !!(L && L.on);
  el.hidden = false;
  el.classList.toggle('on', STG.lead || (on && STG.follow));
  if (lead) el.innerHTML = `<div class="rnlh"><span class="rnlp">프로젝트 <b>${escH(COLLAB.project.name)}</b></span><div class="seg" id="stlseg"></div></div><p class="rnlm">${STG.lead ? '내가 넘기는 대로 멤버들의 악보도 넘어가요 (같은 제목의 곡, 같은 쪽).' : on ? `${escH(nameOf(L.by, L.byName))}님이 넘기는 중이에요.` : '“모두의 악보 넘기기”를 켜면 내가 넘길 때 멤버들의 악보도 함께 넘어가요.'}</p>`;
  else el.innerHTML = `<div class="rnlh"><span class="rnlp">프로젝트 <b>${escH(COLLAB.project.name)}</b></span>${on ? `<span class="rnls on">${STG.follow ? '따라가는 중' : '혼자 보는 중'}</span><button class="btn sec small" id="stfollow">${STG.follow ? '혼자 보기' : '다시 따라가기'}</button>` : '<span class="rnls">각자 넘기기</span>'}</div>${on ? `<p class="rnlm">${escH(nameOf(L.by, L.byName))}님이 넘기는 중: ${escH(L.title || '')} ${(+L.page || 0) + 1}쪽</p>` : ''}`;
  if (typeof tmLiveHtml === 'function') { el.insertAdjacentHTML('beforeend', tmLiveHtml()); tmLiveBind(); }
  if ($('stlseg')) seg($('stlseg'), ['각자 넘기기', '모두의 악보 넘기기'], STG.lead ? 1 : 0, i => stgLeadToggle(i === 1));
  if ($('stfollow')) $('stfollow').onclick = () => { STG.follow = !STG.follow; if (STG.follow && STG.live) stgApplyLive(STG.live); stgDrawLive(); };
}
function stgSyncProject() {
  const pid = collabIn() && COLLAB.project ? COLLAB.pid : null;
  if (pid === STG.pid) { if (STG.lead && !isLead()) STG.lead = false; stgDrawLive(); return; }
  if (STG.lead && STG.pid && COLLAB.B && COLLAB.me) stgLiveWrite(STG.pid, { on: false, v: 3, sid: STG.sid, seq: ++STG.seq, ep: STG.ep, at: Date.now() });
  if (STG.unLive) STG.unLive();
  STG.unLive = null; STG.lead = false; STG.pid = pid; STG.live = null;
  if (pid) STG.unLive = COLLAB.B.watchLive(pid, stgOnLive);
  stgDrawLive();
}
// 로그아웃 전에: 내가 넘기던 “모두의 악보 넘기기”를 꺼요
async function stgLeave() { stgStop(); if (STG.lead) { STG.lead = false; stgBroadcast(true); if (STG.lw) await STG.lw; } }
collabOn('project', () => stgSyncProject());
collabOn('logout', () => { STG.lead = false; stgSyncProject(); });
collabOn('names', () => stgDrawLive());
addEventListener('pagehide', () => { if (STG.lead) stgBroadcast(true); });
setInterval(() => { if (STG.lead && COLLAB.project && collabIn()) stgBroadcast(); }, 240000);

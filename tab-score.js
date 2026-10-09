// 악보 만들기 탭: 녹음·소리 파일·악보 파일을 이 악기용 악보(타브 + 오선)로 만들고, 고치고, 구간을 형광펜으로 표시해요

const SCORE = { src: null, track: null, guitarType: 0, transpose: 0, fit: 1, bpm: 90, ts: 4, mode: 0, metro: 0, srcTab: 0, tool: 0 };
const REC_RANGE = { guitar: [70, 1100], bass: [36, 420], piano: [50, 2100] };

function renderScorePage() {
  const fretted = INST.type === 'fret';
  const tsOpts = [[4, '4/4'], [3, '3/4'], [6, '6/8']].map(([v, t]) => `<option value="${v}"${v === SCORE.ts ? ' selected' : ''}>${t}</option>`).join('');
  $('p-nt').innerHTML = `
    <div id="ntshare" class="sharebar" hidden></div>
    <p class="how">연주를 녹음하거나 파일을 올리면 ${INST.name}용 악보로 만들어요. ${fretted ? '<b>타브와 오선 악보를 함께</b> 보여주고, ' : ''}음을 고치거나 구간을 형광펜으로 칠해 rit.·Break 같은 표시를 넣을 수 있어요. 직접 만든 곡, 저작권이 끝난 곡, 자유롭게 쓰도록 공개된 곡에 써 주세요.</p>
    <h2>1. 불러오기</h2>
    <div class="ctl"><span class="lb">가져올 것</span><div class="seg" id="ntsrc"></div></div>
    <div id="nt-in" class="ntp">
      <div class="ctl"><span class="lb">연주 방식</span><div class="seg" id="ntmode"></div></div>
      <p class="how" id="ntmodehow"></p>
      <div class="rfg">
        <div><label class="lb2" for="ntbpm">빠르기 (BPM)</label><input type="number" id="ntbpm" value="${SCORE.bpm}" min="40" max="220"></div>
        <div><label class="lb2" for="ntts">박자</label><select id="ntts">${tsOpts}</select></div>
        <div id="ntmetrow"><label class="lb2" for="ntmetro">메트로놈</label><select id="ntmetro"><option value="0">카운트인 + 녹음 중에도 딸깍 (이어폰 권장)</option><option value="1">카운트인만 (한 마디 세고 시작)</option><option value="2">끔 · 빠르기 자동으로 찾기</option></select></div>
        <div id="ntautow" hidden><label class="lb2" for="ntauto">빠르기 찾기</label><select id="ntauto"><option value="1">자동으로 찾기</option><option value="0">위에 적은 빠르기 쓰기</option></select></div>
      </div>
    </div>
    <div id="nt-rec" class="ntp">
      <div class="meterw"><canvas id="ntmeter" width="600" height="14" aria-label="소리 크기"></canvas><span class="pitchv" id="ntpitch">—</span></div>
      <div class="btns"><button class="btn" id="ntrec">● 녹음 시작</button><button class="btn sec" id="ntrecstop" disabled>■ 녹음 끝내고 악보 만들기</button><button class="btn sec" id="ntmic">마이크 확인 (조율기)</button></div>
      <p class="recst" id="ntrecst"></p>
      <details class="tips"><summary>잘 알아듣게 녹음하는 요령</summary><ul>
        <li>조용한 곳에서, 휴대폰 마이크를 악기 가까이(30cm 안쪽) 두세요.</li>
        <li>먼저 “마이크 확인”으로 조율해 두면 음 높이가 더 정확해요. 막대가 빨간색까지 가면 너무 커요.</li>
        <li>메트로놈을 켜면 박자가 가장 정확해요. 딸깍 소리가 녹음에 섞이지 않게 이어폰을 써 주세요.</li>
        <li>멜로디는 음과 음 사이를 또렷하게, 코드는 박마다 또렷하게 스트로크해 주세요.</li>
        <li>최대 2분까지 녹음돼요.</li></ul></details>
    </div>
    <div id="nt-audio" class="ntp" hidden>${filePickHtml('nta', '소리·동영상 파일 고르기', MEDIA_ACCEPT)}<p class="how">휴대폰 녹음 앱으로 녹음한 파일(m4a, mp3, wav)이나 연주하는 모습을 찍은 동영상(mp4, mov)을 올려 주세요. 최대 2분까지 분석해요.</p>${pasteBoxHtml('ntpa')}</div>
    <div id="nt-file" class="ntp" hidden>
      <p class="how">MIDI(<code>.mid</code>) 또는 MusicXML(<code>.musicxml</code>, <code>.xml</code>, 압축된 <code>.mxl</code>) 파일을 올려 주세요. MuseScore 같은 무료 악보 프로그램에서 내보낼 수 있어요. 종이 악보나 PDF는 “PDF 악보” 탭에서 표시를 넣을 수 있어요.</p>
      ${filePickHtml('ntf', '악보 파일 고르기', '')}
      ${pasteBoxHtml('ntpf')}
    </div>
    <div id="nt-ex" class="ntp" hidden><p class="how">저작권이 없는 민요 “작은 별”로 기능을 먼저 확인해 볼 수 있어요.</p><div class="btns"><button class="btn" id="ntexb">예시 불러오기</button></div></div>
    <div id="nt-new" class="ntp" hidden>
      <p class="how">빈 악보를 만들고 “음 추가”로 직접 음을 넣어요.</p>
      <div class="rfg"><div><label class="lb2" for="ntbars">마디 수</label><input type="number" id="ntbars" value="8" min="1" max="64"></div></div>
      <div class="btns"><button class="btn" id="ntnewb">빈 악보 만들기</button></div>
    </div>
    <div class="err" id="nterr"></div>
    <p class="meta" id="ntinfo"></p>
    <div id="ntchords" hidden></div>
    <div id="ntfit">
    <h2>2. ${INST.name}에 맞추기</h2>
    <div class="rfg">
      <div><label class="lb2" for="nttrack">파트(트랙)</label><select id="nttrack"><option value="-1">불러온 뒤 고를 수 있어요</option></select></div>
      ${INST.id === 'guitar' ? `<div><label class="lb2" for="ntgt">기타 종류</label><select id="ntgt"><option value="0">일렉기타 (24프렛)</option><option value="1"${SCORE.guitarType ? ' selected' : ''}>어쿠스틱 기타 (20프렛, 낮은 포지션)</option></select></div>` : ''}
      <div><label class="lb2" for="nttr">음 높이 옮기기</label><select id="nttr">${Array.from({ length: 25 }, (_, i) => i - 12).map(k => `<option value="${k}"${k === SCORE.transpose ? ' selected' : ''}>${k > 0 ? '+' + k : k}반음${k === 12 ? ' (한 옥타브 위)' : k === -12 ? ' (한 옥타브 아래)' : k === 0 ? ' (그대로)' : ''}</option>`).join('')}</select></div>
      <div><label class="lb2" for="ntfitsel">음역 맞춤</label><select id="ntfitsel"><option value="1">자동 (악기 음역 안으로)</option><option value="0"${SCORE.fit ? '' : ' selected'}>안 함</option></select></div>
    </div>
    <p class="meta">여기를 바꾸면 악보를 다시 만들어요. 고친 음은 처음 상태로 돌아가고, 형광펜 표시는 그대로 남아요.</p>
    </div>
    <h2>3. 악보 보기·고치기</h2>
    ${fretted ? '<div class="ctl"><span class="lb">보기</span><div class="seg" id="ntview"></div></div>' : ''}
    <div class="ctl"><span class="lb">도구</span><div class="seg" id="nttool"></div></div>
    <p class="how" id="nttoolhow"></p>
    <div id="ntedit" class="edbar" hidden></div>
    <div id="ntpal" class="edbar" hidden></div>
    <div class="btns">
      <button class="btn sec" id="ntplay">▶ 처음부터 듣기</button><button class="btn sec" id="ntloop">▶ 고른 구간 반복</button><button class="btn sec" id="ntstop">■ 정지</button>
      <button class="btn sec" id="ntundo">↶ 되돌리기</button><button class="btn sec" id="ntredo">↷ 다시 하기</button>
      <button class="btn sec" id="ntmidi">MIDI로 저장</button>
    </div>
    <p class="how" id="ntsum"></p>
    <div id="ntout"><p class="meta">위에서 녹음하거나 파일을 불러오면 여기에 악보가 나와요.</p></div>
    <div id="ntmlistw" hidden><h2>형광펜 구간 표시</h2><div id="ntmlist"></div></div>
    <p class="how">${fretted ? '읽는 법: 위는 오선 악보, 아래는 타브예요. 기타·베이스 악보는 관례대로 실제 소리보다 한 옥타브 높게 적어요(음자리표 아래 작은 8). 타브의 숫자는 누를 프렛, 맨 윗줄이 가장 가는 줄이에요.' : '읽는 법: 위가 높은음자리표(오른손), 아래가 낮은음자리표(왼손)예요. 가온 도(C4)부터 위는 오른손, 아래는 왼손으로 나눴어요.'} 자동으로 만든 악보라 틀린 곳이 있을 수 있어요. “음 고르기·고치기”로 다듬어 주세요. 고친 내용은 이 기기에 자동으로 저장돼요.</p>`;

  seg($('ntsrc'), ['녹음하기', '소리 파일', '악보 파일', '예시', '빈 악보'], SCORE.srcTab, i => { SCORE.srcTab = i; ntShowSrc(); });
  seg($('ntmode'), ['멜로디 (한 음씩)', '코드 (스트로크·반주)'], SCORE.mode, i => { SCORE.mode = i; ntModeHow(); });
  $('ntmetro').value = String(SCORE.metro);
  $('ntmetro').onchange = e => (SCORE.metro = +e.target.value);
  $('ntbpm').onchange = () => (SCORE.bpm = Math.max(40, Math.min(220, +$('ntbpm').value || 90)));
  $('ntts').onchange = e => (SCORE.ts = +e.target.value);
  $('ntrec').onclick = ntRecStart;
  $('ntrecstop').onclick = ntRecStop;
  $('ntmic').onclick = ntMicCheck;
  onFilePick('nta', ntAnalyzeFile);
  onFilePick('ntf', loadScoreFile);
  if (!PASTE_TARGETS.some(t => t[0] === 'p-nt')) onPasteFile('p-nt', f => { $('ntinfo').textContent = `붙여넣은 파일: ${f.name}`; loadScoreFile(f); });
  $('ntexb').onclick = () => setScoreSource(Object.assign(exampleScore(), {}));
  $('ntnewb').onclick = ntNewEmpty;
  $('nttrack').onchange = e => { SCORE.track = +e.target.value; ntBuildDoc(true); };
  if ($('ntgt')) $('ntgt').onchange = e => { SCORE.guitarType = +e.target.value; ntBuildDoc(true); };
  $('nttr').onchange = e => { SCORE.transpose = +e.target.value; ntBuildDoc(true); };
  $('ntfitsel').onchange = e => { SCORE.fit = +e.target.value; ntBuildDoc(true); };
  if (fretted) seg($('ntview'), ['타브 + 오선 악보', '오선 악보만', '타브만'], ED.view, i => { ED.view = i; ntDraw(); });
  seg($('nttool'), ['음 고르기·고치기', '구간 표시 (형광펜)', '음 추가'], SCORE.tool, i => { SCORE.tool = i; ED.mode = ['select', 'range', 'add'][i]; ED.anchor = null; if (i !== 1) ED.range = null; ntDraw(); });
  ED.mode = ['select', 'range', 'add'][SCORE.tool];
  $('ntplay').onclick = () => { if (!edPlay(0, null, false)) ntErr('들을 음이 없어요. 먼저 악보를 만들어 주세요.'); };
  $('ntloop').onclick = () => { if (!ED.range) return ntErr('“구간 표시” 도구로 반복할 구간을 먼저 골라 주세요.'); if (!edPlay(ED.range.a, ED.range.b, true)) ntErr('이 구간에는 음이 없어요.'); };
  $('ntstop').onclick = edStop;
  $('ntundo').onclick = () => edRestore(ED.undo, ED.redo);
  $('ntredo').onclick = () => edRestore(ED.redo, ED.undo);
  $('ntmidi').onclick = async () => {
    if (!ED.doc) return ntErr('저장할 악보가 없어요.');
    ntErr('');
    const r = await saveFile(edMidiBytes(ED.doc), (ED.doc.title || 'score') + '.mid', 'audio/midi');
    if (r === 'zip') $('ntsum').textContent = 'MIDI 파일을 압축(zip)해서 저장했어요. 압축을 풀면 .mid 파일이 나와요.';
    else if (r === 'saved') $('ntsum').textContent = 'MIDI 파일로 저장했어요.';
    else if (r === 'declined') $('ntsum').textContent = '저장을 취소했어요.';
    else ntErr('여기서는 저장하지 못했어요. 브라우저나 설치한 앱에서 해 주세요.');
  };
  ED.onChange = ntDraw;
  ED.onBlocked = m => ntErr(m);
  ED.onSelect = n => { try { ensureAC(); AC.resume(); playNote(INST, { key: 'sel', midi: n.midi, vel: 0.45, delay: 0, pan: 0 }, AC.currentTime + 0.02, 0.6); } catch (e) {} };
  edBindPointer($('ntout'));
  ntShowSrc(); ntModeHow();
  if (!ED.doc || ED.doc.instId !== INST.id) { ED.doc = null; ntLibOffer(); }
  ntsSync();
  ntDraw();
}
// 내 악보함에 있는 이 악기 악보를 골라 이어서 고치기
function ntLibOffer() {
  const mine = libScores().filter(x => x.instId === INST.id);
  const el = $('ntinfo');
  if (!el || !mine.length) return;
  el.innerHTML = `내 악보함에 ${escH(INST.name)} 악보가 ${mine.length}개 있어요. <span class="rnrow ntlib"><select id="ntlibsel" aria-label="이어서 고칠 악보">${mine.map(x => `<option value="${escH(x.id)}">${escH(x.title || '악보')} · ${x.notes}음 · ${escH(fmtWhen(x.updatedAt))}</option>`).join('')}</select><button class="btn sec small" id="ntlibopen">이어서 고치기</button></span>`;
  $('ntlibopen').onclick = () => { const d = libGetScore($('ntlibsel').value); if (d) ntOpenDoc(d); };
}
// 내 악보함의 악보를 편집기에 열기
function ntOpenDoc(doc) {
  if (!doc || !Array.isArray(doc.notes)) return;
  edStop();
  if (NTS.bind) ntsDetach('');
  ED.nextId = Math.max(1, ...doc.notes.map(n => (n.id || 0) + 1), ...(doc.marks || []).map(m => (m.id || 0) + 1));
  doc.marks = doc.marks || []; doc.chords = doc.chords || [];
  ED.doc = doc; ED.undo = []; ED.redo = []; ED.sel = null; ED.range = null; ED.anchor = null;
  SCORE.src = null; SCORE.msgs = [];
  if ($('ntchords')) $('ntchords').hidden = true;
  if ($('ntinfo')) $('ntinfo').textContent = `내 악보함의 “${doc.title || '악보'}”를 열었어요. 고치면 자동으로 저장돼요.`;
  ntErr('');
  ntsSync();
  ntDraw();
}

function ntErr(m) { $('nterr').textContent = m || ''; }
function ntShowSrc() {
  const i = SCORE.srcTab;
  $('nt-in').hidden = !(i === 0 || i === 1); $('nt-rec').hidden = i !== 0; $('nt-audio').hidden = i !== 1;
  $('nt-file').hidden = i !== 2; $('nt-ex').hidden = i !== 3; $('nt-new').hidden = i !== 4;
  $('ntmetrow').hidden = i !== 0; $('ntautow').hidden = i !== 1;
}
function ntModeHow() {
  $('ntmodehow').textContent = SCORE.mode === 0
    ? '한 번에 한 음씩 연주하는 멜로디·리프·베이스 라인을 알아들어요. 허밍이나 휘파람도 돼요.'
    : `코드를 스트로크하거나 반주하는 소리에서 코드 이름을 박마다 알아듣고, ${INST.name}에 맞는 ${INST.id === 'bass' ? '근음 베이스 라인' : '코드 운지'}로 악보를 만들어요. 알아낸 코드 진행은 리프 만들기로 보낼 수 있어요.`;
}

// ───────── 녹음 ─────────
function ntRange() { return REC_RANGE[INST.id] || [60, 1200]; }
async function ntMicCheck() {
  ntErr('');
  try { await micOpen(); const [a, b] = ntRange(); liveMeter($('ntmeter'), $('ntpitch'), a, b); $('ntrecst').textContent = '마이크가 켜졌어요. 줄을 하나씩 튕겨서 음 이름과 센트(±)를 확인하며 조율해 보세요.'; }
  catch (e) { ntErr(micError(e)); }
}
let NTREC = null;
async function ntRecStart() {
  ntErr('');
  edStop();
  const bpm = SCORE.bpm = Math.max(40, Math.min(220, +$('ntbpm').value || 90));
  const ts = SCORE.ts, beats = ts === 6 ? 6 : ts, metro = SCORE.metro;
  try {
    await recStart({ bpm: ts === 6 ? bpm * 2 : bpm, beats, countIn: metro !== 2, metro: metro === 0 });
  } catch (e) { ntErr(micError(e)); return; }
  const [a, b] = ntRange();
  liveMeter($('ntmeter'), $('ntpitch'), a, b);
  $('ntrec').disabled = true; $('ntrecstop').disabled = false; $('ntrec').textContent = '● 녹음 중';
  const words = ['하나', '둘', '셋', '넷', '다섯', '여섯'];
  NTREC = setInterval(() => {
    const now = AC.currentTime;
    if (REC.beat0At && now < REC.beat0At) {
      const spb = 60 / (ts === 6 ? bpm * 2 : bpm), k = Math.floor((now - (REC.beat0At - beats * spb)) / spb);
      $('ntrecst').textContent = `카운트인… ${words[Math.max(0, Math.min(beats - 1, k))]}`;
    } else {
      const el = now - (REC.beat0At || REC.startAt);
      $('ntrecst').textContent = `녹음 중 ${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, '0')} · 다 치면 “녹음 끝내고 악보 만들기”를 눌러 주세요.`;
      if (el > 120) ntRecStop();
    }
  }, 100);
}
function ntRecStop() {
  if (!REC.on) return;
  clearInterval(NTREC);
  const r = recStop();
  $('ntrec').disabled = false; $('ntrecstop').disabled = true; $('ntrec').textContent = '● 다시 녹음';
  $('ntrecst').textContent = '분석하는 중…';
  const ts = SCORE.ts, tsObj = ts === 6 ? { num: 6, den: 8 } : { num: ts, den: 4 };
  const auto = SCORE.metro === 2;
  setTimeout(() => ntAnalyze(r.sig, { bpm: auto ? null : SCORE.bpm, beat0: auto ? null : r.beat0, lag: r.lag, ts: tsObj }, '녹음'), 30);
}
function ntAnalyzeFile(file) {
  ntErr(''); $('ntinfo').textContent = '소리 파일을 분석하는 중…';
  try { ensureAC(); } catch (e) { return ntErr('이 브라우저에서는 소리를 분석할 수 없어요.'); }
  file.arrayBuffer().then(ab => AC.decodeAudioData(ab)).then(buf => {
    const ts = SCORE.ts, tsObj = ts === 6 ? { num: 6, den: 8 } : { num: ts, den: 4 };
    const auto = $('ntauto').value === '1';
    SCORE.bpm = Math.max(40, Math.min(220, +$('ntbpm').value || 90));
    setTimeout(() => ntAnalyze(monoFrom(buf, 120), { bpm: auto ? null : SCORE.bpm, beat0: null, ts: tsObj }, file.name.replace(/\.[^.]+$/, '')), 30);
  }).catch(() => { $('ntinfo').textContent = ''; ntErr(audioReadError(file)); });
}
function ntAnalyze(sig, opt, title) {
  const [fmin, fmax] = ntRange();
  try {
    if (sig.x.length < sig.sr * 0.5) throw '녹음이 너무 짧아요.';
    if (SCORE.mode === 0) {
      const s = transcribeMelody(sig, Object.assign({ fmin, fmax }, opt));
      s.title = title === '녹음' ? '녹음한 멜로디' : title;
      const inf = s.info;
      setScoreSource(s);
      $('ntinfo').textContent += ` · 빠르기 ${s.bpm}${inf.autoBpm ? ' (자동으로 찾음)' : ''} · 조율 차이 ${inf.tuneCents >= 0 ? '+' : ''}${inf.tuneCents}센트`;
    } else {
      const r = transcribeChords(sig, opt);
      const bb = opt.ts.num * 4 / opt.ts.den;
      setScoreSource({ title: title === '녹음' ? '녹음한 코드 반주' : title, bpm: r.bpm, ts: r.ts, tracks: [], chordList: r.chords, key: r.key, autoBpm: r.info.autoBpm });
      ntShowChords(r.chords, bb);
    }
    $('ntrecst').textContent = '악보를 만들었어요. 아래에서 확인하고 고쳐 보세요.';
  } catch (e) {
    $('ntrecst').textContent = '';
    ntErr(typeof e === 'string' ? e : '소리를 분석하지 못했어요. 다시 녹음해 주세요.');
    if (typeof e !== 'string') console.error(e);
  }
}
function ntShowChords(chords, bb) {
  const w = $('ntchords');
  w.hidden = false;
  // 코드 진행 글자 (악기 코드 도감 앱의 “리프 만들기” 코드 진행 칸에 그대로 붙여 넣을 수 있는 모양)
  const prog = chords.map(c => `${c.name.replace('♯', '#')}:${c.beats}`).join(' ');
  w.innerHTML = `<div class="chchips">${chords.map(c => `<span class="chip"><b>${escH(c.name)}</b> ${+c.beats || 0}박</span>`).join('')}</div>`
    + `<div class="btns"><button class="btn sec" id="ntcopyprog">코드 진행 복사하기</button></div>`
    + `<p class="meta" id="ntcopymsg">악기 코드 도감 앱의 “리프 만들기”에 붙여 넣으면 이 진행으로 리프를 만들 수 있어요.</p>`;
  $('ntcopyprog').onclick = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(prog); ok = true; } catch (e) {}
    const msg = $('ntcopymsg');
    if (ok) { msg.textContent = `복사했어요: ${prog} — 악기 코드 도감 앱의 “리프 만들기” 코드 진행 칸에 붙여 넣어 주세요.`; return; }
    // 복사가 막힌 곳에서는 글자를 골라 둬서 직접 복사할 수 있게 해요
    msg.innerHTML = `복사가 안 되는 곳이에요. 아래 글자를 길게 눌러 복사해 주세요.<br><code id="ntprogtxt">${escH(prog)}</code>`;
    try { const r = document.createRange(); r.selectNodeContents($('ntprogtxt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  };
}

// ───────── 파일·예시·빈 악보 ─────────
async function loadScoreFile(file) {
  ntErr('');
  // 휴대폰에서 소리·동영상을 골랐으면 녹음 분석으로 보냄
  if (isMediaFile(file) && !/\.midi?$/i.test(file.name)) { $('ntinfo').textContent = '소리 파일이라서 녹음 분석으로 악보를 만들어요.'; return ntAnalyzeFile(file); }
  try {
    const buf = await file.arrayBuffer();
    const head = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
    let s;
    if (head.startsWith('MThd')) s = parseMidi(buf);
    else if (head.startsWith('PK')) s = parseMusicXML(await unzipScoreXml(buf));
    else if (head.startsWith('%PDF')) throw 'PDF 악보는 “PDF 악보” 탭에서 열 수 있어요. 그 탭에서 형광펜·글자·기호를 넣을 수 있어요.';
    else {
      const txt = new TextDecoder().decode(buf);
      if (/<score-partwise/.test(txt)) s = parseMusicXML(txt);
      else if (/<score-timewise/.test(txt)) throw '이 MusicXML 형식(timewise)은 아직 읽지 못해요. MuseScore에서 다시 내보내 주세요.';
      else throw '악보 파일(MIDI·MusicXML)이 아니에요. .mid, .musicxml, .mxl 파일을 골라 주세요.';
    }
    s.title = file.name.replace(/\.[^.]+$/, '');
    setScoreSource(s);
  } catch (e) {
    ntErr(e === 'mxl' ? '이 브라우저에서는 압축된 .mxl을 풀 수 없어요. 압축되지 않은 .musicxml로 내보내 주세요.' : typeof e === 'string' ? e : '파일을 읽을 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.');
  }
}
function ntNewEmpty() {
  const ts = SCORE.ts, tsObj = ts === 6 ? { num: 6, den: 8 } : { num: ts, den: 4 };
  SCORE.src = null;
  $('ntchords').hidden = true;
  ntMakeDoc({ title: '새 악보', bpm: Math.max(40, Math.min(220, +$('ntbpm').value || 90)), ts: tsObj, notes: [], minBars: Math.max(1, Math.min(64, +$('ntbars').value || 8)) }, null);
  SCORE.tool = 2; ED.mode = 'add';
  seg($('nttool'), ['음 고르기·고치기', '구간 표시 (형광펜)', '음 추가'], 2, i => { SCORE.tool = i; ED.mode = ['select', 'range', 'add'][i]; ED.anchor = null; if (i !== 1) ED.range = null; ntDraw(); });
  $('ntinfo').textContent = '빈 악보를 만들었어요. 오선이나 타브 위를 눌러 음을 넣어 보세요.';
  ntDraw();
}

function setScoreSource(s) {
  SCORE.src = s;
  SCORE.track = null;
  if (!s.chordList) $('ntchords').hidden = true;
  const playable = (s.tracks || []).map((t, i) => [i, t]).filter(([, t]) => !t.drums);
  if (s.chordList) {
    $('nttrack').innerHTML = '<option value="-1">알아낸 코드 반주</option>';
    $('ntinfo').textContent = `알아냄: 코드 ${s.chordList.length}개 · ${s.ts.num}/${s.ts.den}박자 · 빠르기 ${s.bpm}${s.autoBpm ? ' (자동으로 찾음)' : ''}${s.key ? ' · 추정 조: ' + s.key.name : ''}`;
  } else {
    SCORE.track = playable.length > 1 && INST.type === 'fret' ? playable[0][0] : -1;
    const opts = [[-1, `모든 파트 합치기 (${playable.length}개)`]].concat(playable.map(([i, t]) => [i, `${t.name} · ${t.notes.length}음`]));
    $('nttrack').innerHTML = opts.map(([v, t]) => `<option value="${v}"${v === SCORE.track ? ' selected' : ''}>${t}</option>`).join('');
    const total = playable.reduce((a, [, t]) => a + t.notes.length, 0);
    $('ntinfo').textContent = `불러옴: ${s.title || '악보'} · 파트 ${playable.length}개 · 음 ${total}개 · ${s.ts.num}/${s.ts.den}박자` + ((s.tracks || []).some(t => t.drums) ? ' · 드럼 파트는 뺐어요' : '');
  }
  ntBuildDoc(false);
}

// 불러온 것 → 악보 문서
function ntBuildDoc(keepMarks) {
  const s = SCORE.src; if (!s) return;
  ntErr('');
  const fretted = INST.type === 'fret';
  const acoustic = INST.id === 'guitar' && SCORE.guitarType === 1;
  const maxFret = acoustic ? 20 : INST.frets || 24;
  const bb = barBeats(s.ts);
  const msgs = [];
  let notes, chords = [];
  if (s.chordList) {
    const tr = SCORE.transpose;
    const list = s.chordList.map(c => { const r = (c.r + tr + 120) % 12, root = s.key && s.key.flats ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'][r] : SHARP_NAMES[r]; return { ...c, r, root, name: root + QUALITIES[c.qi].s }; });
    const instLike = acoustic ? Object.assign({}, INST, { voicings: (r, qi) => ({ all: INST.voicings(r, qi).all.filter(v => v.mx <= 20) }) }) : INST;
    notes = chordsToNotes(list, instLike, bb);
    if (fretted && notes.some(n => n.s == null)) notes = assignFrets(notes, INST.tuning, maxFret, acoustic).notes;
    chords = list.map(c => ({ t: c.t, name: c.name }));
    if (tr) msgs.push(`코드를 ${tr > 0 ? '+' : ''}${tr}반음 옮겼어요.`);
    ntShowChords(list, bb);
  } else {
    const tracks = SCORE.track >= 0 ? [s.tracks[SCORE.track]] : s.tracks.filter(t => !t.drums);
    const raw = tracks.flatMap(t => t.notes);
    const [lo, hi] = SCORE_RANGES[acoustic ? 'acoustic' : INST.id];
    const fit = fitToRange(raw, lo, hi, SCORE.transpose, SCORE.fit === 1);
    if (fit.shift) msgs.push(`악기 음역에 맞게 곡 전체를 ${Math.abs(fit.shift / 12)}옥타브 ${fit.shift > 0 ? '올렸어요' : '내렸어요'}.`);
    if (fit.moved) msgs.push(`음역을 벗어난 ${fit.moved}음은 옥타브를 옮겼어요.`);
    if (fit.outside) msgs.push(`음역 밖의 ${fit.outside}음은 뺐어요.`);
    if (fretted) {
      const r = assignFrets(fit.notes, INST.tuning, maxFret, acoustic);
      notes = r.notes;
      if (r.dropped) msgs.push(`동시에 나는 음이 줄 수보다 많아서 ${r.dropped}음을 뺐어요. 파트를 하나만 골라 보세요.`);
    } else notes = fit.notes;
  }
  const key = s.chordList ? s.key : guessKey(notes);
  const old = keepMarks && ED.doc ? ED.doc.marks.map(m => ({ type: m.type, a: m.a, b: m.b, color: m.color, text: m.text })) : [];
  ntMakeDoc({ title: s.title || '악보', bpm: s.bpm, ts: s.ts, notes: notes.map(n => ({ t: n.t, dur: n.dur, midi: n.midi, s: n.s, f: n.f })), chords, key, marks: old }, msgs, keepMarks);
}
// 새 악보 문서 만들기. 같은 것을 다시 만드는 경우(맞추기 설정 바꾸기, 같은 파일·예시를 다시 불러오기)에는 내 악보함의 같은 칸을 덮어써요.
function ntMakeDoc(base, msgs, rebuild) {
  const fretted = INST.type === 'fret', acoustic = INST.id === 'guitar' && SCORE.guitarType === 1;
  const prev = ED.doc, shared = typeof NTS !== 'undefined' && NTS.bind && NTS.doc === prev;
  const libId = prev && prev.libId && !shared && prev.instId === INST.id && (rebuild || (prev.title === base.title && !ED.undo.length)) ? prev.libId : null;
  edStop();
  edNewDoc(Object.assign({ libId }, {
    instId: INST.id, fretted, tuning: INST.tuning || null, stringNames: INST.stringNames || null,
    maxFret: fretted ? (acoustic ? 20 : INST.frets) : null, key: base.key || guessKey(base.notes), chords: base.chords || [], marks: base.marks || [],
  }, base));
  SCORE.msgs = msgs || [];
  ntDraw();
}

// ───────── 화면 그리기 ─────────
function ntDraw() {
  if (!$('ntout')) return;
  const doc = ED.doc;
  const toolHow = [
    '음(음표나 타브 숫자)을 누르면 골라지고 소리가 나요. 아래 버튼이나 키보드(↑↓ 음 높이, ←→ 위치, Delete 지우기)로 고쳐요.',
    '악보를 가로로 끌어서, 또는 시작점과 끝점을 한 번씩 눌러서 구간을 골라요. 그다음 rit., Break 같은 표시를 누르면 형광펜으로 칠해져요.',
    '오선이나 타브 위의 원하는 자리를 누르면 그 높이·위치에 4분음표가 들어가요. 들어간 음은 바로 고를 수 있어요.',
  ][SCORE.tool];
  $('nttoolhow').textContent = toolHow;
  if (!doc) { $('ntout').innerHTML = '<p class="meta">위에서 녹음하거나 파일을 불러오면 여기에 악보가 나와요.</p>'; $('ntsum').textContent = ''; $('ntedit').hidden = true; $('ntpal').hidden = true; $('ntmlistw').hidden = true; return; }
  const bb = barBeats(doc.ts);
  const bars = Math.max(doc.minBars || 1, Math.ceil(Math.max(0, ...doc.notes.map(n => n.t + n.dur)) / bb - 1e-6));
  $('ntsum').textContent = [`${doc.title} · ${doc.notes.length}음 · ${bars}마디 · 빠르기 ${doc.bpm} · ${doc.ts.num}/${doc.ts.den}박자${doc.key ? ' · 추정 조: ' + doc.key.name : ''}`, ...(SCORE.msgs || [])].join(' ');
  edRender($('ntout'));
  // 고른 음 고치기 막대
  const n = edSelNote();
  const ed = $('ntedit');
  if (n && ED.mode === 'select') {
    const flats = doc.key && doc.key.flats, sp = spellM(n.midi, flats), nm = LETTERS[((sp.step % 7) + 7) % 7] + (sp.acc > 0 ? '♯' : sp.acc < 0 ? '♭' : '') + Math.floor(sp.step / 7);
    ed.hidden = false;
    ed.innerHTML = `<div class="edinfo">고른 음: <b>${nm}</b> · ${durName(n.dur)} · ${posText(n.t, bb)}${doc.fretted ? ` · ${doc.tuning.length - n.s}번줄 ${n.f}프렛` : ''}</div>
      <div class="btns">${[['up', '반음 ▲'], ['down', '반음 ▼'], ['oup', '옥타브 ▲'], ['odown', '옥타브 ▼'], ['longer', '길게'], ['shorter', '짧게'], ['left', '◀ 앞으로'], ['right', '뒤로 ▶'], ...(doc.fretted ? [['string', '다른 줄로']] : []), ['copy', '복사해서 뒤에'], ['del', '지우기']].map(([op, t]) => `<button class="btn sec small${op === 'del' ? ' danger' : ''}" data-op="${op}">${t}</button>`).join('')}</div>`;
    ed.querySelectorAll('button[data-op]').forEach(b => (b.onclick = () => { const m = edEdit(b.dataset.op); ntErr(m); const nn = edSelNote(); if (nn && ED.onSelect && b.dataset.op !== 'del') ED.onSelect(nn); }));
  } else ed.hidden = true;
  // 형광펜 표시 고르기
  const pal = $('ntpal');
  if (ED.mode === 'range') {
    pal.hidden = false;
    const types = Object.entries(MARK_TYPES).filter(([, T]) => !T.fret || doc.fretted);
    const rangeTxt = ED.range ? `고른 구간: <b>${posText(ED.range.a, bb)} ~ ${posText(ED.range.b, bb)}</b>` : ED.anchor != null ? `시작점: <b>${posText(ED.anchor, bb)}</b> · 끝점을 눌러 주세요.` : '악보에서 구간을 골라 주세요.';
    pal.innerHTML = `<div class="edinfo">${rangeTxt}${ED.range ? ' <button class="btn sec small" id="ntrclr">구간 취소</button>' : ''}</div>
      <div class="colors"><span class="lb">형광펜 색</span>${[['', '종류별 색']].concat(HL_COLORS).map(([c, nm]) => `<button class="cchip${(SCORE.color || '') === c ? ' on' : ''}" data-c="${c}" aria-label="${nm}" title="${nm}" style="${c ? 'background:' + c : ''}">${c ? '' : '자동'}</button>`).join('')}</div>
      <div class="rfg" style="margin-top:6px"><div><label class="lb2" for="ntmemo">메모 글자 (메모 표시용)</label><input type="text" id="ntmemo" placeholder="예: 여기서 숨 쉬기, 2절만" value="${SCORE.memo || ''}"></div></div>
      <div class="btns">${types.map(([k, T]) => `<button class="btn sec small mkb" data-k="${k}"${ED.range ? '' : ' disabled'}><span class="sw" style="background:${SCORE.color || T.color}"></span>${T.label ? T.label + ' · ' : ''}${T.name}</button>`).join('')}</div>`;
    if ($('ntrclr')) $('ntrclr').onclick = () => { ED.range = null; ED.anchor = null; ntDraw(); };
    pal.querySelectorAll('.cchip').forEach(b => (b.onclick = () => { SCORE.color = b.dataset.c; ntDraw(); }));
    $('ntmemo').oninput = e => (SCORE.memo = e.target.value);
    pal.querySelectorAll('.mkb').forEach(b => (b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'memo' && !(SCORE.memo || '').trim()) return ntErr('메모 글자 칸에 먼저 글자를 적어 주세요.');
      ntErr('');
      edAddMark(k, SCORE.color || MARK_TYPES[k].color, k === 'memo' ? SCORE.memo.trim() : '');
    }));
  } else pal.hidden = true;
  // 표시 목록
  const lw = $('ntmlistw');
  lw.hidden = !doc.marks.length;
  $('ntmlist').innerHTML = doc.marks.map(m => { const T = MARK_TYPES[m.type] || MARK_TYPES.memo; return `<div class="mrow"><button class="mcol" data-id="${+m.id}" style="background:${cleanColor(m.color)}" aria-label="색 바꾸기" title="눌러서 색 바꾸기"></button><span class="mname"><b>${escH(m.type === 'memo' ? m.text : T.label)}</b> ${m.type === 'memo' ? '메모' : T.name.split(' · ')[0]}</span><span class="meta">${posText(m.a, bb)} ~ ${posText(m.b, bb)}</span><button class="btn sec small" data-play="${+m.id}">▶</button><button class="btn sec small danger" data-del="${+m.id}">지우기</button></div>`; }).join('');
  $('ntmlist').querySelectorAll('.mcol').forEach(b => (b.onclick = () => edRecolorMark(+b.dataset.id)));
  $('ntmlist').querySelectorAll('[data-del]').forEach(b => (b.onclick = () => edDelMark(+b.dataset.del)));
  $('ntmlist').querySelectorAll('[data-play]').forEach(b => (b.onclick = () => { const m = doc.marks.find(x => x.id === +b.dataset.play); if (m) edPlay(Math.max(0, m.a - bb), m.b + 1, false); }));
}

// 키보드로 고치기 (컴퓨터)
document.addEventListener('keydown', e => {
  const page = $('p-nt');
  if (!page || page.hidden || !ED.doc) return;
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); edRestore(e.shiftKey ? ED.redo : ED.undo, e.shiftKey ? ED.undo : ED.redo); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); edRestore(ED.redo, ED.undo); return; }
  if (!edSelNote()) return;
  const map = { ArrowUp: e.shiftKey ? 'oup' : 'up', ArrowDown: e.shiftKey ? 'odown' : 'down', ArrowLeft: 'left', ArrowRight: 'right', Delete: 'del', Backspace: 'del' };
  if (map[e.key]) { e.preventDefault(); ntErr(edEdit(map[e.key])); const n = edSelNote(); if (n && ED.onSelect && map[e.key] !== 'del') ED.onSelect(n); }
});

// 화면 공통 도우미: 버튼 묶음, 구간 선택, 현재 악기

let INST = INSTRUMENTS.guitar; // 지금 고른 악기
const $ = id => document.getElementById(id);
// 사람이 쓴 글(이름·제목·가사)을 화면에 넣을 때 쓰는 안전 처리
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// 다른 사람이 보낸(공유된) 값을 안전한 숫자·색으로 바꾸기
const cleanNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cleanColor = c => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? String(c) : '#FFE14D');
// 바깥 라이브러리(PDF 도구, Firebase)를 필요할 때 한 번만 불러오기
// (못 받았으면 다음에 다시 받아 볼 수 있게 지워 둬요)
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    const had = [...document.scripts].find(s => s.src === src && !s.dataset.err);
    if (had && had.dataset.ok) return res();
    const s = had || document.createElement('script');
    s.addEventListener('load', () => { s.dataset.ok = '1'; res(); });
    s.addEventListener('error', () => { s.dataset.err = '1'; s.remove(); rej('lib'); });
    if (!had) { s.src = src; document.head.appendChild(s); }
  });
}

// 갤럭시 탭 앱(안드로이드) 안에서 열렸는지: 앱이 window.MHNative라는 연결 통로를 넣어 줘요.
// 앱에서는 파일 저장, 화면 켜 두기, 뒤로 가기 버튼을 폰 기능으로 처리해요. 웹(브라우저)에서는 아무 일도 안 해요.
const NATIVE = typeof window.MHNative === 'object' && window.MHNative !== null;
if (NATIVE) document.documentElement.classList.add('native');
const NATIVE_SAVES = {};
window.__mhSaveDone = (id, result) => { const done = NATIVE_SAVES[id]; if (done) { delete NATIVE_SAVES[id]; done(result); } };
// 앱의 “저장할 곳 고르기” 창으로 파일을 저장해요 → 'saved' · 'declined' · 'failed'
function nativeSave(bytes, name, type) {
  return new Promise(resolve => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: type || 'application/octet-stream' });
    const fr = new FileReader();
    fr.onerror = () => resolve('failed');
    fr.onload = () => {
      const s = String(fr.result || ''), b64 = s.slice(s.indexOf(',') + 1);
      const id = 'sv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      NATIVE_SAVES[id] = resolve;
      try { window.MHNative.saveFile(String(name || 'file'), type || 'application/octet-stream', b64, id); }
      catch (e) { delete NATIVE_SAVES[id]; resolve('failed'); }
    };
    fr.readAsDataURL(blob);
  });
}

// 버튼 여러 개 중 하나 고르기
function seg(el, opts, val, cb) {
  el.innerHTML = opts.map((o, i) => `<button id="${el.id}-${i}" aria-pressed="${i === val}">${o}</button>`).join('');
  el.querySelectorAll('button').forEach((b, i) => (b.onclick = () => {
    el.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b));
    cb(i);
  }));
}

// ◀ 구간 ▶ + 슬라이더
function windowControl(el, min, max, fmt, val, cb) {
  el.innerHTML = `<div class="fw"><button id="${el.id}-prev" aria-label="한 칸 아래로">◀</button><output id="${el.id}-out">${fmt(val)}</output><button id="${el.id}-next" aria-label="한 칸 위로">▶</button></div><input type="range" id="${el.id}-range" min="${min}" max="${max}" value="${val}" aria-label="구간 시작">`;
  const set = n => {
    n = Math.max(min, Math.min(max, n));
    $(el.id + '-range').value = n;
    $(el.id + '-out').textContent = fmt(n);
    cb(n);
  };
  $(el.id + '-range').oninput = e => set(+e.target.value);
  $(el.id + '-prev').onclick = () => set(+$(el.id + '-range').value - 1);
  $(el.id + '-next').onclick = () => set(+$(el.id + '-range').value + 1);
}

// 필터 조건을 글자로
function filterSummary(filters, vals) {
  return filters.map(f => {
    const v = vals[f.id];
    if (f.type === 'window') return v < 0 ? f.label + ' 전체' : f.fmt(v);
    return v === 0 ? f.label + ' 전체' : f.opts[v];
  }).join(' · ');
}
function filterTest(filters, vals) {
  return v => filters.every(f => {
    const k = vals[f.id];
    return f.type === 'window' && k < 0 ? true : f.test(v, k);
  });
}

// 파일 고르기 버튼: 휴대폰에서도 누르기 쉽고, 같은 파일을 다시 골라도 다시 불러와요
function filePickHtml(id, label, accept) {
  return `<label class="fpick" for="${id}"><span class="fpbtn">${label}</span><span class="fpname" id="${id}-name">고른 파일 없음</span><input type="file" id="${id}" class="fpin"${accept ? ` accept="${accept}"` : ''}></label>`;
}
function onFilePick(id, cb) {
  const el = $(id);
  if (!el) return;
  const take = f => { const nm = $(id + '-name'); if (nm) nm.textContent = f.name; cb(f); };
  el.onchange = () => {
    const f = el.files && el.files[0];
    if (!f) return;
    el.value = '';
    take(f);
  };
  // 파일을 버튼 위로 끌어다 놓아도 돼요 (태블릿 화면 분할·컴퓨터)
  const box = el.closest('.fpick');
  if (box) {
    box.ondragover = e => { e.preventDefault(); box.classList.add('drop'); };
    box.ondragleave = () => box.classList.remove('drop');
    box.ondrop = e => { e.preventDefault(); box.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) take(f); };
  }
}
// 붙여넣기로 파일 받기: 파일 앱에서 “복사”한 뒤 이 화면에서 붙여넣으면, 지금 보고 있는 탭에 맞게 불러와요
const PASTE_TARGETS = [];
function onPasteFile(panelId, cb) { PASTE_TARGETS.push([panelId, cb]); }
document.addEventListener('paste', e => {
  const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
  if (!f) return;
  const t = PASTE_TARGETS.find(([pid]) => { const p = $(pid); return p && !p.hidden && p.offsetParent !== null; });
  if (!t) return;
  e.preventDefault();
  t[1](f);
});
function pasteBoxHtml(id) {
  return `<details class="pastealt"><summary>버튼을 눌러도 파일 창이 안 열리나요?</summary><p class="how">Claude 앱 안에서는 파일 선택 창이 막혀 있을 수 있어요. 이렇게 해 보세요.</p><ol class="how"><li><b>가장 확실한 방법:</b> 이 화면을 Safari·Chrome 같은 브라우저로 열거나, 설치한 앱(github.io 주소)에서 쓰세요.</li><li><b>끌어다 놓기:</b> 화면을 나눠 파일 앱을 옆에 띄우고, 파일을 위 버튼 위로 끌어다 놓아요.</li><li><b>붙여넣기:</b> 파일 앱에서 파일을 길게 눌러 “복사”한 뒤, 아래 칸을 길게 눌러 “붙여넣기” 해요.</li></ol><textarea class="pastebox" id="${id}" rows="2" placeholder="여기를 길게 눌러 붙여넣기" aria-label="파일 붙여넣기 칸"></textarea></details>`;
}

// 파일로 저장: Claude 화면 안에서는 Claude의 저장 기능으로, 다른 곳에서는 보통 내려받기로
function crc32(u8) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < u8.length; i++) { c = (crc ^ u8[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(name, data) {
  const nm = new TextEncoder().encode(name), crc = crc32(data), n = data.length;
  const le = (v, b) => Array.from({ length: b }, (_, i) => (v >>> (8 * i)) & 255);
  const local = [...le(0x04034b50, 4), 20, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(n, 4), ...le(n, 4), ...le(nm.length, 2), 0, 0];
  const central = [...le(0x02014b50, 4), 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(n, 4), ...le(n, 4), ...le(nm.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const cdOff = local.length + nm.length + n, cdLen = central.length + nm.length;
  const end = [...le(0x06054b50, 4), 0, 0, 0, 0, 1, 0, 1, 0, ...le(cdLen, 4), ...le(cdOff, 4), 0, 0];
  const out = new Uint8Array(cdOff + cdLen + end.length);
  out.set(local, 0); out.set(nm, local.length); out.set(data, local.length + nm.length);
  out.set(central, cdOff); out.set(nm, cdOff + central.length); out.set(end, cdOff + cdLen);
  return out;
}
// 파일을 브라우저 내려받기로 저장 (saveFile이 다른 방법을 못 쓸 때)
function saveBlob(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function saveFile(bytes, name, type) {
  if (NATIVE) return nativeSave(bytes, name, type);
  let dl = null;
  try { if (window.claude && typeof window.claude.use === 'function') dl = await window.claude.use('downloads'); } catch (e) {}
  if (dl) {
    let fname = name, data = bytes;
    if (/\.mid$/i.test(name)) { data = zipStore(name, bytes); fname = name.replace(/\.mid$/i, '') + ' (MIDI).zip'; }
    try { await dl.save({ filename: fname, data: new Blob([data]) }); return /\.zip$/.test(fname) ? 'zip' : 'saved'; }
    catch (e) { return e && e.code === 'declined' ? 'declined' : 'failed'; }
  }
  saveBlob(bytes, name, type);
  return 'saved';
}

// 소리·영상 파일인지 (휴대폰 녹음 앱·동영상 포함)
const isMediaFile = f => /^(audio|video)\//.test(f.type || '') || /\.(m4a|mp3|wav|aac|ogg|oga|opus|webm|3gp|3gpp|amr|mp4|mov|caf|flac|aif|aiff)$/i.test(f.name);
const MEDIA_ACCEPT = 'audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.opus,.webm,.3gp,.amr,.mp4,.mov,.caf,.flac';
const audioReadError = f => /\.(amr|3gp|3gpp)$/i.test(f.name)
  ? '이 녹음 형식(amr·3gp)은 브라우저가 읽지 못해요. 녹음 앱 설정에서 m4a나 mp3로 저장하거나, 이 앱의 “녹음하기”로 바로 녹음해 주세요.'
  : '소리 파일을 읽을 수 없어요. m4a, mp3, wav 파일이나 동영상(mp4, mov)을 올려 주세요.';

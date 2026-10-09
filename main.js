// 화면 이동: 처음 화면(악보 편집 · 악보 실행 + 내 악보함) → 각 부분의 탭

// [탭, 화면, 처음 열 때 그리기, 다시 열 때 할 일]
const TABS = [
  ['t-pj', 'p-pj', renderProjPage, projRender], ['t-nt', 'p-nt', renderScorePage], ['t-pdf', 'p-pdf', renderPdfPage],
  ['t-run', 'p-run', renderStagePage, stgShown],
];
// 부분마다 보이는 탭
const SECTIONS = {
  edit: { tabs: ['t-pj', 't-nt', 't-pdf'], title: '악보 편집', lead: '프로젝트를 만들거나 연동하고, 오선·타브 악보와 PDF 악보를 만들고 고쳐요. 만든 악보는 처음 화면의 “내 악보함”에 저장돼요.' },
  run: { tabs: ['t-run'], title: '악보 실행', lead: '콘티와 곡을 고르고, 화면 오른쪽(또는 페달)을 누르면 넘어가요. 프로젝트에서는 주최자가 넘기면 모두 함께 넘어가요.' },
};
const INST_TABS = ['t-nt']; // 악기에 따라 달라지는 탭
const INST_ORDER = ['guitar', 'piano', 'bass']; // 위쪽 “악기” 버튼에 나오는 악기 (순서대로)
let RENDERED = {}, SECTION = null, TAB = null;

function stopSounds() { stopLoop(); stopScore(); if (REC.on) recStop(); micClose(); if (typeof stgStop === 'function') stgStop(); }

// 악기 바꾸기 (부분은 그대로)
function setInst(id) {
  if (!INSTRUMENTS[id]) id = 'guitar';
  if (INST && INST.id === id && document.body.dataset.inst === id) return;
  stopSounds();
  SAMP = [];
  INST = INSTRUMENTS[id];
  document.body.dataset.inst = id;
  try { localStorage.setItem('inst', id); } catch (e) {}
  INST_TABS.forEach(t => { RENDERED[t] = 0; const p = TABS.find(x => x[0] === t)[1]; $(p).innerHTML = ''; });
  if (SECTION) appHeader();
  if (TAB && INST_TABS.includes(TAB) && !$('app').hidden) showTab(TAB);
}
function lastInst() { let v = null; try { v = localStorage.getItem('inst'); } catch (e) {} return INSTRUMENTS[v] ? v : 'guitar'; }

function appHeader() {
  const S = SECTIONS[SECTION];
  $('instpickw').hidden = SECTION !== 'edit';
  if (SECTION === 'edit') seg($('instseg'), INST_ORDER.map(k => INSTRUMENTS[k].name), INST_ORDER.indexOf(INST.id), i => setInst(INST_ORDER[i]));
  $('apph1').textContent = S.title;
  $('applead').textContent = S.lead;
  document.querySelector('#app .tabs').hidden = S.tabs.length < 2;
  TABS.forEach(([t]) => ($(t).hidden = !S.tabs.includes(t)));
}
// 부분 열기: 'edit' · 'run'
function openSection(sec, tab) {
  if (!SECTIONS[sec]) sec = 'edit';
  SECTION = sec;
  document.body.dataset.sec = sec;
  appHeader();
  showScreen('app');
  const S = SECTIONS[sec];
  showTab(tab && S.tabs.includes(tab) ? tab : S.tabs.includes(TAB) ? TAB : S.tabs[0]);
  window.scrollTo(0, 0);
}

function showTab(t) {
  const T = TABS.find(x => x[0] === t);
  if (!T) return;
  if (TAB === 't-run' && t !== 't-run') stgStop();
  TAB = t;
  TABS.forEach(([t2, p2]) => { $(t2).setAttribute('aria-selected', t2 === t); $(p2).hidden = t2 !== t; });
  if (!RENDERED[t]) { RENDERED[t] = 1; T[2](); } else if (T[3]) T[3]();
}

TABS.forEach(([t]) => ($(t).onclick = () => showTab(t)));
$('switch').onclick = () => { stopSounds(); showScreen('home'); };
$('go-edit').onclick = () => openSection('edit');
$('go-run').onclick = () => openSection('run');

// 갤럭시 탭 앱의 “뒤로 가기” 버튼: 크게 보기 → 끝, 각 부분 → 처음 화면.
// 처음 화면에서는 false를 돌려줘서 앱이 뒤로 물러나요.
window.mhNativeBack = () => {
  if (STG.focus) { stgFocus(false); return true; }
  if (SCREEN === 'app') { $('switch').click(); return true; }
  return false;
};

// 갤탭 앱: GitHub에 올린 새 화면 코드를 앱이 받아 두면 알려 줘요 → “지금 적용”을 누르면 바로 바뀌어요 (앱을 다시 열어도 적용돼요)
window.mhUpdateReady = v => {
  let bar = $('updbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'updbar'; bar.className = 'updbar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  bar.innerHTML = `<span>새 버전(v${+v})을 받아 뒀어요.</span><button class="btn small" id="updgo">지금 적용</button><button class="btn sec small" id="updno">나중에</button>`;
  bar.hidden = false;
  $('updgo').onclick = () => { try { window.MHNative.applyUpdate(); } catch (e) {} };
  $('updno').onclick = () => { bar.hidden = true; };
};
if (NATIVE) { try { const pv = window.MHNative.pendingUpdate(); if (pv > 0) window.mhUpdateReady(pv); } catch (e) {} }
// 처음 화면 아래에 지금 버전을 보여 줘요
(() => {
  const el = $('verline');
  if (!el) return;
  let app = '';
  try { if (NATIVE) app = ' · 앱 ' + window.MHNative.appVersion(); } catch (e) {}
  fetch('version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j && j.version) el.textContent = `화면 v${j.version}${app}`; }).catch(() => {});
})();

INST = INSTRUMENTS[lastInst()];
document.body.dataset.inst = INST.id;
libInit();
// 처음에는 로그인 화면(함께하기)부터: 이미 로그인했으면 바로 처음 화면으로 가요
collabBoot().catch(e => { console.error(e); showScreen('home'); });

// 함께하기 화면: 처음 로그인 화면, 위쪽 계정 막대, “악보 편집 → 프로젝트” 탭(만들기·연동·멤버·역할·설정)

const SCREENS = ['gate', 'home', 'app'];
let SCREEN = 'gate', GATE_TAB = 0;
const ID_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

function showScreen(s) {
  if (s !== 'app' && SCREEN === 'app' && typeof stgStop === 'function') stgStop();
  SCREEN = s;
  SCREENS.forEach(id => { const el = $(id); if (el) el.hidden = id !== s; });
  $('acct').hidden = s === 'gate';
  acctRender();
  if (s === 'gate') gateRender();
  if (s === 'home' && typeof libRender === 'function') libRender();
  window.scrollTo(0, 0);
}
const roleBadge = r => (ROLE_NAMES[r] ? `<span class="rb rb-${r}">${ROLE_NAMES[r]}</span>` : '');
const pjVisible = () => SCREEN === 'app' && $('p-pj') && !$('p-pj').hidden;
function goProjects() { openSection('edit', 't-pj'); }

// ───────── 처음 화면: 로그인 ─────────
function gateRender() {
  const box = $('gatebody');
  if (!box) return;
  devCodeBind();
  const st = COLLAB.status, k = COLLAB.kind;
  $('gatesolo').textContent = st === 'none' ? '시작하기 (혼자 쓰기)' : '로그인 없이 혼자 쓰기';
  $('gatesolo').className = st === 'none' ? 'btn gbig' : 'glink';
  if (st === 'checking') { box.innerHTML = '<p class="gwait">함께하기 서버를 확인하는 중…</p>'; return; }
  if (st === 'error') {
    box.innerHTML = `<p class="err">${escH(COLLAB.note)}</p><div class="btns"><button class="btn sec" id="gretry">다시 연결하기</button></div>`;
    $('gretry').onclick = () => location.reload();
    return;
  }
  if (st === 'none' && window.claude) {
    box.innerHTML = '<p class="how">이 화면에서는 함께하기(로그인)를 쓸 수 없어요. Claude 앱이나 claude.ai 안에서 이 아티팩트를 열면 Claude 계정으로 함께하기를 쓸 수 있어요. 혼자 쓰기로 모든 연습 기능은 쓸 수 있어요.</p>';
    return;
  }
  if (st === 'none') {
    box.innerHTML = '<p class="how">로그인(함께하기) 서버가 아직 연결되지 않았어요. 지금은 혼자 쓰기로 모든 연습 기능을 쓸 수 있어요.</p><details class="tips"><summary>개발자라면: 함께하기 켜는 법</summary><p class="how">README.md의 “함께하기(로그인) 켜기”를 따라 Firebase 프로젝트를 만들고 <code>firebase-config.js</code>를 채워 올리면 이 화면에 로그인 칸이 나와요.</p></details>';
    return;
  }
  if (k === 'claude') {
    const me = CLAUDE_B.current();
    box.innerHTML = `<div class="gcard"><p class="how" style="margin:0">Claude 계정으로 확인했어요.</p><p class="gname"><b>${escH(me.name)}</b>님 ${me.dev ? roleBadge('dev') : ''}</p>${CLAUDE_B.readOnly ? '<p class="meta">공유 권한이 “보기”라서 프로젝트는 볼 수만 있어요.</p>' : ''}<button class="btn gbig" id="genter">들어가기</button></div>`;
    $('genter').onclick = () => { try { localStorage.setItem('mh-gate-claude', '1'); } catch (e) {} collabEnterClaude(); showScreen('home'); };
    return;
  }
  // Firebase: 아이디·비밀번호
  const up = GATE_TAB === 1;
  box.innerHTML = `<div class="seg gtabs" id="gtab"></div>
    <form class="gform" id="gform" autocomplete="on" novalidate>
      <label class="lb2" for="gid">아이디</label>
      <input id="gid" name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="영어 소문자·숫자 3~20자" maxlength="20">
      <label class="lb2" for="gpw">비밀번호</label>
      <input id="gpw" type="password" name="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="6자 이상">
      ${up ? `<label class="lb2" for="gpw2">비밀번호 한 번 더</label><input id="gpw2" type="password" autocomplete="new-password">
      <label class="lb2" for="gname">이름 (프로젝트에서 다른 사람에게 보여요)</label><input id="gname" maxlength="20" placeholder="예: 김민준">` : ''}
      <button class="btn gbig" type="submit" id="gsub">${up ? '가입하고 시작하기' : '로그인'}</button>
      <p class="err" id="gerr" role="alert"></p>
      <p class="meta">${up ? '아이디와 비밀번호는 잊지 않게 적어 두세요. 비밀번호 찾기는 아직 없어요.' : '처음이면 위에서 “회원가입”을 눌러 아이디를 만들어 주세요.'}</p>
    </form>`;
  seg($('gtab'), ['로그인', '회원가입'], GATE_TAB, i => { GATE_TAB = i; gateRender(); });
  $('gform').onsubmit = async e => {
    e.preventDefault();
    const id = $('gid').value.trim().toLowerCase(), pw = $('gpw').value, err = $('gerr');
    err.textContent = '';
    if (!ID_RE.test(id)) { err.textContent = '아이디는 영어 소문자·숫자로 3~20자예요. (가운데에 . _ - 도 쓸 수 있어요)'; return; }
    if (pw.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
    if (up && pw !== $('gpw2').value) { err.textContent = '비밀번호 두 개가 서로 달라요.'; return; }
    const b = $('gsub'); b.disabled = true; b.textContent = up ? '가입하는 중…' : '로그인하는 중…';
    try {
      if (up) await collabSignUp(id, pw, ($('gname').value.trim() || id).slice(0, 20));
      else await collabSignIn(id, pw);
      showScreen('home');
    } catch (ex) { err.textContent = collabErr(ex); b.disabled = false; b.textContent = up ? '가입하고 시작하기' : '로그인'; }
  };
}

// ───────── 처음 화면: 개발자 코드로 들어가기 ─────────
// 로그인 서버가 있으면 개발자 아이디(DEV_IDS 첫 번째)에 이 코드를 비밀번호로 써서 로그인해요 (계정이 없으면 만들어요).
// 서버가 없으면(혼자 쓰기) 이 기기에서 개발자 모드로 들어가요.
async function devCodeHash(code) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function devCodeEnter(code) {
  if (await devCodeHash(code) !== DEV_CODE_HASH) throw '개발자 코드가 맞지 않아요.';
  const ids = COLLAB.kind === 'firebase' ? FIREBASE_B.devIds().filter(x => ID_RE.test(x)) : [];
  if (ids.length) {
    try { await collabSignIn(ids[0], code); }
    catch (e) {
      try { await collabSignUp(ids[0], code, '개발자'); }
      catch (e2) { throw e2 && e2.code === 'auth/email-already-in-use' ? '개발자 계정의 비밀번호가 개발자 코드와 달라요. 아이디·비밀번호로 로그인해 주세요.' : collabErr(e2); }
    }
    return;
  }
  try { localStorage.setItem('mh-devlocal', '1'); sessionStorage.setItem('mh-solo', '1'); } catch (e) {}
  collabSolo();
}
function devCodeBind() {
  const f = $('gdevform');
  if (!f || f.dataset.on) return;
  f.dataset.on = '1';
  f.onsubmit = async e => {
    e.preventDefault();
    const inp = $('gdevcode'), err = $('gdeverr'), b = $('gdevsub');
    err.textContent = '';
    if (!inp.value) { err.textContent = '개발자 코드를 적어 주세요.'; return; }
    b.disabled = true;
    try { await devCodeEnter(inp.value); inp.value = ''; $('gdev').open = false; showScreen('home'); }
    catch (ex) { err.textContent = typeof ex === 'string' ? ex : collabErr(ex); }
    b.disabled = false;
  };
}

// ───────── 위쪽 계정 막대 ─────────
function acctRender() {
  const el = $('acct');
  if (!el || el.hidden) return;
  if (!COLLAB.me) {
    el.innerHTML = `<span class="acwho">혼자 쓰는 중${COLLAB.devLocal ? ' ' + roleBadge('dev') : ''}</span>${COLLAB.devLocal ? '<button class="aclink" id="acdevout">개발자 모드 끄기</button>' : ''}${COLLAB.status === 'none' ? '' : '<button class="aclink" id="aclogin">로그인하기</button>'}`;
    if ($('acdevout')) $('acdevout').onclick = () => { try { localStorage.removeItem('mh-devlocal'); } catch (e) {} COLLAB.devLocal = false; acctRender(); };
    if ($('aclogin')) $('aclogin').onclick = () => { COLLAB.solo = false; try { sessionStorage.removeItem('mh-solo'); } catch (e) {} showScreen('gate'); };
    return;
  }
  const p = COLLAB.project;
  el.innerHTML = `<span class="acwho"><b>${escH(COLLAB.me.name)}</b>${COLLAB.me.dev ? roleBadge('dev') : ''}</span>
    <button class="acbtn" id="acproj">${p ? `<span>프로젝트</span><b>${escH(p.name)}</b>${COLLAB.me.dev ? '' : roleBadge(myRole(p))}` : '<b>프로젝트</b>'}</button>
    <button class="aclink" id="acout">로그아웃</button>`;
  $('acproj').onclick = goProjects;
  $('acout').onclick = async () => {
    if (typeof stgLeave === 'function') await Promise.race([stgLeave(), new Promise(r => setTimeout(r, 1500))]); // 모두의 악보 넘기기를 끄고 나가요
    try { localStorage.removeItem('mh-gate-claude'); sessionStorage.removeItem('mh-solo'); } catch (e) {}
    await collabSignOut();
    showScreen('gate');
  };
}

// ───────── 악보 편집 → 프로젝트 탭 ─────────
let PJ_MSG = '', PJ_ERR = '', PJ_HOST = 'me', PJ_PEOPLE = null;
function renderProjPage() { projRender(); }
function projRender() {
  const el = $('p-pj');
  if (!el) return;
  if (!COLLAB.me) {
    el.innerHTML = `<p class="how">프로젝트를 만들거나 초대 코드로 연동하면, 악보 편집의 악보와 악보 실행이 멤버 모두에게 공유돼요.</p><p class="how">${COLLAB.status === 'none' ? '지금은 로그인(함께하기) 서버가 연결되어 있지 않아서 혼자 쓰기만 돼요.' : '로그인하면 프로젝트를 쓸 수 있어요.'}</p>${COLLAB.status === 'none' ? '' : '<div class="btns"><button class="btn" id="pjlogin">로그인하러 가기</button></div>'}`;
    if ($('pjlogin')) $('pjlogin').onclick = () => { COLLAB.solo = false; try { sessionStorage.removeItem('mh-solo'); } catch (e) {} showScreen('gate'); };
    return;
  }
  const me = COLLAB.me, p = COLLAB.project, lead = p && isLead(p), fb = COLLAB.kind === 'firebase';
  const list = COLLAB.projects;
  const cards = list.map(x => {
    const r = x.members[me.uid], n = Object.keys(x.members).length, hosts = Object.keys(x.members).filter(u => x.members[u] === 'host');
    return `<div class="pjcard${p && p.id === x.id ? ' on' : ''}"><div><b>${escH(x.name)}</b> ${r ? roleBadge(r) : me.dev ? '<span class="meta">(멤버 아님 · 개발자로 보기)</span>' : ''}</div><div class="meta">멤버 ${n}명${hosts.length ? ' · 주최자 ' + hosts.map(u => escH(nameOf(u, (x.names || {})[u]))).join(', ') : ' · 주최자 없음'}</div>${p && p.id === x.id ? '<span class="meta">지금 프로젝트</span>' : `<button class="btn sec small" data-open="${escH(x.id)}">들어가기</button>`}</div>`;
  }).join('');
  // 사람 추가 (아이디 또는 목록)
  const addBox = (idp, withRole) => fb
    ? `<div class="pjform"><input type="text" id="${idp}id" maxlength="20" placeholder="아이디 (예: minjun01)" autocapitalize="off" spellcheck="false">${withRole ? `<select id="${idp}role" aria-label="역할"><option value="host">주최자</option><option value="part">참가자</option></select>` : ''}</div>`
    : `<div class="pjform"><select id="${idp}who" aria-label="사람 고르기">${PJ_PEOPLE ? PJ_PEOPLE.filter(x => x.uid !== me.uid).map(x => `<option value="${escH(x.uid)}">${escH(x.name || '이름 모름')}</option>`).join('') || '<option value="">아직 이 앱에 들어온 사람이 없어요</option>' : '<option value="">불러오는 중…</option>'}</select>${withRole ? `<select id="${idp}role" aria-label="역할"><option value="host">주최자</option><option value="part">참가자</option></select>` : ''}</div>`;
  let cur = '<p class="how">아직 프로젝트에 들어가 있지 않아요. 아래에서 만들거나 초대 코드로 연동해 주세요.</p>';
  if (COLLAB.pid && !p) cur = '<p class="how">프로젝트를 불러오는 중…</p>';
  if (p) {
    const ids = Object.keys(p.members).sort((a, b) => (p.members[a] === 'host' ? 0 : 1) - (p.members[b] === 'host' ? 0 : 1) || nameOf(a).localeCompare(nameOf(b), 'ko'));
    const hosts = ids.filter(u => p.members[u] === 'host');
    const online = COLLAB.kind === 'claude' && COLLAB.online.size ? `<span class="meta">지금 접속 ${COLLAB.online.size}명</span>` : '';
    const members = ids.map(u => {
      const r = p.members[u], mine = u === me.uid, lastHost = r === 'host' && hosts.length === 1 && !me.dev;
      const ctl = lead && !(mine && lastHost)
        ? `<select data-role="${escH(u)}" aria-label="${escH(nameOf(u))} 역할"><option value="host"${r === 'host' ? ' selected' : ''}>주최자</option><option value="part"${r === 'part' ? ' selected' : ''}>참가자</option></select>${mine ? '' : `<button class="btn sec small danger" data-kick="${escH(u)}">내보내기</button>`}`
        : roleBadge(r);
      return `<div class="mrow"><span class="mname">${escH(nameOf(u))}${mine ? ' <span class="meta">(나)</span>' : ''}${COLLAB.online.has(u) ? ' <span class="dot-on" title="접속 중"></span>' : ''}</span>${ctl}</div>`;
    }).join('') || '<p class="meta">아직 멤버가 없어요.</p>';
    const sw = (id, on, label, hint) => `<div class="pjsw"><button class="swb" id="${id}" role="switch" aria-checked="${on}"${lead ? '' : ' disabled'}><span></span></button><div><b>${label}</b><div class="meta">${hint}</div></div></div>`;
    cur = `<div class="pjcur">
      <div class="pjh"><b class="pjname">${escH(p.name)}</b>${roleBadge(myRole(p))}${online}</div>
      ${hosts.length ? '' : '<p class="rolock">아직 주최자가 없어요. 아래 “사람 추가”로 주최자를 정하거나, 초대 코드로 들어온 멤버를 주최자로 바꿔 주세요.</p>'}
      <div class="pjcode">초대 코드 <code id="pjcode">${escH(p.code || '—')}</code> <button class="btn sec small" id="pjcopy">복사</button>${lead ? ' <button class="btn sec small" id="pjnewcode">새 코드로 바꾸기</button>' : ''}</div>
      <p class="meta">친구에게 이 코드를 알려 주면 “초대 코드로 연동하기”로 들어와 참가자가 돼요.${COLLAB.kind === 'claude' ? ' (Claude 화면에서는 이 아티팩트를 먼저 공유 메뉴에서 친구에게 공유해야 해요)' : ''}</p>
      ${lead ? `<h3 class="sgh">사람 추가 ${me.dev ? '<span class="meta">(개발자·주최자)</span>' : ''}</h3><p class="meta">${fb ? '가입한 사람의 아이디를 적고 역할을 골라요. 주최자로 정하면 그 사람이 이 프로젝트를 이끌어요.' : '이 앱에 한 번이라도 들어온 사람 중에서 고르고 역할을 정해요.'}</p>${addBox('pja', true)}<div class="btns"><button class="btn sec small" id="pjaddb">추가하기</button></div>` : ''}
      <h3 class="sgh">설정 ${lead ? '' : '<span class="meta">(주최자만 바꿀 수 있어요)</span>'}</h3>
      ${sw('pjallow', p.allowEdit, '참가자도 악보를 고칠 수 있어요', '끄면 참가자는 공유 악보를 볼 수만 있어요.')}
      ${sw('pjlock', p.hostLock, '모두 잠그기 (주최자 조율 중)', '켜 두는 동안 주최자·개발자만 고칠 수 있어요. 주최자가 악보를 고치면 그 악보는 1분 동안 자동으로 잠겨요.')}
      ${sw('pjopen', p.open, '초대 코드로 새로 들어올 수 있어요', '끄면 코드를 알아도 새로 참가할 수 없어요.')}
      ${lead ? `<div class="rfg"><div><label class="lb2" for="pjrename">프로젝트 이름</label><input type="text" id="pjrename" maxlength="40" value="${escH(p.name)}"></div></div><div class="btns"><button class="btn sec small" id="pjrenameb">이름 바꾸기</button></div>` : ''}
      <h3 class="sgh">멤버 ${ids.length}명</h3>
      <div class="pjmembers">${members}</div>
      <div class="btns">
        <button class="btn sec" id="pjclose">프로젝트 닫기 (혼자 쓰기로)</button>
        ${roleOf(p, me.uid) ? '<button class="btn sec" id="pjleave">프로젝트 나가기</button>' : ''}
        ${lead ? '<button class="btn sec danger" id="pjdel">프로젝트 지우기</button>' : ''}
      </div>
    </div>`;
  }
  const hostPick = me.dev ? `<div class="pjhost"><span class="lb">주최자</span><div class="seg" id="pjhost"></div></div>${PJ_HOST === 'pick' ? addBox('pjh', false) : ''}<p class="meta">${PJ_HOST === 'me' ? '내가 주최자가 돼요.' : PJ_HOST === 'pick' ? (fb ? '적은 아이디의 사람이 주최자가 돼요. 나는 개발자로 모든 권한을 그대로 가져요.' : '고른 사람이 주최자가 돼요. 나는 개발자로 모든 권한을 그대로 가져요.') : '주최자 없이 만들고, 나중에 “사람 추가”나 멤버 역할 바꾸기로 정해요.'}</p>` : '<p class="meta">만든 사람이 주최자가 돼요.</p>';
  const keep = {};
  ['pjnew', 'pjjoin', 'pjrename', 'pjaid', 'pjhid'].forEach(id => { const x = $(id); if (x) keep[id] = { v: x.value, f: document.activeElement === x, s: x.selectionStart, e: x.selectionEnd }; });
  el.innerHTML = `<p class="how">프로젝트를 만들거나 초대 코드로 연동하면, 오선·타브 악보와 PDF 악보에 쓴 표시가 멤버 모두에게 공유되고, 악보 실행에서 주최자가 넘기면 모두의 악보가 함께 넘어가요.</p>
    <p class="pjme">나: <b>${escH(me.name)}</b>${me.loginId ? ` <span class="meta">(아이디 ${escH(me.loginId)})</span>` : ''} ${me.dev ? roleBadge('dev') + ' <span class="meta">모든 프로젝트에서 제한 없이 쓸 수 있어요</span>' : ''}</p>
    ${COLLAB.note ? `<p class="err">${escH(COLLAB.note)}</p>` : ''}
    <p class="okmsg" id="pjmsg" role="status">${escH(PJ_MSG)}</p><p class="err" id="pjerr" role="alert">${escH(PJ_ERR)}</p>
    <h2>지금 프로젝트</h2>${cur}
    <h2>${me.dev ? '모든 프로젝트' : '내 프로젝트'} ${list.length ? `<span class="meta">${list.length}개</span>` : ''}</h2>
    <div class="pjlist">${cards || '<p class="meta">아직 없어요.</p>'}</div>
    <h2>새 프로젝트 만들기</h2>
    <div class="pjform"><input type="text" id="pjnew" maxlength="40" placeholder="예: 주일 2부 찬양팀"><button class="btn" id="pjnewb">만들기</button></div>
    ${hostPick}
    <h2>초대 코드로 연동하기</h2>
    <div class="pjform"><input type="text" id="pjjoin" maxlength="8" placeholder="예: K7M2QX" autocapitalize="characters" spellcheck="false"><button class="btn" id="pjjoinb">연동하기</button></div>
    <details class="tips" style="margin-top:22px"><summary>역할 안내</summary><ul>
      <li><b>개발자</b>: 앱을 만든 사람이에요. 모든 프로젝트를 제한 없이 보고 고치고, 프로젝트를 만들면서 주최자를 직접 정할 수 있어요.</li>
      <li><b>주최자</b>: 프로젝트를 이끄는 사람이에요. 멤버 추가·역할·설정을 바꾸고, 악보 실행에서 모두의 악보를 함께 넘길 수 있어요. 주최자가 악보를 고치는 동안(마지막으로 고친 뒤 1분) 참가자는 그 악보를 건드릴 수 없어요.</li>
      <li><b>참가자</b>: 공유 악보를 보고, 주최자가 허락하면 고칠 수 있어요. 주최자가 함께 넘기는 동안에는 주최자를 따라가요.</li></ul></details>`;
  Object.entries(keep).forEach(([id, k]) => { const x = $(id); if (!x) return; if (id !== 'pjrename' || k.f) x.value = k.v; if (k.f) { x.focus(); try { x.setSelectionRange(k.s, k.e); } catch (e) {} } });
  const say = (m, e) => { PJ_MSG = m || ''; PJ_ERR = e || ''; const a = $('pjmsg'), b = $('pjerr'); if (a) a.textContent = PJ_MSG; if (b) b.textContent = PJ_ERR; };
  const act = (btn, fn, done) => async () => {
    say('', '');
    if (btn) btn.disabled = true;
    try { await fn(); if (done) say(done); } catch (e) { say('', collabErr(e)); }
    if (btn && btn.isConnected) btn.disabled = false;
  };
  // 사람 고르기: 아이디(Firebase) 또는 목록(Claude)
  const pickPerson = async idp => {
    if (fb) {
      const id = ($(idp + 'id').value || '').trim().toLowerCase();
      if (!ID_RE.test(id)) throw '아이디를 확인해 주세요. (영어 소문자·숫자 3~20자)';
      const u = await COLLAB.B.findUser(id);
      if (!u) throw `“${id}” 아이디로 가입한 사람이 없어요. 먼저 그 사람이 앱에서 한 번 가입·로그인해야 해요.`;
      return u;
    }
    const v = $(idp + 'who') && $(idp + 'who').value;
    const u = (PJ_PEOPLE || []).find(x => x.uid === v);
    if (!u) throw '추가할 사람을 골라 주세요.';
    return u;
  };
  if (!fb && PJ_PEOPLE == null && (lead || me.dev)) { PJ_PEOPLE = []; COLLAB.B.people().then(l => { PJ_PEOPLE = l; if (pjVisible()) projRender(); }).catch(() => {}); }
  el.querySelectorAll('[data-open]').forEach(b => (b.onclick = () => { collabSetProject(b.dataset.open); say(''); projRender(); }));
  if (me.dev) seg($('pjhost'), ['나', fb ? '아이디로 정하기' : '사람 고르기', '나중에 정하기'], ['me', 'pick', 'none'].indexOf(PJ_HOST), i => { PJ_HOST = ['me', 'pick', 'none'][i]; if (PJ_HOST === 'pick' && !fb) PJ_PEOPLE = null; projRender(); });
  $('pjnewb').onclick = act($('pjnewb'), async () => {
    let host = null;
    if (me.dev && PJ_HOST === 'pick') host = await pickPerson('pjh');
    if (me.dev && PJ_HOST === 'none') host = 'none';
    await collabCreate($('pjnew').value, host);
    if ($('pjnew')) $('pjnew').value = '';
  }, '프로젝트를 만들었어요. 초대 코드를 친구에게 알려 주세요.');
  $('pjjoinb').onclick = act($('pjjoinb'), async () => { await collabJoin($('pjjoin').value); if ($('pjjoin')) $('pjjoin').value = ''; }, '프로젝트에 연동했어요.');
  $('pjnew').onkeydown = e => { if (e.key === 'Enter') $('pjnewb').click(); };
  $('pjjoin').onkeydown = e => { if (e.key === 'Enter') $('pjjoinb').click(); };
  if (!p) return;
  $('pjcopy').onclick = async () => {
    try { await navigator.clipboard.writeText(p.code); say('초대 코드를 복사했어요.'); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('pjcode')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); say('코드를 골라 두었어요. 길게 눌러 복사해 주세요.'); }
  };
  if ($('pjnewcode')) $('pjnewcode').onclick = act($('pjnewcode'), () => COLLAB.B.newCode(p.id, p.code), '새 초대 코드로 바꿨어요. 예전 코드로는 이제 못 들어와요.');
  if (lead) {
    $('pjaddb').onclick = act($('pjaddb'), async () => {
      const u = await pickPerson('pja'), role = $('pjarole').value;
      if (p.members[u.uid] === role) throw `${u.name || '그 사람'}님은 이미 ${ROLE_NAMES[role]}예요.`;
      await COLLAB.B.addMember(p.id, u.uid, u.name, role);
      if ($('pjaid')) $('pjaid').value = '';
      say(`${u.name || '멤버'}님을 ${ROLE_NAMES[role]}로 추가했어요.`);
    });
    $('pjallow').onclick = act(null, () => collabUpdate({ allowEdit: !p.allowEdit }));
    $('pjlock').onclick = act(null, () => collabUpdate({ hostLock: !p.hostLock }));
    $('pjopen').onclick = act(null, () => collabUpdate({ open: !p.open }));
    $('pjrenameb').onclick = act($('pjrenameb'), () => { const n = $('pjrename').value.trim().slice(0, 40); if (!n) throw '이름을 적어 주세요.'; return collabUpdate({ name: n }); }, '이름을 바꿨어요.');
    el.querySelectorAll('select[data-role]').forEach(s => (s.onchange = act(null, () => {
      const u = s.dataset.role, hosts = Object.keys(p.members).filter(x => p.members[x] === 'host');
      if (s.value === 'part' && p.members[u] === 'host' && hosts.length === 1 && !me.dev) { s.value = 'host'; throw '주최자가 한 명은 있어야 해요. 다른 사람을 먼저 주최자로 바꿔 주세요.'; }
      return COLLAB.B.setRole(p.id, u, s.value);
    }, '역할을 바꿨어요.')));
    el.querySelectorAll('[data-kick]').forEach(b => (b.onclick = () => {
      if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '정말 내보낼까요?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = '내보내기'; } }, 3500); return; }
      act(b, () => COLLAB.B.setRole(p.id, b.dataset.kick, null), '멤버를 내보냈어요.')();
    }));
    $('pjdel').onclick = () => {
      const b = $('pjdel');
      if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '공유 악보까지 모두 지워져요. 한 번 더 누르면 지워요'; setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = '프로젝트 지우기'; } }, 4000); return; }
      act(b, () => collabDelete(), '프로젝트를 지웠어요.')();
    };
  }
  $('pjclose').onclick = () => { collabSetProject(null); say('프로젝트를 닫았어요. 다시 들어가려면 위 목록에서 “들어가기”를 눌러 주세요.'); projRender(); };
  if ($('pjleave')) $('pjleave').onclick = act($('pjleave'), () => {
    const hosts = Object.keys(p.members).filter(x => p.members[x] === 'host');
    if (p.members[me.uid] === 'host' && hosts.length === 1 && Object.keys(p.members).length > 1) throw '주최자가 한 명뿐이에요. 다른 사람을 주최자로 바꾼 뒤에 나가 주세요.';
    return collabLeave();
  }, '프로젝트에서 나왔어요.');
}

// ───────── 시작 ─────────
const pjRefresh = () => { if (pjVisible()) projRender(); };
collabOn('status', () => { if (SCREEN === 'gate') gateRender(); pjRefresh(); });
collabOn('projects', () => { acctRender(); pjRefresh(); if (SCREEN === 'home' && typeof libRender === 'function') libRender(); });
collabOn('project', ev => { if (ev && ev.note) { PJ_MSG = ev.note; PJ_ERR = ''; } acctRender(); pjRefresh(); if (SCREEN === 'home' && typeof libRender === 'function') libRender(); });
collabOn('names', pjRefresh);
collabOn('online', pjRefresh);
collabOn('login', () => { PJ_PEOPLE = null; pjRefresh(); });
collabOn('logout', () => { PJ_MSG = PJ_ERR = ''; PJ_PEOPLE = null; pjRefresh(); });

async function collabBoot() {
  showScreen('gate');
  $('gatesolo').onclick = () => { try { sessionStorage.setItem('mh-solo', '1'); } catch (e) {} collabSolo(); showScreen('home'); };
  let soloS = false;
  try { soloS = sessionStorage.getItem('mh-solo') === '1'; } catch (e) {}
  const slow = setTimeout(() => { if (COLLAB.status === 'checking') { COLLAB.note = ''; const b = $('gatebody'); if (b && SCREEN === 'gate') b.innerHTML = '<p class="gwait">서버 연결이 늦어요. 잠시 기다리거나 혼자 쓰기로 시작해 주세요.</p>'; } }, 12000);
  await collabInit();
  clearTimeout(slow);
  if (SCREEN !== 'gate') return;
  if (COLLAB.kind === 'firebase') { const me = FIREBASE_B.current(); if (me) { collabStart(me); showScreen('home'); return; } }
  if (COLLAB.kind === 'claude') { let ok = false; try { ok = localStorage.getItem('mh-gate-claude') === '1'; } catch (e) {} if (ok) { collabEnterClaude(); showScreen('home'); return; } }
  if (soloS) { collabSolo(); showScreen('home'); return; } // 이번에 이미 “혼자 쓰기”를 골랐으면 새로 고침해도 바로 시작
  gateRender();
}

// 함께하기: 로그인 · 공동 프로젝트 · 역할(개발자/주최자/참가자) · 공유 악보 · 함께 실행
//
// 어디서 여느냐에 따라 저장하는 곳이 달라요.
//  - Claude 화면(아티팩트): Claude 계정으로 로그인하고, 데이터는 Claude가 이 아티팩트에 보관해요.
//  - github.io 앱: Firebase(무료)로 아이디·비밀번호 로그인. firebase-config.js를 채워야 켜져요 (README 참고).
//  - 둘 다 안 되면: 로그인 없이 혼자 쓰기만 돼요.
// 화면 쪽 코드는 COLLAB과 collab… 함수만 쓰고, 두 방식의 차이는 CLAUDE_B / FIREBASE_B 안에만 있어요.

const ROLE_NAMES = { dev: '개발자', host: '주최자', part: '참가자' };
const LOCK_MS = 60000; // 주최자가 악보를 고친 뒤 이 시간(1분) 동안 참가자는 그 악보를 못 고쳐요
const FIREBASE_VER = '12.19.0';
// 개발자 코드: 코드 자체가 아니라 코드의 SHA-256 값만 넣어 둬요 (코드를 바꾸려면 README의 “개발자 코드 바꾸기”)
const DEV_CODE_HASH = '68b3ea6b229d5a7cde64b1ce59f23311121554b492a60130ae876109b2be193f';
const LOGIN_DOMAIN = 'music-helper.example.com'; // 아이디 → 로그인용 주소 (메일은 보내지 않아요)
const ITEM_KINDS = ['scores', 'sheets', 'orders', 'pdfs', 'live'];

const COLLAB = { B: null, kind: 'none', status: 'checking', note: '', me: null, solo: false, all: [], projects: [], pid: null, project: null, names: {}, online: new Set(), subs: {}, h: {} };
function collabOn(ev, fn) { (COLLAB.h[ev] = COLLAB.h[ev] || []).push(fn); }
function collabEmit(ev, x) { (COLLAB.h[ev] || []).forEach(f => { try { f(x); } catch (e) { console.error(e); } }); }
const collabIn = () => !!(COLLAB.B && COLLAB.me);

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', u = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(u);
  return [...u].map(x => A[x % A.length]).join('');
}
const newSid = () => Math.random().toString(36).slice(2, 10);

// ───────── 역할과 권한 ─────────
const roleOf = (p, uid) => (p && p.members && p.members[uid]) || null;
function myRole(p = COLLAB.project) {
  if (!p || !COLLAB.me) return null;
  if (COLLAB.me.dev) return 'dev';
  return roleOf(p, COLLAB.me.uid);
}
const isLead = (p = COLLAB.project) => ['dev', 'host'].includes(myRole(p)); // 주최자·개발자
const lockOn = item => !!(item && item.lock && item.lock.by && COLLAB.me && item.lock.by !== COLLAB.me.uid && Date.now() - (item.lock.at || 0) < LOCK_MS);
// 공유 데이터를 고칠 수 있는지: '' = 고칠 수 있음, 아니면 못 고치는 까닭
function whyReadOnly(item, p = COLLAB.project) {
  if (!p || !COLLAB.me) return '프로젝트에 들어가 있지 않아요.';
  if (COLLAB.B && COLLAB.B.readOnly) return '공유 권한이 “보기”라서 볼 수만 있어요.';
  const r = myRole(p);
  if (!r) return '이 프로젝트의 멤버가 아니에요.';
  if (r === 'dev' || r === 'host') return '';
  if (!p.allowEdit) return '주최자가 참가자 편집을 꺼 두었어요. 볼 수만 있어요.';
  if (p.hostLock) return '주최자가 조율 중이라 모두 잠가 두었어요. 볼 수만 있어요.';
  if (lockOn(item)) return `주최자 ${nameOf(item.lock.by, item.lock.name)}님이 이 악보를 조율 중이에요. 잠시 볼 수만 있어요.`;
  return '';
}
const canCreate = (p = COLLAB.project) => whyReadOnly(null, p) === '';
function nameOf(uid, fallback) {
  if (!uid) return fallback || '누군가';
  if (COLLAB.me && uid === COLLAB.me.uid) return COLLAB.me.name || '나';
  const p = COLLAB.project;
  return COLLAB.names[uid] || (p && p.names && p.names[uid]) || fallback || '멤버';
}
const NAME_ASKED = new Set();
async function collabResolveNames(ids) {
  ids = ids.filter(u => !NAME_ASKED.has(u));
  if (!COLLAB.B || !COLLAB.B.names || !ids.length) return;
  ids.forEach(u => NAME_ASKED.add(u));
  try { Object.assign(COLLAB.names, await COLLAB.B.names(ids)); collabEmit('names'); } catch (e) {}
}

function collabErr(e) {
  const c = String((e && (e.code || e.message)) || e || '');
  const map = [
    [/invalid-credential|wrong-password|user-not-found|invalid-login/, '아이디나 비밀번호가 맞지 않아요.'],
    [/email-already-in-use/, '이미 있는 아이디예요. 다른 아이디를 써 주세요.'],
    [/weak-password/, '비밀번호는 6자 이상으로 해 주세요.'],
    [/invalid-email/, '아이디는 영어 소문자·숫자로 3~20자예요.'],
    [/too-many-requests/, '너무 여러 번 시도했어요. 잠시 뒤 다시 해 주세요.'],
    [/operation-not-allowed/, 'Firebase에서 “이메일/비밀번호” 로그인이 꺼져 있어요. (개발자: README의 2단계를 확인해 주세요)'],
    [/api-key|invalid-api-key|app-not-authorized|configuration/, '서버 설정(firebase-config.js)을 확인해 주세요.'],
    [/network|unavailable|deadline/, '인터넷 연결이 불안정해요. 잠시 뒤 다시 해 주세요.'],
    [/permission-denied|not_permitted/, '권한이 없어서 하지 못했어요. (주최자가 잠갔거나 역할이 바뀌었을 수 있어요)'],
    [/invalid_argument/, '저장하지 못했어요. (공유 권한이 “보기”이거나 악보가 너무 커요)'],
    [/quota|resource[-_]exhausted/, '저장 공간이나 사용량 한도가 찼어요. 오래된 악보를 지워 주세요.'],
    [/revoked|not_granted/, '이 화면의 공유 권한이 바뀌었어요. 새로 고침해 주세요.'],
    [/^closed$/, '주최자가 초대를 닫아 두었어요.'],
  ];
  const hit = map.find(([re]) => re.test(c));
  if (hit) return hit[1];
  return typeof e === 'string' && /[가-힣]/.test(e) ? e : '문제가 생겼어요. 잠시 뒤 다시 해 주세요.';
}

// ───────── 방식 1: Claude 화면 안 (db · user · room) ─────────
const CLAUDE_B = {
  kind: 'claude',
  async init() {
    const use = n => Promise.resolve(window.claude.use(n)).catch(() => null);
    const [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db || !user) return false;
    const me = await user.me();
    if (!me || !me.id) return false;
    this.db = db; this.user = user; this.meV = me;
    this.readOnly = (await user.can('data.write')) === false;
    // 아티팩트 주인(개발자)의 id: meta는 주인만 쓸 수 있게 공개할 때 규칙으로 막아 두었어요
    this.ownerId = null;
    try { const m = await db.doc('meta/owner').get(); if (m.exists) this.ownerId = (m.data() || {}).id || null; } catch (e) {}
    if (me.isOwner && this.ownerId !== me.id) { try { await db.doc('meta/owner').set({ id: me.id }); this.ownerId = me.id; } catch (e) {} }
    // 주인이 나중에 처음 들어와도 알 수 있게 계속 지켜봐요
    try { db.doc('meta/owner').onSnapshot(d => { const id = d.exists ? (d.data() || {}).id : null; if (id) this.ownerId = id; }, () => {}); } catch (e) {}
    this.room = await Promise.race([use('room'), new Promise(r => setTimeout(() => r(null), 5000))]);
    if (this.room) { try { this.room.onPeers(ch => this.peers(ch.peers), () => {}); } catch (e) {} }
    return true;
  },
  current() { const m = this.meV; return { uid: m.id, loginId: '', name: m.name || '나', dev: !!m.isOwner }; },
  async names(ids) { const ps = await this.user.profiles(ids), o = {}; ids.forEach(id => { if (ps[id] && ps[id].name) o[id] = ps[id].name; }); return o; },
  proj(d) {
    const x = d.data() || {}, members = {};
    Object.entries(x.members || {}).forEach(([k, v]) => { if (v === 'host' || v === 'part') members[k] = v; });
    return { id: d.id, name: x.name || '이름 없는 프로젝트', code: x.code || '', members, names: {}, allowEdit: x.allowEdit !== false, hostLock: !!x.hostLock, open: x.open !== false, createdBy: x.createdBy || '' };
  },
  watchProjects(cb, onErr) {
    return this.db.collection('projects').onSnapshot(s => {
      const me = COLLAB.me, all = s.docs.map(d => this.proj(d));
      COLLAB.all = all;
      cb(all.filter(p => me.dev || p.members[me.uid]), !!(s.metadata && s.metadata.fromCache));
    }, onErr);
  },
  ref(pid) { return this.db.doc('projects/' + pid); },
  async createProject(name, host) {
    const me = COLLAB.me, r = this.db.collection('projects').doc();
    const members = host === 'none' ? {} : host ? { [host.uid]: 'host' } : { [me.uid]: 'host' };
    await r.set({ name, code: makeCode(), members, allowEdit: true, hostLock: false, open: true, createdBy: me.uid, createdAt: Date.now() });
    return r.id;
  },
  // 이 앱에 들어온 사람 목록 (개발자·주최자가 사람을 추가할 때 골라요). 이름은 저장하지 않고 그때그때 알아내요.
  async ensureUser() { const ref = this.db.doc('people/' + COLLAB.me.uid); try { const d = await ref.get(); if (!d.exists) await ref.set({ at: Date.now() }); } catch (e) {} },
  async people() {
    const s = await this.db.collection('people').get();
    const ids = s.docs.map(d => d.id), names = ids.length ? await this.names(ids) : {};
    return ids.map(uid => ({ uid, name: names[uid] || '' })).sort((a, b) => (a.name || '~').localeCompare(b.name || '~', 'ko'));
  },
  addMember(pid, uid, name, role) { return this.ref(pid).update({ members: { [uid]: role } }); },
  async newCode(pid) { const code = makeCode(); await this.ref(pid).update({ code }); return code; },
  async findByCode(code) {
    const hit = COLLAB.all.find(p => p.code === code);
    if (hit) return hit.id;
    const s = await this.db.collection('projects').where('code', '==', code).limit(1).get();
    return s.empty ? null : s.docs[0].id;
  },
  async join(pid) {
    const p = COLLAB.all.find(x => x.id === pid);
    if (p && !p.open) throw 'closed';
    await this.ref(pid).update({ members: { [COLLAB.me.uid]: 'part' } });
  },
  leave(pid) { return this.setRole(pid, COLLAB.me.uid, null); },
  setRole(pid, uid, role) { return this.ref(pid).update({ members: { [uid]: role || null } }); },
  updateProject(pid, patch) { return this.ref(pid).update(patch); },
  rename() { return Promise.resolve(); },
  async deleteProject(pid) {
    for (const kind of ITEM_KINDS) {
      const s = await this.col(pid, kind).get();
      for (const d of s.docs) await this.col(pid, kind).doc(d.id).delete();
    }
    await this.ref(pid).delete();
  },
  col(pid, kind) { return this.db.collection(`projects/${pid}/${kind}`); },
  item(d) {
    const x = d.data() || {};
    return { id: d.id, title: x.title || '', inst: x.inst || '', data: typeof x.data === 'string' ? x.data : '', updatedAt: x.updatedAt || 0, updatedBy: x.updatedBy || '', updatedName: '', lock: x.lock && x.lock.by ? { by: x.lock.by, name: '', at: x.lock.at || 0 } : null };
  },
  watchItems(pid, kind, cb, onErr) { return this.col(pid, kind).onSnapshot(s => cb(s.docs.map(d => this.item(d))), onErr); },
  watchItem(pid, kind, id, cb, onErr) { return this.col(pid, kind).doc(id).onSnapshot(d => cb(d.exists ? this.item(d) : null), onErr); },
  async getItem(pid, kind, id) { const d = await this.col(pid, kind).doc(id).get(); return d.exists ? this.item(d) : null; },
  async saveItem(pid, kind, id, body, lock) {
    const me = COLLAB.me, x = Object.assign({}, body, { updatedAt: Date.now(), updatedBy: me.uid });
    if (lock) x.lock = { by: me.uid, at: Date.now() };
    if (!id) { const r = this.col(pid, kind).doc(); await r.set(x); return r.id; }
    await this.col(pid, kind).doc(id).update(x);
    return id;
  },
  createItem(pid, kind, id, body, lock) {
    const me = COLLAB.me, x = Object.assign({}, body, { updatedAt: Date.now(), updatedBy: me.uid });
    if (lock) x.lock = { by: me.uid, at: Date.now() };
    return this.col(pid, kind).doc(id).set(x);
  },
  setLock(pid, kind, id, on) { return this.col(pid, kind).doc(id).update({ lock: on ? { by: COLLAB.me.uid, at: Date.now() } : null }); },
  deleteItem(pid, kind, id) { return this.col(pid, kind).doc(id).delete(); },
  setLive(pid, st) { return this.db.doc(`projects/${pid}/live/state`).set(Object.assign({}, st, { by: COLLAB.me.uid })); },
  emitLive(pid, st) { if (this.room) this.room.emit('live', Object.assign({ pid }, st, { by: COLLAB.me.uid })).catch(() => {}); },
  watchLive(pid, cb) {
    const u1 = this.db.doc(`projects/${pid}/live/state`).onSnapshot(d => cb(d.exists ? d.data() : null), () => {});
    const u2 = this.room ? this.room.on('live', m => { if (m.data && m.data.pid === pid && !m.sameTab && m.by) cb(Object.assign({}, m.data, { by: m.by, room: true })); }, () => {}) : null;
    return () => { u1(); if (u2) u2(); };
  },
  presence(pid) { if (this.room) this.room.presence({ pid: pid || null }).catch(() => {}); },
  peers(list) {
    const on = new Set();
    (list || []).forEach(p => { if (p.by && p.presence && p.presence.pid && p.presence.pid === COLLAB.pid) on.add(p.by); });
    COLLAB.online = on;
    collabEmit('online');
  },
};

// ───────── 방식 2: Firebase (github.io 앱) ─────────
const FIREBASE_B = {
  kind: 'firebase',
  async init(cfg) {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/`;
    await loadScriptOnce(base + 'firebase-app-compat.js');
    await Promise.all([loadScriptOnce(base + 'firebase-auth-compat.js'), loadScriptOnce(base + 'firebase-firestore-compat.js')]);
    const fb = window.firebase;
    if (!fb) throw 'nofb';
    if (!(fb.apps && fb.apps.length)) fb.initializeApp(cfg);
    this.fb = fb; this.auth = fb.auth(); this.db = fb.firestore(); this.FV = fb.firestore.FieldValue;
    await new Promise(res => { const un = this.auth.onAuthStateChanged(() => { un(); res(); }); });
  },
  devIds() { return (typeof DEV_IDS !== 'undefined' && Array.isArray(DEV_IDS) ? DEV_IDS : []).map(x => String(x).trim().toLowerCase()).filter(Boolean); },
  email: id => `${String(id).trim().toLowerCase()}@${LOGIN_DOMAIN}`,
  current() {
    const u = this.auth.currentUser;
    if (!u) return null;
    const loginId = String(u.email || '').split('@')[0];
    return { uid: u.uid, loginId, name: u.displayName || loginId, dev: this.devIds().includes(loginId) };
  },
  async signIn(id, pw) { await this.auth.signInWithEmailAndPassword(this.email(id), pw); return this.current(); },
  async signUp(id, pw, name) {
    const c = await this.auth.createUserWithEmailAndPassword(this.email(id), pw);
    await c.user.updateProfile({ displayName: name });
    return this.current();
  },
  async rename(name) {
    await this.auth.currentUser.updateProfile({ displayName: name });
    const me = COLLAB.me;
    await Promise.all(COLLAB.projects.filter(p => p.members[me.uid]).map(p => this.ref(p.id).update({ ['names.' + me.uid]: name }).catch(() => {})));
  },
  signOut() { return this.auth.signOut(); },
  ms: v => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0),
  proj(d) {
    const x = d.data({ serverTimestamps: 'estimate' }) || {}, members = {};
    Object.entries(x.members || {}).forEach(([k, v]) => { if (v === 'host' || v === 'part') members[k] = v; });
    return { id: d.id, name: x.name || '이름 없는 프로젝트', code: x.code || '', members, names: x.names || {}, allowEdit: x.allowEdit !== false, hostLock: !!x.hostLock, open: x.open !== false, createdBy: x.createdBy || '' };
  },
  watchProjects(cb, onErr) {
    const me = COLLAB.me, col = this.db.collection('projects');
    let un = null;
    const fc = s => !!(s.metadata && s.metadata.fromCache);
    const mine = () => col.where('memberIds', 'array-contains', me.uid).onSnapshot(s => cb(s.docs.map(d => this.proj(d)), fc(s)), onErr);
    if (me.dev) un = col.onSnapshot(s => cb(s.docs.map(d => this.proj(d)), fc(s)), () => { onErr({ code: 'dev-rules' }); un = mine(); });
    else un = mine();
    return () => un && un();
  },
  ref(pid) { return this.db.collection('projects').doc(pid); },
  async createProject(name, host) {
    const me = COLLAB.me, ref = this.db.collection('projects').doc();
    const h = host === 'none' ? null : host || { uid: me.uid, name: me.name };
    const members = h ? { [h.uid]: 'host' } : {}, names = h ? { [h.uid]: h.name || '' } : {};
    await ref.set({ name, code: '', members, memberIds: Object.keys(members), names, allowEdit: true, hostLock: false, open: true, createdBy: me.uid, createdAt: this.FV.serverTimestamp() });
    await this.newCode(ref.id, '');
    return ref.id;
  },
  // 아이디로 사람 찾기: 가입할 때 usernames/아이디 에 적어 둬요
  async ensureUser() {
    const me = COLLAB.me;
    if (!me.loginId) return;
    const ref = this.db.collection('usernames').doc(me.loginId);
    try { const d = await ref.get(); if (!d.exists) await ref.set({ uid: me.uid, name: me.name }); else if ((d.data() || {}).uid === me.uid && d.data().name !== me.name) await ref.update({ name: me.name }); } catch (e) {}
  },
  async findUser(id) { const d = await this.db.collection('usernames').doc(id).get(); const x = d.exists ? d.data() || {} : null; return x && x.uid ? { uid: x.uid, name: x.name || id } : null; },
  addMember(pid, uid, name, role) { return this.ref(pid).update({ ['members.' + uid]: role, memberIds: this.FV.arrayUnion(uid), ['names.' + uid]: name || '' }); },
  async newCode(pid, old) {
    for (let k = 0; k < 6; k++) {
      const code = makeCode();
      try { await this.db.collection('codes').doc(code).set({ pid }); }
      catch (e) { if (k < 5) continue; throw e; }
      await this.ref(pid).update({ code });
      if (old) this.db.collection('codes').doc(old).delete().catch(() => {});
      return code;
    }
  },
  async findByCode(code) { const d = await this.db.collection('codes').doc(code).get(); return d.exists ? (d.data() || {}).pid || null : null; },
  join(pid, code) { const me = COLLAB.me; return this.ref(pid).update({ ['members.' + me.uid]: 'part', memberIds: this.FV.arrayUnion(me.uid), ['names.' + me.uid]: me.name, joinCode: code }); },
  leave(pid) { return this.setRole(pid, COLLAB.me.uid, null); },
  setRole(pid, uid, role) {
    if (role) return this.ref(pid).update({ ['members.' + uid]: role });
    return this.ref(pid).update({ ['members.' + uid]: this.FV.delete(), memberIds: this.FV.arrayRemove(uid), ['names.' + uid]: this.FV.delete() });
  },
  updateProject(pid, patch) { return this.ref(pid).update(patch); },
  async deleteProject(pid) {
    const p = COLLAB.projects.find(x => x.id === pid);
    for (const kind of ITEM_KINDS) { const s = await this.col(pid, kind).get(); await Promise.all(s.docs.map(d => d.ref.delete())); }
    if (p && p.code) await this.db.collection('codes').doc(p.code).delete().catch(() => {});
    await this.ref(pid).delete();
  },
  col(pid, kind) { return this.ref(pid).collection(kind); },
  item(d) {
    const x = d.data({ serverTimestamps: 'estimate' }) || {};
    return { id: d.id, title: x.title || '', inst: x.inst || '', data: typeof x.data === 'string' ? x.data : '', updatedAt: this.ms(x.updatedAt), updatedBy: x.updatedBy || '', updatedName: x.updatedName || '', lock: x.lock && x.lock.by ? { by: x.lock.by, name: x.lock.name || '', at: this.ms(x.lock.at) } : null };
  },
  watchItems(pid, kind, cb, onErr) { return this.col(pid, kind).onSnapshot(s => cb(s.docs.map(d => this.item(d))), onErr); },
  watchItem(pid, kind, id, cb, onErr) { return this.col(pid, kind).doc(id).onSnapshot(d => cb(d.exists ? this.item(d) : null), onErr); },
  async getItem(pid, kind, id) { const d = await this.col(pid, kind).doc(id).get(); return d.exists ? this.item(d) : null; },
  async saveItem(pid, kind, id, body, lock) {
    const me = COLLAB.me, x = Object.assign({}, body, { updatedAt: this.FV.serverTimestamp(), updatedBy: me.uid, updatedName: me.name });
    if (lock) x.lock = { by: me.uid, name: me.name, at: this.FV.serverTimestamp() };
    if (!id) { const r = this.col(pid, kind).doc(); await r.set(x); return r.id; }
    await this.col(pid, kind).doc(id).update(x);
    return id;
  },
  createItem(pid, kind, id, body, lock) {
    const me = COLLAB.me, x = Object.assign({}, body, { updatedAt: this.FV.serverTimestamp(), updatedBy: me.uid, updatedName: me.name });
    if (lock) x.lock = { by: me.uid, name: me.name, at: this.FV.serverTimestamp() };
    return this.col(pid, kind).doc(id).set(x);
  },
  setLock(pid, kind, id, on) { const me = COLLAB.me; return this.col(pid, kind).doc(id).update({ lock: on ? { by: me.uid, name: me.name, at: this.FV.serverTimestamp() } : null }); },
  deleteItem(pid, kind, id) { return this.col(pid, kind).doc(id).delete(); },
  setLive(pid, st) { return this.col(pid, 'live').doc('state').set(Object.assign({}, st, { by: COLLAB.me.uid, byName: COLLAB.me.name })); },
  watchLive(pid, cb) { return this.col(pid, 'live').doc('state').onSnapshot(d => cb(d.exists ? d.data() : null), () => {}); },
  presence() {},
};

// ───────── 시작 · 로그인 · 로그아웃 ─────────
async function collabInit() {
  COLLAB.status = 'checking'; collabEmit('status');
  if (window.claude && typeof window.claude.use === 'function') {
    try { if (await CLAUDE_B.init()) { COLLAB.B = CLAUDE_B; COLLAB.kind = 'claude'; COLLAB.status = 'ready'; collabEmit('status'); return; } }
    catch (e) { console.warn('claude', e); }
  }
  const cfg = typeof firebaseConfig !== 'undefined' ? firebaseConfig : null;
  if (cfg && cfg.apiKey && cfg.projectId) {
    try { await FIREBASE_B.init(cfg); COLLAB.B = FIREBASE_B; COLLAB.kind = 'firebase'; COLLAB.status = 'ready'; }
    catch (e) { console.warn('firebase', e); COLLAB.status = 'error'; COLLAB.note = '함께하기 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 새로 고침해 주세요.'; }
  } else COLLAB.status = 'none';
  collabEmit('status');
}
function collabStart(me) {
  collabStopSubs();
  COLLAB.me = me; COLLAB.solo = false; COLLAB.note = '';
  let saved = null;
  try { saved = localStorage.getItem('mh-pid-' + COLLAB.kind + '-' + me.uid); } catch (e) {}
  COLLAB.pid = saved || null; COLLAB.project = null; COLLAB.projects = [];
  let first = true;
  COLLAB.subs.projects = COLLAB.B.watchProjects((list, cached) => {
    if (cached && !list.length) return; // 아직 서버에서 받기 전
    const before = new Set(COLLAB.projects.map(x => x.id));
    COLLAB.projects = list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (first && !COLLAB.pid) { const mine = list.filter(x => x.members[me.uid]); if (mine.length === 1) COLLAB.pid = mine[0].id; }
    // 프로젝트에 들어가 있지 않을 때 개발자·주최자가 나를 새 프로젝트에 넣으면 바로 그 프로젝트로 들어가요
    if (!first && !COLLAB.pid && !cached) {
      const fresh = list.filter(x => x.members[me.uid] && !before.has(x.id));
      if (fresh.length === 1) collabSetProject(fresh[0].id, `“${fresh[0].name}” 프로젝트에 ${ROLE_NAMES[fresh[0].members[me.uid]]}로 들어갔어요.`);
    }
    const p = COLLAB.pid ? list.find(x => x.id === COLLAB.pid) : null;
    if (COLLAB.pid && !p && !COLLAB.pendingPid && !cached) collabSetProject(null, first ? '' : '프로젝트에서 빠졌거나 프로젝트가 지워졌어요.');
    else if (p) {
      const changed = !COLLAB.project || COLLAB.project.id !== p.id;
      COLLAB.project = p;
      if (changed && COLLAB.B.presence) COLLAB.B.presence(p.id);
      collabResolveNames(Object.keys(p.members));
      if (COLLAB.pendingPid === p.id) COLLAB.pendingPid = null;
      collabEmit('project', { changed });
    }
    first = false;
    collabEmit('projects');
  }, e => {
    COLLAB.note = e && e.code === 'dev-rules'
      ? '개발자로 모든 프로젝트를 보려면 Firebase 보안 규칙에 내 아이디를 넣어 주세요. (README 6단계) 지금은 내가 속한 프로젝트만 보여요.'
      : /permission/.test(String(e && e.code)) ? '서버 보안 규칙이 아직 설정되지 않았어요. (개발자: README 6단계)' : collabErr(e);
    collabEmit('status');
  });
  collabEmit('login');
  if (COLLAB.B.ensureUser) COLLAB.B.ensureUser();
}
function collabStopSubs() { Object.values(COLLAB.subs).forEach(u => { try { u && u(); } catch (e) {} }); COLLAB.subs = {}; }
async function collabSignIn(id, pw) { collabStart(await COLLAB.B.signIn(id, pw)); }
async function collabSignUp(id, pw, name) { collabStart(await COLLAB.B.signUp(id, pw, name)); }
function collabEnterClaude() { collabStart(CLAUDE_B.current()); }
async function collabSignOut() {
  collabSetProject(null);
  collabStopSubs();
  if (COLLAB.B && COLLAB.B.signOut) { try { await COLLAB.B.signOut(); } catch (e) {} }
  COLLAB.me = null; COLLAB.projects = []; COLLAB.all = []; COLLAB.pendingPid = null;
  collabEmit('logout');
}
function collabSolo() { collabStopSubs(); COLLAB.me = null; COLLAB.solo = true; COLLAB.devLocal = (() => { try { return localStorage.getItem('mh-devlocal') === '1'; } catch (e) { return false; } })(); COLLAB.pid = null; COLLAB.project = null; collabEmit('login'); }

// ───────── 프로젝트 ─────────
function collabSetProject(pid, note) {
  const changed = pid !== (COLLAB.project && COLLAB.project.id) || pid !== COLLAB.pid;
  if (pid !== COLLAB.pendingPid) COLLAB.pendingPid = null;
  COLLAB.pid = pid || null;
  COLLAB.project = pid ? COLLAB.projects.find(p => p.id === pid) || null : null;
  if (pid && !COLLAB.project) COLLAB.pendingPid = pid;
  try {
    const k = 'mh-pid-' + COLLAB.kind + '-' + (COLLAB.me ? COLLAB.me.uid : '');
    if (pid) localStorage.setItem(k, pid); else localStorage.removeItem(k);
  } catch (e) {}
  if (COLLAB.B && COLLAB.B.presence) COLLAB.B.presence(pid);
  COLLAB.online = new Set();
  if (COLLAB.project) collabResolveNames(Object.keys(COLLAB.project.members));
  collabEmit('project', { changed, note });
}
async function collabCreate(name, host) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw '프로젝트 이름을 적어 주세요.';
  if (COLLAB.B.readOnly) throw '공유 권한이 “보기”라서 프로젝트를 만들 수 없어요.';
  if (host && !COLLAB.me.dev) host = null; // 주최자를 따로 정하는 건 개발자만
  const pid = await COLLAB.B.createProject(name, host);
  collabSetProject(pid);
  return pid;
}
async function collabJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) throw '초대 코드 6자리를 확인해 주세요.';
  const pid = await COLLAB.B.findByCode(code);
  if (!pid) throw '그 초대 코드를 가진 프로젝트가 없어요. 코드를 다시 확인해 주세요.';
  const mine = COLLAB.projects.find(p => p.id === pid && p.members[COLLAB.me.uid]);
  if (!mine) await COLLAB.B.join(pid, code);
  collabSetProject(pid);
  return pid;
}
const collabUpdate = patch => COLLAB.B.updateProject(COLLAB.pid, patch);
async function collabLeave() { const pid = COLLAB.pid; await COLLAB.B.leave(pid); collabSetProject(null, '프로젝트에서 나왔어요.'); }
async function collabDelete() { const pid = COLLAB.pid; collabSetProject(null); await COLLAB.B.deleteProject(pid); }

// 한 문서에 담을 수 있는 크기 (Claude: 256KB, Firebase: 1MB)
function collabTooBig(data) {
  const lim = COLLAB.kind === 'claude' ? 200000 : 900000;
  return new Blob([JSON.stringify({ data })]).size > lim ? '악보가 너무 커서 공유할 수 없어요. 곡을 나누어 올리거나 음을 줄여 주세요.' : '';
}

// ───────── 공유 문서 하나를 화면과 잇기 ─────────
// 다른 사람이 고친 내용은 h.apply(item)로, 잠금·고친 사람 정보는 h.meta(item)로 알려 줘요.
// 내가 고친 내용은 push(data)로 넘기면 조금 모았다가 저장해요. 주최자·개발자가 고치면 1분 동안 잠겨요.
// 두 사람이 거의 동시에 고치면: 주최자·개발자의 고침이 이기고, 참가자끼리는 서버에 먼저 들어간 쪽을 따라요.
// 저장에 실패하거나 겹친 뒤에는 서버에 남은 내용으로 모두의 화면을 맞춰요.
function shareBind(kind, id, h) {
  const pid = COLLAB.pid;
  const S = { kind, id, pid, item: null, shown: null, sent: null, inflight: null, pending: null, extra: null, t: 0, dead: false, conflict: false };
  const proj = () => COLLAB.projects.find(p => p.id === pid) || null;
  const take = item => { const dropped = S.pending != null; clearTimeout(S.t); S.pending = null; S.sent = null; S.shown = item.data; S.item = item; if (h.apply) h.apply(item, dropped); };
  S.un = COLLAB.B.watchItem(pid, kind, id, item => {
    if (S.dead) return;
    S.item = item;
    if (!item) { if (h.gone) h.gone(); return; }
    if (item.data !== S.shown && item.data !== S.inflight && item.data !== S.sent) {
      const busy = S.pending != null || S.inflight != null;
      if (busy) S.conflict = true;
      if (!(busy && isLead(proj()))) take(item); // 주최자가 고치는 중이면 주최자 것을 먼저 저장한 뒤 맞춰요
    }
    if (h.meta) h.meta(item);
  }, e => { if (!S.dead && h.fail) h.fail(collabErr(e)); });
  S.push = (data, extra) => {
    if (S.dead) return;
    S.pending = data; S.shown = data; S.extra = extra || null;
    clearTimeout(S.t);
    S.t = setTimeout(S.flush, 700);
  };
  S.resync = async () => {
    try {
      const it = await COLLAB.B.getItem(pid, kind, id);
      if (!S.dead && it && it.data !== S.shown && S.pending == null && S.inflight == null) take(it);
    } catch (e) {}
  };
  S.flush = async () => {
    clearTimeout(S.t);
    if (S.inflight != null || S.pending == null) return;
    const p = proj();
    const why = !p ? '프로젝트에 들어가 있지 않아요.' : whyReadOnly(S.item, p) || collabTooBig(S.pending);
    if (why) { S.pending = null; if (!S.dead) { if (h.fail) h.fail(why); S.resync(); } return; }
    const data = S.pending, extra = S.extra;
    S.pending = null; S.inflight = data;
    let ok = false;
    try { await COLLAB.B.saveItem(pid, kind, id, Object.assign({ data }, extra || {}), isLead(p)); S.sent = data; ok = true; if (!S.dead && h.saved) h.saved(); }
    catch (e) { if (!S.dead && h.fail) h.fail(collabErr(e)); }
    S.inflight = null;
    if (!ok || S.conflict) { S.conflict = false; if (S.pending == null) await S.resync(); }
    if (S.pending != null) S.flush();
  };
  S.release = async () => {
    const it = S.item;
    if (!it || !it.lock || !COLLAB.me || it.lock.by !== COLLAB.me.uid) return;
    try { await COLLAB.B.setLock(pid, kind, id, false); } catch (e) {}
  };
  S.close = async () => {
    if (S.dead) return;
    S.dead = true;
    if (S.un) S.un();
    if (S.pending != null) await S.flush();
    for (let k = 0; k < 40 && S.inflight != null; k++) await new Promise(r => setTimeout(r, 50));
    await S.release();
  };
  return S;
}

// 오프라인 지원: 인터넷이 되면 항상 최신 파일을 받고, 안 되면 저장해 둔 파일로 열어요.
// 파일을 고쳐 올리면 설치된 앱에도 다음 실행 때 바로 반영돼요.
// 크게 바꿨는데 예전 화면이 남으면 index.html의 ?v= 숫자와 아래 CACHE 숫자를 하나씩 올려 주세요.
// 같은 github.io 주소에 다른 앱(악보 편집 · 악기 코드 도감)이 같이 있어도 서로의 저장 파일은 지우지 않아요.
const APP = 'mh-score';
const CACHE = APP + '-v15';
// 앱 파일과 글꼴·라이브러리만 저장해요. 로그인·공동 프로젝트 서버(Firebase) 통신은 저장하지 않아요.
const KEEP = [/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/cdnjs\.cloudflare\.com\//, /^https:\/\/www\.gstatic\.com\/firebasejs\//];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(APP + '-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (!url.startsWith(self.location.origin + '/') && !KEEP.some(r => r.test(url))) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)).then(r => r || Response.error()))
  );
});

// 녹음: 마이크 소리를 직접 받아 저장(시간이 정확함), 메트로놈·카운트인, 소리 크기와 음 높이(조율기) 실시간 표시

const REC = { stream: null, src: null, an: null, proc: null, sink: null, on: false, chunks: [], firstAt: null, raf: 0, clicks: [], live: null, lastPitch: 0 };

async function micOpen() {
  ensureAC();
  await AC.resume();
  if (REC.stream && REC.stream.active) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw 'nomic';
  REC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  REC.src = AC.createMediaStreamSource(REC.stream);
  REC.an = AC.createAnalyser(); REC.an.fftSize = 4096;
  REC.proc = AC.createScriptProcessor(4096, 1, 1);
  REC.sink = AC.createGain(); REC.sink.gain.value = 0;
  REC.src.connect(REC.an); REC.src.connect(REC.proc); REC.proc.connect(REC.sink); REC.sink.connect(AC.destination);
  REC.proc.onaudioprocess = e => {
    if (!REC.on) return;
    const d = e.inputBuffer.getChannelData(0);
    if (REC.firstAt === null) REC.firstAt = AC.currentTime - e.inputBuffer.duration;
    REC.chunks.push(new Float32Array(d));
  };
}
function micClose() {
  cancelAnimationFrame(REC.raf);
  if (REC.stream) REC.stream.getTracks().forEach(t => t.stop());
  try { REC.src && REC.src.disconnect(); REC.proc && REC.proc.disconnect(); } catch (e) {}
  REC.stream = REC.src = REC.proc = REC.an = null;
}
const micError = e => (e === 'nomic'
  ? '이 화면에서는 마이크를 쓸 수 없어요. 휴대폰 녹음 앱으로 녹음한 뒤 “소리 파일”로 올려 주세요.'
  : '마이크를 쓸 수 없어요. 브라우저에서 마이크 권한을 허용해 주세요. (Claude 안의 미리보기 화면에서는 녹음이 막혀 있어요. 설치한 앱이나 github.io 주소에서 해 주세요.)');

// 메트로놈 딸깍 소리
function click(t, accent) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + 0.08);
  REC.clicks.push(o);
}

// 녹음 시작. opt: { bpm, beats(한 마디 박 수), countIn(true/false), metro(녹음 내내 딸깍), onBeat(i) }
async function recStart(opt) {
  await micOpen();
  REC.chunks = []; REC.firstAt = null; REC.clicks = []; REC.opt = opt;
  const spb = 60 / (opt.bpm || 100), now = AC.currentTime + 0.15;
  REC.on = true;
  REC.startAt = now;
  REC.beat0At = null;
  if (opt.countIn) {
    for (let i = 0; i < opt.beats; i++) click(now + i * spb, i === 0);
    REC.beat0At = now + opt.beats * spb;
  }
  if (opt.metro) {
    const from = REC.beat0At || now;
    REC.metroTimer = { next: from, i: 0 };
    const tick = () => {
      if (!REC.on) return;
      while (REC.metroTimer.next < AC.currentTime + 0.2) { click(REC.metroTimer.next, REC.metroTimer.i % opt.beats === 0); REC.metroTimer.next += spb; REC.metroTimer.i++; }
      REC.metroId = setTimeout(tick, 50);
    };
    tick();
  }
}
// 녹음 끝 → { sig: {x, sr}, beat0: 녹음 시작부터 첫 박까지(초) 또는 null, lag: 소리가 늦게 들리는 정도(초) }
function recStop() {
  REC.on = false;
  clearTimeout(REC.metroId);
  REC.clicks.forEach(o => { try { o.stop(); } catch (e) {} });
  const len = REC.chunks.reduce((a, c) => a + c.length, 0), x = new Float32Array(len);
  let p = 0;
  REC.chunks.forEach(c => { x.set(c, p); p += c.length; });
  REC.chunks = [];
  const lag = (AC.outputLatency || 0) + (AC.baseLatency || 0) + 0.03;
  return { sig: { x, sr: AC.sampleRate }, beat0: REC.beat0At != null && REC.firstAt != null ? REC.beat0At - REC.firstAt : null, lag };
}

// 실시간 표시: 소리 크기 막대 + 지금 들리는 음 (조율기)
function liveMeter(canvas, label, fmin, fmax) {
  cancelAnimationFrame(REC.raf);
  if (!REC.an) return;
  const buf = new Float32Array(REC.an.fftSize), ctx = canvas.getContext('2d');
  const dfn = new Float32Array(2048);
  let lastPitchAt = 0;
  const draw = ts => {
    if (!REC.an) return;
    REC.an.getFloatTimeDomainData(buf);
    let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
    const rms = Math.sqrt(e / buf.length), db = 20 * Math.log10(rms + 1e-9);
    const w = canvas.width, h = canvas.height, lv = Math.max(0, Math.min(1, (db + 60) / 60));
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css.getPropertyValue('--chip'); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = lv > 0.92 ? '#D2413A' : lv > 0.75 ? '#E0A030' : '#3FA46A';
    ctx.fillRect(0, 0, w * lv, h);
    if (ts - lastPitchAt > 90) {
      lastPitchAt = ts;
      let txt = '—';
      if (db > -50) {
        const sr = AC.sampleRate, f = sr > 30000 ? 4 : 2, n = Math.floor(buf.length / f), x = new Float32Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += buf[i * f + k]; x[i] = s / f; }
        const s2 = sr / f, minT = Math.floor(s2 / fmax), maxT = Math.min(Math.ceil(s2 / fmin), Math.floor(n / 2) - 1);
        const r = yinPitch(x, 0, Math.min(n, maxT * 2 + 64), minT, maxT, dfn);
        if (r && r.conf > 0.6) {
          const m = 69 + 12 * Math.log2(s2 / r.period / 440), mr = Math.round(m), cents = Math.round((m - mr) * 100);
          txt = `${midiName(mr)} ${cents >= 0 ? '+' : ''}${cents}센트`;
          REC.lastPitch = m;
        }
      }
      label.textContent = txt;
    }
    REC.raf = requestAnimationFrame(draw);
  };
  REC.raf = requestAnimationFrame(draw);
}

// 짧은 소리 녹음 (줄 하나 튕기기용): 소리가 시작되면 그때부터 seconds초 녹음
async function recordPluck(seconds, onState) {
  await micOpen();
  REC.chunks = []; REC.firstAt = null; REC.on = true;
  onState('튕겨 주세요…');
  const sr = AC.sampleRate, wait = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const len = REC.chunks.reduce((a, c) => a + c.length, 0);
      let started = -1, p = 0;
      for (const c of REC.chunks) { for (let i = 0; i < c.length; i += 64) if (Math.abs(c[i]) > 0.05) { started = p + i; break; } if (started >= 0) break; p += c.length; }
      if (started < 0 && Date.now() - wait > 8000) { REC.on = false; REC.chunks = []; reject('소리가 들리지 않았어요. 다시 해 주세요.'); return; }
      if (started >= 0 && len - started > seconds * sr) {
        REC.on = false;
        const x = new Float32Array(len); let q = 0;
        REC.chunks.forEach(c => { x.set(c, q); q += c.length; });
        REC.chunks = [];
        resolve({ x: x.subarray(Math.max(0, started - Math.floor(sr * 0.01))), sr });
        return;
      }
      if (started >= 0) onState('녹음 중…');
      setTimeout(check, 60);
    };
    check();
  });
}

// 짧은 소리의 음 높이 (가장 안정된 부분에서)
function pluckPitch(sig, fmin, fmax) {
  const F = analyzeFrames(sig, fmin, fmax);
  const vals = [];
  for (let i = 0; i < F.t.length; i++) if (F.pitch[i] && F.conf[i] > 0.7 && F.t[i] > 0.05 && F.t[i] < 1.5) vals.push(F.pitch[i]);
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

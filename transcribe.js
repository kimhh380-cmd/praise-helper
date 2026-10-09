// 녹음 분석: 멜로디(한 음씩)와 코드(스트로크)를 알아듣고, 빠르기·박 위치를 맞춰 악보용 음표로 바꿔요
// 입력: { x: Float32Array(소리), sr: 초당 샘플 수 }

// 여러 채널 소리를 하나로 (최대 maxSec초)
function monoFrom(audioBuf, maxSec) {
  const n = Math.min(audioBuf.length, Math.floor(audioBuf.sampleRate * maxSec));
  const x = new Float32Array(n);
  for (let c = 0; c < audioBuf.numberOfChannels; c++) {
    const d = audioBuf.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += d[i] / audioBuf.numberOfChannels;
  }
  return { x, sr: audioBuf.sampleRate };
}

// 샘플 수 줄이기 (평균을 두 번 내서 높은 소리를 거른 뒤 솎아냄) + 아주 낮은 웅웅거림 거르기
function prepSignal(sig, target, hpHz) {
  const f = Math.max(1, Math.round(sig.sr / target)), src = sig.x;
  let x = src, sr = sig.sr;
  if (f > 1) {
    const tmp = new Float32Array(src.length);
    let acc = 0;
    for (let i = 0; i < src.length; i++) { acc += src[i]; if (i >= f) acc -= src[i - f]; tmp[i] = acc / f; }
    const n = Math.floor(src.length / f);
    x = new Float32Array(n);
    for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < f; k++) s += tmp[j * f + k]; x[j] = s / f; }
    sr = sig.sr / f;
  } else x = Float32Array.from(src);
  if (hpHz) {
    const rc = 1 / (2 * Math.PI * hpHz), a = rc / (rc + 1 / sr);
    let py = 0, px = x[0] || 0;
    for (let i = 0; i < x.length; i++) { const v = x[i]; py = a * (py + v - px); px = v; x[i] = py; }
  }
  return { x, sr };
}

// 음 높이 찾기(YIN): 한 구간에서 반복 주기를 찾아 주파수로 바꿈
function yinPitch(x, st, W, minT, maxT, dfn) {
  const N = W - maxT;
  let run = 0, best = -1, gmin = 9, gi = -1;
  dfn[0] = 1;
  for (let tau = 1; tau <= maxT; tau++) {
    let s = 0;
    for (let j = 0; j < N; j++) { const v = x[st + j] - x[st + j + tau]; s += v * v; }
    run += s;
    dfn[tau] = run > 0 ? (s * tau) / run : 1;
    const k = tau - 1;
    if (k > minT) {
      if (dfn[k] < gmin) { gmin = dfn[k]; gi = k; }
      if (dfn[k] < 0.2 && dfn[k] <= dfn[tau]) { best = k; break; }
    }
  }
  if (best < 0) {
    if (!(gmin < 0.32 && gi > minT && gi < maxT)) return null;
    best = gi;
    for (let k = minT + 1; k < maxT; k++) if (dfn[k] < gmin + 0.08 && dfn[k] <= dfn[k - 1] && dfn[k] <= dfn[k + 1]) { best = k; break; }
  }
  const a = dfn[best - 1], b = dfn[best], c = dfn[best + 1] !== undefined ? dfn[best + 1] : b;
  const den = a - 2 * b + c;
  const sh = den !== 0 ? (a - c) / (2 * den) : 0;
  return { period: best + (Math.abs(sh) < 1 ? sh : 0), conf: 1 - b };
}

// 소리 크기(dB)와 음 높이를 10ms마다 계산
function analyzeFrames(sig, fmin, fmax) {
  const s = prepSignal(sig, fmax > 700 ? 11025 : 8000, Math.max(30, fmin * 0.6));
  const { x, sr } = s;
  const hop = Math.max(1, Math.round(sr * 0.01));
  const minT = Math.floor(sr / fmax), maxT = Math.ceil(sr / fmin);
  const W = Math.max(Math.round(sr * 0.046), maxT * 3);
  const nF = Math.max(0, Math.floor((x.length - W) / hop));
  const Ws = Math.max(8, Math.round(sr * 0.025));
  const t = new Float32Array(nF), db = new Float32Array(nF), dbs = new Float32Array(nF), dbh = new Float32Array(nF), pitch = new Float32Array(nF), conf = new Float32Array(nF);
  const dfn = new Float32Array(maxT + 2);
  let peak = -120;
  for (let i = 0; i < nF; i++) {
    const st = i * hop;
    let e = 0, es = 0, eh = 0;
    const s0 = st + Math.floor((W - Ws) / 2);
    for (let j = 0; j < W; j++) e += x[st + j] * x[st + j];
    for (let j = 0; j < Ws; j++) { const v = x[s0 + j]; es += v * v; const d = v - (s0 + j > 0 ? x[s0 + j - 1] : 0); eh += d * d; }
    db[i] = 10 * Math.log10(e / W + 1e-12);
    dbs[i] = 10 * Math.log10(es / Ws + 1e-12);
    dbh[i] = 10 * Math.log10(eh / Ws + 1e-12);
    t[i] = (st + W / 2) / sr;
    if (db[i] > peak) peak = db[i];
  }
  const gate = Math.max(peak - 38, -62);
  for (let i = 0; i < nF; i++) {
    if (db[i] < gate || i % 2) continue; // 음 높이는 20ms마다
    const r = yinPitch(x, i * hop, W, minT, maxT, dfn);
    if (!r) continue;
    pitch[i] = 69 + 12 * Math.log2(sr / r.period / 440);
    conf[i] = r.conf;
  }
  for (let i = 1; i < nF - 1; i += 2) if (!pitch[i] && pitch[i - 1] && pitch[i + 1] && Math.abs(pitch[i - 1] - pitch[i + 1]) < 0.6) { pitch[i] = (pitch[i - 1] + pitch[i + 1]) / 2; conf[i] = Math.min(conf[i - 1], conf[i + 1]); }
  return { t, db, dbs, dbh, pitch, conf, peak, gate, hop: hop / sr };
}

// 소리가 새로 시작되는 순간(어택) 찾기
function detectOnsets(F) {
  const n = F.db.length, nov = new Float32Array(n), out = [];
  for (let i = 3; i < n; i++) {
    const full = F.dbs[i] - Math.max(F.dbs[i - 2], F.dbs[i - 3]);
    const hi = F.dbh[i] - Math.max(F.dbh[i - 2], F.dbh[i - 3]);
    nov[i] = Math.max(0, full, hi * 0.8);
  }
  let last = -1;
  for (let i = 3; i < n - 2; i++) {
    let m = 0, c = 0;
    for (let k = Math.max(0, i - 25); k < Math.min(n, i + 25); k++) { m += nov[k]; c++; }
    const th = Math.max(2.6, (m / c) * 2 + 1.4);
    if (nov[i] > th && nov[i] >= nov[i - 1] && nov[i] >= nov[i + 1] && F.db[i + 1] > F.gate + 6) {
      if (last >= 0 && F.t[i] - F.t[last] < 0.07) { if (nov[i] > nov[last]) out[out.length - 1] = F.t[i], last = i; continue; }
      out.push(F.t[i]); last = i;
    }
  }
  return out;
}

// 멜로디 음표 찾기 (초 단위)
function melodyNotesSec(F, onsets) {
  const n = F.t.length;
  const pv = [];
  for (let i = 0; i < n; i++) if (F.pitch[i] && F.conf[i] > 0.55) pv.push(F.pitch[i] - Math.round(F.pitch[i]));
  pv.sort((a, b) => a - b);
  const tune = pv.length ? pv[Math.floor(pv.length / 2)] : 0;
  // 음 높이를 반음 단위로 + 옥타브 튐 정리 (앞뒤 음과 비교)
  const mid = new Int16Array(n);
  for (let i = 0; i < n; i++) if (F.pitch[i] && F.conf[i] > 0.5) mid[i] = Math.round(F.pitch[i] - tune);
  for (let i = 0; i < n; i++) {
    if (!mid[i]) continue;
    const win = [];
    for (let k = i - 6; k <= i + 6; k++) if (k >= 0 && k < n && mid[k]) win.push(mid[k]);
    win.sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    if (Math.abs(mid[i] - med) === 12 || Math.abs(mid[i] - med) === 24 || Math.abs(mid[i] - med) === 19) {
      const cnt = win.filter(v => v === mid[i]).length;
      if (cnt * 3 < win.length) mid[i] = med;
    }
  }
  // 같은 음이 이어지는 구간 → 음 (짧은 흔들림은 무시)
  const segs = [];
  let cur = null, miss = 0;
  for (let i = 0; i < n; i++) {
    const m = mid[i];
    if (cur && m === cur.m) { cur.end = F.t[i]; cur.peak = Math.max(cur.peak, F.db[i]); miss = 0; continue; }
    if (cur && (!m || m !== cur.m)) {
      // 다음 3칸 안에 같은 음으로 돌아오면 흔들림으로 봄
      let back = false;
      for (let k = i + 1; k <= i + 4 && k < n; k++) if (mid[k] === cur.m) { back = true; break; }
      if (back && miss < 3) { miss++; continue; }
      segs.push(cur); cur = null; miss = 0;
    }
    if (m) {
      let stable = 0;
      for (let k = i; k < i + 8 && k < n; k++) if (mid[k] === m) stable++;
      if (stable >= 3) cur = { m, start: F.t[i], end: F.t[i], peak: F.db[i], i0: i };
    }
  }
  if (cur) segs.push(cur);
  // 같은 음을 다시 친 곳(어택)에서 나누기
  const out = [];
  segs.forEach(sg => {
    const cuts = onsets.filter(o => o > sg.start + 0.08 && o < sg.end - 0.05);
    let s0 = sg.start;
    const nearOn = onsets.find(o => Math.abs(o - sg.start) < 0.06);
    if (nearOn !== undefined) s0 = Math.min(s0, nearOn);
    [...cuts, sg.end].forEach(e => { out.push({ m: sg.m, start: s0, end: e, peak: sg.peak }); s0 = e; });
  });
  // 옥타브가 잘못 들린 조각 합치기 (어택 없이 옥타브·12도만 바뀐 경우)
  const merged = [];
  out.forEach(nt => {
    const p = merged[merged.length - 1], dm = p ? Math.abs(nt.m - p.m) : 0;
    const near = p && nt.start - p.end < 0.06 && !onsets.some(o => Math.abs(o - nt.start) < 0.06);
    if (near && (dm === 12 || dm === 19 || dm === 24)) {
      const lp = p.end - p.start, ln = nt.end - nt.start, hiM = Math.max(p.m, nt.m), loM = Math.min(p.m, nt.m);
      const loLen = p.m === loM ? lp : ln, hiLen = p.m === hiM ? lp : ln;
      p.m = loLen > hiLen * 2 ? loM : hiM; p.end = nt.end; p.peak = Math.max(p.peak, nt.peak);
      return;
    }
    merged.push({ ...nt });
  });
  // 소리가 충분히 작아지면 음 끝
  merged.forEach(nt => {
    let last = nt.start;
    for (let i = 0; i < n; i++) { if (F.t[i] < nt.start) continue; if (F.t[i] > nt.end) break; if (F.db[i] > nt.peak - 28) last = F.t[i]; }
    nt.end = Math.max(nt.start + 0.05, Math.min(nt.end, last + 0.03));
  });
  // 너무 작은 소리(잔향·잡음)는 빼기
  const peaks = merged.map(nt => nt.peak).sort((a, b) => a - b), mp = peaks[Math.floor(peaks.length / 2)] || F.peak;
  return { notes: merged.filter(nt => nt.end - nt.start >= 0.05 && nt.peak > Math.max(F.peak - 30, mp - 18)), tuneCents: Math.round(tune * 100) };
}

// 빠르기와 박 위치 맞추기. 박 위치가 대략 알려져 있으면(카운트인) 그 근처에서 찾음
function fitBeatGrid(onsets, opt) {
  const sal = [1, 0.3, 0.55, 0.3], sig2 = 2 * 0.03 * 0.03;
  const gridScore = (spb, ph) => {
    let s = 0;
    for (const o of onsets) {
      const q = (o - ph) / (spb / 4), k = Math.round(q), d = (q - k) * spb / 4;
      s += sal[((k % 4) + 4) % 4] * Math.exp(-(d * d) / sig2);
    }
    return s;
  };
  if (!onsets.length) return { bpm: opt.bpm || 100, beat0: opt.beat0 || 0, auto: false };
  if (opt.bpm) {
    const spb = 60 / opt.bpm;
    if (opt.beat0 != null) {
      let best = 0, bs = -1;
      for (let dlt = -0.35; dlt <= 0.35; dlt += 0.004) {
        const prior = Math.exp(-((dlt - (opt.lag || 0.08)) ** 2) / (2 * 0.12 * 0.12));
        const s = gridScore(spb, opt.beat0 + dlt) * (0.55 + 0.45 * prior);
        if (s > bs) { bs = s; best = dlt; }
      }
      return { bpm: opt.bpm, beat0: opt.beat0 + best, auto: false };
    }
    let bp = 0, bs = -1;
    for (let k = 0; k < 64; k++) { const ph = onsets[0] + (k / 64 - 0.5) * spb; const s = gridScore(spb, ph); if (s > bs) { bs = s; bp = ph; } }
    return { bpm: opt.bpm, beat0: bp, auto: false };
  }
  let best = { bpm: 100, beat0: onsets[0], s: -1 };
  for (let bpm = 50; bpm <= 200; bpm += 0.5) {
    const spb = 60 / bpm;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 100) / 0.55) ** 2);
    for (let k = 0; k < 40; k++) {
      const ph = onsets[0] + (k / 40 - 0.5) * spb;
      const s = (gridScore(spb, ph) / onsets.length) * prior;
      if (s > best.s) best = { bpm, beat0: ph, s };
    }
  }
  return { bpm: Math.round(best.bpm), beat0: best.beat0, auto: true };
}

// 초 단위 음표 → 박 단위 음표 (16분음표에 맞춤)
function quantizeNotes(secNotes, grid, bb) {
  const spb = 60 / grid.bpm, q = 0.25;
  let notes = secNotes.map(s => {
    const t = Math.round((s.start - grid.beat0) / spb / q) * q;
    const e = Math.round((s.end - grid.beat0) / spb / q) * q;
    return { t, dur: Math.max(q, e - t), midi: s.m };
  }).sort((a, b) => a.t - b.t);
  const clean = [];
  notes.forEach(n => {
    const p = clean[clean.length - 1];
    if (p && n.t <= p.t) { if (n.midi === p.midi) return; n.t = p.t + q; }
    if (p && p.t + p.dur > n.t) p.dur = Math.max(q, n.t - p.t);
    clean.push(n);
  });
  for (let i = 0; i < clean.length - 1; i++) { const gap = clean[i + 1].t - (clean[i].t + clean[i].dur); if (gap > 0 && gap <= 0.25) clean[i].dur += gap; }
  if (clean.length && clean[0].t < 0) { const sh = Math.ceil(-clean[0].t / bb) * bb; clean.forEach(n => (n.t += sh)); }
  return clean;
}

// 조(키) 추정: 음 높이 분포를 장조·단조 모양과 비교 (Krumhansl 방식)
const KEY_PROFILE = { maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
function guessKey(notes) {
  const h = new Array(12).fill(0);
  notes.forEach(n => (h[((n.midi % 12) + 12) % 12] += Math.max(0.25, Math.min(4, n.dur))));
  if (!h.some(v => v)) return null;
  const corr = (a, b) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let s = 0, sa = 0, sb = 0; for (let i = 0; i < 12; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb || 1); };
  let best = null;
  for (let r = 0; r < 12; r++) for (const mode of ['maj', 'min']) {
    const prof = KEY_PROFILE[mode].map((_, i) => KEY_PROFILE[mode][(i - r + 12) % 12]);
    const c = corr(h, prof);
    if (!best || c > best.c) best = { r, minor: mode === 'min', c };
  }
  const name = (best.minor ? MINOR_KEYS : MAJOR_KEYS)[best.r];
  const flats = best.minor ? [2, 7, 0, 5, 10, 3].includes(best.r) : [5, 10, 3, 8, 1].includes(best.r);
  return { root: best.r, minor: best.minor, name: name + (best.minor ? ' 단조' : ' 장조'), flats };
}

// ───────── 멜로디 받아적기 ─────────
function transcribeMelody(sig, opt) {
  const F = analyzeFrames(sig, opt.fmin, opt.fmax);
  if (F.peak < -70) throw '소리가 거의 들리지 않아요. 마이크 가까이에서 조금 더 크게 연주해 주세요.';
  const onsets = detectOnsets(F);
  const { notes: secN, tuneCents } = melodyNotesSec(F, onsets);
  if (!secN.length) throw '음 높이를 찾지 못했어요. 조용한 곳에서 한 음씩 또렷하게 연주해 주세요.';
  const keep = opt.beat0 != null ? secN.filter(n => n.start > opt.beat0 - 0.25) : secN;
  if (!keep.length) throw '카운트인이 끝난 뒤에 연주한 음을 찾지 못했어요.';
  const grid = fitBeatGrid(keep.map(n => n.start), opt);
  const bb = opt.ts.num * 4 / opt.ts.den;
  const notes = quantizeNotes(keep, grid, bb);
  return { bpm: grid.bpm, ts: opt.ts, tracks: [{ name: '녹음한 멜로디', notes }], info: { tuneCents, autoBpm: grid.auto, onsets: onsets.length } };
}

// ───────── 코드 받아적기 (여러 음을 한꺼번에 친 소리) ─────────
function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const m = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}
const CHORD_TYPES = ['M', 'm', '7', 'm7', 'M7', 'sus4', 'dim'];
function transcribeChords(sig, opt) {
  const s = prepSignal(sig, 11025, 40), { x, sr } = s;
  const N = 4096, hop = 512, win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const nF = Math.max(0, Math.floor((x.length - N) / hop));
  if (nF < 4) throw '녹음이 너무 짧아요. 코드를 몇 마디 이상 쳐 주세요.';
  const binPc = new Int8Array(N / 2).fill(-1), binBass = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N, pc = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
    if (f >= 60 && f <= 2000) binPc[k] = pc;
    if (f >= 38 && f <= 190) binBass[k] = pc;
  }
  const frames = [];
  let peak = -120;
  for (let i = 0; i < nF; i++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let j = 0; j < N; j++) { const v = x[i * hop + j]; re[j] = v * win[j]; e += v * v; }
    const db = 10 * Math.log10(e / N + 1e-12);
    const mag = fftMag(re, im);
    const ch = new Float32Array(12), bs = new Float32Array(12);
    // 봉우리(peak)만 모은 뒤, 낮은 음부터 그 음의 배음(2·3·4·5배) 자리를 덜어내서 배음이 다른 음으로 들리지 않게 함
    const pk = [];
    for (let k = 2; k < N / 2 - 1; k++) if (mag[k] >= mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > 1e-4) pk.push([k, mag[k]]);
    for (let a = 0; a < pk.length; a++) {
      const [k0, m0] = pk[a];
      if (m0 <= 0) continue;
      for (let h = 2; h <= 6; h++) {
        const kt = k0 * h;
        for (let b = a + 1; b < pk.length && pk[b][0] <= kt * 1.03 + 1; b++) {
          if (pk[b][0] >= kt * 0.97 - 1) pk[b][1] = Math.max(0, pk[b][1] - m0 * 0.75 * Math.pow(0.8, h - 2));
        }
      }
    }
    pk.forEach(([k, m]) => {
      if (m <= 0) return;
      if (binPc[k] >= 0) ch[binPc[k]] += m;
      if (binBass[k] >= 0) bs[binBass[k]] += mag[k];
    });
    frames.push({ t: (i * hop + N / 2) / sr, db, ch, bs });
    if (db > peak) peak = db;
  }
  if (peak < -70) throw '소리가 거의 들리지 않아요. 마이크 가까이에서 조금 더 크게 연주해 주세요.';
  // 박 위치: 어택(소리 커지는 순간)으로 찾기
  const F = analyzeFrames(sig, 70, 1000);
  const onsets = detectOnsets(F);
  const grid = fitBeatGrid(onsets, opt);
  const spb = 60 / grid.bpm, bb = opt.ts.num * 4 / opt.ts.den;
  const lastT = frames[frames.length - 1].t;
  let firstBeat = opt.beat0 != null ? 0 : Math.floor((onsets.length ? onsets[0] - grid.beat0 : 0) / spb);
  const beats = [];
  for (let k = firstBeat; grid.beat0 + k * spb < lastT; k++) {
    const a = grid.beat0 + k * spb, b = a + spb;
    const ch = new Float32Array(12), bs = new Float32Array(12);
    let e = -120, c = 0;
    frames.forEach(f => { if (f.t >= a && f.t < b) { for (let p = 0; p < 12; p++) { ch[p] += f.ch[p]; bs[p] += f.bs[p]; } e = Math.max(e, f.db); c++; } });
    const norm = Math.hypot(...ch) || 1;
    for (let p = 0; p < 12; p++) ch[p] /= norm;
    let bmax = 0, bpc = -1;
    for (let p = 0; p < 12; p++) if (bs[p] > bmax) { bmax = bs[p]; bpc = p; }
    beats.push({ k, ch, bass: bpc, loud: c && e > peak - 30 });
  }
  // 코드 틀과 비교
  const states = [];
  for (let r = 0; r < 12; r++) CHORD_TYPES.forEach(q => {
    const qi = QI[q], { pcs } = chordTones(r, qi), tpl = new Float32Array(12);
    pcs.forEach((p, i) => (tpl[p] += i === 0 ? 1.15 : 1));
    const nn = Math.hypot(...tpl);
    for (let p = 0; p < 12; p++) tpl[p] /= nn;
    states.push({ r, qi, pcs, tpl, pen: q === 'M' || q === 'm' ? 0 : q === '7' || q === 'm7' ? 0.06 : q === 'M7' ? 0.08 : 0.07 });
  });
  const emit = (b, st) => {
    if (!st) return b.loud ? 0.05 : 0.6;
    if (!b.loud) return 0;
    let s = 0;
    for (let p = 0; p < 12; p++) s += b.ch[p] * st.tpl[p];
    if (b.bass === st.r) s += 0.08; else if (st.pcs.includes(b.bass)) s += 0.02;
    return s - st.pen;
  };
  const S = states.length + 1, T = beats.length;
  let score = new Float32Array(S), back = [];
  const stOf = j => (j ? states[j - 1] : null);
  for (let j = 0; j < S; j++) score[j] = emit(beats[0], stOf(j));
  for (let i = 1; i < T; i++) {
    const barStart = ((beats[i].k % Math.round(bb)) + Math.round(bb)) % Math.round(bb) === 0;
    const pen = barStart ? 0.06 : 0.14;
    let bestPrev = 0;
    for (let j = 1; j < S; j++) if (score[j] > score[bestPrev]) bestPrev = j;
    const nsc = new Float32Array(S), bk = new Int16Array(S);
    for (let j = 0; j < S; j++) {
      const stay = score[j], sw = score[bestPrev] - pen;
      if (stay >= sw) { nsc[j] = stay; bk[j] = j; } else { nsc[j] = sw; bk[j] = bestPrev; }
      nsc[j] += emit(beats[i], stOf(j));
    }
    back.push(bk); score = nsc;
  }
  let j = 0;
  for (let q = 1; q < S; q++) if (score[q] > score[j]) j = q;
  const path = new Array(T);
  for (let i = T - 1; i >= 0; i--) { path[i] = j; if (i > 0) j = back[i - 1][j]; }
  // 같은 코드끼리 묶기
  const segs = [];
  path.forEach((st, i) => {
    const p = segs[segs.length - 1];
    if (p && p.st === st) p.beats++;
    else segs.push({ st, beats: 1, k: beats[i].k });
  });
  const key = guessKey(segs.filter(g => g.st).flatMap(g => states[g.st - 1].pcs.map(pc => ({ midi: pc, dur: g.beats }))));
  const firstChord = segs.find(g => g.st);
  const k0 = opt.beat0 != null ? 0 : firstChord ? firstChord.k : 0;
  const chords = segs.filter(g => g.st).map(g => {
    const st = states[g.st - 1];
    const rootName = key && key.flats ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'][st.r] : SHARP_NAMES[st.r];
    return { t: g.k - k0, beats: g.beats, r: st.r, qi: st.qi, root: rootName, name: rootName + QUALITIES[st.qi].s };
  });
  if (!chords.length) throw '코드를 알아듣지 못했어요. 코드를 또렷하게 스트로크해 주세요.';
  return { bpm: grid.bpm, ts: opt.ts, chords, key, info: { autoBpm: grid.auto } };
}

// 코드 목록 → 악기별 음표
function chordsToNotes(chords, inst, bb) {
  const notes = [];
  let anchor = 3, prevRh = null;
  chords.forEach(c => {
    const hits = [];
    for (let t = c.t; t < c.t + c.beats - 1e-6;) { const nextBar = (Math.floor(t / bb + 1e-6) + 1) * bb; const e = Math.min(c.t + c.beats, nextBar); hits.push([t, e - t]); t = e; }
    if (inst.id === 'bass') {
      const root = [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39].find(m => m % 12 === c.r);
      for (let t = c.t; t < c.t + c.beats - 1e-6; t++) notes.push({ t, dur: 1, midi: root });
      return;
    }
    if (inst.id === 'piano') {
      const all = pianoVoicings(c.r, c.qi).all.filter(v => v.hands === 2 && v.lh.length === 1 && !v.shell && octaveOf(v.lh[0]) === 3);
      const v = (prevRh ? all.slice().sort((a, b) => a.rh.reduce((s, x) => s + Math.min(...prevRh.map(y => Math.abs(x - y))), 0) - b.rh.reduce((s, x) => s + Math.min(...prevRh.map(y => Math.abs(x - y))), 0)) : all.slice().sort((a, b) => Math.abs(a.rh[0] - 62) - Math.abs(b.rh[0] - 62)))[0];
      if (!v) return;
      prevRh = v.rh;
      hits.forEach(([t, d]) => v.lh.concat(v.rh).forEach(m => notes.push({ t, dur: d, midi: m })));
      return;
    }
    const all = inst.voicings(c.r, c.qi).all;
    const good = all.filter(v => v.n >= 4 && v.i === 0);
    const v = (good.length ? good : all).slice().sort((a, b) => (a.sc + Math.abs(a.p - anchor) * 0.7) - (b.sc + Math.abs(b.p - anchor) * 0.7))[0];
    if (!v) return;
    anchor = v.p || anchor;
    hits.forEach(([t, d]) => v.t.forEach((f, s) => { if (f !== 'x') notes.push({ t, dur: d, midi: inst.tuning[s] + +f, s, f: +f }); }));
  });
  return notes;
}

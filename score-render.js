// 악보 준비: 악기 음역에 맞추기, 기타·베이스 줄·프렛 자동 배정

const SCORE_RANGES = { guitar: [40, 88], acoustic: [40, 84], bass: [28, 67], piano: [21, 108] };

// 곡 전체를 옥타브 단위로 옮겨 음역에 최대한 넣고, 그래도 벗어난 음은 하나씩 옥타브를 옮김
function fitToRange(notes, lo, hi, transpose, auto) {
  let ns = notes.map(n => ({ ...n, midi: n.midi + transpose }));
  let shift = 0, moved = 0;
  if (auto && ns.length) {
    let best = 0, bestOut = 1e9;
    for (let k = -4; k <= 4; k++) {
      const out = ns.reduce((a, n) => a + (n.midi + 12 * k < lo || n.midi + 12 * k > hi ? 1 : 0), 0) + Math.abs(k) * 0.01;
      if (out < bestOut) { bestOut = out; best = k; }
    }
    shift = best * 12;
    ns = ns.map(n => {
      let m = n.midi + shift;
      while (m < lo) { m += 12; moved++; }
      while (m > hi) { m -= 12; moved++; }
      return { ...n, midi: m };
    });
  }
  const outside = ns.filter(n => n.midi < lo || n.midi > hi).length;
  return { notes: ns.filter(n => n.midi >= lo && n.midi <= hi), shift, moved, outside };
}

// 같은 시간에 치는 음끼리 묶기
function groupByTime(notes) {
  const g = new Map();
  notes.forEach(n => { const k = Math.round(n.t * 1000); if (!g.has(k)) g.set(k, []); g.get(k).push(n); });
  return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.sort((a, b) => b.midi - a.midi));
}

// 줄·프렛 배정: 손 위치(anchor)를 크게 옮기지 않도록 가까운 프렛을 고름
function assignFrets(notes, tuning, maxFret, preferLow) {
  let anchor = preferLow ? 2 : 5, dropped = 0;
  const out = [];
  groupByTime(notes).forEach(group => {
    const used = new Set(), frets = [];
    group.forEach(n => {
      let best = null, bc = 1e9;
      tuning.forEach((open, s) => {
        if (used.has(s)) return;
        const f = n.midi - open;
        if (f < 0 || f > maxFret) return;
        let c = Math.abs(f - anchor);
        if (f === 0) c = preferLow ? Math.min(c, 1) : c + 0.5;
        if (preferLow) c += f * 0.08;
        if (c < bc) { bc = c; best = { s, f }; }
      });
      if (!best) { dropped++; return; }
      used.add(best.s);
      frets.push(best.f);
      out.push({ ...n, s: best.s, f: best.f });
    });
    const pressed = frets.filter(f => f > 0);
    if (pressed.length) anchor = anchor * 0.4 + (pressed.reduce((a, b) => a + b, 0) / pressed.length) * 0.6;
  });
  return { notes: out, dropped };
}

const barBeats = ts => ts.num * 4 / ts.den;

// 예전 재생 정지 이름 (다른 파일에서 씀)
function stopScore() { if (typeof edStop === 'function') edStop(); }

// 악보 불러오기: MIDI·MusicXML 파일 읽기, 예시 곡 (녹음 분석은 transcribe.js)
// 결과 모양: { title, bpm, ts: {num, den}, tracks: [{ name, notes: [{ t, dur, midi }] }] }
// t, dur 단위는 "박"(4분음표 = 1)

// ───────── MIDI ─────────
function parseMidi(buf) {
  const d = new DataView(buf);
  let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
  const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  if (str(4) !== 'MThd') throw 'MIDI 파일이 아니에요. .mid 파일을 올려 주세요.';
  const hl = u32(); u16(); const ntr = u16(), div = u16();
  p = 8 + hl;
  if (div & 0x8000) throw '이 MIDI 형식(SMPTE 시간)은 지원하지 않아요.';
  const tracks = [], tempos = [];
  let ts = null;
  for (let tr = 0; tr < ntr && p + 8 <= d.byteLength; tr++) {
    const id = str(4), len = u32(), end = Math.min(p + len, d.byteLength);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, run = 0, name = '';
    const on = {}, notes = [];
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return v; };
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st < 0x80) st = run; else { p++; if (st < 0xF0) run = st; }
      const type = st & 0xF0, ch = st & 0x0F;
      if (st === 0xFF) {
        const mt = d.getUint8(p++), ml = vlq();
        if (mt === 0x51) tempos.push({ tick, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
        else if (mt === 0x58 && !ts) ts = { num: d.getUint8(p), den: Math.pow(2, d.getUint8(p + 1)) };
        else if (mt === 0x03) { try { name = new TextDecoder().decode(new Uint8Array(buf, p, ml)).trim(); } catch (e) {} }
        p += ml;
      } else if (st === 0xF0 || st === 0xF7) { p += vlq(); }
      else if (type === 0x90 || type === 0x80) {
        const n = d.getUint8(p++), v = d.getUint8(p++), k = ch * 128 + n;
        if (type === 0x90 && v > 0) (on[k] = on[k] || []).push(tick);
        else { const s = on[k] && on[k].shift(); if (s !== undefined && tick > s) notes.push({ t: s / div, dur: (tick - s) / div, midi: n, ch }); }
      } else if (type === 0xC0 || type === 0xD0) p += 1;
      else p += 2;
    }
    p = end;
    if (notes.length) tracks.push({ name: name || `트랙 ${tracks.length + 1}`, notes: notes.sort((a, b) => a.t - b.t || b.midi - a.midi), drums: notes.every(n => n.ch === 9) });
  }
  if (!tracks.length) throw '이 MIDI 파일에서 음을 찾지 못했어요.';
  return { bpm: tempos.length ? Math.round(60000000 / tempos[0].us) : 120, ts: ts || { num: 4, den: 4 }, tracks };
}

// ───────── MusicXML (압축 안 된 .musicxml / .xml) ─────────
function parseMusicXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw 'MusicXML 파일을 읽을 수 없어요. 압축되지 않은 .musicxml 파일로 내보내 주세요.';
  const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);
  const val = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : null; };
  const partNames = {};
  [...doc.getElementsByTagName('score-part')].forEach(sp => { partNames[sp.getAttribute('id')] = val(sp, 'part-name') || ''; });
  let ts = null, bpm = null;
  const snd = doc.querySelector('sound[tempo]');
  if (snd) bpm = Math.round(+snd.getAttribute('tempo'));
  const tracks = [...doc.getElementsByTagName('part')].map((part, pi) => {
    let div = 1, t = 0, lastStart = 0;
    const notes = [];
    kids(part, 'measure').forEach(m => {
      [...m.children].forEach(c => {
        if (c.tagName === 'attributes') {
          const dv = val(c, 'divisions'); if (dv) div = +dv;
          const b = val(c, 'beats'), bt = val(c, 'beat-type');
          if (b && bt && !ts) ts = { num: +b, den: +bt };
        } else if (c.tagName === 'backup') t -= (+val(c, 'duration') || 0) / div;
        else if (c.tagName === 'forward') t += (+val(c, 'duration') || 0) / div;
        else if (c.tagName === 'note') {
          if (c.getElementsByTagName('grace').length) return;
          const dur = (+val(c, 'duration') || 0) / div;
          const chord = c.getElementsByTagName('chord').length > 0;
          const start = chord ? lastStart : t;
          if (!chord) lastStart = t;
          if (!c.getElementsByTagName('rest').length) {
            const step = val(c, 'step'), oct = +val(c, 'octave'), alter = +(val(c, 'alter') || 0);
            if (step) {
              const midi = 12 * (oct + 1) + NATURAL[step] + alter;
              const tieStop = [...c.getElementsByTagName('tie')].some(x => x.getAttribute('type') === 'stop');
              const prev = tieStop && notes.slice().reverse().find(n => n.midi === midi && Math.abs(n.t + n.dur - start) < 1e-6);
              if (prev) prev.dur += dur; else notes.push({ t: start, dur, midi });
            }
          }
          if (!chord) t += dur;
        }
      });
    });
    return { name: partNames[part.getAttribute('id')] || `파트 ${pi + 1}`, notes: notes.sort((a, b) => a.t - b.t || b.midi - a.midi) };
  }).filter(x => x.notes.length);
  if (!tracks.length) throw '이 MusicXML 파일에서 음을 찾지 못했어요.';
  return { bpm: bpm || 100, ts: ts || { num: 4, den: 4 }, tracks };
}

// 예시: "작은 별" (18세기 프랑스 민요, 저작권 없음) — 멜로디 + 낮은 음 반주
function exampleScore() {
  const mel = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0, 67, 67, 65, 65, 64, 64, 62, 0, 67, 67, 65, 65, 64, 64, 62, 0];
  const notes = [];
  mel.forEach((m, i) => { if (m) notes.push({ t: i, dur: mel[i + 1] === 0 ? 2 : 1, midi: m }); });
  const bass = [48, 53, 48, 48, 53, 48, 55, 48, 48, 53, 48, 55, 48, 53, 48, 55];
  const low = bass.map((m, i) => ({ t: i * 2, dur: 2, midi: m }));
  return { title: '작은 별 (민요)', bpm: 96, ts: { num: 4, den: 4 }, tracks: [{ name: '멜로디', notes }, { name: '반주 (낮은 음)', notes: low }] };
}

// 압축된 MusicXML(.mxl) 풀기: zip 안의 악보 xml을 찾아 글자로 돌려줌
async function unzipScoreXml(buf) {
  const d = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (d.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw '압축 파일을 읽을 수 없어요.';
  const n = d.getUint16(e + 10, true);
  let p = d.getUint32(e + 16, true);
  const entries = [];
  for (let k = 0; k < n && p + 46 <= u8.length; k++) {
    if (d.getUint32(p, true) !== 0x02014b50) break;
    const method = d.getUint16(p + 10, true), csize = d.getUint32(p + 20, true), nlen = d.getUint16(p + 28, true), xlen = d.getUint16(p + 30, true), clen = d.getUint16(p + 32, true), off = d.getUint32(p + 42, true);
    entries.push({ name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)), method, csize, off });
    p += 46 + nlen + xlen + clen;
  }
  const read = async en => {
    const st = en.off + 30 + d.getUint16(en.off + 26, true) + d.getUint16(en.off + 28, true);
    const data = u8.subarray(st, st + en.csize);
    if (en.method === 0) return new TextDecoder().decode(data);
    if (en.method !== 8 || typeof DecompressionStream === 'undefined') throw 'mxl';
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return new TextDecoder().decode(out);
  };
  let target = null;
  const cont = entries.find(x => x.name === 'META-INF/container.xml');
  if (cont) { const m = (await read(cont)).match(/full-path="([^"]+)"/); if (m) target = entries.find(x => x.name === m[1]); }
  if (!target) target = entries.find(x => /\.(musicxml|xml)$/i.test(x.name) && !x.name.startsWith('META-INF'));
  if (!target) throw '압축 파일 안에서 악보를 찾지 못했어요.';
  return read(target);
}

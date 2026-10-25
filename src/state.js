// Project model, defaults and timeline math shared by the preview player and the exporter.

export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const FONTS = {
  Archivo: { family: '"Archivo Black"', weight: 400 },
  Rubik: { family: 'Rubik', weight: 900 },
  Anton: { family: 'Anton', weight: 400 },
  Bebas: { family: '"Bebas Neue"', weight: 400 },
};

export const ANIMS = [
  { value: 'none', label: 'None' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide', label: 'Slide' },
  { value: 'drop', label: 'Drop' },
  { value: 'fade', label: 'Fade' },
];

// Area YouTube Shorts leaves free of its own UI (top bar, right-hand buttons, caption block).
// All burned-in text is wrapped and clamped to stay inside it.
export const SAFE = { top: 170, bottom: 1480, side: 140 };

export const defaultSettings = {
  // The pasted ranking text is the single source of truth for every title on screen.
  script: { text: '', direction: 'down' },
  canvas: { fit: 'fill', bg: '#000000', transition: 'flash', shade: true },
  title: {
    on: true,
    // Word indexes picked by hand, valid only while the title text is highlightFor.
    highlight: [],
    highlightFor: null,
    font: 'Archivo',
    size: 88,
    y: 10,
    hold: 0,
    outline: 10,
    shadow: true,
    color: '#ffffff',
    highlightColor: '#ffd21f',
    outlineColor: '#000000',
    uppercase: true,
    anim: 'pop',
  },
  label: { on: true, size: 84, y: 62, hold: 0, color: '#ffffff', rankColor: '#ffd21f', anim: 'pop', withRank: true, format: '{n}.' },
  list: { on: false, size: 56, y: 28, color: '#ffffff', activeColor: '#ffd21f', format: '{n}.' },
  audio: { keepOriginal: true, musicVolume: 0.35, musicOffset: 0, loop: true, fadeIn: 1, fadeOut: 2 },
};

const STORAGE_KEY = 'rankforge.settings.v3';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return structuredClone(defaultSettings);
    // Only known fields, so settings saved by an older version can't leak in.
    const out = {};
    for (const [k, def] of Object.entries(defaultSettings)) {
      out[k] = { ...def };
      for (const f of Object.keys(def)) if (saved[k]?.[f] !== undefined) out[k][f] = saved[k][f];
    }
    return out;
  } catch {
    return structuredClone(defaultSettings);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

// setIn(settings, 'title.size', 90) -> new object with that leaf replaced
export function setIn(obj, path, value) {
  const [a, b] = path.split('.');
  return b === undefined ? { ...obj, [a]: value } : { ...obj, [a]: { ...obj[a], [b]: value } };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clipLength = (c) => Math.max(0.1, c.trimEnd - c.trimStart);

export function buildSegments(clips) {
  let t = 0;
  return clips.map((clip, index) => {
    const d = clipLength(clip);
    const seg = { clip, index, start: t, end: t + d };
    t += d;
    return seg;
  });
}

export const totalOf = (segs) => (segs.length ? segs[segs.length - 1].end : 0);

export function segmentIndexAt(segs, t) {
  if (!segs.length) return -1;
  for (let i = 0; i < segs.length; i++) if (t < segs[i].end) return i;
  return segs.length - 1;
}

export const formatRank = (fmt, n) => (fmt || '{n}.').split('{n}').join(String(n));

// Words of the title to paint in the highlight colour: the hand-picked ones while the title is
// unchanged, otherwise "Top" plus any number ("TOP 5 Most Powerful …").
export function titleHighlights(T, title) {
  if (T.highlightFor === title) return T.highlight;
  const words = title.split(/\s+/).filter(Boolean);
  const out = [];
  words.forEach((w, i) => {
    if (/^\d+\W*$/.test(w)) {
      out.push(i);
      if (i > 0 && /^top$/i.test(words[i - 1])) out.push(i - 1);
    }
  });
  return out;
}

export function fmtTime(t, precise = false) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return precise ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

export function musicGainAt(audio, t, total) {
  let f = 1;
  if (audio.fadeIn > 0) f = Math.min(f, t / audio.fadeIn);
  if (audio.fadeOut > 0) f = Math.min(f, (total - t) / audio.fadeOut);
  return audio.musicVolume * clamp(f, 0, 1);
}

// Draws one 1080x1920 frame. Used identically by the live preview and the MP4 exporter,
// so what you preview is what gets burned in.
import { W, H, FONTS, SAFE, clamp, formatRank, segmentIndexAt, titleHighlights } from './state';
import { parsedFor } from './parse';

const MAX_W = W - SAFE.side * 2;

const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export function animate(kind, lt, dur = 0.45) {
  const p = clamp(lt / dur, 0, 1);
  switch (kind) {
    case 'pop':
      return { alpha: clamp(p * 3, 0, 1), scale: 0.3 + 0.7 * easeOutBack(p), dx: 0, dy: 0 };
    case 'slide':
      return { alpha: p, scale: 1, dx: -(1 - easeOutCubic(p)) * W * 0.6, dy: 0 };
    case 'drop':
      return { alpha: clamp(p * 2, 0, 1), scale: 1, dx: 0, dy: -(1 - easeOutBack(p)) * 240 };
    case 'fade':
      return { alpha: easeOutCubic(p), scale: 1, dx: 0, dy: 0 };
    default:
      return { alpha: 1, scale: 1, dx: 0, dy: 0 };
  }
}

function setFont(ctx, key, size) {
  const f = FONTS[key] || FONTS.Archivo;
  ctx.font = `${f.weight} ${size}px ${f.family}, Impact, sans-serif`;
}

function layoutWords(ctx, words, maxW) {
  const space = ctx.measureText(' ').width;
  const lines = [];
  let cur = [];
  let curW = 0;
  words.forEach((text, idx) => {
    const width = ctx.measureText(text).width;
    if (cur.length && curW + space + width > maxW) {
      lines.push({ words: cur, width: curW });
      cur = [];
      curW = 0;
    }
    curW += (cur.length ? space : 0) + width;
    cur.push({ text, idx, width });
  });
  if (cur.length) lines.push({ words: cur, width: curW });
  return { lines, space };
}

// Shrinks the font (down to 55%) until the text wraps to at most maxLines inside the safe width,
// so long titles stay readable and never run under the Shorts UI.
function fitText(ctx, font, words, size, maxLines) {
  let s = size;
  for (;;) {
    setFont(ctx, font, s);
    const lay = layoutWords(ctx, words, MAX_W);
    const fits = lay.lines.length <= maxLines && lay.lines.every((l) => l.width <= MAX_W);
    if (fits || s <= size * 0.55) return { ...lay, size: s };
    s = Math.floor(s * 0.94);
  }
}

// Keeps a text block of height h inside the vertical safe area.
const safeTop = (top, h) => clamp(top, SAFE.top, Math.max(SAFE.top, SAFE.bottom - h));

// Fades a held element out over 0.3s once its hold time is over (hold 0 = always on).
const holdFade = (hold, t) => (hold > 0 ? clamp((hold - t) / 0.3, 0, 1) : 1);

function withAnim(ctx, a, cx, cy, draw) {
  if (a.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a.alpha;
  ctx.translate(cx + a.dx, cy + a.dy);
  ctx.scale(a.scale, a.scale);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

// Outlined text: stroke every run first, then fill, so outlines never cover neighbouring glyphs.
// The drop shadow goes on the first pass only, so it sits behind the whole word.
function drawRuns(ctx, runs, outline, outlineColor, shadow) {
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const setShadow = (on) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.65)' : 'transparent';
    ctx.shadowBlur = on ? 22 : 0;
    ctx.shadowOffsetY = on ? 8 : 0;
  };
  setShadow(shadow);
  if (outline > 0) {
    ctx.lineWidth = outline * 2;
    ctx.strokeStyle = outlineColor;
    for (const r of runs) ctx.strokeText(r.text, r.x, r.y);
    setShadow(false);
  }
  for (const r of runs) {
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, r.x, r.y);
  }
  setShadow(false);
}

function drawMedia(ctx, el, fit, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // el is a <video> (preview, seek export) or a decoded frame canvas (fast export path)
  if (!el || (el instanceof HTMLVideoElement && el.readyState < 2)) return;
  const vw = el.videoWidth ?? el.width;
  const vh = el.videoHeight ?? el.height;
  if (!vw || !vh) return;
  const cover = Math.max(W / vw, H / vh);
  const contain = Math.min(W / vw, H / vh);
  const draw = (s) => {
    const dw = vw * s;
    const dh = vh * s;
    ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };
  if (fit === 'fill') return draw(cover);
  if (fit === 'blur') {
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.55)';
    draw(cover * 1.1);
    ctx.restore();
  }
  draw(contain);
}

function drawShade(ctx) {
  let g = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.4);
  g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
}

// Centred, wrapped runs for a block whose first line's top sits at `top`.
function centredRuns(lay, top, colorOf) {
  const lh = lay.size * 1.12;
  const runs = [];
  lay.lines.forEach((line, li) => {
    let x = (W - line.width) / 2;
    const y = top + lay.size * 0.9 + li * lh;
    for (const w of line.words) {
      runs.push({ text: w.text, x, y, color: colorOf(w.idx) });
      x += w.width + lay.space;
    }
  });
  return { runs, height: lay.lines.length * lh };
}

function drawTitle(ctx, s, title, t) {
  const T = s.title;
  if (!T.on || !title) return;
  const fade = holdFade(T.hold, t);
  if (fade <= 0) return;
  const words = (T.uppercase ? title.toUpperCase() : title).split(/\s+/).filter(Boolean);
  const hl = titleHighlights(T, title);
  const lay = fitText(ctx, T.font, words, T.size, 3);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const h = lay.lines.length * lay.size * 1.12;
  const top = safeTop((H * T.y) / 100, h);
  const { runs } = centredRuns(lay, top, (i) => (hl.includes(i) ? T.highlightColor : T.color));
  const a = animate(T.anim, t, 0.6);
  a.alpha *= fade;
  withAnim(ctx, a, W / 2, top + h / 2, () => drawRuns(ctx, runs, T.outline, T.outlineColor, T.shadow));
}

// The ranking entry for the playing clip: "5. Spider-Man", number in the rank colour.
function drawLabel(ctx, s, entry, lt) {
  const L = s.label;
  const fade = holdFade(L.hold, lt);
  if (fade <= 0) return;
  const head = L.withRank ? formatRank(L.format, entry.rank).split(/\s+/).filter(Boolean) : [];
  const words = [...head, ...entry.text.split(/\s+/).filter(Boolean)];
  if (!words.length) return;
  const lay = fitText(ctx, s.title.font, words, L.size, 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const h = lay.lines.length * lay.size * 1.12;
  const top = safeTop((H * L.y) / 100 - h / 2, h);
  const { runs } = centredRuns(lay, top, (i) => (i < head.length ? L.rankColor : L.color));
  const a = animate(L.anim, lt);
  a.alpha *= fade;
  withAnim(ctx, a, W / 2, top + h / 2, () => drawRuns(ctx, runs, Math.max(4, s.title.outline * 0.8), s.title.outlineColor, s.title.shadow));
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Every number on screen from the start; entries fill in as their clips play.
function drawList(ctx, s, entries, current) {
  const Ls = s.list;
  const rows = entries.map((e, idx) => ({ ...e, idx })).sort((a, b) => a.rank - b.rank);
  if (!rows.length) return;
  const lh0 = Ls.size * 1.32;
  // Shrink the whole list if it would run past the safe area.
  const size = Math.min(Ls.size, Math.floor((SAFE.bottom - SAFE.top) / rows.length / 1.32));
  const lh = (lh0 * size) / Ls.size;
  setFont(ctx, s.title.font, size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const x0 = SAFE.side - 40;
  const y0 = safeTop((H * Ls.y) / 100, rows.length * lh);
  const runs = rows.map((e, k) => {
    const revealed = e.idx <= current;
    const head = formatRank(Ls.format, e.rank);
    const text = revealed && e.text ? ellipsize(ctx, `${head} ${e.text}`, W - SAFE.side - x0) : head;
    return { text, x: x0, y: y0 + size + k * lh, color: e.idx === current ? Ls.activeColor : Ls.color };
  });
  drawRuns(ctx, runs, Math.max(3, s.title.outline * 0.6), s.title.outlineColor, s.title.shadow);
}

// scene = { clips, segs, total, settings }; getEl(clipId) -> HTMLVideoElement
// Clip i (in timeline order) shows ranking entry i from the pasted text.
export function drawFrame(ctx, scene, t, getEl) {
  const { segs, settings: s } = scene;
  const { title, entries } = parsedFor(s.script);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  const i = segmentIndexAt(segs, t);
  if (i < 0) {
    ctx.fillStyle = s.canvas.bg;
    ctx.fillRect(0, 0, W, H);
    drawTitle(ctx, s, title, t);
    ctx.restore();
    return;
  }
  const seg = segs[i];
  const lt = t - seg.start;
  const ld = seg.end - seg.start;
  drawMedia(ctx, getEl(seg.clip.id), s.canvas.fit, s.canvas.bg);
  if (s.canvas.shade) drawShade(ctx);

  if (s.list.on) drawList(ctx, s, entries, i);
  if (s.label.on && entries[i]) drawLabel(ctx, s, entries[i], lt);
  drawTitle(ctx, s, title, t);

  if (s.canvas.transition === 'flash' && i > 0 && lt < 0.25) {
    ctx.fillStyle = `rgba(255,255,255,${(1 - lt / 0.25) * 0.85})`;
    ctx.fillRect(0, 0, W, H);
  } else if (s.canvas.transition === 'fade') {
    const fd = 0.25;
    let a = 0;
    if (i > 0 && lt < fd) a = 1 - lt / fd;
    if (i < segs.length - 1 && ld - lt < fd) a = Math.max(a, 1 - (ld - lt) / fd);
    if (a > 0) {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.restore();
}

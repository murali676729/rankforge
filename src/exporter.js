// Offline render: every frame is drawn with the same renderer as the preview, encoded with
// WebCodecs (H.264) and muxed with an AAC (or Opus fallback) mix into an MP4.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { W, H, FPS, buildSegments, musicGainAt, segmentIndexAt, totalOf } from './state';
import { drawFrame } from './render';
import { loadCanvasFonts } from './media';

const SR = 48000;
const VIDEO_CODECS = ['avc1.640032', 'avc1.4d0032', 'avc1.640028', 'avc1.42e032', 'avc1.42003e'];

async function pickVideoConfig() {
  for (const codec of VIDEO_CODECS) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const cfg = { codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS, hardwareAcceleration };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error('No H.264 encoder is available in this browser. Use a recent Chrome or Edge.');
}

async function pickAudioConfig() {
  if (!('AudioEncoder' in window)) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 192_000 };
    try {
      if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux };
    } catch {
      /* try next */
    }
  }
  return null;
}

const audioCache = new WeakMap();
async function decodeAudio(file) {
  if (audioCache.has(file)) return audioCache.get(file);
  let buf = null;
  try {
    buf = await new OfflineAudioContext(2, 1, SR).decodeAudioData(await file.arrayBuffer());
  } catch {
    buf = null; // no audio track, or a codec Web Audio can't decode
  }
  audioCache.set(file, buf);
  return buf;
}

async function mixAudio({ clips, settings, music }, segs, total) {
  const a = settings.audio;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * SR)), SR);
  let any = false;
  if (a.keepOriginal) {
    for (const seg of segs) {
      const c = seg.clip;
      if (c.muted || c.volume <= 0 || c.hasAudio === false) continue;
      const buf = await decodeAudio(c.file);
      if (!buf || c.trimStart >= buf.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = c.volume;
      src.connect(g).connect(ctx.destination);
      src.start(seg.start, c.trimStart, seg.end - seg.start);
      any = true;
    }
  }
  if (music) {
    const buf = await decodeAudio(music.file);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = a.loop;
      const g = ctx.createGain();
      const n = Math.max(2, Math.ceil(total * 100));
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = musicGainAt(a, (i / (n - 1)) * total, total);
      g.gain.setValueCurveAtTime(curve, 0, total);
      src.connect(g).connect(ctx.destination);
      src.start(0, Math.min(a.musicOffset, Math.max(0, buf.duration - 0.01)));
      any = true;
    }
  }
  return ctx.startRendering().then((b) => ({ buffer: b, silent: !any }));
}

function loadVideo(clip) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.onloadeddata = () => res(v);
    v.onerror = () => rej(new Error(`Could not decode ${clip.name}`));
    v.src = clip.url;
  });
}

function seekVideo(el, t) {
  return new Promise((res) => {
    if (Math.abs(el.currentTime - t) < 1e-4 && el.readyState >= 2) return res();
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      el.removeEventListener('seeked', fin);
      clearTimeout(timer);
      res();
    };
    const timer = setTimeout(fin, 5000);
    el.addEventListener('seeked', fin);
    el.currentTime = t;
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function openFrameSource(file, inputs) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  inputs.push(input);
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) return null;
  return { sink: new CanvasSink(track, { poolSize: 2 }), first: await track.getFirstTimestamp() };
}

export async function renderMp4(project, { onProgress = () => {}, isCancelled = () => false } = {}) {
  if (!('VideoEncoder' in window)) throw new Error('This browser has no WebCodecs support. Use a recent Chrome or Edge.');
  const check = () => {
    if (isCancelled()) throw new Error('Export cancelled.');
  };
  const segs = buildSegments(project.clips);
  const total = totalOf(segs);
  if (!total) throw new Error('Add at least one clip first.');

  onProgress('Loading fonts and clips', 0);
  await loadCanvasFonts();
  const sources = new Map();
  for (const c of project.clips) sources.set(c.id, await loadVideo(c));
  check();

  onProgress('Mixing audio', 0);
  const vcfg = await pickVideoConfig();
  const acfg = await pickAudioConfig();
  const mix = acfg ? await mixAudio(project, segs, total) : null;
  check();

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: SR } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encError = null;
  if (mix) {
    onProgress('Encoding audio', 0);
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (encError = e) });
    aenc.configure(acfg.cfg);
    const b = mix.buffer;
    const L = b.getChannelData(0);
    const R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
    const CH = 4096;
    for (let off = 0; off < b.length; off += CH) {
      const n = Math.min(CH, b.length - off);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / SR) * 1e6), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
    if (encError) throw encError;
  }

  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (encError = e) });
  venc.configure(vcfg);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const scene = { clips: project.clips, segs, total, settings: project.settings };
  const frames = Math.max(1, Math.round(total * FPS));
  const frameDur = Math.round(1e6 / FPS);

  // Group output frames by segment: [{ seg, items: [{ i, t, src }] }]
  const groups = [];
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    const seg = segs[segmentIndexAt(segs, t)];
    const el = sources.get(seg.clip.id);
    const src = Math.max(0, Math.min(seg.clip.trimStart + (t - seg.start), seg.clip.trimEnd - 0.001, el.duration - 0.001));
    if (groups.at(-1)?.seg !== seg) groups.push({ seg, items: [] });
    groups.at(-1).items.push({ i, t, src });
  }

  let current = null;
  const emit = async ({ i, t }) => {
    check();
    if (encError) throw encError;
    drawFrame(ctx, scene, t, () => current);
    const frame = new VideoFrame(canvas, { timestamp: i * frameDur, duration: frameDur });
    venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await tick();
    if (i % 3 === 0) onProgress('Rendering frames', (i + 1) / frames);
  };

  const inputs = [];
  try {
    for (const { seg, items } of groups) {
      // Fast path: demux + WebCodecs-decode frames in order. Fallback: seek the <video> per frame.
      const fast = await openFrameSource(seg.clip.file, inputs).catch(() => null);
      if (fast) {
        current = null;
        const times = items.map((it) => Math.max(it.src, fast.first));
        let k = 0;
        try {
          for await (const wc of fast.sink.canvasesAtTimestamps(times)) {
            if (wc) current = wc.canvas;
            await emit(items[k++]);
          }
        } catch (e) {
          if (isCancelled() || encError) throw e;
          console.warn('Fast decode failed, falling back to seeking:', e);
        }
        if (k === items.length) continue;
        items.splice(0, k); // decoder stopped early: finish this segment by seeking
      }
      const el = sources.get(seg.clip.id);
      current = el;
      for (const it of items) {
        await seekVideo(el, it.src);
        await emit(it);
      }
    }
  } finally {
    for (const inp of inputs) inp.dispose();
    for (const v of sources.values()) {
      v.removeAttribute('src');
      v.load();
    }
  }
  onProgress('Finalizing', 1);
  await venc.flush();
  venc.close();
  if (encError) throw encError;
  muxer.finalize();
  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    audioCodec: acfg ? (mix?.silent ? `${acfg.mux} (silent)` : acfg.mux) : 'none',
    videoCodec: vcfg.codec,
  };
}

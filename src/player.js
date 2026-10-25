// Live preview engine. Each clip gets its own <video>; playback is driven by the active clip's
// media clock and handed to the next clip when it reaches its trim-out point. Audio is routed
// through Web Audio so per-clip volume can go above 100% and music can fade in/out.
import { W, H, buildSegments, clamp, musicGainAt, segmentIndexAt, totalOf } from './state';
import { drawFrame } from './render';

export class Player {
  constructor(canvas) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.media = new Map();
    this.scene = { clips: [], segs: [], total: 0, settings: null, music: null };
    this.time = 0;
    this.playing = false;
    this.segIndex = -1;
    this.muted = false;
    this.dirty = true;
    this.listeners = new Set();
    this.snap = { time: 0, playing: false, total: 0, muted: false };
    this.musicEl = new Audio();
    this.musicEl.preload = 'auto';
    this.musicUrl = null;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const m of this.media.values()) m.el.pause();
    this.musicEl.pause();
    this.audioCtx?.close();
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  emit() {
    const s = this.snap;
    if (s.time !== this.time || s.playing !== this.playing || s.total !== this.scene.total || s.muted !== this.muted) {
      this.snap = { time: this.time, playing: this.playing, total: this.scene.total, muted: this.muted };
      this.listeners.forEach((f) => f());
    }
  }

  setScene({ clips, settings, music }) {
    const segs = buildSegments(clips);
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, m] of this.media) {
      if (ids.has(id)) continue;
      m.el.pause();
      m.node?.disconnect();
      m.gain?.disconnect();
      this.media.delete(id);
    }
    for (const c of clips) {
      if (this.media.has(c.id)) continue;
      const el = document.createElement('video');
      el.preload = 'auto';
      el.playsInline = true;
      el.src = c.url;
      el.addEventListener('seeked', () => (this.dirty = true));
      el.addEventListener('loadeddata', () => (this.dirty = true));
      el.currentTime = c.trimStart;
      const m = { el };
      this.media.set(c.id, m);
      if (this.audioCtx) this.connect(m);
    }
    const murl = music?.url || null;
    if (murl !== this.musicUrl) {
      this.musicEl.pause();
      this.musicUrl = murl;
      if (murl) this.musicEl.src = murl;
      else this.musicEl.removeAttribute('src');
    }
    const prev = this.scene.segs[this.segIndex];
    this.scene = { clips, segs, total: totalOf(segs), settings, music };
    if (this.playing) {
      const idx = prev ? segs.findIndex((s) => s.clip.id === prev.clip.id) : -1;
      if (idx < 0) this.pause();
      else this.segIndex = idx;
    }
    if (!this.playing) this.seek(this.time);
    this.dirty = true;
    this.emit();
  }

  ensureAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.master = this.audioCtx.createGain();
      this.master.connect(this.audioCtx.destination);
      for (const m of this.media.values()) this.connect(m);
      const node = this.audioCtx.createMediaElementSource(this.musicEl);
      this.musicGain = this.audioCtx.createGain();
      node.connect(this.musicGain).connect(this.master);
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  connect(m) {
    m.node = this.audioCtx.createMediaElementSource(m.el);
    m.gain = this.audioCtx.createGain();
    m.node.connect(m.gain).connect(this.master);
  }

  updateGains() {
    if (!this.audioCtx) return;
    const a = this.scene.settings.audio;
    for (const c of this.scene.clips) {
      const m = this.media.get(c.id);
      if (m?.gain) m.gain.gain.value = a.keepOriginal && !c.muted ? c.volume : 0;
    }
    this.musicGain.gain.value = this.scene.music ? musicGainAt(a, this.time, this.scene.total) : 0;
    this.master.gain.value = this.muted ? 0 : 1;
  }

  syncMusic() {
    if (!this.scene.music) return;
    const a = this.scene.settings.audio;
    const d = this.musicEl.duration || 0;
    let p = a.musicOffset + this.time;
    if (a.loop && d > 0) p %= d;
    if (d && p >= d) {
      this.musicEl.pause();
      return;
    }
    try {
      this.musicEl.currentTime = p;
    } catch {
      /* metadata not loaded yet */
    }
    if (this.playing) this.musicEl.play().catch(() => {});
  }

  // Set the playhead without touching media; the next setScene() seeks there with fresh data.
  cue(t) {
    this.time = Math.max(0, t);
  }

  play() {
    const { segs, total } = this.scene;
    if (!segs.length) return;
    this.ensureAudio();
    if (this.time >= total - 0.02) this.time = 0;
    this.segIndex = segmentIndexAt(segs, this.time);
    const seg = segs[this.segIndex];
    const el = this.media.get(seg.clip.id).el;
    el.currentTime = seg.clip.trimStart + (this.time - seg.start);
    this.playing = true;
    el.play().catch(() => {});
    this.syncMusic();
    this.emit();
  }

  pause() {
    this.playing = false;
    for (const m of this.media.values()) m.el.pause();
    this.musicEl.pause();
    this.dirty = true;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setMuted(b) {
    this.muted = b;
    this.emit();
  }

  seek(t) {
    const { segs, total } = this.scene;
    this.time = clamp(t, 0, total);
    this.dirty = true;
    if (!segs.length) return this.emit();
    const idx = segmentIndexAt(segs, this.time);
    if (this.playing && idx !== this.segIndex) {
      const old = segs[this.segIndex];
      if (old) this.media.get(old.clip.id)?.el.pause();
    }
    this.segIndex = idx;
    const seg = segs[idx];
    const el = this.media.get(seg.clip.id)?.el;
    if (el) {
      el.currentTime = seg.clip.trimStart + Math.min(this.time - seg.start, seg.end - seg.start - 0.001);
      if (this.playing) el.play().catch(() => {});
    }
    if (this.playing) this.syncMusic();
    this.emit();
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    const { settings, segs, total } = this.scene;
    if (!settings) return;
    if (this.playing) {
      const seg = segs[this.segIndex];
      if (!seg) {
        this.pause();
      } else {
        const el = this.media.get(seg.clip.id).el;
        const ct = el.currentTime;
        this.time = Math.min(seg.end, seg.start + Math.max(0, ct - seg.clip.trimStart));
        if (ct >= seg.clip.trimEnd - 0.03 || el.ended) {
          el.pause();
          el.currentTime = seg.clip.trimStart;
          const next = segs[this.segIndex + 1];
          if (!next) {
            this.time = total;
            this.pause();
          } else {
            this.segIndex++;
            const nel = this.media.get(next.clip.id).el;
            if (Math.abs(nel.currentTime - next.clip.trimStart) > 0.05) nel.currentTime = next.clip.trimStart;
            nel.play().catch(() => {});
            this.time = next.start;
          }
        }
      }
      this.dirty = true;
    }
    this.updateGains();
    if (this.dirty) {
      this.dirty = this.playing;
      drawFrame(this.ctx, this.scene, this.time, (id) => this.media.get(id)?.el);
    }
    this.emit();
  }
}

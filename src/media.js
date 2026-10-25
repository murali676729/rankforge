// Local file import: everything is read through object URLs and never leaves the machine.
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { FONTS } from './state';
import '@fontsource/archivo-black/400.css';
import '@fontsource/rubik/900.css';
import '@fontsource/anton/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource-variable/outfit';
import '@fontsource/ibm-plex-mono/400.css';

let seq = 0;
export const uid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export function loadCanvasFonts() {
  return Promise.all(Object.values(FONTS).map((f) => document.fonts.load(`${f.weight} 64px ${f.family}`)));
}

function once(el, ev) {
  return new Promise((res) => el.addEventListener(ev, res, { once: true }));
}

// Reads duration, size and a thumbnail. Rejects for files the browser cannot decode.
export async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = true;
  const failed = new Promise((_, rej) =>
    v.addEventListener('error', () => rej(new Error(`${file.name}: this browser can't decode this file (try H.264 MP4 or WebM).`)), { once: true }),
  );
  try {
    v.src = url;
    await Promise.race([once(v, 'loadedmetadata'), failed]);
    let duration = v.duration;
    if (!Number.isFinite(duration)) {
      // MediaRecorder WebM files report Infinity until the end has been seeked once.
      v.currentTime = 1e7;
      await Promise.race([once(v, 'seeked'), failed]);
      duration = v.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${file.name}: could not read the clip length.`);
    if (!v.videoWidth) throw new Error(`${file.name}: no video track found.`);
    v.currentTime = Math.min(0.5, duration / 3);
    await Promise.race([once(v, 'seeked'), failed]);
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = Math.round((180 * v.videoHeight) / v.videoWidth) || 320;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { url, duration, width: v.videoWidth, height: v.videoHeight, thumb: c.toDataURL('image/jpeg', 0.7) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

// true / false when the container could be read, null when we can't tell (the clip still plays).
export async function probeHasAudio(file) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    return !!(await input.getPrimaryAudioTrack());
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

export function makeClip(file, info) {
  return {
    id: uid(),
    file,
    url: info.url,
    name: file.name,
    duration: info.duration,
    width: info.width,
    height: info.height,
    thumb: info.thumb,
    hasAudio: info.hasAudio ?? null,
    trimStart: 0,
    trimEnd: info.duration,
    volume: 1,
    muted: false,
  };
}

export async function probeAudio(file) {
  const url = URL.createObjectURL(file);
  const a = new Audio();
  a.preload = 'metadata';
  a.src = url;
  await new Promise((res, rej) => {
    a.onloadedmetadata = res;
    a.onerror = () => rej(new Error(`${file.name}: this browser can't decode this audio file.`));
  });
  return { file, url, name: file.name, duration: a.duration };
}

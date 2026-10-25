import { useState, useSyncExternalStore } from 'react';

const EMPTY_SNAP = { time: 0, playing: false, total: 0, muted: false };
const noopSub = () => () => {};
const emptySnap = () => EMPTY_SNAP;

export function usePlayerSnap(player) {
  return useSyncExternalStore(player ? player.subscribe : noopSub, player ? player.getSnapshot : emptySnap);
}

export function Section({ title, desc, right, children }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <h3>{title}</h3>
        {right}
      </div>
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label = 'On' }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, unit = '', fmt, disabled }) {
  return (
    <div className={`slider${disabled ? ' disabled' : ''}`}>
      <div className="slider-top">
        <span>{label}</span>
        <span className="mono">
          {fmt ? fmt(value) : value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Seg({ options, value, onChange, small }) {
  return (
    <div className={`seg${small ? ' small' : ''}`}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Color({ label, value, onChange }) {
  return (
    <label className="row color-row">
      <span>{label}</span>
      <span className="mono dim">{value.toUpperCase()}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// HTML5 drag-and-drop list reordering. axis decides which half of an item counts as "after".
export function useReorder(onMove, axis = 'y') {
  const [st, setSt] = useState(null);
  const item = (i) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'clip');
      setSt({ from: i, over: i });
    },
    onDragOver: (e) => {
      if (!st) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const after = axis === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      const over = after ? i + 1 : i;
      if (over !== st.over) setSt({ ...st, over });
    },
    onDrop: (e) => {
      if (!st) return;
      e.preventDefault();
      e.stopPropagation();
      let to = st.over;
      if (to > st.from) to--;
      if (to !== st.from) onMove(st.from, to);
      setSt(null);
    },
    onDragEnd: () => setSt(null),
  });
  const cls = (i, n) => {
    if (!st) return '';
    if (st.from === i) return 'dragging';
    if (st.over === i) return 'drop-before';
    if (st.over === n && i === n - 1) return 'drop-after';
    return '';
  };
  return { item, cls };
}

export const Icon = {
  play: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
  ),
  fwd: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>
  ),
  vol: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 15l6-6 6 6" /></svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6 6 18" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
  ),
};

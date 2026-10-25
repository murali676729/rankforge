import { useMemo, useRef, useState } from 'react';
import { buildSegments, clamp, fmtTime, formatRank, totalOf } from '../state';
import { Icon, usePlayerSnap, useReorder } from './ui';

function Playhead({ player, pps }) {
  const snap = usePlayerSnap(player);
  return <div className="playhead" style={{ transform: `translateX(${snap.time * pps}px)` }} />;
}

export default function Timeline({ clips, parsed, settings, music, player, selectedId, onSelect, onMove, updateClip: onUpdate, onAddFiles, onRemove }) {
  const [pps, setPps] = useState(48);
  const segs = useMemo(() => buildSegments(clips), [clips]);
  const total = totalOf(segs);
  const trimRef = useRef(null);
  const fileRef = useRef(null);
  const { item, cls } = useReorder(onMove, 'x');
  const width = Math.max(total * pps + 240, 600);
  const step = pps >= 60 ? 1 : pps >= 25 ? 2 : pps >= 12 ? 5 : 10;
  const ticks = [];
  for (let s = 0; s <= total + step * 4; s += step) ticks.push(s);
  const selIndex = clips.findIndex((c) => c.id === selectedId);

  const seekAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    player?.seek((e.clientX - r.left) / pps);
  };

  const startTrim = (e, seg, side) => {
    e.stopPropagation();
    e.preventDefault();
    const c = seg.clip;
    trimRef.current = { id: c.id, side, x: e.clientX, ts: c.trimStart, te: c.trimEnd, dur: c.duration, segStart: seg.start };
    onSelect(c.id);
    const move = (ev) => {
      const st = trimRef.current;
      if (!st) return;
      const d = (ev.clientX - st.x) / pps;
      if (st.side === 'start') {
        player?.cue(st.segStart);
        onUpdate(st.id, { trimStart: clamp(st.ts + d, 0, st.te - 0.25) });
      } else {
        const te = clamp(st.te + d, st.ts + 0.25, st.dur);
        player?.cue(st.segStart + (te - st.ts) - 0.04);
        onUpdate(st.id, { trimEnd: te });
      }
    };
    const up = () => {
      trimRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onFileDrop = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    onAddFiles([...e.dataTransfer.files]);
  };

  return (
    <div className="panel timeline" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onFileDrop}>
      <div className="tl-bar">
        <h2>Timeline</h2>
        <button className="chip" onClick={() => fileRef.current.click()}>{Icon.plus} Add clips</button>
        <input ref={fileRef} type="file" accept="video/*,.mov,.mkv" multiple hidden onChange={(e) => { onAddFiles([...e.target.files]); e.target.value = ''; }} />
        <button className="chip" disabled={selIndex < 1} onClick={() => onMove(selIndex, selIndex - 1)}>◀ Move</button>
        <button className="chip" disabled={selIndex < 0 || selIndex >= clips.length - 1} onClick={() => onMove(selIndex, selIndex + 1)}>Move ▶</button>
        <button className="chip danger" disabled={selIndex < 0} onClick={() => onRemove(selectedId)}>Delete</button>
        <span className="spacer" />
        <span className="mono dim">{clips.length} clips · {fmtTime(total)}</span>
        <span className="mono dim">ZOOM</span>
        <input className="zoom" type="range" min={8} max={140} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
      </div>
      <div className="tl-scroll">
        <div className="tl-content" style={{ width }}>
          <div className="ruler" onPointerDown={seekAt}>
            {ticks.map((s) => (
              <span key={s} className="tick mono" style={{ left: s * pps }}>{s}s</span>
            ))}
          </div>
          <div className="track">
            {!clips.length && <div className="tl-empty">Empty. Drop video files here or use “Add clips”.</div>}
            {segs.map((seg, i) => {
              const c = seg.clip;
              const entry = parsed.entries[i];
              const drag = item(i);
              return (
                <div
                  key={c.id}
                  className={`block ${c.id === selectedId ? 'sel' : ''} ${cls(i, clips.length)}`}
                  style={{ width: Math.max(18, (seg.end - seg.start) * pps), backgroundImage: `url(${c.thumb})` }}
                  {...drag}
                  onDragStart={(e) => (trimRef.current ? e.preventDefault() : drag.onDragStart(e))}
                  onClick={() => {
                    onSelect(c.id);
                    player?.seek(seg.start);
                  }}
                  title={`${entry?.text || c.name} — drag to reorder, drag edges to trim`}
                >
                  <div className="trim l" onPointerDown={(e) => startTrim(e, seg, 'start')} />
                  <div className="block-info">
                    {entry && <span className="rank-chip">{formatRank(settings.label.format, entry.rank)}</span>}
                    <span className={`block-label${entry ? '' : ' warn'}`}>{entry ? entry.text : 'No title'}</span>
                    <span className="block-dur mono">{(seg.end - seg.start).toFixed(1)}s{c.muted ? ' · muted' : ''}</span>
                  </div>
                  <div className="trim r" onPointerDown={(e) => startTrim(e, seg, 'end')} />
                </div>
              );
            })}
          </div>
          <div className="music-track">
            {music ? (
              <div className="music-bar" style={{ width: Math.max(40, total * pps) }}>
                ♪ {music.name} · {Math.round(settings.audio.musicVolume * 100)}%
              </div>
            ) : (
              <span className="dim mono">No background music — add one in the Audio tab</span>
            )}
          </div>
          <Playhead player={player} pps={pps} />
        </div>
      </div>
    </div>
  );
}

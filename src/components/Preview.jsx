import { useEffect, useRef, useState } from 'react';
import { Player } from '../player';
import { loadCanvasFonts } from '../media';
import { H, SAFE, W, fmtTime } from '../state';
import { Icon, usePlayerSnap } from './ui';

export default function Preview({ player, setPlayer, clips, settings, music }) {
  const canvasRef = useRef(null);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const p = new Player(canvasRef.current);
    const redraw = () => (p.dirty = true);
    loadCanvasFonts().then(redraw);
    document.fonts.addEventListener('loadingdone', redraw);
    setPlayer(p);
    return () => {
      document.fonts.removeEventListener('loadingdone', redraw);
      p.destroy();
    };
  }, [setPlayer]);

  useEffect(() => {
    player?.setScene({ clips, settings, music });
  }, [player, clips, settings, music]);

  const snap = usePlayerSnap(player);

  return (
    <div className="panel preview">
      <div className="stage">
        <canvas ref={canvasRef} className="canvas" onClick={() => player?.toggle()} />
        {guide && (
          <div
            className="safe-guide"
            style={{ top: `${(SAFE.top / H) * 100}%`, bottom: `${((H - SAFE.bottom) / H) * 100}%`, left: `${(SAFE.side / W) * 100}%`, right: `${(SAFE.side / W) * 100}%` }}
          >
            <span className="mono">Shorts safe area (not in the video)</span>
          </div>
        )}
        {!clips.length && (
          <div className="stage-empty">
            <p>Upload clips, then paste your ranking titles.</p>
            <p className="mono dim">MP4 · MOV · WEBM — everything stays on your device</p>
          </div>
        )}
      </div>
      <div className="transport">
        <input
          className="scrub"
          type="range"
          aria-label="Playhead"
          min={0}
          max={snap.total || 0}
          step={0.01}
          value={Math.min(snap.time, snap.total)}
          onChange={(e) => player?.seek(Number(e.target.value))}
        />
        <div className="transport-row">
          <span className="mono">{fmtTime(snap.time, true)}</span>
          <div className="transport-btns">
            <button className="icon-btn" title="Back 1 second (←)" onClick={() => player?.seek(snap.time - 1)}>{Icon.back}</button>
            <button className="play-btn" title="Play / pause (Space)" disabled={!clips.length} onClick={() => player?.toggle()}>
              {snap.playing ? Icon.pause : Icon.play}
            </button>
            <button className="icon-btn" title="Forward 1 second (→)" onClick={() => player?.seek(snap.time + 1)}>{Icon.fwd}</button>
          </div>
          <div className="transport-right">
            <button className={`chip${guide ? ' on' : ''}`} title="Show where YouTube's buttons and caption cover the video" onClick={() => setGuide(!guide)}>Safe area</button>
            <button className="icon-btn" title={snap.muted ? 'Unmute preview' : 'Mute preview'} onClick={() => player?.setMuted(!snap.muted)}>
              {snap.muted ? Icon.mute : Icon.vol}
            </button>
            <span className="mono dim">{fmtTime(snap.total, true)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

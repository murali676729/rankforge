import { useRef, useState } from 'react';
import { buildSegments, clipLength, formatRank } from '../state';
import { Icon, Section, Toggle, useReorder } from './ui';

export default function LeftPanel({ clips, parsed, settings, set, selectedId, onSelect, onAddFiles, onMove, onRemove, updateClip, player, importing }) {
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);
  const { item, cls } = useReorder(onMove, 'y');
  const segs = buildSegments(clips);
  const keep = settings.audio.keepOriginal;

  return (
    <div className="panel side">
      <div className="side-body">
        <Section title="1 · Upload clips" desc="Pick all your clips at once, with or without sound. Files stay on your computer.">
          <div
            className={`dropzone${over ? ' over' : ''}`}
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              onAddFiles([...e.dataTransfer.files]);
            }}
          >
            {Icon.upload}
            <strong>Drop videos or click to browse</strong>
            <span className="mono dim">MP4 · MOV · WEBM · select several</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,.mov,.mkv"
            multiple
            hidden
            onChange={(e) => {
              onAddFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          {importing > 0 && <p className="mono dim">Importing {importing} file{importing > 1 ? 's' : ''}…</p>}
        </Section>
        <Section
          title="Clip order"
          desc="Clip 1 plays first and gets the first title. Drag or use the arrows to reorder."
          right={<span className="mono dim">{clips.length}</span>}
        >
          {!clips.length && <div className="empty">No clips yet.</div>}
          <ul className="clip-list">
            {clips.map((c, i) => {
              const entry = parsed.entries[i];
              return (
                <li
                  key={c.id}
                  className={`clip-row ${c.id === selectedId ? 'sel' : ''} ${cls(i, clips.length)}`}
                  {...item(i)}
                  onClick={() => {
                    onSelect(c.id);
                    player?.seek(segs[i].start);
                  }}
                  title="Click to preview this clip"
                >
                  <span className="slot mono">{i + 1}</span>
                  <img src={c.thumb} alt="" />
                  <div className="clip-meta">
                    <div className="clip-title">
                      {entry ? (
                        <>
                          <span className="rank-chip">{formatRank(settings.label.format, entry.rank)}</span>
                          <span className="ellipsis">{entry.text || <em className="dim">untitled</em>}</span>
                        </>
                      ) : (
                        <span className="ellipsis warn">No title for this clip</span>
                      )}
                    </div>
                    <span className="mono dim ellipsis">
                      {clipLength(c).toFixed(1)}s · {c.hasAudio === false ? 'no audio' : c.muted || !keep ? 'muted' : 'sound on'} · {c.name}
                    </span>
                  </div>
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    {c.hasAudio !== false && (
                      <button className={`icon-btn${c.muted ? ' on' : ''}`} title={c.muted ? 'Unmute clip' : 'Mute clip'} disabled={!keep} onClick={() => updateClip(c.id, { muted: !c.muted })}>
                        {c.muted ? Icon.mute : Icon.vol}
                      </button>
                    )}
                    <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => onMove(i, i - 1)}>{Icon.up}</button>
                    <button className="icon-btn" title="Move down" disabled={i === clips.length - 1} onClick={() => onMove(i, i + 1)}>{Icon.down}</button>
                    <button className="icon-btn" title="Remove" onClick={() => onRemove(c.id)}>{Icon.x}</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {clips.length > 0 && (
            <div className="row">
              <span>Keep original clip audio</span>
              <Toggle checked={keep} onChange={(v) => set('audio.keepOriginal', v)} label={keep ? 'On' : 'Muted'} />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

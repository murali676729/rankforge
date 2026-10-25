import { useRef, useState } from 'react';
import { ANIMS, FONTS, buildSegments, clamp, clipLength, titleHighlights } from '../state';
import { EXAMPLE, renumber } from '../parse';
import { Color, Field, Icon, Section, Seg, Slider, Toggle } from './ui';

// Text input that keeps what you type (trailing spaces included) while focused, even though the
// committed value is normalised by the parser on every keystroke.
function DraftInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      {...rest}
      className={`input ${rest.className || ''}`}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(e.target.value);
      }}
    />
  );
}

const range = (word, a, b) => (a === b ? `${word} ${a}` : `${word}s ${a}–${b}`);

function Mismatch({ clips, parsed, fixes }) {
  const nc = clips.length;
  const ne = parsed.entries.length;
  if (!nc || !ne || nc === ne) return null;
  return (
    <div className="notice warn-box">
      <strong>{nc} clips but {ne} titles.</strong>
      {nc > ne ? (
        <>
          <span>{range('Clip', ne + 1, nc)} {nc - ne > 1 ? 'have' : 'has'} no title and will play without one.</span>
          <div className="btn-row">
            <button className="btn ghost small" onClick={fixes.addBlankTitles}>Add {nc - ne} blank title{nc - ne > 1 ? 's' : ''}</button>
            <button className="btn ghost small" onClick={fixes.dropExtraClips}>Remove last {nc - ne} clip{nc - ne > 1 ? 's' : ''}</button>
          </div>
        </>
      ) : (
        <>
          <span>{range('Title', nc + 1, ne)} {ne - nc > 1 ? 'have' : 'has'} no clip and won't appear. Upload {ne - nc} more clip{ne - nc > 1 ? 's' : ''}, or:</span>
          <div className="btn-row">
            <button className="btn ghost small" onClick={fixes.dropExtraTitles}>Remove last {ne - nc} title{ne - nc > 1 ? 's' : ''}</button>
          </div>
        </>
      )}
    </div>
  );
}

function TitlesTab({ clips, parsed, setParsed, settings, set, fixes }) {
  const text = settings.script.text;
  const { title, entries, notes } = parsed;
  const setEntry = (i, patch) => setParsed({ title, entries: entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const renum = (dir) => {
    set('script.direction', dir);
    setParsed({ title, entries: renumber(entries, dir) });
  };
  return (
    <>
      <Section title="2 · Paste your ranking titles" desc="Paste the heading and the list. Numbers, “#5”, “5)”, emoji numbers and plain lines all work.">
        <textarea
          className="input script"
          rows={9}
          spellCheck={false}
          value={text}
          placeholder={EXAMPLE}
          onChange={(e) => set('script.text', e.target.value)}
        />
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => set('script.text', EXAMPLE)}>Use example</button>
          <button className="btn ghost small" disabled={!text} onClick={() => set('script.text', '')}>Clear</button>
        </div>
        {notes.map((n, i) => (
          <p key={i} className={`notice ${n.level === 'warn' ? 'warn-box' : 'info-box'}`}>{n.text}</p>
        ))}
        <Mismatch clips={clips} parsed={parsed} fixes={fixes} />
      </Section>
      <Section title="Recognised" desc="Check and fix anything here. Changes show in the preview straight away." right={<span className="mono dim">{entries.length} entries</span>}>
        <Field label="Main title (top of the video)">
          <DraftInput value={title} placeholder="Top 5 …" onCommit={(v) => setParsed({ title: v.trim(), entries })} />
        </Field>
        {!entries.length && <div className="empty">Nothing recognised yet. Paste your list above.</div>}
        {entries.map((e, i) => (
          <div className="rank-edit" key={i}>
            <span className={`slot mono${i >= clips.length ? ' missing' : ''}`} title={i < clips.length ? `Plays on clip ${i + 1}` : 'No clip for this title yet'}>
              {i + 1}
            </span>
            <DraftInput
              className="rank-num"
              inputMode="numeric"
              title="Rank number"
              value={String(e.rank)}
              onCommit={(v) => /^\d{1,3}$/.test(v.trim()) && setEntry(i, { rank: Number(v) })}
            />
            <DraftInput value={e.text} placeholder="Title for this clip" onCommit={(v) => setEntry(i, { text: v.trim() })} />
            <button className="icon-btn" title="Remove entry" onClick={() => setParsed({ title, entries: entries.filter((_, k) => k !== i) })}>{Icon.x}</button>
          </div>
        ))}
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => setParsed({ title, entries: renumber([...entries, { rank: 0, text: '' }], settings.script.direction) })}>
            {Icon.plus} Add entry
          </button>
          <button className="btn ghost small" disabled={!entries.length} onClick={() => renum('down')}>Number {entries.length || 'N'} → 1</button>
          <button className="btn ghost small" disabled={!entries.length} onClick={() => renum('up')}>Number 1 → {entries.length || 'N'}</button>
        </div>
      </Section>
    </>
  );
}

function StyleTab({ parsed, settings, set }) {
  const { title: T, label: L, list: Ls, canvas: C } = settings;
  const words = parsed.title.split(/\s+/).filter(Boolean);
  const hl = titleHighlights(T, parsed.title);
  const toggleWord = (idx) => {
    set('title.highlight', hl.includes(idx) ? hl.filter((x) => x !== idx) : [...hl, idx]);
    set('title.highlightFor', parsed.title);
  };
  const hold = (v, whole) => (v === 0 ? whole : `${v}s`);
  return (
    <>
      <Section title="Main title" desc="Shown at the top. Long titles shrink to fit the Shorts safe area." right={<Toggle checked={T.on} onChange={(v) => set('title.on', v)} />}>
        {words.length > 0 && (
          <>
            <p className="small dim">Tap words to highlight them</p>
            <div className="word-chips">
              {words.map((w, idx) => (
                <button key={idx} className={`word${hl.includes(idx) ? ' on' : ''}`} onClick={() => toggleWord(idx)}>{w}</button>
              ))}
            </div>
          </>
        )}
        <span className="lbl">Font (used for all text)</span>
        <Seg value={T.font} onChange={(v) => set('title.font', v)} options={Object.keys(FONTS).map((k) => ({ value: k, label: k }))} />
        <div className="row">
          <span>UPPERCASE</span>
          <Toggle checked={T.uppercase} onChange={(v) => set('title.uppercase', v)} />
        </div>
        <Slider label="Size" min={40} max={160} value={T.size} onChange={(v) => set('title.size', v)} />
        <Slider label="Position from top" min={0} max={60} value={T.y} onChange={(v) => set('title.y', v)} unit="%" />
        <Slider label="Show for" min={0} max={30} step={0.5} value={T.hold} onChange={(v) => set('title.hold', v)} fmt={(v) => hold(v, 'whole video')} />
        <Color label="Text" value={T.color} onChange={(v) => set('title.color', v)} />
        <Color label="Highlight" value={T.highlightColor} onChange={(v) => set('title.highlightColor', v)} />
        <Color label="Outline (all text)" value={T.outlineColor} onChange={(v) => set('title.outlineColor', v)} />
        <Slider label="Outline width" min={0} max={24} value={T.outline} onChange={(v) => set('title.outline', v)} />
        <div className="row">
          <span>Drop shadow (all text)</span>
          <Toggle checked={T.shadow} onChange={(v) => set('title.shadow', v)} />
        </div>
        <span className="lbl">Intro animation</span>
        <Seg small value={T.anim} onChange={(v) => set('title.anim', v)} options={ANIMS} />
      </Section>
      <Section title="Clip titles" desc="“5. Spider-Man” over each clip, matched by clip order." right={<Toggle checked={L.on} onChange={(v) => set('label.on', v)} />}>
        <div className="row">
          <span>Show rank number</span>
          <Toggle checked={L.withRank} onChange={(v) => set('label.withRank', v)} />
        </div>
        <Field label="Number style ({n} = rank)">
          <input className="input" value={L.format} placeholder="{n}." onChange={(e) => set('label.format', e.target.value)} />
        </Field>
        <Slider label="Size" min={36} max={160} value={L.size} onChange={(v) => set('label.size', v)} />
        <Slider label="Position from top" min={10} max={80} value={L.y} onChange={(v) => set('label.y', v)} unit="%" />
        <Slider label="Show for" min={0} max={15} step={0.5} value={L.hold} onChange={(v) => set('label.hold', v)} fmt={(v) => hold(v, 'whole clip')} />
        <Color label="Text" value={L.color} onChange={(v) => set('label.color', v)} />
        <Color label="Number" value={L.rankColor} onChange={(v) => set('label.rankColor', v)} />
        <span className="lbl">Animation</span>
        <Seg small value={L.anim} onChange={(v) => set('label.anim', v)} options={ANIMS} />
      </Section>
      <Section title="Countdown list" desc="Optional: all numbers on screen, each title fills in when its clip plays." right={<Toggle checked={Ls.on} onChange={(v) => set('list.on', v)} />}>
        {Ls.on && (
          <>
            <Slider label="Size" min={24} max={120} value={Ls.size} onChange={(v) => set('list.size', v)} />
            <Slider label="Position from top" min={5} max={80} value={Ls.y} onChange={(v) => set('list.y', v)} unit="%" />
            <Color label="Text" value={Ls.color} onChange={(v) => set('list.color', v)} />
            <Color label="Playing" value={Ls.activeColor} onChange={(v) => set('list.activeColor', v)} />
          </>
        )}
      </Section>
      <Section title="Video" desc="Vertical 1080×1920 output.">
        <span className="lbl">Clip fit</span>
        <Seg value={C.fit} onChange={(v) => set('canvas.fit', v)} options={[{ value: 'fill', label: 'Fill frame' }, { value: 'fit', label: 'Fit inside' }, { value: 'blur', label: 'Blur fill' }]} />
        <p className="desc">Fill crops landscape footage to 9:16; fit letterboxes it; blur fill puts a blurred copy behind.</p>
        <div className="row">
          <span>Darken top & bottom for readability</span>
          <Toggle checked={C.shade} onChange={(v) => set('canvas.shade', v)} />
        </div>
        <span className="lbl">Transition between clips</span>
        <Seg value={C.transition} onChange={(v) => set('canvas.transition', v)} options={[{ value: 'cut', label: 'Cut' }, { value: 'flash', label: 'Flash' }, { value: 'fade', label: 'Dip to black' }]} />
        <Color label="Background" value={C.bg} onChange={(v) => set('canvas.bg', v)} />
      </Section>
    </>
  );
}

function ClipTab({ clips, parsed, setParsed, settings, selectedId, updateClip, player, onMove, onRemove }) {
  const i = clips.findIndex((c) => c.id === selectedId);
  if (i < 0) return <div className="empty pad">Click a clip in the list or on the timeline to trim it or set its volume.</div>;
  const c = clips[i];
  const entry = parsed.entries[i];
  const segStart = buildSegments(clips)[i].start;
  const trim = (patch, cueAt) => {
    player?.cue(cueAt);
    updateClip(c.id, patch);
  };
  const setDuration = (d) => {
    d = clamp(d || 0.25, 0.25, c.duration);
    let ts = c.trimStart;
    if (ts + d > c.duration) ts = c.duration - d;
    trim({ trimStart: ts, trimEnd: ts + d }, segStart);
  };
  return (
    <>
      <Section title={`Clip ${i + 1} of ${clips.length}`} desc={`${c.name} · ${c.width}×${c.height} · ${c.duration.toFixed(2)}s`}>
        {entry ? (
          <Field label={`Title (rank ${entry.rank})`}>
            <DraftInput value={entry.text} onCommit={(v) => setParsed({ ...parsed, entries: parsed.entries.map((e, k) => (k === i ? { ...e, text: v.trim() } : e)) })} />
          </Field>
        ) : (
          <p className="notice warn-box">This clip has no title. Add more entries in the Titles tab.</p>
        )}
      </Section>
      <Section title="Trim" desc="Drag the clip edges on the timeline, or set exact values here.">
        <Slider label="Start at" min={0} max={c.duration} step={0.05} value={c.trimStart} fmt={(v) => v.toFixed(2)} unit="s"
          onChange={(v) => trim({ trimStart: Math.min(v, c.trimEnd - 0.25) }, segStart)} />
        <Slider label="End at" min={0} max={c.duration} step={0.05} value={c.trimEnd} fmt={(v) => v.toFixed(2)} unit="s"
          onChange={(v) => {
            const te = Math.max(v, c.trimStart + 0.25);
            trim({ trimEnd: te }, segStart + (te - c.trimStart) - 0.04);
          }} />
        <div className="row">
          <span>Duration (s)</span>
          <input className="input num" type="number" min={0.25} max={c.duration} step={0.1} value={Number(clipLength(c).toFixed(2))} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => player?.seek(segStart)}>Preview clip</button>
          <button className="btn ghost small" onClick={() => trim({ trimStart: 0, trimEnd: c.duration }, segStart)}>Reset trim</button>
        </div>
      </Section>
      <Section title="Clip audio" right={c.hasAudio !== false && <Toggle checked={!c.muted} onChange={(v) => updateClip(c.id, { muted: !v })} label={c.muted ? 'Muted' : 'On'} />}>
        {c.hasAudio === false ? (
          <p className="desc">This clip has no audio track.</p>
        ) : (
          <>
            <Slider label="Volume" min={0} max={2} step={0.05} value={c.volume} fmt={(v) => Math.round(v * 100)} unit="%" disabled={c.muted} onChange={(v) => updateClip(c.id, { volume: v })} />
            {!settings.audio.keepOriginal && <p className="desc warn">Original audio is muted for all clips.</p>}
          </>
        )}
      </Section>
      <Section title="Arrange">
        <div className="btn-row">
          <button className="btn ghost small" disabled={i === 0} onClick={() => onMove(i, i - 1)}>Earlier</button>
          <button className="btn ghost small" disabled={i === clips.length - 1} onClick={() => onMove(i, i + 1)}>Later</button>
          <button className="btn ghost small danger" onClick={() => onRemove(c.id)}>Remove clip</button>
        </div>
      </Section>
    </>
  );
}

function AudioTab({ settings, set, music, onMusic, onRemoveMusic }) {
  const A = settings.audio;
  const musicRef = useRef(null);
  return (
    <>
      <Section title="Original audio" desc="Each clip's own sound. Mute single clips from the clip list." right={<Toggle checked={A.keepOriginal} onChange={(v) => set('audio.keepOriginal', v)} label={A.keepOriginal ? 'On' : 'Muted'} />} />
      <Section title="Background music" desc="Optional. Mixed under the clips for the whole video.">
        {music ? (
          <div className="music-card">
            <span className="ellipsis">♪ {music.name}</span>
            <span className="mono dim">{music.duration.toFixed(1)}s</span>
            <button className="icon-btn" title="Remove music" onClick={onRemoveMusic}>{Icon.x}</button>
          </div>
        ) : (
          <button className="btn ghost wide" onClick={() => musicRef.current.click()}>{Icon.plus} Add music (MP3, WAV, M4A…)</button>
        )}
        <input
          ref={musicRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            if (e.target.files[0]) onMusic(e.target.files[0]);
            e.target.value = '';
          }}
        />
        {music && (
          <>
            <Slider label="Music volume" min={0} max={1.5} step={0.05} value={A.musicVolume} onChange={(v) => set('audio.musicVolume', v)} fmt={(v) => Math.round(v * 100)} unit="%" />
            <Slider label="Start song at" min={0} max={Math.max(1, Math.floor(music.duration))} step={0.5} value={A.musicOffset} onChange={(v) => set('audio.musicOffset', v)} unit="s" />
            <Slider label="Fade in" min={0} max={5} step={0.25} value={A.fadeIn} onChange={(v) => set('audio.fadeIn', v)} unit="s" />
            <Slider label="Fade out" min={0} max={5} step={0.25} value={A.fadeOut} onChange={(v) => set('audio.fadeOut', v)} unit="s" />
            <div className="row">
              <span>Loop if shorter than the video</span>
              <Toggle checked={A.loop} onChange={(v) => set('audio.loop', v)} />
            </div>
          </>
        )}
      </Section>
    </>
  );
}

export default function RightPanel(props) {
  const { tab, setTab, parsed, clips } = props;
  const bad = clips.length > 0 && parsed.entries.length !== clips.length;
  return (
    <div className="panel side">
      <div className="tabs">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'titles', label: bad ? 'Titles ⚠' : 'Titles' },
            { value: 'style', label: 'Style' },
            { value: 'clip', label: 'Clip' },
            { value: 'audio', label: 'Audio' },
          ]}
        />
      </div>
      <div className="side-body">
        {tab === 'titles' && <TitlesTab {...props} />}
        {tab === 'style' && <StyleTab {...props} />}
        {tab === 'clip' && <ClipTab {...props} />}
        {tab === 'audio' && <AudioTab {...props} />}
      </div>
    </div>
  );
}

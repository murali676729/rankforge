import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSegments, fmtTime, loadSettings, saveSettings, setIn, totalOf } from './state';
import { makeClip, probeAudio, probeHasAudio, probeVideo } from './media';
import { parsedFor, renumber, serializeRanking } from './parse';
import Preview from './components/Preview';
import Timeline from './components/Timeline';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import ExportDialog from './components/ExportDialog';
import { Icon } from './components/ui';

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)$/i;

export default function App() {
  const [clips, setClips] = useState([]);
  const [settings, setSettings] = useState(loadSettings);
  const [music, setMusic] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [rightTab, setRightTab] = useState('titles');
  const [importing, setImporting] = useState(0);
  const [errors, setErrors] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [player, setPlayer] = useState(null);

  useEffect(() => saveSettings(settings), [settings]);

  const set = useCallback((path, value) => setSettings((s) => setIn(s, path, value)), []);
  const parsed = useMemo(() => parsedFor(settings.script), [settings.script]);
  const total = totalOf(buildSegments(clips));

  // Editing the parsed rows writes canonical text back, so the text box stays the one source of truth.
  const setParsed = useCallback((next) => set('script.text', serializeRanking(next)), [set]);

  const addFiles = useCallback(async (files) => {
    const vids = files.filter((f) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name));
    const skipped = files.filter((f) => !vids.includes(f));
    if (skipped.length) setErrors((e) => [...e, `${skipped.map((f) => f.name).join(', ')}: not a video file, skipped.`]);
    if (!vids.length) return;
    setImporting((n) => n + vids.length);
    const errs = [];
    for (const f of vids) {
      try {
        const [info, hasAudio] = await Promise.all([probeVideo(f), probeHasAudio(f)]);
        const clip = makeClip(f, { ...info, hasAudio });
        setClips((cs) => [...cs, clip]);
      } catch (e) {
        errs.push(e.message);
      }
      setImporting((n) => n - 1);
    }
    if (errs.length) setErrors((e) => [...e, ...errs]);
  }, []);

  const updateClip = useCallback((id, patch) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))), []);

  const move = useCallback((from, to) => {
    setClips((cs) => {
      if (to < 0 || to >= cs.length || from === to) return cs;
      const next = [...cs];
      const [c] = next.splice(from, 1);
      next.splice(to, 0, c);
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setClips((cs) => cs.filter((c) => c.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  // Fixes offered when the clip count and the title count disagree.
  const fixes = useMemo(
    () => ({
      dropExtraClips: () => setClips((cs) => cs.slice(0, parsed.entries.length)),
      dropExtraTitles: () => setParsed({ ...parsed, entries: parsed.entries.slice(0, clips.length) }),
      addBlankTitles: () => {
        const blanks = Array.from({ length: clips.length - parsed.entries.length }, () => ({ rank: 0, text: '' }));
        setParsed({ ...parsed, entries: renumber([...parsed.entries, ...blanks], settings.script.direction) });
      },
    }),
    [parsed, clips.length, setParsed, settings.script.direction],
  );

  const onMusic = async (file) => {
    try {
      setMusic(await probeAudio(file));
    } catch (e) {
      setErrors((x) => [...x, e.message]);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (exportOpen || e.target.closest('input, textarea, select, button')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        player?.toggle();
      } else if (e.key === 'ArrowLeft') player?.seek(player.time - (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowRight') player?.seek(player.time + (e.shiftKey ? 5 : 1));
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) remove(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, selectedId, remove, exportOpen]);

  // Dev/test hook so automated checks can feed generated clips in.
  useEffect(() => {
    if (import.meta.env.DEV) window.__rankforge = { addFiles, onMusic, player, clips, settings };
  });

  const steps = [
    { label: 'Upload clips', done: clips.length > 0 },
    { label: 'Paste titles', done: parsed.entries.length > 0 },
    { label: 'Preview', done: clips.length > 0 && parsed.entries.length === clips.length },
    { label: 'Export', done: false },
  ];

  const shared = {
    clips, parsed, setParsed, settings, set, updateClip, selectedId, onSelect: setSelectedId, onAddFiles: addFiles,
    onMove: move, onRemove: remove, fixes, player, importing, music, onMusic, onRemoveMusic: () => setMusic(null),
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">R</span>
          <strong>RankForge</strong>
        </div>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.label} className={s.done ? 'done' : ''}><span>{s.done ? '✓' : i + 1}</span>{s.label}</li>
          ))}
        </ol>
        <p className="mono dim stats">{clips.length} clips · {fmtTime(total)} · 1080×1920</p>
        <button className="btn primary" disabled={!clips.length} onClick={() => setExportOpen(true)}>{Icon.export} Export MP4</button>
      </header>
      {errors.length > 0 && (
        <div className="errors">
          {errors.map((e, i) => <span key={i}>{e}</span>)}
          <button className="icon-btn" title="Dismiss" onClick={() => setErrors([])}>{Icon.x}</button>
        </div>
      )}
      <main className="work">
        <LeftPanel {...shared} />
        <Preview player={player} setPlayer={setPlayer} clips={clips} settings={settings} music={music} />
        <RightPanel {...shared} tab={rightTab} setTab={setRightTab} />
      </main>
      <Timeline {...shared} />
      {exportOpen && <ExportDialog clips={clips} parsed={parsed} settings={settings} music={music} player={player} onClose={() => setExportOpen(false)} />}
    </div>
  );
}

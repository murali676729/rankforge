import { useEffect, useRef, useState } from 'react';
import { FPS, buildSegments, fmtTime, totalOf } from '../state';
import { renderMp4 } from '../exporter';
import { Icon } from './ui';

export default function ExportDialog({ clips, parsed, settings, music, player, onClose }) {
  const [st, setSt] = useState({ status: 'idle' });
  const cancelRef = useRef(false);
  const total = totalOf(buildSegments(clips));

  useEffect(() => () => st.url && URL.revokeObjectURL(st.url), [st.url]);

  const start = async () => {
    player?.pause();
    cancelRef.current = false;
    const t0 = performance.now();
    setSt({ status: 'rendering', stage: 'Preparing', p: 0, t0 });
    try {
      const res = await renderMp4(
        { clips, settings, music },
        {
          onProgress: (stage, p) => setSt((s) => ({ ...s, stage, p })),
          isCancelled: () => cancelRef.current,
        },
      );
      setSt({ status: 'done', url: URL.createObjectURL(res.blob), size: res.blob.size, secs: (performance.now() - t0) / 1000, codecs: `${res.videoCodec} + ${res.audioCodec}` });
    } catch (e) {
      setSt(cancelRef.current ? { status: 'idle' } : { status: 'error', error: e.message || String(e) });
    }
  };

  const busy = st.status === 'rendering';
  const elapsed = busy ? (performance.now() - st.t0) / 1000 : 0;
  const eta = busy && st.stage === 'Rendering frames' && st.p > 0.02 ? (elapsed / st.p) * (1 - st.p) : null;
  const slug = parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const fileName = `${slug || 'ranking-short'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`;
  const ne = parsed.entries.length;
  const warning = !ne
    ? 'No ranking titles yet: the video will have no clip titles.'
    : ne !== clips.length
      ? `${clips.length} clips but ${ne} titles: ${clips.length > ne ? `clip${clips.length - ne > 1 ? `s ${ne + 1}–` : ' '}${clips.length} will have no title` : `title${ne - clips.length > 1 ? `s ${clips.length + 1}–` : ' '}${ne} will be left out`}.`
      : null;

  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export MP4</h2>
          {!busy && <button className="icon-btn" onClick={onClose}>{Icon.x}</button>}
        </div>
        <dl className="specs">
          <dt>Canvas</dt><dd>1080 × 1920 vertical</dd>
          <dt>Frame rate</dt><dd>{FPS} fps</dd>
          <dt>Codec</dt><dd>H.264 + AAC in MP4</dd>
          <dt>Length</dt><dd>{fmtTime(total, true)} · {clips.length} clips</dd>
          {parsed.title && <><dt>Title</dt><dd>{parsed.title}</dd></>}
          <dt>Processing</dt><dd>renders in your browser, nothing is uploaded</dd>
        </dl>
        {warning && st.status !== 'done' && <p className="notice warn-box">{warning} Close this window to fix it, or render anyway.</p>}
        {st.status === 'idle' && (
          <button className="btn primary wide" disabled={!clips.length} onClick={start}>{Icon.export} Render video</button>
        )}
        {busy && (
          <>
            <div className="progress"><div style={{ width: `${Math.round(st.p * 100)}%` }} /></div>
            <p className="mono dim">
              {st.stage} · {Math.round(st.p * 100)}%{eta != null ? ` · ~${Math.ceil(eta)}s left` : ''}
            </p>
            <p className="small dim">Keep this tab in the foreground while rendering.</p>
            <button className="btn ghost wide" onClick={() => (cancelRef.current = true)}>Cancel</button>
          </>
        )}
        {st.status === 'error' && (
          <>
            <p className="desc warn">{st.error}</p>
            <button className="btn primary wide" onClick={start}>Try again</button>
          </>
        )}
        {st.status === 'done' && (
          <>
            <video className="result" src={st.url} controls playsInline />
            <p className="mono dim">
              {(st.size / 1e6).toFixed(1)} MB · rendered in {st.secs.toFixed(0)}s · {st.codecs}
            </p>
            <div className="btn-row">
              <a className="btn primary" href={st.url} download={fileName}>{Icon.export} Download MP4</a>
              <button className="btn ghost" onClick={start}>Render again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

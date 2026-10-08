import { useEffect, useRef, useState } from 'react';
import type { Library } from '../hooks/useLibrary';
import { buildZip, downloadBlob, safeFileName, type ExportOptions } from '../lib/export';
import { plural } from '../lib/format';
import type { Shape } from '../lib/types';
import { ExportFields } from './ExportFields';
import { CloseIcon, DownloadIcon } from './Icons';
import { Progress } from './Progress';
import { btn, check, formLabel, formRow, scrim } from './ui';

interface Props {
  label: string;
  shapes: Shape[];
  library: Library;
  options: ExportOptions;
  onOptionsChange: (patch: Partial<ExportOptions>) => void;
  onClose: () => void;
}

export function ExportDialog({ label, shapes, library, options: o, onOptionsChange, onClose }: Props) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  const included = o.includeHidden ? shapes : shapes.filter((s) => !s.hidden);
  const hiddenCount = shapes.length - shapes.filter((s) => !s.hidden).length;
  const running = progress !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !running && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    setError(undefined);
    abort.current = new AbortController();
    setProgress({ done: 0, total: included.length });
    try {
      const blob = await buildZip(included, library.packById, library.stencilById, o, (done, total) => setProgress({ done, total }), abort.current.signal);
      downloadBlob(blob, `RackLibrary - ${safeFileName(label)}.zip`);
      onClose();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    }
  };

  return (
    <>
      <div className={scrim} onClick={() => !running && onClose()} />
      <div
        className="fixed top-1/2 left-1/2 z-41 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] -translate-1/2 animate-fade overflow-y-auto rounded-xl border border-line bg-surface shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <div className="flex items-center border-b border-line px-4 py-3.5">
          <h2 id="export-title" className="m-0 flex-1 text-base font-bold">
            Export {label}
          </h2>
          <button className={btn({ variant: 'ghost', icon: true })} onClick={onClose} disabled={running} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 p-4">
          <div className="text-fg-subtle">
            {plural(included.length, 'shape')} will be exported to a zip, in folders by vendor, pack and stencil, with a <code>manifest.json</code> listing every
            shape's size and rack units.
          </div>
          <div className={formRow}>
            <span className={formLabel}>Formats</span>
            <label className={check}>
              <input type="checkbox" checked={o.svg} onChange={(e) => onOptionsChange({ svg: e.target.checked })} /> SVG
            </label>
            <label className={check}>
              <input type="checkbox" checked={o.png} onChange={(e) => onOptionsChange({ png: e.target.checked })} /> PNG
            </label>
          </div>
          <ExportFields options={o} onChange={onOptionsChange} showBackground={o.png} />
          {hiddenCount > 0 && (
            <label className={check}>
              <input type="checkbox" checked={o.includeHidden} onChange={(e) => onOptionsChange({ includeHidden: e.target.checked })} /> Include {plural(hiddenCount, 'hidden master')}
            </label>
          )}
          {running && (
            <div role="status">
              <Progress fraction={progress.done / Math.max(1, progress.total)} />
              <div className="mt-1.5 text-fg-subtle">
                Rendering {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
              </div>
            </div>
          )}
          {error && <div className="break-words whitespace-pre-line text-danger">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          {running ? (
            <button className={btn()} onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          ) : (
            <button className={btn()} onClick={onClose}>
              Close
            </button>
          )}
          <button className={btn({ variant: 'primary' })} onClick={start} disabled={running || (!o.svg && !o.png) || !included.length}>
            <DownloadIcon /> Download zip
          </button>
        </div>
      </div>
    </>
  );
}

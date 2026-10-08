import { useEffect, useState } from 'react';
import type { Library } from '../hooks/useLibrary';
import { downloadBlob, exportShapePng, exportShapeSvg, outputSize, safeFileName, type ExportOptions } from '../lib/export';
import { getSvg } from '../lib/db';
import { formatDims, viewLabel } from '../lib/format';
import { MAX_CANVAS_SIDE, RACK_UNIT_IN } from '../lib/svg';
import type { Shape } from '../lib/types';
import { ExportFields } from './ExportFields';
import { ChevronIcon, CloseIcon, CopyIcon, DownloadIcon, LeftIcon, LoaderIcon } from './Icons';
import { useSvgUrl } from './Thumb';
import { btn, formLabel, formRow, hint, scrim } from './ui';

interface Props {
  shape: Shape;
  list: Shape[];
  library: Library;
  options: ExportOptions;
  onOptionsChange: (patch: Partial<ExportOptions>) => void;
  onNavigate: (shape: Shape) => void;
  onClose: () => void;
}

export function ShapeDetail({ shape, list, library, options, onOptionsChange, onNavigate, onClose }: Props) {
  const url = useSvgUrl(shape.id);
  const [busy, setBusy] = useState<'svg' | 'png' | 'copy' | null>(null);
  const [status, setStatus] = useState<string>();
  const index = list.findIndex((s) => s.id === shape.id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;
  const stencil = library.stencilById.get(shape.stencilId);
  const pack = library.packById.get(shape.packId);
  const size = outputSize(shape, options);
  const clamped = Math.max(size.w, size.h) > MAX_CANVAS_SIDE;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev);
      if (e.key === 'ArrowRight' && next) onNavigate(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose, onNavigate]);

  useEffect(() => setStatus(undefined), [shape.id]);

  const run = async (kind: 'svg' | 'png' | 'copy') => {
    setBusy(kind);
    setStatus(undefined);
    try {
      const base = safeFileName(shape.name);
      if (kind === 'svg') downloadBlob(await exportShapeSvg(shape, options), `${base}.svg`);
      if (kind === 'png') downloadBlob(await exportShapePng(shape, options), `${base}.png`);
      if (kind === 'copy') {
        await navigator.clipboard.writeText(await (await exportShapeSvg(shape, options)).text());
        setStatus('SVG markup copied to the clipboard');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const downloadUnscaled = async () => {
    const svg = await getSvg(shape.id);
    if (svg) downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFileName(shape.name)} (unscaled).svg`);
  };

  return (
    <>
      <div className={scrim} onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-41 flex w-[min(760px,100vw)] animate-slide-in flex-col border-l border-line bg-surface shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-label={shape.name}
      >
        <div className="flex items-start gap-2 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] leading-snug font-bold break-words">{shape.name}</h2>
            <div className="mt-0.5 text-[12.5px] text-fg-subtle">
              {pack?.vendor} · {pack?.name} · {stencil?.name}
            </div>
          </div>
          <button className={btn({ variant: 'ghost', icon: true })} onClick={() => prev && onNavigate(prev)} disabled={!prev} aria-label="Previous shape" title="Previous (←)">
            <LeftIcon />
          </button>
          <button className={btn({ variant: 'ghost', icon: true })} onClick={() => next && onNavigate(next)} disabled={!next} aria-label="Next shape" title="Next (→)">
            <ChevronIcon />
          </button>
          <button className={btn({ variant: 'ghost', icon: true })} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-col gap-4.5 overflow-y-auto p-4">
          <div className="checker grid max-h-[46vh] min-h-40 place-items-center overflow-hidden rounded-lg border border-line p-5">
            {url ? <img className="block h-auto max-h-[calc(46vh-40px)] w-full object-contain" src={url} alt={shape.name} /> : <LoaderIcon size={24} />}
          </div>

          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-fg-subtle">
            {shape.prompt && (
              <>
                <dt>Description</dt>
                <dd>{shape.prompt}</dd>
              </>
            )}
            <dt>Size</dt>
            <dd>
              {formatDims(shape)} ({formatDims(shape, 'mm')}){' '}
              <span className="text-fg-subtle">{shape.sizeSource === 'stencil' ? '· from the stencil' : '· as drawn (stencil scale unknown)'}</span>
            </dd>
            <dt>Rack units</dt>
            <dd>
              {shape.rackUnits ? `${shape.rackUnits}U` : '—'}
              {shape.sizeSource === 'stencil' && !shape.rackUnits ? <span className="text-fg-subtle"> ({(shape.heightIn / RACK_UNIT_IN).toFixed(2)} × 1.75″)</span> : null}
            </dd>
            {viewLabel(shape.view) && (
              <>
                <dt>View</dt>
                <dd>{viewLabel(shape.view)}</dd>
              </>
            )}
            <dt>Source file</dt>
            <dd>
              {stencil?.fileName}
              {pack?.sourceUrl ? (
                <>
                  {' '}
                  ·{' '}
                  <a href={pack.sourceUrl} target="_blank" rel="noreferrer">
                    download link
                  </a>
                </>
              ) : null}
            </dd>
          </dl>

          <section className="flex flex-col gap-3 rounded-lg border border-line p-3.5" aria-label="Export">
            <h3 className="m-0 text-sm font-bold">Export</h3>
            <ExportFields options={options} onChange={onOptionsChange} />
            <div className={formRow}>
              <span className={formLabel}>Output</span>
              <span className={hint}>
                {Math.round(size.w)} × {Math.round(size.h)} px{clamped ? ` (PNG capped at ${MAX_CANVAS_SIDE}px)` : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btn({ variant: 'primary' })} onClick={() => run('png')} disabled={!!busy}>
                {busy === 'png' ? <LoaderIcon /> : <DownloadIcon />} PNG
              </button>
              <button className={btn({ variant: 'primary' })} onClick={() => run('svg')} disabled={!!busy}>
                {busy === 'svg' ? <LoaderIcon /> : <DownloadIcon />} SVG
              </button>
              <button className={btn()} onClick={() => run('copy')} disabled={!!busy}>
                <CopyIcon /> Copy SVG
              </button>
              <button className={btn({ variant: 'ghost' })} onClick={downloadUnscaled} title="The cropped SVG without any resizing">
                Unscaled SVG
              </button>
            </div>
            {status && (
              <div className={hint} role="status">
                {status}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}

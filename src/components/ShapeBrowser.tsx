import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Library } from '../hooks/useLibrary';
import { formatDims, plural, viewLabel } from '../lib/format';
import type { Shape } from '../lib/types';
import { CheckIcon, DownloadIcon, SearchIcon } from './Icons';
import { Thumb } from './Thumb';
import { badge, btn, check, chip, chips, input, page, pageHeader, pageSub, pageTitle } from './ui';

type ViewFilter = 'all' | 'front' | 'rear' | 'other';
type SortKey = 'library' | 'name' | 'height';

const PAGE = 240;

const SIZE_SOURCE_TITLE: Record<Shape['sizeSource'], string> = {
  stencil: 'Real-world size from the stencil',
  estimated: 'Real-world size estimated from a standard rack width',
  drawing: 'Size as drawn in the stencil (scale unknown)',
};

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  shapes: Shape[];
  library: Library;
  showStencil: boolean;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpen: (shape: Shape, list: Shape[]) => void;
  onExport: (shapes: Shape[], label: string) => void;
}

export function ShapeBrowser({ title, subtitle, actions, shapes, library, showStencil, selected, onSelectedChange, onOpen, onExport }: Props) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewFilter>('all');
  const [rackOnly, setRackOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<SortKey>('library');
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let list = shapes.filter((s) => {
      if (!showHidden && s.hidden) return false;
      if (rackOnly && !s.rackUnits) return false;
      if (view === 'front' && s.view !== 'front') return false;
      if (view === 'rear' && s.view !== 'rear') return false;
      if (view === 'other' && (s.view === 'front' || s.view === 'rear')) return false;
      if (!terms.length) return true;
      const stencil = library.stencilById.get(s.stencilId);
      const pack = library.packById.get(s.packId);
      const hay = `${s.name} ${s.prompt ?? ''} ${stencil?.name ?? ''} ${pack?.name ?? ''} ${pack?.vendor ?? ''} ${s.rackUnits ? `${s.rackUnits}u` : ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (sort === 'height') list = [...list].sort((a, b) => (a.rackUnits ?? 99) - (b.rackUnits ?? 99) || a.heightIn - b.heightIn);
    return list;
  }, [shapes, query, view, rackOnly, showHidden, sort, library.stencilById, library.packById]);

  useEffect(() => setLimit(PAGE), [query, view, rackOnly, showHidden, sort, shapes]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, limit]);

  const hiddenCount = useMemo(() => shapes.filter((s) => s.hidden).length, [shapes]);
  const selecting = selected.size > 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  return (
    <div className={page}>
      <div className={pageHeader}>
        <div>
          <h1 className={pageTitle}>{title}</h1>
          <div className={pageSub}>
            {subtitle ?? null}
            {subtitle ? ' · ' : ''}
            {filtered.length === shapes.length ? plural(shapes.length, 'shape') : `${filtered.length.toLocaleString()} of ${plural(shapes.length, 'shape')}`}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {actions}
          <button className={btn({ variant: 'primary' })} onClick={() => onExport(filtered, title)} disabled={!filtered.length}>
            <DownloadIcon /> Export {filtered.length === shapes.length ? 'all' : 'filtered'} as zip
          </button>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <label className="relative flex max-w-[420px] flex-[1_1_260px] items-center">
          <SearchIcon className="pointer-events-none absolute left-2.5 text-fg-subtle" />
          <span className="sr-only">Search shapes</span>
          <input className={`${input} w-full pl-8`} type="search" placeholder="Search by model, description, stencil…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className={chips} role="group" aria-label="View">
          {(['all', 'front', 'rear', 'other'] as ViewFilter[]).map((v) => (
            <button key={v} className={chip} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'all' ? 'All views' : v === 'other' ? 'Other' : viewLabel(v)}
            </button>
          ))}
        </div>
        <label className={check} title="Only shapes whose size (or name) identifies them as 19-inch rack equipment">
          <input type="checkbox" checked={rackOnly} onChange={(e) => setRackOnly(e.target.checked)} /> Rack units only
        </label>
        {hiddenCount > 0 && (
          <label className={check} title="Hidden masters are helper shapes the stencil author hid from Visio's shape list">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden ({hiddenCount})
          </label>
        )}
        <label className={check}>
          Sort
          <select className={input} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="library">Stencil order</option>
            <option value="name">Name</option>
            <option value="height">Height (U)</option>
          </select>
        </label>
      </div>

      {selecting && (
        <div className="sticky top-0 z-5 -mt-1 mb-3.5 flex flex-wrap items-center gap-2.5 rounded-lg bg-accent-soft px-3 py-2 font-semibold text-accent">
          <span>{plural(selected.size, 'shape')} selected</span>
          <button className={btn({ size: 'sm' })} onClick={() => onSelectedChange(new Set([...selected, ...filtered.map((s) => s.id)]))}>
            Select all {filtered.length.toLocaleString()}
          </button>
          <button className={btn({ size: 'sm', variant: 'ghost' })} onClick={() => onSelectedChange(new Set())}>
            Clear
          </button>
          <span className="flex-1" />
          <button className={btn({ size: 'sm', variant: 'primary' })} onClick={() => onExport(library.shapes.filter((s) => selected.has(s.id)), 'Selection')}>
            <DownloadIcon size={14} /> Export selected
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="my-12 text-center text-fg-muted">No shapes match these filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {filtered.slice(0, limit).map((s) => {
              const isSelected = selected.has(s.id);
              const stencil = library.stencilById.get(s.stencilId);
              const sub = showStencil && stencil ? stencil.name : s.prompt;
              return (
                <div
                  key={s.id}
                  className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface text-left transition hover:shadow-card ${isSelected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong'}`}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey || selecting ? toggle(s.id) : onOpen(s, filtered))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpen(s, filtered);
                    if (e.key === ' ') {
                      e.preventDefault();
                      toggle(s.id);
                    }
                  }}
                >
                  <Thumb shapeId={s.id} alt={s.name} />
                  <button
                    className={`absolute top-2 left-2 grid size-5.5 cursor-pointer place-items-center rounded-[5px] border text-on-accent transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${isSelected ? 'border-accent bg-accent opacity-100' : `border-line-strong bg-surface ${selecting ? 'opacity-100' : 'opacity-0'}`}`}
                    aria-label={isSelected ? `Deselect ${s.name}` : `Select ${s.name}`}
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(s.id);
                    }}
                  >
                    {isSelected && <CheckIcon size={14} strokeWidth={3} />}
                  </button>
                  <div className="flex min-w-0 flex-col gap-1 border-t border-line px-2.5 pt-2 pb-2.5">
                    <div className="line-clamp-2 text-[13px] leading-snug font-semibold break-words" title={s.name}>
                      {s.name}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      {s.rackUnits ? <span className={badge('accent')}>{s.rackUnits}U</span> : null}
                      {viewLabel(s.view) ? <span className={badge()}>{viewLabel(s.view)}</span> : null}
                      <span className="truncate text-xs text-fg-subtle" title={SIZE_SOURCE_TITLE[s.sizeSource]}>
                        {formatDims(s)}
                      </span>
                    </div>
                    {sub ? (
                      <div className="truncate text-xs text-fg-subtle" title={sub}>
                        {sub}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {limit < filtered.length && (
            <div className="flex justify-center p-5" ref={sentinel}>
              <button className={btn()} onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({(filtered.length - limit).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { isArchived, useCatalog } from '../catalog';
import type { Library } from '../hooks/useLibrary';
import { Link } from 'react-router';
import { routePath } from '../hooks/useRoute';
import type { Settings } from '../hooks/useSettings';
import { formatBytes, plural } from '../lib/format';
import type { CatalogPack, Pack } from '../lib/types';
import { CheckIcon, ChevronIcon, DownloadIcon, ExternalIcon, InfoIcon, LoaderIcon, SearchIcon } from './Icons';
import { badge, btn, check, input, page, pageHeader, pageSub, pageTitle } from './ui';

interface Props {
  library: Library;
  busyCatalogIds: Set<string>;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onImport: (entry: CatalogPack) => void;
}

interface VendorGroup {
  vendor: string;
  homepage: string;
  source: CatalogPack['source'];
  packs: CatalogPack[];
}

export function CatalogView({ library, busyCatalogIds, settings, onSettingsChange, onImport }: Props) {
  const [query, setQuery] = useState('');
  const [proxyDraft, setProxyDraft] = useState(settings.proxyTemplate);
  const catalogEntries = useCatalog();

  const imported = useMemo(() => {
    const m = new Map<string, Pack>();
    for (const p of library.packs) if (p.catalogId) m.set(p.catalogId, p);
    return m;
  }, [library.packs]);

  const groups = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map<string, VendorGroup>();
    for (const p of catalogEntries) {
      if (settings.hideArchived && isArchived(p) && !imported.has(p.id)) continue;
      const hay = `${p.vendor} ${p.name} ${p.description} ${p.collection ?? ''}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
      const key = `${p.source}:${p.vendor}`;
      if (!map.has(key)) map.set(key, { vendor: p.vendor, homepage: p.homepage, source: p.source, packs: [] });
      map.get(key)!.packs.push(p);
    }
    return [...map.values()].sort((a, b) => (a.source === b.source ? a.vendor.localeCompare(b.vendor) : a.source === 'vendor' ? -1 : 1));
  }, [catalogEntries, query, settings.hideArchived, imported]);

  const total = groups.reduce((n, g) => n + g.packs.length, 0);
  const searching = query.trim().length > 0;

  return (
    <div className={page}>
      <div className={pageHeader}>
        <div>
          <h1 className={pageTitle}>Stencil catalog</h1>
          <div className={pageSub}>
            {plural(total, 'stencil pack')} from {plural(groups.length, 'source')}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-[13px] text-fg-muted">
        <InfoIcon size={18} className="mt-px flex-none text-accent" />
        <div className="space-y-1">
          <p>
            Every pack is fetched from its official download link and converted <b>in your browser</b>. Nothing is uploaded anywhere, and your library is
            stored on this device only.
          </p>
          <p>
            Most stencil hosts don't allow direct downloads from other websites. When that happens, use <b>Download</b> to save the file from the official site,
            then drop it anywhere on this page and it is matched to its catalog entry automatically. Check each vendor's terms before reusing their artwork.
          </p>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <label className="relative flex max-w-[420px] flex-[1_1_260px] items-center">
          <SearchIcon className="pointer-events-none absolute left-2.5 text-fg-subtle" />
          <span className="sr-only">Search catalog</span>
          <input
            className={`${input} w-full pl-8`}
            type="search"
            placeholder="Search vendors and packs, e.g. “switch”, “PDU”, “ProLiant”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className={check}>
          <input type="checkbox" checked={!settings.hideArchived} onChange={(e) => onSettingsChange({ hideArchived: !e.target.checked })} /> Include classic & archived packs
        </label>
      </div>

      {groups.map((g) => (
        <details key={`${g.source}:${g.vendor}`} className="group mb-3 overflow-hidden rounded-lg border border-line bg-surface" open={searching || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 font-semibold">
            <ChevronIcon className="text-fg-subtle transition-transform group-open:rotate-90" />
            <span>{g.vendor}</span>
            <span className="text-[13px] font-normal text-fg-subtle">
              {g.packs.length} {g.source === 'visiocafe' ? 'via VisioCafe' : 'official'}
            </span>
            <a className="ml-auto inline-flex items-center gap-1 text-[13px] font-normal hover:underline" href={g.homepage} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              Source page <ExternalIcon size={12} />
            </a>
          </summary>
          {g.packs.map((p) => {
            const pack = imported.get(p.id);
            const busy = busyCatalogIds.has(p.id);
            return (
              <div className="grid items-center gap-3 border-t border-line px-3.5 py-2.5 md:grid-cols-[minmax(0,1fr)_auto]" key={p.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {p.name}
                    {pack && (
                      <span className={badge('ok')}>
                        <CheckIcon size={12} /> In library
                      </span>
                    )}
                    {p.cors && !pack && (
                      <span className={badge('accent')} title="This host allows direct downloads, so Import works in one click">
                        One-click import
                      </span>
                    )}
                    {isArchived(p) && <span className={badge()}>Archive</span>}
                  </div>
                  <div className="text-[13px] text-fg-muted">{p.description}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2.5 text-xs text-fg-subtle">
                    {p.sizeBytes ? <span>{formatBytes(p.sizeBytes)}</span> : null}
                    {p.updated ? <span>Updated {p.updated}</span> : null}
                    {p.collection ? <span>{p.collection}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  {pack && (
                    <Link className={btn({ size: 'sm', variant: 'ghost' })} to={routePath({ page: 'library', packId: pack.id })}>
                      View {pack.shapeCount}
                    </Link>
                  )}
                  <a className={btn({ size: 'sm' })} href={p.url} target="_blank" rel="noreferrer" title="Download the original file from the official site">
                    <DownloadIcon size={14} /> Download
                  </a>
                  <button className={btn({ size: 'sm', variant: pack ? 'default' : 'primary' })} onClick={() => onImport(p)} disabled={busy}>
                    {busy ? <LoaderIcon size={14} /> : null} {pack ? 'Re-import' : 'Import'}
                  </button>
                </div>
              </div>
            );
          })}
        </details>
      ))}

      {groups.length === 0 && <p className="my-12 text-center text-fg-muted">No catalog entries match “{query}”.</p>}

      <details className="mt-6 rounded-lg border border-line bg-surface px-3.5 py-1 text-[13px] text-fg-muted">
        <summary className="cursor-pointer py-2 font-semibold text-fg">Advanced: CORS proxy</summary>
        <p>
          To make <b>Import</b> work in one click for hosts that block cross-site downloads, you can route downloads through a CORS proxy you run yourself (for
          example a small Cloudflare Worker). Use <code>{'{url}'}</code> where the encoded download URL should go. Leave empty to disable.
        </p>
        <div className="mt-2 mb-3 flex gap-2">
          <input
            className={`${input} flex-1 font-mono text-[12.5px]`}
            placeholder="https://your-proxy.example/?url={url}"
            value={proxyDraft}
            onChange={(e) => setProxyDraft(e.target.value)}
          />
          <button className={btn()} onClick={() => onSettingsChange({ proxyTemplate: proxyDraft.trim() })} disabled={proxyDraft.trim() === settings.proxyTemplate}>
            Save
          </button>
        </div>
      </details>
    </div>
  );
}

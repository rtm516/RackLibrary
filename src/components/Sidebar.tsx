import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useCatalog } from '../catalog';
import type { Library } from '../hooks/useLibrary';
import { routePath, type Route } from '../hooks/useRoute';
import { clearLibrary, storageEstimate } from '../lib/db';
import { formatBytes } from '../lib/format';
import type { Pack } from '../lib/types';
import { ChevronIcon, GlobeIcon, LibraryIcon } from './Icons';

interface Props {
  library: Library;
  route: Route;
  open: boolean;
  onNavigate: () => void;
}

const navItem =
  'flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13.5px] text-fg no-underline hover:bg-surface-2 hover:no-underline aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent';
const label = 'min-w-0 flex-1 truncate';
const count = 'text-xs text-fg-subtle tabular-nums';

function NavLink({ to, active, title, onClick, children }: { to: string; active: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <Link className={navItem} to={to} aria-current={active ? 'page' : undefined} title={title} onClick={onClick}>
      {children}
    </Link>
  );
}

export function Sidebar({ library, route, open, onNavigate }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<string>();
  const catalog = useCatalog();

  const vendors = useMemo(() => {
    const m = new Map<string, Pack[]>();
    for (const p of library.packs) {
      if (!m.has(p.vendor)) m.set(p.vendor, []);
      m.get(p.vendor)!.push(p);
    }
    return [...m.entries()];
  }, [library.packs]);

  const stencilsByPack = useMemo(() => {
    const m = new Map<string, Library['stencils']>();
    for (const s of library.stencils) {
      if (!m.has(s.packId)) m.set(s.packId, []);
      m.get(s.packId)!.push(s);
    }
    return m;
  }, [library.stencils]);

  const packId = route.page === 'library' ? route.packId : undefined;
  const stencilId = route.page === 'library' ? route.stencilId : undefined;

  // Keep the pack containing the current stencil expanded.
  const activePackId = packId ?? (stencilId && library.stencilById.get(stencilId)?.packId);
  useEffect(() => {
    if (activePackId) setExpanded((e) => (e.has(activePackId) ? e : new Set(e).add(activePackId)));
  }, [activePackId]);

  useEffect(() => {
    storageEstimate().then((e) => setUsage(e && e.usage ? `${formatBytes(e.usage)} used on this device` : undefined));
  }, [library.shapes]);

  const toggle = (id: string) =>
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav
      aria-label="Library"
      className={`fixed top-14 bottom-0 left-0 z-35 flex w-[min(300px,86vw)] min-h-0 flex-col overflow-y-auto border-r border-line bg-surface shadow-pop transition-transform md:static md:z-auto md:w-auto md:translate-x-0 md:shadow-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="px-2.5 pt-3 pb-1">
        <NavLink to={routePath({ page: 'library' })} active={route.page === 'library' && !packId && !stencilId} onClick={onNavigate}>
          <LibraryIcon />
          <span className={label}>All shapes</span>
          <span className={count}>{library.shapes.length.toLocaleString()}</span>
        </NavLink>
        <NavLink to={routePath({ page: 'catalog' })} active={route.page === 'catalog'} onClick={onNavigate}>
          <GlobeIcon />
          <span className={label}>Stencil catalog</span>
          <span className={count}>{catalog.length || ''}</span>
        </NavLink>
      </div>

      <div className="px-2.5 pt-3 pb-1">
        <div className="px-2 pt-1 pb-1.5 text-[11.5px] font-bold tracking-wider text-fg-subtle uppercase">My library</div>
        {vendors.length === 0 && <div className="px-2 pb-2 text-[13px] text-fg-subtle">Nothing imported yet. Pick packs from the catalog or drop stencil files anywhere.</div>}
        {vendors.map(([vendor, packs]) => (
          <div key={vendor}>
            <div className="px-2 pt-2 pb-0.5 text-[12.5px] font-semibold text-fg-muted">{vendor}</div>
            {packs.map((p) => {
              const stencils = stencilsByPack.get(p.id) ?? [];
              const isOpen = expanded.has(p.id);
              const single = stencils.length <= 1;
              return (
                <div key={p.id}>
                  <div className={`${navItem} pl-0.5`} aria-current={packId === p.id ? 'page' : undefined}>
                    <button
                      className={`grid size-5 flex-none cursor-pointer place-items-center rounded text-fg-subtle hover:bg-surface-3 ${single ? 'invisible' : ''}`}
                      onClick={() => toggle(p.id)}
                      aria-label={isOpen ? `Collapse ${p.name}` : `Expand ${p.name}`}
                      aria-expanded={isOpen}
                    >
                      <ChevronIcon size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                    <Link className={`${label} text-inherit no-underline hover:no-underline`} to={routePath({ page: 'library', packId: p.id })} onClick={onNavigate} title={p.name}>
                      {p.name}
                    </Link>
                    <span className={count}>{p.shapeCount.toLocaleString()}</span>
                  </div>
                  {isOpen && !single && (
                    <div className="pl-3.5">
                      {stencils.map((s) => (
                        <NavLink key={s.id} to={routePath({ page: 'library', stencilId: s.id })} active={stencilId === s.id} title={s.name} onClick={onNavigate}>
                          <span className={label}>{s.name}</span>
                          <span className={count}>{s.shapeCount}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line px-4.5 py-3 text-xs text-fg-subtle">
        <span className="flex-1">{usage ?? 'Stored locally in your browser'}</span>
        {usage && (
          <button
            className="cursor-pointer text-fg-subtle underline-offset-2 hover:text-danger hover:underline"
            onClick={async () => {
              if (!confirm('Delete your whole local library? Imported stencils and shapes will be removed from this browser.')) return;
              await clearLibrary();
              await library.reload();
            }}
          >
            Clear
          </button>
        )}
      </div>
    </nav>
  );
}

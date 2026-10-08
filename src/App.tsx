import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CatalogView } from './components/CatalogView';
import { ExportDialog } from './components/ExportDialog';
import { GitHubIcon, GlobeIcon, MenuIcon, MonitorIcon, MoonIcon, RackIcon, SunIcon, TrashIcon, UploadIcon } from './components/Icons';
import { ImportQueue } from './components/ImportQueue';
import { ShapeBrowser } from './components/ShapeBrowser';
import { ShapeDetail } from './components/ShapeDetail';
import { Sidebar } from './components/Sidebar';
import { badge, btn, page, scrim } from './components/ui';
import { useImports } from './hooks/useImports';
import { useLibrary } from './hooks/useLibrary';
import { routePath, useRoute } from './hooks/useRoute';
import { useSettings } from './hooks/useSettings';
import { deletePack } from './lib/db';
import { plural } from './lib/format';
import { CONVERTER_VERSION } from './lib/importer';
import type { Shape } from './lib/types';

const ACCEPT = '.zip,.vss,.vssx,.vssm,.vsd,.vsdx,.vsdm';
const REPO_URL = 'https://github.com/rtm516/RackLibrary';

export default function App() {
  const library = useLibrary();
  const { settings, update: updateSettings, updateExport } = useSettings();
  const [route, navigate] = useRoute();
  const imports = useImports(library.reload, settings.proxyTemplate);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ shape: Shape; list: Shape[] } | null>(null);
  const [exporting, setExporting] = useState<{ shapes: Shape[]; label: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Drop stencil files (or a downloaded catalog zip) anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) imports.importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [imports.importFiles]);

  // The slide-out navigation (narrow screens) closes on Escape too.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const packId = route.page === 'library' ? route.packId : undefined;
  const stencilId = route.page === 'library' ? route.stencilId : undefined;

  const scope = useMemo(() => {
    if (stencilId) {
      const stencil = library.stencilById.get(stencilId);
      if (stencil) {
        const pack = library.packById.get(stencil.packId);
        return { title: stencil.name, subtitle: `${pack?.vendor} · ${pack?.name}`, shapes: library.shapes.filter((s) => s.stencilId === stencil.id), pack, showStencil: false };
      }
    }
    if (packId) {
      const pack = library.packById.get(packId);
      if (pack) {
        const stale = (pack.converterVersion ?? 0) < CONVERTER_VERSION;
        const subtitle = (
          <>
            {pack.vendor} · {plural(pack.stencilCount, 'stencil')}
            {stale && (
              <span
                className={`${badge('warn')} ml-2`}
                title="The converter has improved since this pack was imported. Import it again (from the catalog, or by dropping the file) and the new import replaces this one."
              >
                Re-import for the latest conversion fixes
              </span>
            )}
          </>
        );
        return { title: pack.name, subtitle, shapes: library.shapes.filter((s) => s.packId === pack.id), pack, showStencil: pack.stencilCount > 1 };
      }
    }
    return { title: 'All shapes', subtitle: plural(library.packs.length, 'pack'), shapes: library.shapes, pack: undefined, showStencil: true };
  }, [packId, stencilId, library.shapes, library.packs.length, library.packById, library.stencilById]);

  const removePack = async (id: string, name: string) => {
    if (!confirm(`Remove “${name}” and all of its shapes from your library?`)) return;
    await deletePack(id);
    setSelected(new Set());
    navigate({ page: 'library' });
    await library.reload();
  };

  const theme = settings.theme;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';

  return (
    <div className="grid h-full grid-rows-[56px_1fr] md:grid-cols-[280px_1fr]">
      <header className="col-span-full flex min-w-0 items-center gap-2 border-b border-line bg-surface px-3 md:gap-3 md:px-4">
        <button className={`${btn({ variant: 'ghost', icon: true })} md:hidden`} onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          <MenuIcon />
        </button>
        <Link className="flex min-w-0 items-center gap-2.5 text-base font-bold whitespace-nowrap text-fg no-underline" to={routePath({ page: 'library' })}>
          <span className="grid size-7 flex-none place-items-center rounded-[7px] bg-accent text-on-accent">
            <RackIcon size={18} />
          </span>
          RackLibrary
        </Link>
        <span className="flex-1" />
        <button className={btn({ variant: 'primary' })} onClick={() => fileInput.current?.click()}>
          <UploadIcon /> <span className="max-md:hidden">Upload stencils</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) imports.importFiles(files);
            e.target.value = '';
          }}
        />
        <a className={btn({ variant: 'ghost', icon: true })} href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub">
          <GitHubIcon />
        </a>
        <button
          className={btn({ variant: 'ghost', icon: true })}
          onClick={() => updateSettings({ theme: nextTheme })}
          aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}
          title={`Theme: ${theme === 'system' ? 'match system' : theme}`}
        >
          {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <MonitorIcon />}
        </button>
      </header>

      {menuOpen && <div className={`${scrim} top-14 z-30 md:hidden`} onClick={() => setMenuOpen(false)} />}
      <Sidebar library={library} route={route} open={menuOpen} onNavigate={() => setMenuOpen(false)} />

      <main className="min-h-0 min-w-0 overflow-y-auto">
        {route.page === 'catalog' ? (
          <CatalogView library={library} busyCatalogIds={imports.busyCatalogIds} settings={settings} onSettingsChange={updateSettings} onImport={imports.importCatalog} />
        ) : library.loading ? null : library.shapes.length === 0 ? (
          <Welcome onUpload={() => fileInput.current?.click()} error={library.error} />
        ) : (
          <ShapeBrowser
            key={`${packId ?? ''}${stencilId ?? ''}`}
            title={scope.title}
            subtitle={scope.subtitle}
            shapes={scope.shapes}
            library={library}
            showStencil={scope.showStencil}
            selected={selected}
            onSelectedChange={setSelected}
            onOpen={(shape, list) => setDetail({ shape, list })}
            onExport={(shapes, label) => setExporting({ shapes, label })}
            actions={
              scope.pack ? (
                <>
                  {scope.pack.sourceUrl && (
                    <a className={btn()} href={scope.pack.sourceUrl} target="_blank" rel="noreferrer">
                      Original download
                    </a>
                  )}
                  <button className={btn({ variant: 'danger' })} onClick={() => removePack(scope.pack!.id, scope.pack!.name)}>
                    <TrashIcon /> Remove
                  </button>
                </>
              ) : null
            }
          />
        )}
      </main>

      {detail && (
        <ShapeDetail
          shape={detail.shape}
          list={detail.list}
          library={library}
          options={settings.exportOptions}
          onOptionsChange={updateExport}
          onNavigate={(shape) => setDetail((d) => (d ? { ...d, shape } : d))}
          onClose={() => setDetail(null)}
        />
      )}

      {exporting && (
        <ExportDialog
          label={exporting.label}
          shapes={exporting.shapes}
          library={library}
          options={settings.exportOptions}
          onOptionsChange={updateExport}
          onClose={() => setExporting(null)}
        />
      )}

      <ImportQueue jobs={imports.jobs} onDismiss={imports.dismiss} onResume={imports.resumeWithFile} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-60 grid animate-fade place-items-center bg-accent/12">
          <div className="rounded-2xl border-2 border-dashed border-accent bg-surface px-12 py-9 text-center text-base font-semibold text-accent shadow-pop">
            Drop to import
            <div className="mt-1 text-[13px] font-normal text-fg-subtle">.vss, .vssx, .vsd, .vsdx or a .zip of them</div>
          </div>
        </div>
      )}
    </div>
  );
}

const STEPS = [
  ['1. Add stencils', 'Import from the catalog of official vendor downloads, or drop your own .vss / .vssx / .zip files.'],
  ['2. Browse', 'Search by model, filter front/rear views and rack-mount gear. Heights in U are detected automatically.'],
  ['3. Export', 'Download single images as SVG or PNG at a consistent real-world scale, or everything as a zip.'],
];

function Welcome({ onUpload, error }: { onUpload: () => void; error?: string }) {
  return (
    <div className={page}>
      <div className="mx-auto my-12 max-w-[640px] text-center text-fg-muted">
        <RackIcon size={48} strokeWidth={1.5} className="mx-auto text-fg-subtle" />
        <h2 className="mt-3 mb-1.5 text-xl font-bold text-fg">Rack elevation images from Visio stencils</h2>
        <p>
          Turn vendor Visio stencils into clean SVG and PNG images of switches, servers, firewalls, PDUs and more. Conversion happens entirely in your browser.
        </p>
        {error && <p className="mt-2 text-danger">Could not open the local library: {error}</p>}
        <div className="mt-4.5 flex flex-wrap justify-center gap-2">
          <Link className={btn({ variant: 'primary' })} to={routePath({ page: 'catalog' })}>
            <GlobeIcon /> Browse the stencil catalog
          </Link>
          <button className={btn()} onClick={onUpload}>
            <UploadIcon /> Upload your own stencils
          </button>
        </div>
        <div className="mt-7 grid gap-3 text-left text-[13px] md:grid-cols-3">
          {STEPS.map(([title, text]) => (
            <div key={title} className="rounded-lg border border-line bg-surface px-3.5 py-3">
              <b className="mb-0.5 block text-fg">{title}</b>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

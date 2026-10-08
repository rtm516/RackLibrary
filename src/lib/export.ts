import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { getSvg } from './db';
import { RACK_UNIT_IN, rasterize, sizedSvg } from './svg';
import type { Pack, Shape, Stencil } from './types';

export type SizeMode = 'ppi' | 'width' | 'height';

export interface ExportOptions {
  svg: boolean;
  png: boolean;
  sizeMode: SizeMode;
  /** Pixels per real-world inch (keeps every device at the same scale). */
  ppi: number;
  widthPx: number;
  heightPx: number;
  /** CSS colour, or '' for transparent. */
  background: string;
  includeHidden: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  svg: true,
  png: true,
  sizeMode: 'ppi',
  ppi: 200,
  widthPx: 1200,
  heightPx: 200,
  background: '',
  includeHidden: false,
};

export const pxPerU = (ppi: number) => ppi * RACK_UNIT_IN;

export function outputSize(shape: Shape, o: Pick<ExportOptions, 'sizeMode' | 'ppi' | 'widthPx' | 'heightPx'>): { w: number; h: number } {
  const aspect = shape.vbWidth / shape.vbHeight;
  switch (o.sizeMode) {
    case 'width':
      return { w: o.widthPx, h: o.widthPx / aspect };
    case 'height':
      return { w: o.heightPx * aspect, h: o.heightPx };
    default:
      return { w: shape.widthIn * o.ppi, h: shape.heightIn * o.ppi };
  }
}

export function safeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 120) || 'shape'
  );
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportShapeSvg(shape: Shape, o: ExportOptions): Promise<Blob> {
  const svg = await getSvg(shape.id);
  if (!svg) throw new Error('Shape data is missing');
  const { w, h } = outputSize(shape, o);
  return new Blob([sizedSvg(svg, w, h)], { type: 'image/svg+xml' });
}

export async function exportShapePng(shape: Shape, o: ExportOptions): Promise<Blob> {
  const svg = await getSvg(shape.id);
  if (!svg) throw new Error('Shape data is missing');
  const { w, h } = outputSize(shape, o);
  return rasterize(svg, w, h, { background: o.background || undefined });
}

export interface ManifestEntry {
  name: string;
  description?: string;
  vendor: string;
  pack: string;
  stencil: string;
  view: Shape['view'];
  rackUnits?: number;
  widthIn: number;
  heightIn: number;
  sizeSource: Shape['sizeSource'];
  files: { svg?: string; png?: string; pngWidth?: number; pngHeight?: number };
}

/**
 * Builds a zip of the given shapes laid out as Vendor/Pack/Stencil/Shape.ext,
 * with a manifest.json describing every file (sizes, rack units, views).
 */
export async function buildZip(
  shapes: Shape[],
  packs: Map<string, Pack>,
  stencils: Map<string, Stencil>,
  o: ExportOptions,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let zipError: Error | null = null;
  let finished!: () => void;
  const finishedPromise = new Promise<void>((r) => (finished = r));
  const zip = new Zip((err, chunk, final) => {
    if (err) zipError = err;
    else chunks.push(chunk);
    if (final || err) finished();
  });

  const addFile = (path: string, data: Uint8Array, compress: boolean) => {
    const entry = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
    zip.add(entry);
    entry.push(data, true);
  };

  const used = new Set<string>();
  const uniquePath = (dir: string, base: string, ext: string) => {
    let path = `${dir}/${base}.${ext}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${dir}/${base} (${n}).${ext}`;
    used.add(path.toLowerCase());
    return path;
  };

  const manifest: ManifestEntry[] = [];
  for (let i = 0; i < shapes.length; i++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const shape = shapes[i];
    const pack = packs.get(shape.packId);
    const stencil = stencils.get(shape.stencilId);
    const dir = [pack?.vendor ?? 'Unknown', pack?.name ?? 'Pack', stencil?.name ?? 'Stencil'].map(safeFileName).join('/');
    const base = safeFileName(shape.name);
    const svg = await getSvg(shape.id);
    if (!svg) continue;
    const { w, h } = outputSize(shape, o);
    const entry: ManifestEntry = {
      name: shape.name,
      description: shape.prompt,
      vendor: pack?.vendor ?? '',
      pack: pack?.name ?? '',
      stencil: stencil?.name ?? '',
      view: shape.view,
      rackUnits: shape.rackUnits,
      widthIn: round(shape.widthIn),
      heightIn: round(shape.heightIn),
      sizeSource: shape.sizeSource,
      files: {},
    };
    if (o.svg) {
      entry.files.svg = uniquePath(dir, base, 'svg');
      addFile(entry.files.svg, strToU8(sizedSvg(svg, w, h)), true);
    }
    if (o.png) {
      try {
        const png = await rasterize(svg, w, h, { background: o.background || undefined });
        entry.files.png = uniquePath(dir, base, 'png');
        entry.files.pngWidth = Math.round(w);
        entry.files.pngHeight = Math.round(h);
        addFile(entry.files.png, new Uint8Array(await png.arrayBuffer()), false);
      } catch {
        // Leave the PNG out; the SVG (if requested) is still there.
      }
    }
    manifest.push(entry);
    onProgress(i + 1, shapes.length);
  }

  addFile('manifest.json', strToU8(JSON.stringify({ generator: 'RackLibrary', exportedAt: new Date().toISOString(), options: o, shapes: manifest }, null, 2)), true);
  zip.end();
  await finishedPromise;
  if (zipError) throw zipError;
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

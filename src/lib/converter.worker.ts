/// <reference lib="webworker" />
// Runs the libvisio2svg WebAssembly module off the main thread. Accepts a
// single Visio file or a zip of them and streams back the raw SVG for every
// master, one stencil at a time. After each stencil it waits for the page to
// acknowledge it, so a 150-stencil pack never sits in memory all at once.

import { unzipSync } from 'fflate';
import { readMasterMeta, type MasterMeta } from './vsdxMeta';
import type { RawShape, RawStencil } from './types';

interface Visio2SvgModule {
  convert(bytes: Uint8Array, stencil: boolean): {
    ok: boolean;
    error?: string;
    shapes: { name: string; svg: string }[];
    stats?: { emfConverted: number; emfFailed: number; wmfSkipped: number };
  };
}

export type WorkerRequest =
  | { id: number; type: 'convert'; wasmUrl: string; fileName: string; data: ArrayBuffer }
  | { id: number; type: 'ack' };

export type WorkerResponse =
  | { id: number; type: 'progress'; message: string; done: number; total: number }
  | { id: number; type: 'stencil'; stencil: RawStencil; done: number; total: number }
  | { id: number; type: 'result'; count: number }
  | { id: number; type: 'error'; message: string };

const acks = new Map<number, () => void>();

const VISIO_EXT = /\.(vss|vssx|vssm|vsd|vsdx|vsdm|vst|vstx|vstm)$/i;
const STENCIL_EXT = /\.(vss|vssx|vssm)$/i;

let modulePromise: Promise<Visio2SvgModule> | null = null;

function loadModule(wasmUrl: string): Promise<Visio2SvgModule> {
  modulePromise ??= import(/* @vite-ignore */ wasmUrl).then((m) => m.default() as Promise<Visio2SvgModule>);
  return modulePromise;
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

const baseName = (path: string) => path.split('/').pop() ?? path;

interface VisioFile {
  name: string;
  bytes: Uint8Array;
}

/** Collects Visio files from an upload, descending into (nested) zip archives. */
function collectVisioFiles(name: string, bytes: Uint8Array, out: VisioFile[], depth = 0) {
  if (isZip(bytes)) {
    if (VISIO_EXT.test(name)) {
      out.push({ name, bytes });
      return;
    }
    let isPackage = false;
    const entries = unzipSync(bytes, {
      filter: (f) => {
        // An OOXML Visio package (.vssx etc.) saved without its extension.
        if (f.name === 'visio/document.xml') isPackage = true;
        if (f.name.startsWith('__MACOSX/') || baseName(f.name).startsWith('._')) return false;
        return VISIO_EXT.test(f.name) || (/\.zip$/i.test(f.name) && depth < 2);
      },
    });
    if (isPackage) {
      out.push({ name: `${name.replace(/\.zip$/i, '')}.vssx`, bytes });
      return;
    }
    for (const [path, data] of Object.entries(entries)) {
      if (/\.zip$/i.test(path)) collectVisioFiles(path, data, out, depth + 1);
      else out.push({ name: path, bytes: data });
    }
    return;
  }
  if (isOle(bytes) || VISIO_EXT.test(name)) out.push({ name, bytes });
}

function matchMetadata(shapes: { name: string; svg: string }[], meta: MasterMeta[]): RawShape[] {
  // libvisio names pages after the master; consume metadata by name, in order.
  const byName = new Map<string, MasterMeta[]>();
  for (const m of meta) {
    for (const key of new Set([m.name, m.nameU])) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(m);
    }
  }
  const used = new Set<MasterMeta>();
  return shapes.map((s) => {
    const candidates = byName.get(s.name) ?? [];
    const m = candidates.find((c) => !used.has(c));
    if (m) used.add(m);
    return {
      name: s.name,
      svg: s.svg,
      prompt: m?.prompt,
      widthIn: m?.widthIn,
      heightIn: m?.heightIn,
      scale: m?.scale,
      hidden: m?.hidden,
    };
  });
}

function convertOne(mod: Visio2SvgModule, name: string, bytes: Uint8Array): RawStencil {
  const fileName = baseName(name);
  const warnings: string[] = [];
  let result = mod.convert(bytes, true);
  // Drawings have pages rather than masters, and some "stencils" are really
  // drawings saved as .vss; fall back to the pages whenever there are no masters.
  if (!result.ok || result.shapes.length === 0) {
    const pages = mod.convert(bytes, false);
    if (pages.ok && pages.shapes.length) {
      result = pages;
      if (STENCIL_EXT.test(fileName)) warnings.push('No master shapes found; imported the drawing pages instead');
    }
  }
  if (!result.ok) return { fileName, shapes: [], warnings, error: result.error ?? 'Conversion failed' };

  const s = result.stats;
  if (s?.emfFailed) warnings.push(`${s.emfFailed} embedded EMF image(s) could not be converted`);
  if (s?.wmfSkipped) warnings.push(`${s.wmfSkipped} embedded WMF image(s) are not supported and were left out`);

  let meta: MasterMeta[] = [];
  if (isZip(bytes)) {
    try {
      const parts = unzipSync(bytes, {
        filter: (f) => (f.name.startsWith('visio/masters/') && f.name.endsWith('.xml')) || f.name.endsWith('masters.xml.rels'),
      });
      meta = readMasterMeta(parts);
    } catch {
      // Metadata is optional; the SVG is what matters.
    }
  }
  return { fileName, shapes: matchMetadata(result.shapes, meta), warnings };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type === 'ack') {
    acks.get(e.data.id)?.();
    return;
  }
  const { id, wasmUrl, fileName, data } = e.data;
  const post = (msg: WorkerResponse) => self.postMessage(msg);
  try {
    let mod = await loadModule(wasmUrl);
    const found: VisioFile[] = [];
    collectVisioFiles(fileName, new Uint8Array(data), found);
    if (!found.length) throw new Error('No Visio stencils (.vss, .vssx, .vsd, .vsdx) found in this file');

    const files: (VisioFile | null)[] = found.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      files[i] = null; // let the decompressed bytes go once converted
      post({ id, type: 'progress', message: `Converting ${baseName(file.name)}`, done: i, total: files.length });
      let stencil: RawStencil;
      try {
        stencil = convertOne(mod, file.name, file.bytes);
      } catch (err) {
        modulePromise = null;
        stencil = { fileName: baseName(file.name), shapes: [], warnings: [], error: String(err) };
        if (i < files.length - 1) mod = await loadModule(wasmUrl);
      }
      const acked = new Promise<void>((resolve) => acks.set(id, resolve));
      post({ id, type: 'stencil', stencil, done: i + 1, total: files.length });
      await acked;
      acks.delete(id);
    }
    post({ id, type: 'result', count: files.length });
  } catch (err) {
    // A wasm abort leaves the module unusable; load a fresh instance next time.
    modulePromise = null;
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

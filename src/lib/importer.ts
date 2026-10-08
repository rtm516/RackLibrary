import { convertFile } from './converter';
import { deletePack, deleteStencil, listPackStencils, listPacks, requestPersistence, saveStencil, savePack, type ShapeRecord } from './db';
import { harmonizeScale, makeThumbnail, normalizeShape, type NormalizedShape } from './svg';
import type { Pack, RawShape, RawStencil, Stencil } from './types';

export interface ImportSource {
  fileName: string;
  data: ArrayBuffer;
  name?: string;
  vendor?: string;
  catalogId?: string;
  sourceUrl?: string;
}

export interface ImportProgress {
  message: string;
  /** 0..1, or undefined when indeterminate. */
  fraction?: number;
}

export interface ImportResult {
  pack: Pack;
  stencils: Stencil[];
  /** Files that produced nothing, with the reason. */
  errors: string[];
  /** Problems in files that did import (e.g. some shapes could not be rendered). */
  warnings: string[];
  /** True when this re-import updated an existing pack in place. */
  updated: boolean;
}

export const prettyName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Bump when conversion output changes, so older imports can be flagged for
 * re-import. At most once per commit: compare with the committed value first.
 */
export const CONVERTER_VERSION = 3;

const uuid = () => crypto.randomUUID();

/** Masters that only explain how to use the stencil, e.g. F5's "Stencil Instructions - Drop on page…". */
const isInstructions = (s: RawShape) => /\binstructions?\b/i.test(`${s.name} ${s.prompt ?? ''}`);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Converts a file, normalizes every shape and stores the result in IndexedDB.
 * `onStored` fires after each stencil is saved, so the library can show shapes
 * while the rest of the pack is still converting.
 *
 * Re-importing a source (same catalog entry, or for uploads the same file name)
 * updates its existing pack in place: each stencil replaces the old stencil of
 * the same file name as soon as it is stored. If the re-import fails partway,
 * the pack keeps a mix of new and not-yet-replaced old stencils, and its old
 * converter version, so it is still flagged for re-import.
 */
export async function importFile(src: ImportSource, onProgress: (p: ImportProgress) => void, onStored?: () => void): Promise<ImportResult> {
  requestPersistence();
  onProgress({ message: `Converting ${src.fileName}` });

  const sameSource = (p: Pack) => (src.catalogId ? p.catalogId === src.catalogId : !p.catalogId && p.fileName === src.fileName);
  const [existing, ...duplicates] = (await listPacks()).filter(sameSource).sort((a, b) => b.importedAt - a.importedAt);

  // Stencils from the earlier import, by file name, still waiting to be replaced.
  const previous = new Map<string, Stencil[]>();
  if (existing) {
    for (const s of await listPackStencils(existing.id)) previous.set(s.fileName, [...(previous.get(s.fileName) ?? []), s]);
  }

  const pack: Pack = existing
    ? { ...existing, name: src.name ?? existing.name, vendor: src.vendor ?? existing.vendor, fileName: src.fileName, sourceUrl: src.sourceUrl ?? existing.sourceUrl }
    : {
        id: uuid(),
        name: src.name ?? prettyName(src.fileName),
        vendor: src.vendor ?? 'My uploads',
        fileName: src.fileName,
        catalogId: src.catalogId,
        sourceUrl: src.sourceUrl,
        importedAt: Date.now(),
        converterVersion: CONVERTER_VERSION,
        stencilCount: 0,
        shapeCount: 0,
      };

  // A new pack is saved up front and after every stencil so stencils are never
  // orphaned; the library hides packs with no stencils yet.
  if (!existing) await savePack(pack);
  const errors: string[] = [];
  const stencils: Stencil[] = [];

  const dropOld = async (old: Stencil[]) => {
    for (const o of old) {
      await deleteStencil(o.id, pack.id);
      pack.stencilCount--;
      pack.shapeCount -= o.shapeCount;
    }
  };

  const processStencil = async (rs: RawStencil, done: number, total: number) => {
    // Whatever happens to the new version, the old one is no longer "pending":
    // it is either replaced below or kept because the new one failed.
    const old = previous.get(rs.fileName) ?? [];
    previous.delete(rs.fileName);
    try {
      if (!(await storeStencil(rs, done, total))) return;
      await dropOld(old);
      // Keep the pack current so an interrupted import still shows what it got.
      await savePack(pack);
      onStored?.();
    } catch (err) {
      // e.g. the browser's storage quota is full; report it rather than lose it.
      errors.push(`${rs.fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /** Normalizes and saves one stencil into the pack; returns false if nothing was stored. */
  const storeStencil = async (rs: RawStencil, done: number, total: number): Promise<boolean> => {
    // done counts this stencil; progress runs from the previous file to this one.
    const base = (done - 1) / total;
    const report = (message: string, within: number) => onProgress({ message, fraction: base + within / total });
    if (rs.error) {
      errors.push(`${rs.fileName}: ${rs.error}`);
      return false;
    }
    const stencil: Stencil = {
      id: uuid(),
      packId: pack.id,
      name: prettyName(rs.fileName),
      fileName: rs.fileName,
      shapeCount: 0,
      warnings: [...rs.warnings],
    };
    report(`Processing ${stencil.name}`, 0);
    let failed = 0;
    const reasons = new Set<string>();
    // Normalize everything first so sizes can be harmonized across the stencil.
    const ok: { raw: RawShape; n: NormalizedShape }[] = [];
    for (let i = 0; i < rs.shapes.length; i++) {
      // Measuring runs on the main thread; yield now and then to keep the UI responsive.
      if (i % 25 === 24) await new Promise((r) => setTimeout(r));
      if (isInstructions(rs.shapes[i])) continue;
      try {
        ok.push({ raw: rs.shapes[i], n: normalizeShape(rs.shapes[i]) });
      } catch (err) {
        failed++;
        if (err instanceof Error) reasons.add(err.message);
      }
    }
    harmonizeScale(ok);

    let thumbs = 0;
    const records = await mapLimit(ok, 4, async ({ raw: rawShape, n }, index): Promise<ShapeRecord> => {
      const thumb = await makeThumbnail(n.svg, n.vbWidth, n.vbHeight).catch(() => undefined);
      report(`Processing ${stencil.name}`, ++thumbs / Math.max(1, ok.length));
      return {
        svg: n.svg,
        thumb,
        shape: {
          id: uuid(),
          packId: pack.id,
          stencilId: stencil.id,
          index,
          name: rawShape.name || `Shape ${index + 1}`,
          prompt: rawShape.prompt,
          vbWidth: n.vbWidth,
          vbHeight: n.vbHeight,
          widthIn: n.widthIn,
          heightIn: n.heightIn,
          sizeSource: n.sizeSource,
          rackUnits: n.rackUnits,
          view: n.view,
          hidden: rawShape.hidden || undefined,
        },
      };
    });
    const why = reasons.size ? `: ${[...reasons].join('; ')}` : '';
    if (failed) stencil.warnings.push(`${failed} shape(s) could not be rendered${why}`);
    stencil.shapeCount = records.length;
    if (!records.length) {
      errors.push(`${rs.fileName}: ${failed ? `nothing renderable${why}` : 'no shapes found'}`);
      return false;
    }
    await saveStencil(stencil, records);
    stencils.push(stencil);
    pack.stencilCount++;
    pack.shapeCount += records.length;
    return true;
  };

  try {
    await convertFile(src.fileName, src.data, processStencil, (message, done, total) =>
      onProgress({ message, fraction: total > 1 ? done / total : undefined }),
    );
  } catch (err) {
    if (!existing && !stencils.length) await deletePack(pack.id);
    else await savePack(pack);
    throw err;
  }

  if (!stencils.length) {
    if (!existing) await deletePack(pack.id);
    throw new Error(errors.join('\n') || 'No shapes could be extracted');
  }

  // Success: drop stencils the source no longer contains, and any older copies of this pack.
  for (const old of previous.values()) await dropOld(old);
  for (const d of duplicates) await deletePack(d.id);
  pack.importedAt = Date.now();
  pack.converterVersion = CONVERTER_VERSION;
  await savePack(pack);

  const warnings = stencils.flatMap((s) => s.warnings.map((w) => `${s.fileName}: ${w}`));
  return { pack, stencils, errors, warnings, updated: !!existing };
}

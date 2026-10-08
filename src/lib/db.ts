// IndexedDB persistence. Everything stays in the visitor's browser.
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Pack, Shape, Stencil } from './types';

interface LibraryDB extends DBSchema {
  packs: { key: string; value: Pack };
  stencils: { key: string; value: Stencil; indexes: { packId: string } };
  shapes: { key: string; value: Shape; indexes: { packId: string } };
  // Keyed by shape id; kept apart from metadata so listing the library stays cheap.
  svgs: { key: string; value: string };
  thumbs: { key: string; value: Blob };
}

const DB_NAME = 'racklibrary';
let dbPromise: Promise<IDBPDatabase<LibraryDB>> | null = null;

function open() {
  dbPromise ??= openDB<LibraryDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('packs', { keyPath: 'id' });
      db.createObjectStore('stencils', { keyPath: 'id' }).createIndex('packId', 'packId');
      db.createObjectStore('shapes', { keyPath: 'id' }).createIndex('packId', 'packId');
      db.createObjectStore('svgs');
      db.createObjectStore('thumbs');
    },
  });
  return dbPromise;
}

export const listPacks = async () => (await open()).getAll('packs');
export const listStencils = async () => (await open()).getAll('stencils');
export const listShapes = async () => (await open()).getAll('shapes');
export const getSvg = async (shapeId: string) => (await open()).get('svgs', shapeId);
export const getThumb = async (shapeId: string) => (await open()).get('thumbs', shapeId);
export const savePack = async (pack: Pack) => void (await open()).put('packs', pack);

export interface ShapeRecord {
  shape: Shape;
  svg: string;
  thumb?: Blob;
}

/** Writes one stencil's worth of shapes. Called per stencil to keep transactions small. */
export async function saveStencil(stencil: Stencil, records: ShapeRecord[]): Promise<void> {
  const tx = (await open()).transaction(['stencils', 'shapes', 'svgs', 'thumbs'], 'readwrite');
  tx.objectStore('stencils').put(stencil);
  for (const r of records) {
    tx.objectStore('shapes').put(r.shape);
    tx.objectStore('svgs').put(r.svg, r.shape.id);
    if (r.thumb) tx.objectStore('thumbs').put(r.thumb, r.shape.id);
  }
  await tx.done;
}

export const listPackStencils = async (packId: string) => (await open()).getAllFromIndex('stencils', 'packId', packId);

/** Deletes one stencil along with its shapes, SVGs and thumbnails. */
export async function deleteStencil(stencilId: string, packId: string): Promise<void> {
  const tx = (await open()).transaction(['stencils', 'shapes', 'svgs', 'thumbs'], 'readwrite');
  tx.objectStore('stencils').delete(stencilId);
  for (const shape of await tx.objectStore('shapes').index('packId').getAll(packId)) {
    if (shape.stencilId !== stencilId) continue;
    tx.objectStore('shapes').delete(shape.id);
    tx.objectStore('svgs').delete(shape.id);
    tx.objectStore('thumbs').delete(shape.id);
  }
  await tx.done;
}

export async function deletePack(packId: string): Promise<void> {
  const tx = (await open()).transaction(['packs', 'stencils', 'shapes', 'svgs', 'thumbs'], 'readwrite');
  tx.objectStore('packs').delete(packId);
  for (const key of await tx.objectStore('stencils').index('packId').getAllKeys(packId)) tx.objectStore('stencils').delete(key);
  for (const key of await tx.objectStore('shapes').index('packId').getAllKeys(packId)) {
    tx.objectStore('shapes').delete(key);
    tx.objectStore('svgs').delete(key);
    tx.objectStore('thumbs').delete(key);
  }
  await tx.done;
}

/**
 * Removes data that no visible pack owns: packs whose import never stored a
 * stencil (the tab was closed or reloaded mid-import), and stencils, shapes,
 * SVGs and thumbnails whose pack or shape no longer exists. Packs younger than
 * `graceMs` are left alone, since another tab may still be importing them.
 */
export async function cleanupOrphans(graceMs = 10 * 60_000): Promise<number> {
  const db = await open();
  const packs = await db.getAll('packs');
  const abandoned = packs.filter((p) => p.stencilCount === 0 && p.importedAt < Date.now() - graceMs);
  for (const p of abandoned) await deletePack(p.id);

  const live = new Set(packs.filter((p) => !abandoned.includes(p)).map((p) => p.id));
  const tx = db.transaction(['stencils', 'shapes', 'svgs', 'thumbs'], 'readwrite');
  let removed = abandoned.length;
  for (const s of await tx.objectStore('stencils').getAll()) {
    if (!live.has(s.packId)) {
      tx.objectStore('stencils').delete(s.id);
      removed++;
    }
  }
  const shapeIds = new Set<string>();
  for (const s of await tx.objectStore('shapes').getAll()) {
    if (live.has(s.packId)) shapeIds.add(s.id);
    else {
      tx.objectStore('shapes').delete(s.id);
      removed++;
    }
  }
  for (const store of ['svgs', 'thumbs'] as const) {
    for (const key of await tx.objectStore(store).getAllKeys()) {
      if (!shapeIds.has(key)) {
        tx.objectStore(store).delete(key);
        removed++;
      }
    }
  }
  await tx.done;
  return removed;
}

/** Deletes the whole local library. */
export async function clearLibrary(): Promise<void> {
  (await open()).close();
  dbPromise = null;
  await deleteDB(DB_NAME);
}

/** Ask the browser not to evict the library under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not supported; the library still works, it is just evictable.
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

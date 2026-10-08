import { useEffect, useState } from 'react';
import type { CatalogPack } from '../lib/types';

let loading: Promise<CatalogPack[]> | null = null;
let loaded: CatalogPack[] | null = null;

/** The catalog lives in its own chunk; this loads it once. */
export function loadCatalog(): Promise<CatalogPack[]> {
  loading ??= import('./data').then((m) => (loaded = m.catalog));
  return loading;
}

/** The catalog entries, or an empty list until they have loaded. */
export function useCatalog(): CatalogPack[] {
  const [catalog, setCatalog] = useState(() => loaded ?? []);
  useEffect(() => {
    if (!loaded) loadCatalog().then(setCatalog);
  }, []);
  return catalog;
}

export const isArchived = (p: CatalogPack) => /archive|classic/i.test(`${p.collection ?? ''} ${p.name}`);

/** Finds the catalog entry a manually downloaded file came from, by its file name. */
export async function matchCatalogFile(fileName: string): Promise<CatalogPack | undefined> {
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(\d+\)(?=\.[^.]+$)/, '').replace(/[^a-z0-9.]+/g, '');
  const target = norm(fileName);
  return (await loadCatalog()).find((p) => {
    try {
      return norm(decodeURIComponent(new URL(p.url).pathname.split('/').pop() ?? '')) === target;
    } catch {
      return false;
    }
  });
}

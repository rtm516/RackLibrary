import { useCallback, useEffect, useMemo, useState } from 'react';
import { cleanupOrphans, listPacks, listShapes, listStencils } from '../lib/db';
import type { Pack, Shape, Stencil } from '../lib/types';

export interface Library {
  loading: boolean;
  error?: string;
  packs: Pack[];
  stencils: Stencil[];
  shapes: Shape[];
  packById: Map<string, Pack>;
  stencilById: Map<string, Stencil>;
  reload: () => Promise<void>;
}

export function useLibrary(): Library {
  const [state, setState] = useState<{ loading: boolean; error?: string; packs: Pack[]; stencils: Stencil[]; shapes: Shape[] }>({
    loading: true,
    packs: [],
    stencils: [],
    shapes: [],
  });

  const reload = useCallback(async () => {
    try {
      const [packs, stencils, shapes] = await Promise.all([listPacks(), listStencils(), listShapes()]);
      // A pack without stencils is an import that is still running (or never finished).
      const live = packs.filter((p) => p.stencilCount > 0);
      const liveIds = new Set(live.map((p) => p.id));
      live.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
      const packOrder = new Map(live.map((p, i) => [p.id, i]));
      const liveStencils = stencils
        .filter((s) => liveIds.has(s.packId))
        .sort((a, b) => packOrder.get(a.packId)! - packOrder.get(b.packId)! || a.name.localeCompare(b.name));
      const stencilOrder = new Map(liveStencils.map((s, i) => [s.id, i]));
      const liveShapes = shapes
        .filter((s) => liveIds.has(s.packId))
        .sort((a, b) => (stencilOrder.get(a.stencilId) ?? 0) - (stencilOrder.get(b.stencilId) ?? 0) || a.index - b.index);
      setState({ loading: false, packs: live, stencils: liveStencils, shapes: liveShapes });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  useEffect(() => {
    // Clear out anything left behind by interrupted imports before the first listing.
    cleanupOrphans()
      .catch(() => 0)
      .then(reload);
  }, [reload]);

  const packById = useMemo(() => new Map(state.packs.map((p) => [p.id, p])), [state.packs]);
  const stencilById = useMemo(() => new Map(state.stencils.map((s) => [s.id, s])), [state.stencils]);

  return { ...state, packById, stencilById, reload };
}

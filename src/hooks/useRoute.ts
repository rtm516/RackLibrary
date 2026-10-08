import { useCallback } from 'react';
import { useMatch, useNavigate } from 'react-router';

// Routes live in the URL hash (HashRouter), so deep links work on static hosting.
export type Route = { page: 'library'; packId?: string; stencilId?: string } | { page: 'catalog' };

export function routePath(route: Route): string {
  if (route.page === 'catalog') return '/catalog';
  if (route.stencilId) return `/stencil/${encodeURIComponent(route.stencilId)}`;
  if (route.packId) return `/pack/${encodeURIComponent(route.packId)}`;
  return '/';
}

export function useRoute() {
  const catalog = useMatch('/catalog');
  const pack = useMatch('/pack/:packId');
  const stencil = useMatch('/stencil/:stencilId');
  const nav = useNavigate();

  const route: Route = catalog
    ? { page: 'catalog' }
    : { page: 'library', packId: pack?.params.packId, stencilId: stencil?.params.stencilId };
  const navigate = useCallback((r: Route) => nav(routePath(r)), [nav]);
  return [route, navigate] as const;
}

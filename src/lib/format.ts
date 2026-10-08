import type { Shape } from './types';

const VIEW_LABEL: Record<Shape['view'], string> = { front: 'Front', rear: 'Rear', top: 'Top', side: 'Side', other: '' };

export const viewLabel = (v: Shape['view']) => VIEW_LABEL[v];

export function formatDims(shape: Shape, unit: 'in' | 'mm' = 'in'): string {
  if (unit === 'mm') return `${Math.round(shape.widthIn * 25.4)} × ${Math.round(shape.heightIn * 25.4)} mm`;
  const f = (n: number) => (n >= 10 ? n.toFixed(1) : n.toFixed(2));
  return `${f(shape.widthIn)} × ${f(shape.heightIn)} in`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

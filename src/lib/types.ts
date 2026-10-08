/** A single import: one uploaded/downloaded file (often a zip of stencils). */
export interface Pack {
  id: string;
  name: string;
  vendor: string;
  fileName: string;
  /** Catalog entry this pack was imported from, if any. */
  catalogId?: string;
  sourceUrl?: string;
  importedAt: number;
  /** CONVERTER_VERSION at import time; older packs miss later conversion fixes. */
  converterVersion?: number;
  stencilCount: number;
  shapeCount: number;
}

/** One .vss/.vssx/.vsd/.vsdx file inside a pack. */
export interface Stencil {
  id: string;
  packId: string;
  name: string;
  fileName: string;
  shapeCount: number;
  warnings: string[];
}

export type ShapeView = 'front' | 'rear' | 'top' | 'side' | 'other';

export type SizeSource = 'stencil' | 'estimated' | 'drawing';

/** Metadata for one master shape. The SVG markup and thumbnail live in separate stores. */
export interface Shape {
  id: string;
  packId: string;
  stencilId: string;
  index: number;
  name: string;
  /** The master's prompt / description text, when the stencil has one. */
  prompt?: string;
  /** viewBox width/height of the cropped SVG (user units). */
  vbWidth: number;
  vbHeight: number;
  /** Real-world size in inches when known from the stencil, else estimated from the drawing. */
  widthIn: number;
  heightIn: number;
  /** Where widthIn/heightIn came from: the stencil's data, an inferred drawing scale, or the raw drawing. */
  sizeSource: SizeSource;
  rackUnits?: number;
  view: ShapeView;
  hidden?: boolean;
}

/** Raw result for one master, as produced by the converter worker. */
export interface RawShape {
  name: string;
  svg: string;
  prompt?: string;
  /** Real-world size from the stencil XML (inches), if available. */
  widthIn?: number;
  heightIn?: number;
  /** Real-world units per drawing unit, from the master's page settings. */
  scale?: number;
  hidden?: boolean;
}

export interface RawStencil {
  fileName: string;
  shapes: RawShape[];
  warnings: string[];
  error?: string;
}

export interface CatalogPack {
  id: string;
  vendor: string;
  name: string;
  description: string;
  collection?: string;
  url: string;
  homepage: string;
  sizeBytes?: number | null;
  updated?: string;
  /** The host allows cross-site downloads, so Import works in one click. */
  cors?: boolean;
  source: 'visiocafe' | 'vendor';
}

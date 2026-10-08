import DOMPurify from 'dompurify';
import type { RawShape, ShapeView, SizeSource } from './types';

export const RACK_UNIT_IN = 1.75;
const PT_PER_IN = 72;

const RENDERABLE_IMAGE = /^data:image\/(png|jpe?g|gif|bmp|webp|svg\+xml)[;,]/i;

/**
 * Parses converter output into a sanitized <svg> element (no scripts, event
 * handlers or external references) and drops <image>s browsers can't draw,
 * e.g. embedded OLE/CAD objects. Returns how many images were dropped.
 */
function sanitize(markup: string): { svg: SVGSVGElement; dropped: number } {
  const fragment = DOMPurify.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true }, RETURN_DOM_FRAGMENT: true });
  const svg = fragment.querySelector('svg');
  if (!svg) throw new Error('Converter produced invalid SVG');
  let dropped = 0;
  svg.querySelectorAll('image').forEach((img) => {
    const href = img.getAttribute('href') ?? img.getAttribute('xlink:href') ?? '';
    if (!RENDERABLE_IMAGE.test(href.trim())) {
      img.remove();
      dropped++;
    }
  });
  return { svg, dropped };
}

let measureHost: HTMLDivElement | null = null;

function measure(svg: SVGSVGElement): DOMRect | null {
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.style.cssText = 'position:absolute;left:-100000px;top:0;width:1000px;height:1000px;visibility:hidden;pointer-events:none';
    document.body.appendChild(measureHost);
  }
  const node = document.importNode(svg, true);
  measureHost.appendChild(node);
  try {
    // getBBox() ignores clipping. Each embedded EMF is a nested <svg> that
    // clips its drawing to the picture frame (as Visio does), so swap each one
    // for a rectangle covering just its visible area before measuring.
    for (const inner of node.querySelectorAll<SVGSVGElement>('svg')) {
      if (!inner.isConnected) continue;
      // The visible area is the viewBox (or the viewport when there is none),
      // in the nested svg's own units; scale it back into the parent's units.
      const width = inner.width.baseVal.value;
      const height = inner.height.baseVal.value;
      const vb = inner.viewBox.baseVal;
      const view = vb && vb.width > 0 && vb.height > 0 ? vb : { x: 0, y: 0, width, height };
      const sx = width / view.width;
      const sy = height / view.height;
      const b = inner.getBBox();
      const x0 = Math.max(b.x, view.x);
      const y0 = Math.max(b.y, view.y);
      const x1 = Math.min(b.x + b.width, view.x + view.width);
      const y1 = Math.min(b.y + b.height, view.y + view.height);
      if (x1 <= x0 || y1 <= y0) {
        inner.remove();
        continue;
      }
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(inner.x.baseVal.value + (x0 - view.x) * sx));
      rect.setAttribute('y', String(inner.y.baseVal.value + (y0 - view.y) * sy));
      rect.setAttribute('width', String((x1 - x0) * sx));
      rect.setAttribute('height', String((y1 - y0) * sy));
      inner.replaceWith(rect);
    }
    const box = node.getBBox();
    return box.width > 0 && box.height > 0 ? box : null;
  } catch {
    return null;
  } finally {
    node.remove();
  }
}

const VIEW_PATTERNS: [ShapeView, RegExp][] = [
  ['front', /\bfront\b|\(c?f\)/i],
  ['rear', /\brear\b|\bback\b|\(r\)/i],
  ['top', /\btop\b/i],
  ['side', /\bside\b/i],
];

export function detectView(name: string, prompt?: string): ShapeView {
  for (const text of [name, prompt ?? '']) {
    for (const [view, re] of VIEW_PATTERNS) if (re.test(text.trim())) return view;
  }
  return 'other';
}

/** Rack height in U, from the name ("2U") or from a real-world size that fits a 19" rack. */
export function detectRackUnits(name: string, prompt: string | undefined, widthIn: number, heightIn: number, trusted: boolean): number | undefined {
  const named = `${name} ${prompt ?? ''}`.match(/\b(\d{1,2})\s?R?U\b/i);
  if (named) {
    const u = parseInt(named[1], 10);
    if (u >= 1 && u <= 58) return u;
  }
  if (!trusted) return undefined;
  const u = heightIn / RACK_UNIT_IN;
  const rounded = Math.round(u);
  // 19" rack gear is ~17.2" without ears and 19" with; half-width units are ~8.5".
  const fitsRack = (widthIn >= 16 && widthIn <= 19.5) || (widthIn >= 8 && widthIn <= 9.75);
  // Drawings often include a bezel lip or feet, so allow up to 0.2U (0.35") of slack.
  if (fitsRack && rounded >= 1 && rounded <= 58 && Math.abs(u - rounded) <= 0.2) return rounded;
  return undefined;
}

export interface NormalizedShape {
  svg: string;
  vbWidth: number;
  vbHeight: number;
  widthIn: number;
  heightIn: number;
  sizeSource: SizeSource;
  rackUnits?: number;
  view: ShapeView;
  /** Factor the drawn size was multiplied by to undo an unrecorded drawing scale (1 if none). */
  scaleFactor: number;
}

/**
 * Sanitizes a converted SVG, crops it to its drawn content and works out the
 * real-world size. libvisio emits the master's whole page (in points, at the
 * stencil's drawing scale), which usually has a lot of empty margin.
 */
export function normalizeShape(raw: RawShape): NormalizedShape {
  const { svg, dropped } = sanitize(raw.svg);

  const box = measure(svg);
  if (!box) {
    throw new Error(
      dropped ? 'Only contains an embedded object (such as an AutoCAD drawing) that browsers cannot render' : 'Nothing is drawn in this shape',
    );
  }

  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  svg.setAttribute('viewBox', `${r(box.x)} ${r(box.y)} ${r(box.width)} ${r(box.height)}`);
  svg.setAttribute('width', String(r(box.width)));
  svg.setAttribute('height', String(r(box.height)));
  svg.removeAttribute('version');

  // Prefer the stencil's own dimensions when they agree with what was drawn;
  // otherwise scale the drawing by the master's drawing scale (e.g. 1:10).
  let widthIn = box.width / PT_PER_IN;
  let heightIn = box.height / PT_PER_IN;
  let sizeSource: SizeSource = 'drawing';
  if (raw.widthIn && raw.heightIn && Math.abs(box.width / box.height / (raw.widthIn / raw.heightIn) - 1) < 0.15) {
    widthIn = raw.widthIn;
    heightIn = raw.heightIn;
    sizeSource = 'stencil';
  } else if (raw.scale) {
    widthIn *= raw.scale;
    heightIn *= raw.scale;
    sizeSource = 'stencil';
  }
  // Rack stencils are usually drawn at a reduced scale (1:10, 1:12, ...), but
  // some masters lose it: binary .vss/.vsd files don't expose it, and some
  // vendors shrink shapes without setting one (a 19" x 3.5" 2U box stored as
  // 1.9" x 0.35"). Restore it only when it makes the shape unmistakably rack gear.
  let trusted = sizeSource === 'stencil';
  let scaleFactor = 1;
  const factor = rackScale(widthIn, heightIn);
  if (factor) {
    widthIn *= factor;
    heightIn *= factor;
    trusted = true;
    scaleFactor = factor;
    if (sizeSource === 'drawing') sizeSource = 'estimated';
  }

  return {
    svg: new XMLSerializer().serializeToString(svg),
    vbWidth: box.width,
    vbHeight: box.height,
    widthIn,
    heightIn,
    sizeSource,
    rackUnits: detectRackUnits(raw.name, raw.prompt, widthIn, heightIn, trusted),
    view: detectView(raw.name, raw.prompt),
    scaleFactor,
  };
}

/** Drawing scales commonly used for equipment stencils (real units per drawn unit). */
const COMMON_SCALES = [10, 12, 16, 20, 24, 48];

/**
 * The drawing scale that turns a shape into 19" rack gear (16-19.6" wide, a
 * whole number of U tall), if exactly that is what one of the common scales does.
 */
function rackScale(widthIn: number, heightIn: number): number | undefined {
  let best: number | undefined;
  let bestError = Infinity;
  for (const f of COMMON_SCALES) {
    const width = widthIn * f;
    const u = (heightIn * f) / RACK_UNIT_IN;
    if (width < 16 || width > 19.6 || u < 0.94) continue;
    const error = Math.abs(u - Math.round(u));
    if (error <= 0.06 && error < bestError) {
      best = f;
      bestError = error;
    }
  }
  return best;
}

/**
 * If a stencil's rack masters clearly needed a scale correction, its other
 * masters (desktop units, modules) were almost certainly drawn at that scale
 * too. Applies the most common correction to the rest, per drawing-scale group.
 * Mutates in place.
 */
export function harmonizeScale(items: { raw: RawShape; n: NormalizedShape }[]) {
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = `${it.raw.scale ?? 'none'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  for (const group of groups.values()) {
    const counts = new Map<number, number>();
    for (const it of group) if (it.n.scaleFactor > 1) counts.set(it.n.scaleFactor, (counts.get(it.n.scaleFactor) ?? 0) + 1);
    const [factor, fixed] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [1, 0];
    if (fixed < 2 || fixed / group.length < 0.25) continue;
    for (const it of group) {
      if (it.n.scaleFactor > 1 || it.n.widthIn * factor > 40) continue;
      it.n.widthIn *= factor;
      it.n.heightIn *= factor;
      it.n.scaleFactor = factor;
      if (it.n.sizeSource === 'drawing') it.n.sizeSource = 'estimated';
      it.n.rackUnits = detectRackUnits(it.raw.name, it.raw.prompt, it.n.widthIn, it.n.heightIn, true);
    }
  }
}

/** Returns the SVG with its width/height set to the given pixel size. */
export function sizedSvg(svg: string, widthPx: number, heightPx: number): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  doc.documentElement.setAttribute('width', String(Math.round(widthPx * 100) / 100));
  doc.documentElement.setAttribute('height', String(Math.round(heightPx * 100) / 100));
  return new XMLSerializer().serializeToString(doc);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render SVG'));
    img.src = url;
  });
}

/** Browsers cap canvas size; keep exports inside the limit. */
export const MAX_CANVAS_SIDE = 16384;

export async function rasterize(
  svg: string,
  widthPx: number,
  heightPx: number,
  options: { background?: string; type?: 'image/png' | 'image/webp'; quality?: number } = {},
): Promise<Blob> {
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(widthPx, heightPx));
  const w = Math.max(1, Math.round(widthPx * scale));
  const h = Math.max(1, Math.round(heightPx * scale));
  const url = URL.createObjectURL(new Blob([sizedSvg(svg, w, h)], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    // The async encoders (toBlob / convertToBlob) wait for the next rendered
    // frame once an SVG image has been drawn, which costs ~1s per image when the
    // tab isn't painting. toDataURL rasterizes synchronously.
    return await (await fetch(canvas.toDataURL(options.type ?? 'image/png', options.quality))).blob();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Small preview image for the library grid. */
export function makeThumbnail(svg: string, vbWidth: number, vbHeight: number): Promise<Blob> {
  const max = 480;
  const scale = max / Math.max(vbWidth, vbHeight);
  return rasterize(svg, vbWidth * scale, vbHeight * scale, { type: 'image/webp', quality: 0.85 });
}

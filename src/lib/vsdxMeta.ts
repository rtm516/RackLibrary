// Extracts per-master metadata (prompt, real-world size, hidden flag, drawing
// scale) from the XML parts of a .vssx/.vsdx package. libvisio only gives us
// SVG, so this fills in what the SVG cannot tell us. Runs in the worker, which
// has no DOMParser, hence txml.

import { parse, type TNode } from 'txml/txml';

export interface MasterMeta {
  name: string;
  nameU: string;
  prompt?: string;
  hidden: boolean;
  widthIn?: number;
  heightIn?: number;
  /** Real-world units per page unit (DrawingScale / PageScale), e.g. 10 for 1:10. */
  scale?: number;
  /** Package path of the master's contents part, e.g. visio/masters/master3.xml. */
  path?: string;
}

const decoder = new TextDecoder();

const parseXml = (bytes: Uint8Array) => parse(decoder.decode(bytes), { decodeEntities: true, skipXmlDeclaration: true });

const elements = (nodes: (TNode | string)[] | undefined, tagName?: string): TNode[] =>
  (nodes ?? []).filter((n): n is TNode => typeof n !== 'string' && (!tagName || n.tagName === tagName));

const child = (node: TNode | undefined, tagName: string) => elements(node?.children, tagName)[0];

/** Numeric values of a node's direct <Cell N="..." V="..."/> children (not those inside sections). */
function cells(node: TNode | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of elements(node?.children, 'Cell')) {
    const v = parseFloat(c.attributes.V ?? '');
    if (c.attributes.N && Number.isFinite(v)) out[c.attributes.N] = v;
  }
  return out;
}

/** Union of the master's top-level shape boxes, in inches. */
function masterSize(contents: (TNode | string)[]): { widthIn: number; heightIn: number } | undefined {
  const shapes = elements(child(elements(contents, 'MasterContents')[0], 'Shapes')?.children, 'Shape')
    .map(cells)
    .filter((b) => b.Width > 0 && b.Height > 0);
  if (!shapes.length) return undefined;
  if (shapes.length === 1) return { widthIn: shapes[0].Width, heightIn: shapes[0].Height };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of shapes) {
    const left = (b.PinX ?? 0) - (b.LocPinX ?? b.Width / 2);
    const bottom = (b.PinY ?? 0) - (b.LocPinY ?? b.Height / 2);
    x0 = Math.min(x0, left);
    y0 = Math.min(y0, bottom);
    x1 = Math.max(x1, left + b.Width);
    y1 = Math.max(y1, bottom + b.Height);
  }
  return { widthIn: x1 - x0, heightIn: y1 - y0 };
}

/** files: the unzipped package (path -> bytes). Returns masters in document order. */
export function readMasterMeta(files: Record<string, Uint8Array>): MasterMeta[] {
  const mastersXml = files['visio/masters/masters.xml'];
  if (!mastersXml) return [];
  const relsXml = files['visio/masters/_rels/masters.xml.rels'];
  const rels = new Map<string, string>();
  if (relsXml) {
    for (const r of elements(elements(parseXml(relsXml), 'Relationships')[0]?.children, 'Relationship')) {
      if (r.attributes.Id && r.attributes.Target) rels.set(r.attributes.Id, r.attributes.Target);
    }
  }

  return elements(elements(parseXml(mastersXml), 'Masters')[0]?.children, 'Master').map((master) => {
    const a = master.attributes;
    const meta: MasterMeta = {
      name: a.Name ?? a.NameU ?? '',
      nameU: a.NameU ?? a.Name ?? '',
      prompt: a.Prompt || undefined,
      hidden: a.Hidden === '1',
    };
    const page = cells(child(master, 'PageSheet'));
    if (page.DrawingScale > 0 && page.PageScale > 0) meta.scale = page.DrawingScale / page.PageScale;

    const target = rels.get(child(master, 'Rel')?.attributes['r:id'] ?? '');
    if (target) {
      meta.path = target.startsWith('/') ? target.slice(1) : `visio/masters/${target}`;
      const content = files[meta.path];
      if (content) Object.assign(meta, masterSize(parseXml(content)));
    }
    return meta;
  });
}

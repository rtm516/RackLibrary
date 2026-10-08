// Finds alternate views hidden behind a shape option in a .vssx master, e.g.
// F5's "back" sub-shape whose Width is IF(Sheet.5!User.ShowBack, ..., 0).
// libvisio uses stored cell values and has no formula engine, so for each such
// option this switches it on, re-evaluates the affected geometry formulas and
// returns a copy of the master XML with the new values, ready to convert.

import { parse, type TNode } from 'txml/txml';
import { evaluate, references, type CellRef } from './formula';

/** Only options that switch to another side of the device count as views (not blades, PSUs, ...). */
const VIEW_OPTION = /^(User|Prop)\.\w*(back|rear|front|top|side)\w*$/i;

/** The cells that place and size a shape (and its picture). */
const GEOMETRY_CELLS = ['Width', 'Height', 'LocPinX', 'LocPinY', 'PinX', 'PinY', 'ImgWidth', 'ImgHeight', 'ImgOffsetX', 'ImgOffsetY'];

interface Cell {
  value: number;
  formula?: string;
}

export interface ToggleVariant {
  /** Short view name from the option, e.g. "Back" for User.ShowBack. */
  label: string;
  /** The master's XML with the option switched on. */
  xml: string;
}

const elements = (nodes: (TNode | string)[] | undefined, tagName?: string): TNode[] =>
  (nodes ?? []).filter((n): n is TNode => typeof n !== 'string' && (!tagName || n.tagName === tagName));

function readCell(node: TNode): Cell | undefined {
  const value = parseFloat(node.attributes.V ?? '');
  if (!Number.isFinite(value)) return undefined;
  const f = node.attributes.F;
  // "Inh" and "No Formula" mean there is nothing to evaluate.
  return { value, formula: f && f !== 'Inh' && f !== 'No Formula' ? f : undefined };
}

/** All shapes in a master, by ID, with their own cells plus User.* and Prop.* values. */
function collectShapes(xml: string): Map<string, Map<string, Cell>> {
  const shapes = new Map<string, Map<string, Cell>>();
  const walk = (nodes: (TNode | string)[]) => {
    for (const shape of elements(nodes, 'Shape')) {
      const cells = new Map<string, Cell>();
      for (const c of elements(shape.children, 'Cell')) {
        const cell = readCell(c);
        if (cell && c.attributes.N) cells.set(c.attributes.N, cell);
      }
      for (const section of elements(shape.children, 'Section')) {
        const prefix = section.attributes.N === 'User' ? 'User.' : section.attributes.N === 'Property' ? 'Prop.' : null;
        if (!prefix) continue;
        for (const row of elements(section.children, 'Row')) {
          const valueCell = elements(row.children, 'Cell').find((c) => c.attributes.N === 'Value');
          const cell = valueCell && readCell(valueCell);
          if (cell && row.attributes.N) cells.set(prefix + row.attributes.N, cell);
        }
      }
      if (shape.attributes.ID) shapes.set(shape.attributes.ID, cells);
      walk(elements(shape.children, 'Shapes').flatMap((s) => s.children));
    }
  };
  for (const root of elements(parse(xml, { decodeEntities: true, skipXmlDeclaration: true }), 'MasterContents')) {
    walk(elements(root.children, 'Shapes').flatMap((s) => s.children));
  }
  return shapes;
}

const keyOf = (shapeId: string, ref: CellRef) => `${ref.sheet ?? shapeId}:${ref.name}`;

/** "ShowBack" -> "Back", "DisplayRear" -> "Rear". */
function labelFor(option: string): string {
  const name = option.replace(/^(User|Prop)\./, '');
  const stripped = name.replace(/^(show|display|view|is)_?/i, '');
  const label = stripped || name;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Writes new V values into the given shapes' own cells (inserting cells that are absent). */
function applyValues(xml: string, values: Map<string, number>): string {
  const byShape = new Map<string, [string, number][]>();
  for (const [key, value] of values) {
    const [shapeId, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (!GEOMETRY_CELLS.includes(name)) continue;
    if (!byShape.has(shapeId)) byShape.set(shapeId, []);
    byShape.get(shapeId)!.push([name, value]);
  }
  for (const [shapeId, cells] of byShape) {
    const open = new RegExp(`<Shape\\b[^>]*\\bID=['"]${shapeId}['"][^>]*>`).exec(xml);
    if (!open) continue;
    const start = open.index + open[0].length;
    // The shape's own cells come before its sections and sub-shapes.
    const rest = xml.slice(start);
    const end = start + (rest.search(/<Section\b|<Shapes\b|<\/Shape>|<Shape\b/) >>> 0);
    let region = xml.slice(start, end);
    for (const [name, value] of cells) {
      const cellRe = new RegExp(`<Cell\\b[^>]*\\bN=['"]${name}['"][^>]*?/?>`);
      const tag = cellRe.exec(region);
      if (tag) {
        const updated = /\bV=['"][^'"]*['"]/.test(tag[0]) ? tag[0].replace(/\bV=(['"])[^'"]*\1/, `V='${value}'`) : tag[0].replace(/\s*\/?>$/, ` V='${value}'$&`);
        region = region.slice(0, tag.index) + updated + region.slice(tag.index + tag[0].length);
      } else {
        region = `<Cell N='${name}' V='${value}'/>` + region;
      }
    }
    xml = xml.slice(0, start) + region + xml.slice(end);
  }
  return xml;
}

/**
 * Returns one variant per view option (e.g. User.ShowBack) that, when switched
 * on, reveals a sub-shape that is currently hidden (zero width or height). Options whose formulas
 * can't be evaluated are skipped rather than guessed at.
 */
export function toggleVariants(xml: string): ToggleVariant[] {
  let shapes: Map<string, Map<string, Cell>>;
  try {
    shapes = collectShapes(xml);
  } catch {
    return [];
  }

  // Options (User.* / Prop.* cells, currently off) that geometry formulas depend on.
  const options = new Set<string>();
  for (const [shapeId, cells] of shapes) {
    for (const name of GEOMETRY_CELLS) {
      const formula = cells.get(name)?.formula;
      if (!formula) continue;
      for (const ref of references(formula)) {
        if (!VIEW_OPTION.test(ref.name)) continue;
        const key = keyOf(shapeId, ref);
        const [sheet, cellName] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        if (shapes.get(sheet)?.get(cellName)?.value === 0) options.add(key);
      }
    }
  }

  const variants: ToggleVariant[] = [];
  for (const option of options) {
    const values = new Map<string, number>([[option, 1]]);
    const changed = new Set([option]);
    const current = (key: string) => {
      if (values.has(key)) return values.get(key)!;
      const [sheet, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      const cell = shapes.get(sheet)?.get(name);
      if (!cell) throw new Error(`Unknown cell ${key}`);
      return cell.value;
    };

    let ok = true;
    // Re-evaluate every geometry formula that depends on something that changed,
    // until nothing new changes.
    for (let pass = 0; pass < 8 && ok; pass++) {
      let more = false;
      for (const [shapeId, cells] of shapes) {
        for (const name of GEOMETRY_CELLS) {
          const formula = cells.get(name)?.formula;
          if (!formula || !references(formula).some((r) => changed.has(keyOf(shapeId, r)))) continue;
          let value: number;
          try {
            value = evaluate(formula, (ref) => current(keyOf(shapeId, ref)));
          } catch {
            ok = false;
            break;
          }
          const key = `${shapeId}:${name}`;
          if (Math.abs(value - current(key)) > 1e-9) {
            values.set(key, value);
            if (!changed.has(key)) {
              changed.add(key);
              more = true;
            }
          }
        }
        if (!ok) break;
      }
      if (!more) break;
    }
    if (!ok) continue;

    // Only worth a variant if it reveals something that was hidden.
    const reveals = [...values].some(([key, value]) => {
      const name = key.slice(key.indexOf(':') + 1);
      if ((name !== 'Width' && name !== 'Height') || value <= 0) return false;
      const [sheet] = key.split(':');
      return shapes.get(sheet)?.get(name)?.value === 0;
    });
    if (reveals) variants.push({ label: labelFor(option.slice(option.indexOf(':') + 1)), xml: applyValues(xml, values) });
  }
  return variants;
}

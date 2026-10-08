// A small evaluator for Visio ShapeSheet formulas, enough for the size and
// position formulas smart shapes use (arithmetic, IF/GUARD/NOT/AND/OR, a few
// maths functions, units, and references like Width or Sheet.5!User.ShowBack).
// Anything else throws, so callers can give up rather than guess.

/** A cell reference: `sheet` is undefined for the shape's own cells. */
export interface CellRef {
  sheet?: string;
  name: string;
}

export type Lookup = (ref: CellRef) => number;

const UNITS: Record<string, number> = { in: 1, 'in.': 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 1000 / 25.4, pt: 1 / 72 };

type Token = { kind: 'num'; value: number } | { kind: 'ref'; ref: CellRef } | { kind: 'op'; value: string } | { kind: 'name'; value: string };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)(?:\s*(in\.?|ft|mm|cm|m|pt)\b)?|(Sheet\.\d+)!([A-Za-z_][\w.]*)|([A-Za-z_][\w.]*)(?=\s*\()|([A-Za-z_][\w.]*)|(<=|>=|<>|[-+*/^(),=<>]))/y;
  let pos = 0;
  while (pos < formula.length) {
    re.lastIndex = pos;
    const m = re.exec(formula);
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(formula.slice(pos))) break;
      throw new Error(`Unsupported formula syntax: ${formula}`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ kind: 'num', value: parseFloat(m[1]) * (m[2] ? UNITS[m[2]] : 1) });
    else if (m[3]) tokens.push({ kind: 'ref', ref: { sheet: m[3].slice(6), name: m[4] } });
    else if (m[5]) tokens.push({ kind: 'name', value: m[5].toUpperCase() });
    else if (m[6]) {
      const upper = m[6].toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') tokens.push({ kind: 'num', value: upper === 'TRUE' ? 1 : 0 });
      else tokens.push({ kind: 'ref', ref: { name: m[6] } });
    } else tokens.push({ kind: 'op', value: m[7] });
  }
  return tokens;
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  IF: ([c, a, b]) => (c ? a : b ?? 0),
  GUARD: ([x]) => x,
  NOT: ([x]) => (x ? 0 : 1),
  AND: (xs) => (xs.every(Boolean) ? 1 : 0),
  OR: (xs) => (xs.some(Boolean) ? 1 : 0),
  ABS: ([x]) => Math.abs(x),
  SQRT: ([x]) => Math.sqrt(x),
  MIN: (xs) => Math.min(...xs),
  MAX: (xs) => Math.max(...xs),
  INT: ([x]) => Math.floor(x),
  ROUND: ([x, d = 0]) => Math.round(x * 10 ** d) / 10 ** d,
};

/** Evaluates a formula, resolving cell references through `lookup`. Throws if unsupported. */
export function evaluate(formula: string, lookup: Lookup): number {
  const tokens = tokenize(formula.trim().replace(/^=/, ''));
  let i = 0;
  const peek = () => tokens[i];
  const take = (op?: string) => {
    const t = tokens[i++];
    if (!t || (op && !(t.kind === 'op' && t.value === op))) throw new Error(`Unexpected token in ${formula}`);
    return t;
  };
  const isOp = (...ops: string[]) => peek()?.kind === 'op' && ops.includes((peek() as { value: string }).value);

  const comparison = (): number => {
    let left = additive();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = (take() as { value: string }).value;
      const right = additive();
      left = Number({ '=': left === right, '<>': left !== right, '<': left < right, '>': left > right, '<=': left <= right, '>=': left >= right }[op]);
    }
    return left;
  };
  const additive = (): number => {
    let left = multiplicative();
    while (isOp('+', '-')) left = (take() as { value: string }).value === '+' ? left + multiplicative() : left - multiplicative();
    return left;
  };
  const multiplicative = (): number => {
    let left = power();
    while (isOp('*', '/')) left = (take() as { value: string }).value === '*' ? left * power() : left / power();
    return left;
  };
  const power = (): number => {
    const base = unary();
    return isOp('^') ? (take(), base ** power()) : base;
  };
  const unary = (): number => {
    if (isOp('-')) return take(), -unary();
    if (isOp('+')) return take(), unary();
    return primary();
  };
  const primary = (): number => {
    const t = take();
    if (t.kind === 'num') return t.value;
    if (t.kind === 'ref') return lookup(t.ref);
    if (t.kind === 'op' && t.value === '(') {
      const v = comparison();
      take(')');
      return v;
    }
    if (t.kind === 'name') {
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new Error(`Unsupported function ${t.value}`);
      take('(');
      const args: number[] = [];
      if (!isOp(')')) {
        args.push(comparison());
        while (isOp(',')) take(), args.push(comparison());
      }
      take(')');
      return fn(args);
    }
    throw new Error(`Unexpected token in ${formula}`);
  };

  const value = comparison();
  if (i !== tokens.length) throw new Error(`Trailing tokens in ${formula}`);
  if (!Number.isFinite(value)) throw new Error(`Non-finite result for ${formula}`);
  return value;
}

/** The cell references a formula uses (without evaluating it). */
export function references(formula: string): CellRef[] {
  try {
    return tokenize(formula.trim().replace(/^=/, ''))
      .filter((t): t is { kind: 'ref'; ref: CellRef } => t.kind === 'ref')
      .map((t) => t.ref);
  } catch {
    return [];
  }
}

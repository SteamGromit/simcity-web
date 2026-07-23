/**
 * A tiny expression language for authored content: unlock conditions now,
 * campaign objectives later. Evaluates against a flat record of numbers.
 *
 * Deliberately has no eval, no Function constructor, no function calls, and
 * no strings — a pack from a stranger must not be able to run code. Booleans
 * are numbers (0 / 1). Division and modulo by zero yield 0 so authored
 * content cannot poison balance math with NaN.
 */

export type ExprContext = Record<string, number>;

export interface CompiledExpr {
  eval(ctx: ExprContext): number;
}

export type CompileResult =
  | { ok: true; expr: CompiledExpr }
  | { ok: false; error: string };

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string };

// longest first, so '<=' wins over '<'
const OPERATORS = ['||', '&&', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '(', ')', '!'];

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class ParseError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new ParseError(`bad number "${src.slice(i, j)}"`);
      out.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new ParseError(`unexpected character "${c}"`);
    out.push({ k: 'op', v: op });
    i += op.length;
  }
  return out;
}

function parse(toks: Tok[], allowed: readonly string[]): CompiledExpr {
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];

  function expect(op: string): void {
    const t = peek();
    if (!t || t.k !== 'op' || t.v !== op) throw new ParseError(`expected "${op}"`);
    pos++;
  }

  function primary(): CompiledExpr {
    const t = peek();
    if (!t) throw new ParseError('unexpected end of expression');
    if (t.k === 'num') {
      pos++;
      return { eval: () => t.v };
    }
    if (t.k === 'id') {
      pos++;
      // a following '(' would be a call — the language has none
      const next = peek();
      if (next && next.k === 'op' && next.v === '(') {
        throw new ParseError(`function calls are not allowed ("${t.v}")`);
      }
      if (!allowed.includes(t.v)) throw new ParseError(`unknown identifier "${t.v}"`);
      const key = t.v;
      return { eval: (ctx) => ctx[key] ?? 0 };
    }
    if (t.v === '(') {
      pos++;
      const inner = binary(0);
      expect(')');
      return inner;
    }
    if (t.v === '-') {
      pos++;
      const operand = primary();
      return { eval: (ctx) => -operand.eval(ctx) };
    }
    if (t.v === '!') {
      pos++;
      const operand = primary();
      return { eval: (ctx) => (operand.eval(ctx) === 0 ? 1 : 0) };
    }
    throw new ParseError(`unexpected "${t.v}"`);
  }

  function apply(op: string, l: number, r: number): number {
    switch (op) {
      case '||':
        return l !== 0 || r !== 0 ? 1 : 0;
      case '&&':
        return l !== 0 && r !== 0 ? 1 : 0;
      case '==':
        return l === r ? 1 : 0;
      case '!=':
        return l !== r ? 1 : 0;
      case '<':
        return l < r ? 1 : 0;
      case '<=':
        return l <= r ? 1 : 0;
      case '>':
        return l > r ? 1 : 0;
      case '>=':
        return l >= r ? 1 : 0;
      case '+':
        return l + r;
      case '-':
        return l - r;
      case '*':
        return l * r;
      case '/':
        return r === 0 ? 0 : l / r;
      case '%':
        return r === 0 ? 0 : l % r;
      default:
        throw new ParseError(`unknown operator "${op}"`);
    }
  }

  function binary(minPrec: number): CompiledExpr {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.k !== 'op') break;
      const prec = PRECEDENCE[t.v];
      if (prec === undefined || prec < minPrec) break;
      pos++;
      const right = binary(prec + 1); // left associative
      const op = t.v;
      const l = left;
      left = { eval: (ctx) => apply(op, l.eval(ctx), right.eval(ctx)) };
    }
    return left;
  }

  const expr = binary(0);
  if (pos !== toks.length) throw new ParseError(`unexpected "${describe(toks[pos])}"`);
  return expr;
}

function describe(t: Tok): string {
  return t.k === 'num' ? String(t.v) : t.v;
}

export function compile(src: string, allowed: readonly string[]): CompileResult {
  try {
    const toks = tokenize(src);
    if (toks.length === 0) throw new ParseError('empty expression');
    return { ok: true, expr: parse(toks, allowed) };
  } catch (e) {
    return { ok: false, error: e instanceof ParseError ? e.message : String(e) };
  }
}

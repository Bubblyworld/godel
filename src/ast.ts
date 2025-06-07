/**
 * Types of nodes in the first-order logic syntax tree:
 */
export const enum NodeKind {
  Var, // variable term x
  Const, // constant term c
  FunApp, // atomic term f(x_1, ..., x_n) for n-ary function f
  Atom, // atomic formula  R(x_1, ..., x_n) for n-ary relation R
  Not, // negation of a formula
  And, // conjunction of two formulas
  Or, // disjunction of two formulas
  Implies, // implication of two formulas
  ForAll, // universal quantification of a formula
  Exists, // existential quantification of a formula
}

/**
 * Represents a first-order term, which is either a variable, constant or an
 * application of an n-ary function to n subterms.
 */
export type Term =
  | { kind: NodeKind.Var; idx: number }
  | { kind: NodeKind.Const; idx: number }
  | { kind: NodeKind.FunApp; idx: number; args: Term[] };

/**
 * Represents a first-order formula, which is either an application of an n-ary
 * relation to n subterms, or a logical combination of formulas.
 */
export type Formula =
  | { kind: NodeKind.Atom; idx: number; args: Term[] }
  | { kind: NodeKind.Not; arg: Formula }
  | { kind: NodeKind.And; left: Formula; right: Formula }
  | { kind: NodeKind.Or; left: Formula; right: Formula }
  | { kind: NodeKind.Implies; left: Formula; right: Formula }
  | { kind: NodeKind.ForAll; vars: number[]; arg: Formula }
  | { kind: NodeKind.Exists; vars: number[]; arg: Formula };

/**
 * Types of symbols in a first-order language:
 */
export const enum SymbolKind {
  Var, // variable symbol x
  Const, // constant symbol c
  Fun, // function symbol f
  Rel, // relation symbol R
}

/**
 * Represents a symbol table for a first-order context, which maps variables,
 * constants, functions and relations to their symbols and metadata. Uses symbols
 * instead of strings to guarantee uniqueness and protect against name collisions.
 */
export type SymbolTable = {
  vars: { symbol: symbol }[];
  consts: { symbol: symbol }[];
  funs: { symbol: symbol; arity: number }[];
  rels: { symbol: symbol; arity: number }[];
}

/**
 * Represents a failure to resolve a symbol against a symbol table.
 */
export class UnresolvedSymbolError extends Error {
  constructor(
    public readonly kind: SymbolKind,
    public readonly idx: number,
    public readonly st: SymbolTable,
  ) {
    super(`symbol ${kind}/${idx} could not be resolved in the given symbol table`);
  }
}

/**
 * Represents a use of a function or relation symbol with invalid arity.
 */
export class InvalidSymbolArityError extends Error {
  constructor(
    public readonly kind: SymbolKind.Fun | SymbolKind.Rel,
    public readonly idx: number,
    public readonly arity: number,
    public readonly st: SymbolTable,
  ) {
    let name = '';
    try {
      name = `(${resolve(kind as any, idx, st).symbol.description ?? ''}) `;
    } catch (err) {
      if (!(err instanceof UnresolvedSymbolError)) {
        throw err;
      }
    }
    super(`symbol ${kind}/${idx} ${name}was used with arity ${arity} which does not match symbol table`);
  }
}

/**
 * Resolves a symbol against a symbol table and throws if it's not found.
 */
export function resolve(kind: SymbolKind.Var, idx: number, st: SymbolTable): SymbolTable['vars'][number];
export function resolve(kind: SymbolKind.Const, idx: number, st: SymbolTable): SymbolTable['consts'][number];
export function resolve(kind: SymbolKind.Fun, idx: number, st: SymbolTable): SymbolTable['funs'][number];
export function resolve(kind: SymbolKind.Rel, idx: number, st: SymbolTable): SymbolTable['rels'][number];
export function resolve(kind: SymbolKind, idx: number, st: SymbolTable): SymbolTable[keyof SymbolTable][number] {
  let res: SymbolTable[keyof SymbolTable][number] | undefined;
  switch(kind) {
    case SymbolKind.Var: res = st.vars[idx]; break;
    case SymbolKind.Const: res = st.consts[idx]; break;
    case SymbolKind.Fun: res = st.funs[idx]; break;
    case SymbolKind.Rel: res = st.rels[idx]; break;
    default:
      const _exhaustive: never = kind;
      throw new Error(_exhaustive);
  }

  if (res == null) {
    throw new UnresolvedSymbolError(kind, idx, st);
  } else {
    return res;
  }
}

/**
 * Helper for traversing formulas:
 */
export function visit<T>(
  f: Formula | Term,
  cbs: {
    Var: (f: Term & { kind: NodeKind.Var }) => T,
    Const: (f: Term & { kind: NodeKind.Const }) => T,
    FunApp: (f: Term & { kind: NodeKind.FunApp }) => T,
    Atom: (f: Formula & { kind: NodeKind.Atom }) => T,
    Not: (f: Formula & { kind: NodeKind.Not }) => T,
    And: (f: Formula & { kind: NodeKind.And }) => T,
    Or: (f: Formula & { kind: NodeKind.Or }) => T,
    Implies: (f: Formula & { kind: NodeKind.Implies }) => T,
    ForAll: (f: Formula & { kind: NodeKind.ForAll }) => T,
    Exists: (f: Formula & { kind: NodeKind.Exists }) => T,
  },
): T {
  switch(f.kind) {
    case NodeKind.Var: return cbs.Var(f);
    case NodeKind.Const: return cbs.Const(f);
    case NodeKind.FunApp: return cbs.FunApp(f);
    case NodeKind.Atom: return cbs.Atom(f);
    case NodeKind.Not: return cbs.Not(f);
    case NodeKind.And: return cbs.And(f);
    case NodeKind.Or: return cbs.Or(f);
    case NodeKind.Implies: return cbs.Implies(f);
    case NodeKind.ForAll: return cbs.ForAll(f);
    case NodeKind.Exists: return cbs.Exists(f);
    default:
      const _exhaustive: never = f;
      throw new Error(_exhaustive);
  }
}

/**
 * Helper for rendering a formula or term against a symbol table:
 */
export function render(
  f: Formula | Term,
  st: SymbolTable,
): string {
  const _render = (f: Formula | Term): string => visit(f, {
    Var: f => resolve(SymbolKind.Var, f.idx, st).symbol.description ?? '',
    Const: f => resolve(SymbolKind.Const, f.idx, st).symbol.description ?? '',
    FunApp: f => {
      const res = resolve(SymbolKind.Fun, f.idx, st);
      if (f.args.length !== res.arity) {
        throw new InvalidSymbolArityError(SymbolKind.Fun, f.idx, f.args.length, st);
      }
      const children = f.args.map(_render);
      return `${res.symbol.description ?? ''}(${children.join(', ')})`;
    },
    Atom: f => {
      const res = resolve(SymbolKind.Rel, f.idx, st);
      if (f.args.length !== res.arity) {
        throw new InvalidSymbolArityError(SymbolKind.Rel, f.idx, f.args.length, st);
      }
      const children = f.args.map(_render);
      return `${res.symbol.description ?? ''}(${children.join(', ')})`;
    },
    Not: f => `¬${_render(f.arg)}`,
    And: f => `(${_render(f.left)}∧${_render(f.right)})`,
    Or: f => `(${_render(f.left)}∨${_render(f.right)})`,
    Implies: f => `(${_render(f.left)}→${_render(f.right)})`,
    ForAll: f => {
      const vars = f.vars.map(idx => _render({ kind: NodeKind.Var, idx }));
      return `(∀${vars.join(',')}.${_render(f.arg)})`;
    },
    Exists: f => {
      const vars = f.vars.map(idx => _render({ kind: NodeKind.Var, idx }));
      return `(∃${vars.join(',')}.${_render(f.arg)})`;
    },
  });

  return _render(f);
}

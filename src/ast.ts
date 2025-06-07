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
 * Types of symbols in a first-order language:
 */
export const enum SymbolKind {
  Var, // variable symbol x
  Const, // constant symbol c
  Fun, // function symbol f
  Rel, // relation symbol R
}

/**
 * Represents an entry in a symbol table.
 */
export type SymbolEntry = 
  | { kind: SymbolKind.Var; symbol: symbol; idx: number }
  | { kind: SymbolKind.Const; symbol: symbol; idx: number }
  | { kind: SymbolKind.Fun; symbol: symbol; arity: number; idx: number }
  | { kind: SymbolKind.Rel; symbol: symbol; arity: number; idx: number };


/**
 * Represents a symbol table for a first-order context, which maps variables,
 * constants, functions and relations to their symbols and metadata. Uses symbols
 * instead of strings to guarantee uniqueness and protect against name collisions.
 */
export type SymbolTable = {
  vars: (SymbolEntry & { kind: SymbolKind.Var })[];
  consts: (SymbolEntry & { kind: SymbolKind.Const })[];
  funs: (SymbolEntry & { kind: SymbolKind.Fun })[];
  rels: (SymbolEntry & { kind: SymbolKind.Rel })[];
  varToIdx: Map<symbol, number>;
  constToIdx: Map<symbol, number>;
  funToIdx: Map<symbol, number>;
  relToIdx: Map<symbol, number>;
}

/**
 * Represents a failure to resolve a symbol against a symbol table.
 */
export class UnresolvedSymbolError extends Error {
  public readonly kindOrSymbol: symbol | SymbolKind;
  public readonly idxOrSt: SymbolTable | number;
  public readonly st: SymbolTable | undefined;

  constructor(sym: symbol, st: SymbolTable);
  constructor(kind: SymbolKind, idx: number, st: SymbolTable);
  constructor(
    kindOrSymbol: symbol | SymbolKind,
    idxOrSt: SymbolTable | number,
    st?: SymbolTable,
  ) {
    if (typeof kindOrSymbol === 'symbol') {
      super(`symbol '${(kindOrSymbol as symbol).description}' could not be resolved in the given symbol table`);
    } else {
      super(`symbol ${kindOrSymbol as SymbolKind}/${idxOrSt as number} could not be found in the given symbol table`);
    }
    
    this.kindOrSymbol = kindOrSymbol;
    this.idxOrSt = idxOrSt;
    this.st = st;
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
export function resolve(kind: SymbolKind.Var, idx: number, st: SymbolTable): SymbolEntry & { kind: SymbolKind.Var };
export function resolve(kind: SymbolKind.Const, idx: number, st: SymbolTable): SymbolEntry & { kind: SymbolKind.Const };
export function resolve(kind: SymbolKind.Fun, idx: number, st: SymbolTable): SymbolEntry & { kind: SymbolKind.Fun };
export function resolve(kind: SymbolKind.Rel, idx: number, st: SymbolTable): SymbolEntry & { kind: SymbolKind.Rel };
export function resolve(symbol: symbol, st: SymbolTable): SymbolEntry;
export function resolve(
  kindOrSymbol: SymbolKind | symbol,
  idxOrSt: number | SymbolTable,
  st?: SymbolTable,
): SymbolEntry {
  if (typeof kindOrSymbol === 'symbol') {
    const st = idxOrSt as SymbolTable;
    
    const varIdx = st.varToIdx.get(kindOrSymbol);
    if (varIdx !== undefined) {
      return st.vars[varIdx]!;
    }
    
    const constIdx = st.constToIdx.get(kindOrSymbol);
    if (constIdx !== undefined) {
      return st.consts[constIdx]!;
    }
    
    const funIdx = st.funToIdx.get(kindOrSymbol);
    if (funIdx !== undefined) {
      return st.funs[funIdx]!;
    }
    
    const relIdx = st.relToIdx.get(kindOrSymbol);
    if (relIdx !== undefined) {
      return st.rels[relIdx]!;
    }

    throw new UnresolvedSymbolError(kindOrSymbol, st);
  }
  
  const kind = kindOrSymbol as SymbolKind;
  const idx = idxOrSt as number;
  
  let res: SymbolEntry | undefined;
  switch(kind) {
    case SymbolKind.Var: res = st!.vars[idx]; break;
    case SymbolKind.Const: res = st!.consts[idx]; break;
    case SymbolKind.Fun: res = st!.funs[idx]; break;
    case SymbolKind.Rel: res = st!.rels[idx]; break;
    default:
      const _exhaustive: never = kind;
      throw new Error(_exhaustive);
  }

  if (res == null) {
    throw new UnresolvedSymbolError(kind, idx, st!);
  } else {
    return res;
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

/**
 * Creates an empty symbol table with initialized caching maps.
 */
export function createSymbolTable(): SymbolTable {
  return {
    vars: [],
    consts: [],
    funs: [],
    rels: [],
    varToIdx: new Map(),
    constToIdx: new Map(),
    funToIdx: new Map(),
    relToIdx: new Map(),
  };
}

/**
 * Add a symbol to the given symbol table. If the symbol is already present
 * the existing entry is returned. If the symbol is already present but does
 * not match the provided inputs then this throws.
 */
export function add(st: SymbolTable, kind: SymbolKind.Var, symbol: symbol): SymbolEntry & { kind: SymbolKind.Var };
export function add(st: SymbolTable, kind: SymbolKind.Const, symbol: symbol): SymbolEntry & { kind: SymbolKind.Const };
export function add(st: SymbolTable, kind: SymbolKind.Fun, symbol: symbol, arity: number): SymbolEntry & { kind: SymbolKind.Fun };
export function add(st: SymbolTable, kind: SymbolKind.Rel, symbol: symbol, arity: number): SymbolEntry & { kind: SymbolKind.Rel };
export function add(
  st: SymbolTable, 
  kind: SymbolKind, 
  symbol: symbol, 
  arity?: number
): SymbolEntry {
  try {
    const existing = resolve(symbol, st);
    if (existing.kind !== kind) {
      throw new Error(`expected symbol '${symbol.description}' to have kind ${existing.kind}`);
    }
    if (existing.kind === SymbolKind.Fun || existing.kind === SymbolKind.Rel) {
      if (arity == null || arity != existing.arity) {
        throw new Error(`expected symbol '${symbol.description}' to have arity ${existing.arity}`);
      }
    }
    return existing;
  } catch (err) {
    if (!(err instanceof UnresolvedSymbolError)) {
      throw err;
    }
  }

  switch(kind) {
    case SymbolKind.Var: {
      const entry = { kind, symbol, idx: st.vars.length };
      st.vars.push(entry);
      st.varToIdx.set(symbol, entry.idx);
      return entry;
    }
    case SymbolKind.Const: {
      const entry = { kind, symbol, idx: st.consts.length };
      st.consts.push(entry);
      st.constToIdx.set(symbol, entry.idx);
      return entry;
    }
    case SymbolKind.Fun: {
      if (arity == null) {
        throw new Error(`expected symbol of kind '${kind}' to have an arity`);
      }
      const entry = { kind, symbol, arity, idx: st.funs.length };
      st.funs.push(entry);
      st.funToIdx.set(symbol, entry.idx);
      return entry;
    }
    case SymbolKind.Rel: {
      if (arity == null) {
        throw new Error(`expected symbol of kind '${kind}' to have an arity`);
      }
      const entry = { kind, symbol, arity, idx: st.rels.length };
      st.rels.push(entry);
      st.relToIdx.set(symbol, entry.idx);
      return entry;
    }
    default:
      const _exhaustive: never = kind;
      throw new Error(_exhaustive);
  }
}

export type NodeConstructor<T> = (fns: {
  var: (sym: symbol) => Term & { kind: NodeKind.Var };
  const: (sym: symbol) => Term & { kind: NodeKind.Const };
  func: (sym: symbol, ...args: Term[]) => Term & { kind: NodeKind.FunApp };
  atom: (sym: symbol, ...args: Term[]) => Formula & { kind: NodeKind.Atom };
  not: (arg: Formula) => Formula & { kind: NodeKind.Not };
  and: (left: Formula, right: Formula) => Formula & { kind: NodeKind.And };
  or: (left: Formula, right: Formula) => Formula & { kind: NodeKind.Or };
  implies: (left: Formula, right: Formula) => Formula & { kind: NodeKind.Implies };
  forall: (vars: symbol[], arg: Formula) => Formula & { kind: NodeKind.ForAll };
  exists: (vars: symbol[], arg: Formula) => Formula & { kind: NodeKind.Exists };
}) => T;

/**
 * Higher-level constructor for AST nodes that works with Symbols natively
 * and automatically handles the symbol table for you.
 */
export function construct<T>(st: SymbolTable, nc: NodeConstructor<T>): T {
  return nc({
    var: (sym: symbol) => {
      const entry = add(st, SymbolKind.Var, sym);
      return { kind: NodeKind.Var, idx: entry.idx };
    },
    const: (sym: symbol) => {
      const entry = add(st, SymbolKind.Const, sym);
      return { kind: NodeKind.Const, idx: entry.idx };
    },
    func: (sym: symbol, ...args: Term[]) => {
      const entry = add(st, SymbolKind.Fun, sym, args.length);
      return { kind: NodeKind.FunApp, idx: entry.idx, args };
    },
    atom: (sym: symbol, ...args: Term[]) => {
      const entry = add(st, SymbolKind.Rel, sym, args.length);
      return { kind: NodeKind.Atom, idx: entry.idx, args };
    },
    not: (arg: Formula) => ({ kind: NodeKind.Not, arg }),
    and: (left: Formula, right: Formula) => ({ kind: NodeKind.And, left, right }),
    or: (left: Formula, right: Formula) => ({ kind: NodeKind.Or, left, right }),
    implies: (left: Formula, right: Formula) => ({ kind: NodeKind.Implies, left, right }),
    forall: (vars: symbol[], arg: Formula) => {
      const varIndices = vars.map(sym => add(st, SymbolKind.Var, sym).idx);
      return { kind: NodeKind.ForAll, vars: varIndices, arg };
    },
    exists: (vars: symbol[], arg: Formula) => {
      const varIndices = vars.map(sym => add(st, SymbolKind.Var, sym).idx);
      return { kind: NodeKind.Exists, vars: varIndices, arg };
    },
  });
}

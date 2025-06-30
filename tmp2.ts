import assert from "assert";

type SymbolId = number;

interface SymbolInfo {
  readonly name: string;
  readonly arity: number;
  readonly idx: SymbolId;
}

class SymbolTable {
  private syms: SymbolInfo[] = [];
  private index: Map<string, SymbolId> = new Map();

  intern(name: string, arity: number = 0): SymbolId {
    const key = `${name}/${arity}`;
    let idx = this.index.get(key);
    if (idx == null) {
      idx = this.syms.length;
      this.index.set(key, idx);
      this.syms.push({ name, arity, idx });
    }
    return idx;
  }

  sym(idx: SymbolId): SymbolInfo {
    return this.syms[idx];
  }
}

type TermId = number;

const enum TermKind {
  Var = 0,
  Fun = 1,
}

interface Term {
  kind: TermKind;
  sym: SymbolId;
  idx: TermId;
  prev?: Term;
  next?: Term;
  end?: Term;
}

interface DTree {
  vars: Map<SymbolId, DTree>;
  funs: Map<SymbolId, DTree>;
  term?: TermId;
  // clause positions
}

class TermIndex {
  private terms: Term[] = [];
  private dtree: DTree = this.emptyDTree();

  var(sym: SymbolId, prev?: Term, here = this.dtree): DTree {
    if (here.vars.has(sym)) {
      return here.vars.get(sym)!;
    }

    const idx = this.terms.length;
    const tree = this.emptyDTree();
    tree.term = idx;
    here.vars.set(sym, tree);
    this.terms.push({
      kind: TermKind.Var,
      prev,
      sym,
      idx,
    });

    return tree;
  }

  fun(sym: SymbolId, args: TermId[], prev?: Term, here = this.dtree): DTree {
    if (!here.funs.has(sym)) {
      here.funs.set(sym, this.emptyDTree());
    }

    here = here.funs.get(sym)!;
    for (const arg of args) {
    }

    if (here.term) return here;
    // TODO
  }

  term(idx: TermId): Term {
    return this.terms[idx];
  }

  private emptyDTree(): DTree {
    return {
      vars: new Map(),
      funs: new Map(),
    };
  }
}

import assert from "assert";

type SymbolId = number;

type SymbolInfo = {
  readonly name: string;
  readonly sym: SymbolId;
  readonly var: true;
} | {
  readonly name: string;
  readonly sym: SymbolId;
  readonly arity: number;
  readonly var: false;
}

class SymbolTable {
  private syms: SymbolInfo[] = [];
  private index: Map<string, SymbolId> = new Map();

  var(name: string) {
    return this.intern(name);
  }

  fun(name: string, arity: number) {
    return this.intern(name, arity);
  }

  intern(name: string, arity?: number): SymbolId {
    const key = arity == null ? name : `${name}/${arity}`;
    let sym = this.index.get(key);
    if (sym == null) {
      sym = this.syms.length;
      this.index.set(key, sym);
      if (arity == null) {
        this.syms.push({ name, sym, var: true });
      } else {
        this.syms.push({ name, arity, sym, var: false });
      }
    } else {
      const info = this.info(sym);
      if (info.var && arity != null) {
        throw new Error(`symbol '${name}' already used for variable`);
      }
      if (!info.var && arity == null) {
        throw new Error(`symbol '${name}' already used for function`);
      }
    }

    return sym;
  }

  info(sym: SymbolId): SymbolInfo {
    return this.syms[sym];
  }
}

const enum TermKind {
  Var = 0,
  Fun = 1,
}

type Term = {
  sym: SymbolId;
  kind: TermKind.Var; 
} | {
  sym: SymbolId;
  kind: TermKind.Fun; 
  args: Term[];
}

interface TermNode {
  next: Map<SymbolId, TermNode>;
  term?: Term;
}

class TermTree {
  private st: SymbolTable = new SymbolTable();
  private root: TermNode = { next: new Map() };

  var(name: string, here?: TermNode): Term;
  var(sym: SymbolId, here?: TermNode): Term;
  var(sn: string | SymbolId, here: TermNode = this.root): Term {
    const sym: SymbolId = typeof(sn) == 'string' ? this.st.var(sn) : sn;

    const info = this.st.info(sym);
    if (!info.var) {
      throw new Error(`symbol '${info.name}' is not a variable symbol`);
    }

    if (here.next.has(sym)) {
      return here.next.get(sym)!.term!;
    }

    const term: Term = { sym, kind: TermKind.Var };
    here.next.set(sym, { term, next: new Map() });
    return term;
  }

  fun(name: string, args: Term[], here?: TermNode): Term;
  fun(sym: SymbolId, args: Term[], here?: TermNode): Term;
  fun(sn: string | SymbolId, args: Term[], here: TermNode = this.root): Term {
    const sym: SymbolId = typeof(sn) == 'string' ? this.st.fun(sn, args.length) : sn;

    const info = this.st.info(sym);
    if (info.var) {
      throw new Error(`symbol '${info.name}' is not a function symbol`);
    }
    if (info.arity != args.length) {
      throw new Error(`function ${info.name}/${info.arity} received ${args.length} args`);
    }

    const iterate = (t: Term) => {
      if (!here.next.has(t.sym)) {
        here.next.set(t.sym, { next: new Map() });
        here = here.next.get(t.sym)!;
      } else {
        here = here.next.get(t.sym)!;
      }

      if (t.kind == TermKind.Fun) {
        t.args.map(iterate);
      }
    };

    const term: Term = {
      sym,
      args,
      kind: TermKind.Fun,
    };

    iterate(term);
    if (here.term) {
      return here.term;
    }

    here.term = term;
    return term;
  }

  const(name: string, here?: TermNode): Term;
  const(sym: SymbolId, here?: TermNode): Term;
  const(sn: string | SymbolId, here: TermNode = this.root): Term {
    if (typeof sn === 'string') {
      return this.fun(sn, [], here);
    } else {
      return this.fun(sn, [], here);
    }
  }

  render(): string;
  render(t: Term): string;
  render(t?: Term): string {
    if (t == null) {
      return this._renderSelf();
    }

    const info = this.st.info(t.sym);
    if (t.kind == TermKind.Var) {
      return info.name;
    } else {
      if (!info.var && info.arity == 0) return info.name + this.toSuperscript(info.arity);
      if (!info.var) {
        return info.name + this.toSuperscript(info.arity) + "(" + t.args.map(
          this.render.bind(this)).join(', ') + ')';
      }
    }
    
    throw new Error('cannot be reached');
  }

  private _renderSelf(): string {
    let res = "";
    const iterate = (here: TermNode, depth = 0) => {
      for (const sym of here.next.keys()) {
        const info = this.st.info(sym);
        if (info.var) {
          res += `${" ".repeat(depth)}${info.name}`;
        } else {
          res += `${" ".repeat(depth)}${info.name}${this.toSuperscript(info.arity)}`;
        }
        
        if (here.next.get(sym)!.term != null) {
          res += ` <- ${this.render(here.next.get(sym)!.term!)}`;
        }

        res += '\n';
        iterate(here.next.get(sym)!, depth+1); 
      }
    };

    iterate(this.root);
    return res;
  }

  private toSuperscript(n: number): string {
    const tr = {
      "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
      "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹"
    };

    return n.toString().split("").map(c => tr[c]).join("");
  }

  public countNodes(here: TermNode = this.root): number {
    let cnt = 1;
    for (const next of here.next.values()) {
      cnt += this.countNodes(next);
    }
    return cnt;
  }

  public countTerms(here: TermNode = this.root): number {
    let cnt = here.term != null ? 1 : 0;
    for (const next of here.next.values()) {
      cnt += this.countTerms(next);
    }
    return cnt;
  }

  public countDepth(here: TermNode = this.root, depth=0): number {
    let cnt = here.term != null ? depth : 0;
    for (const next of here.next.values()) {
      cnt += this.countDepth(next, depth+1);
    }
    return cnt;
  }
}

const tt = new TermTree();
const vars = 'uvwxyz';
const funs = 'fghijk';
const cons = 'abcde';
const sample = (opts: string): string => opts[Math.floor(Math.random()*opts.length)];
function generateTerm(p: number = 0.5, b: number = 3) {
  if (Math.random() < p) {
    return tt.var(sample(vars));
  } else {
    const args: Term[] = [];
    for (let i = 0; i < Math.floor(Math.random()*(1+b)); i++) {
      args.push(generateTerm());
    }
    if (args.length === 0) {
      return tt.fun(sample(cons), []);
    } else {
      return tt.fun(sample(funs), args);
    }
  }
}

const k = 50_000;
for (let j = 0; j < 20; j++) {
  for (let i = 0; i < k; i++) {
    generateTerm(0.1);
  }

  const x = tt.countTerms();
  const y = tt.countNodes();
  const z = tt.countDepth();
  console.log(`${x} , ${y} (~${(y/x).toPrecision(2)}) , ${z} (~${(z/x).toPrecision(2)})`);
}

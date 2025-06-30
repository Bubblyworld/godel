/**
 * Ultra‑minimalist *hash‑consed* AST for a first‑order resolution prover
 * Version 12 – fixed Martelli–Montanari (eager σ‑application) and full demo
 * © 2025 ChatGPT – MIT licence
 */

/* -------------------------------------------------------------------------- */
/* Utility hashing                                                            */
/* -------------------------------------------------------------------------- */

function hashCombine(h: number, x: number): number {
  h ^= x + 0x9e3779b9 + (h << 6) + (h >>> 2);
  return h >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Public ID aliases                                                          */
/* -------------------------------------------------------------------------- */

export type SymId     = number;
export type VarId     = number;
export type TermId    = number;
export type LiteralId = number;
export type ClauseId  = number;

/* -------------------------------------------------------------------------- */
/* Symbol table                                                               */
/* -------------------------------------------------------------------------- */

interface SymbolInfo { readonly name: string; readonly arity: number; }

class SymbolTable {
  private infos: SymbolInfo[] = [];
  private index: Map<string, SymId> = new Map();

  intern(name: string, arity = 0): SymId {
    const k = `${name}/${arity}`;
    let id = this.index.get(k);
    if (id === undefined) { id = this.infos.length; this.index.set(k, id); this.infos.push({ name, arity }); }
    return id;
  }
  info(id: SymId) { return this.infos[id]; }
}

/* -------------------------------------------------------------------------- */
/* Terms                                                                       */
/* -------------------------------------------------------------------------- */

const enum TermKind { Var = 0, Const = 1, Fun = 2 }
interface VarTerm   { readonly k: TermKind.Var;   readonly v: VarId; }
interface ConstTerm { readonly k: TermKind.Const; readonly sym: SymId; }
interface FunTerm   { readonly k: TermKind.Fun;   readonly sym: SymId; readonly args: readonly TermId[]; }
export type Term = VarTerm | ConstTerm | FunTerm;

class TermArena {
  private terms: Term[] = [];
  private buckets: Map<number, TermId[]> = new Map();
  /* hashing helpers */
  private hashVar(v: VarId)               { return (v << 2) | 0x1; }
  private hashConst(s: SymId)             { return (s << 2) | 0x2; }
  private hashFun(s: SymId, a: TermId[])  { let h = (s << 2) | 0x3; for (const id of a) h = hashCombine(h, id); return h; }

  /* canonicalised construction */
  var(id: VarId) { return this.cons(this.hashVar(id), { k: TermKind.Var, v: id }, t => (t as VarTerm).v === id); }
  constant(sym: SymId) { return this.cons(this.hashConst(sym), { k: TermKind.Const, sym }, t => (t as ConstTerm).sym === sym); }
  fun(sym: SymId, args: TermId[]) {
    const h = this.hashFun(sym, args);
    return this.cons(h, { k: TermKind.Fun, sym, args: [...args] }, t => {
      const f = t as FunTerm;
      if (f.sym !== sym || f.args.length !== args.length) return false;
      for (let i = 0; i < args.length; ++i) if (f.args[i] !== args[i]) return false;
      return true;
    });
  }
  private cons(hash: number, node: Term, eq: (o: Term) => boolean): TermId {
    const bucket = this.buckets.get(hash);
    if (bucket) for (const id of bucket) if (eq(this.terms[id])) return id;
    const id = this.terms.length; this.terms.push(node);
    bucket ? bucket.push(id) : this.buckets.set(hash, [id]);
    return id;
  }
  get(id: TermId) { return this.terms[id]; }

  /* Martelli–Montanari with eager σ‑application */
  unifyPairs(pairs: [TermId, TermId][], σ: Map<VarId, TermId> = new Map()): Map<VarId, TermId> | null {
    const deref = (id: TermId): TermId => {
      const t = this.terms[id];
      return t.k === TermKind.Var && σ.has((t as VarTerm).v) ? deref(σ.get((t as VarTerm).v)!) : id;
    };

    const applyToQueue = () => {
      for (let i = 0; i < pairs.length; ++i) {
        const [l, r] = pairs[i];
        pairs[i] = [deref(l), deref(r)];
      }
    };

    while (pairs.length) {
      let [s, t] = pairs.pop()!;
      s = deref(s); t = deref(t);
      if (s === t) continue;

      const ns = this.terms[s];
      const nt = this.terms[t];
      if (nt.k === TermKind.Var && ns.k !== TermKind.Var) [s, t] = [t, s];

      if (this.terms[s].k === TermKind.Var) {
        const v = (this.terms[s] as VarTerm).v;
        if (this.occurs(v, t, σ)) return null;
        σ.set(v, t);
        applyToQueue();
        continue;
      }

      if (ns.k !== nt.k) return null;
      if (ns.k === TermKind.Const) {
        if ((ns as ConstTerm).sym !== (nt as ConstTerm).sym) return null;
        continue;
      }

      const fs = ns as FunTerm;
      const ft = nt as FunTerm;
      if (fs.sym !== ft.sym || fs.args.length !== ft.args.length) return null;
      for (let i = 0; i < fs.args.length; ++i) pairs.push([fs.args[i], ft.args[i]]);
    }
    return σ;
  }
  private occurs(v:VarId, t:TermId, σ:Map<VarId,TermId>):boolean{ const n=this.terms[t]; if(n.k===TermKind.Var){ const rep=σ.get((n as VarTerm).v); return rep!==undefined?this.occurs(v,rep,σ):(n as VarTerm).v===v;} if(n.k===TermKind.Fun) return (n as FunTerm).args.some(a=>this.occurs(v,a,σ)); return false; }
}

/* -------------------------------------------------------------------------- */
/* Literals                                                                   */
/* -------------------------------------------------------------------------- */

interface Literal { readonly pred: SymId; readonly args: readonly TermId[]; readonly neg: boolean; }
class LiteralArena {
  private lits: Literal[] = [];
  private buckets: Map<number, LiteralId[]> = new Map();
  private hash(p:SymId,a:readonly TermId[],n:boolean){ let h=(p<<1)|(n?1:0); for(const id of a) h=hashCombine(h,id); return h; }
  atom(pred:SymId,args:TermId[],neg=false){ const h=this.hash(pred,args,neg); let b=this.buckets.get(h); if(b){outer:for(const id of b){ const l=this.lits[id]; if(l.neg!==neg||l.pred!==pred||l.args.length!==args.length) continue; for(let i=0;i<args.length;++i) if(l.args[i]!==args[i]) continue outer; return id; }} const id=this.lits.length; this.lits.push({pred,args:[...args],neg}); b?b.push(id):this.buckets.set(h,[id]); return id; }
  get(id:LiteralId){ return this.lits[id]; }
}

/* -------------------------------------------------------------------------- */
/* Clauses (with edit helpers)                                                */
/* -------------------------------------------------------------------------- */

interface Clause { readonly lits: readonly LiteralId[]; }
class ClauseArena {
  private clauses: Clause[] = [];
  private buckets: Map<number, ClauseId[]> = new Map();
  private hash(lits: readonly LiteralId[]){ let h=lits.length; for(const id of lits) h=hashCombine(h,id); return h; }
  private intern(sorted: LiteralId[]): ClauseId {
    const h=this.hash(sorted); let b=this.buckets.get(h);
    if(b){outer:for(const cid of b){ const c=this.clauses[cid]; if(c.lits.length!==sorted.length) continue; for(let i=0;i<sorted.length;++i) if(c.lits[i]!==sorted[i]) continue outer; return cid; }}
    const cid=this.clauses.length; this.clauses.push({lits:sorted}); b?b.push(cid):this.buckets.set(h,[cid]); return cid;
  }
  clause(lits:LiteralId[]){ lits.sort((a,b)=>a-b); return this.intern([...lits]); }
  get(id:ClauseId){ return this.clauses[id]; }

  addLiteral(cid:ClauseId,lid:LiteralId){ const set=new Set(this.clauses[cid].lits); if(set.has(lid)) return cid; set.add(lid); const arr=[...set].sort((a,b)=>a-b); return this.intern(arr); }
  removeLiteral(cid:ClauseId,lid:LiteralId){ const old=this.clauses[cid].lits; if(!old.includes(lid)) return cid; const arr=old.filter(x=>x!==lid); if(arr.length===0) return null; return this.intern(arr); }
  join(c1:ClauseId,c2:ClauseId){ const set=new Set([...this.clauses[c1].lits,...this.clauses[c2].lits]); const arr=[...set].sort((a,b)=>a-b); return this.intern(arr); }
  applySubst(cid:ClauseId, σ:Map<VarId,TermId>, litArena:LiteralArena, termArena:TermArena){ const newLits:LiteralId[]=[]; for(const lid of this.clauses[cid].lits){ const l=litArena.get(lid); const newArgs=l.args.map(tid=>this.applyTerm(tid,σ,termArena)); newLits.push(litArena.atom(l.pred,newArgs,l.neg)); } newLits.sort((a,b)=>a-b); return this.intern(newLits); }
  private applyTerm(tid:TermId, σ:Map<VarId,TermId>, termArena:TermArena):TermId { const t=termArena.get(tid); if(t.k===TermKind.Var){ const rep=σ.get((t as VarTerm).v); return rep!==undefined?rep:tid;} if(t.k===TermKind.Const) return tid; const f=t as FunTerm; const newArgs=f.args.map(a=>this.applyTerm(a,σ,termArena)); if(newArgs.every((v,i)=>v===f.args[i])) return tid; return termArena.fun(f.sym,newArgs);} }

/* -------------------------------------------------------------------------- */
/* AST façade                                                                 */
/* -------------------------------------------------------------------------- */

export class AST {
  readonly syms=new SymbolTable();
  readonly terms=new TermArena();
  readonly lits=new LiteralArena();
  readonly clauses=new ClauseArena();
  private vars=new Map<string,VarId>(); private varNames:string[]=[]; private nextVar=0;

  /* builders */
  var(n:string){ let id=this.vars.get(n); if(id===undefined){ id=this.nextVar++; this.vars.set(n,id); this.varNames[id]=n; } return id; }
  variable(n:string){ return this.terms.var(this.var(n)); }
  constant(n:string){ return this.terms.constant(this.syms.intern(n,0)); }
  fun(n:string,...args:TermId[]){ return this.terms.fun(this.syms.intern(n,args.length),args); }
  atom(p:string,args:TermId[]){ return this.lits.atom(this.syms.intern(p,args.length),args,false); }
  negAtom(p:string,args:TermId[]){ return this.lits.atom(this.syms.intern(p,args.length),args,true); }
  clause(...lits:LiteralId[]){ return this.clauses.clause(lits); }

  /* helpers */
  addLit(c:ClauseId,l:LiteralId){ return this.clauses.addLiteral(c,l); }
  removeLit(c:ClauseId,l:LiteralId){ return this.clauses.removeLiteral(c,l); }
  joinClauses(c1:ClauseId,c2:ClauseId){ return this.clauses.join(c1,c2); }
  applySubstClause(c:ClauseId, σ:Map<VarId,TermId>){ return this.clauses.applySubst(c,σ,this.lits,this.terms); }
  unifyLiterals(a:LiteralId,b:LiteralId){ const la=this.lits.get(a), lb=this.lits.get(b); if(la.pred!==lb.pred||la.args.length!==lb.args.length) return null; const pairs: [TermId,TermId][]=la.args.map((t,i)=>[t,lb.args[i]]); return this.terms.unifyPairs(pairs); }

  /* rendering */
  renderTerm(id:TermId):string{ const t=this.terms.get(id); if(t.k===TermKind.Var) return this.varNames[(t as VarTerm).v]??`V${(t as VarTerm).v}`; if(t.k===TermKind.Const) return this.syms.info((t as ConstTerm).sym).name; const f=t as FunTerm; return `${this.syms.info(f.sym).name}(${f.args.map(a=>this.renderTerm(a)).join(', ')})`; }
  renderLiteral(id:LiteralId){ const l=this.lits.get(id); const core=`${this.syms.info(l.pred).name}(${l.args.map(a=>this.renderTerm(a)).join(', ')})`; return l.neg?`¬${core}`:core; }
  renderClause(id:ClauseId){ return this.clauses.get(id).lits.map(l=>this.renderLiteral(l)).join(' ∨ '); }
  renderSubst(σ:Map<VarId,TermId>|null){ if(!σ) return '⟂'; if(σ.size===0) return '∅'; return [...σ.entries()].map(([v,t])=>`${this.varNames[v]} ↦ ${this.renderTerm(t)}`).join(', ');} }

/* -------------------------------------------------------------------------- */
/* DEMO                                                                       */
/* -------------------------------------------------------------------------- */

if(require.main===module){
  const ast=new AST();
  /* vars & consts */
  const X=ast.variable('X'), Y=ast.variable('Y'), Z=ast.variable('Z');
  const a=ast.constant('a'), b=ast.constant('b');
  /* terms */
  const t1=ast.fun('f', X, ast.fun('g', a));
  const t2=ast.fun('f', b, ast.fun('g', Z));
  /* literals */
  const L1=ast.atom('P', [t1, ast.fun('h', Y)]);
  const L2=ast.atom('P', [t2, ast.fun('h', b)]);

  console.log('L1:', ast.renderLiteral(L1));
  console.log('L2:', ast.renderLiteral(L2));
  const σ=ast.unifyLiterals(L1, L2);
  console.log('σ (MGU):', ast.renderSubst(σ));

  const clauseId=ast.clause(L1, ast.negAtom('Q', [b]));
  console.log('Clause:', ast.renderClause(clauseId));
}


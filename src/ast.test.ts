import { expect } from 'chai';
import {
  NodeKind,
  SymbolKind,
  type Term,
  type Formula,
  resolve,
  render,
  UnresolvedSymbolError,
  InvalidSymbolArityError,
  createSymbolTable,
  add,
  construct,
} from './ast';

const st = createSymbolTable();
const xSym = add(st, SymbolKind.Var, Symbol('x'));
const ySym = add(st, SymbolKind.Var, Symbol('y'));
const zSym = add(st, SymbolKind.Var, Symbol('z'));
const cSym = add(st, SymbolKind.Const, Symbol('c'));
const fSym = add(st, SymbolKind.Fun, Symbol('f'), 2);
const gSym = add(st, SymbolKind.Fun, Symbol('g'), 1);
const RSym = add(st, SymbolKind.Rel, Symbol('R'), 2);
const SSym = add(st, SymbolKind.Rel, Symbol('S'), 1);

const v = (i: number): Term => ({ kind: NodeKind.Var, idx: i });
const c = (i: number): Term => ({ kind: NodeKind.Const, idx: i });
const f = (i: number, ...args: Term[]): Term =>
  ({ kind: NodeKind.FunApp, idx: i, args });

const atom = (i: number, ...args: Term[]): Formula =>
  ({ kind: NodeKind.Atom, idx: i, args });

describe('ast.ts', () => {
  describe('Symbol table caching', () => {
    it('creates an empty symbol table', () => {
      const emptySt = createSymbolTable();
      expect(emptySt.vars).to.have.length(0);
      expect(emptySt.consts).to.have.length(0);
      expect(emptySt.funs).to.have.length(0);
      expect(emptySt.rels).to.have.length(0);
      expect(emptySt.varToIdx.size).to.equal(0);
      expect(emptySt.constToIdx.size).to.equal(0);
      expect(emptySt.funToIdx.size).to.equal(0);
      expect(emptySt.relToIdx.size).to.equal(0);
    });

    it('adds symbols with correct indices', () => {
      expect(xSym.idx).to.equal(0);
      expect(ySym.idx).to.equal(1);
      expect(zSym.idx).to.equal(2);
      expect(cSym.idx).to.equal(0);
      expect(fSym.idx).to.equal(0);
      expect(gSym.idx).to.equal(1);
      expect(RSym.idx).to.equal(0);
      expect(SSym.idx).to.equal(1);
    });

    it('resolves symbols in O(1) time', () => {
      expect(resolve(xSym.symbol, st).idx).to.equal(0);
      expect(resolve(ySym.symbol, st).idx).to.equal(1);
      expect(resolve(zSym.symbol, st).idx).to.equal(2);
      expect(resolve(cSym.symbol, st).idx).to.equal(0);
      expect(resolve(fSym.symbol, st).idx).to.equal(0);
      expect(resolve(gSym.symbol, st).idx).to.equal(1);
      expect(resolve(RSym.symbol, st).idx).to.equal(0);
      expect(resolve(SSym.symbol, st).idx).to.equal(1);
    });

    it('resolves symbols with correct kinds', () => {
      expect(resolve(xSym.symbol, st).kind).to.equal(SymbolKind.Var);
      expect(resolve(cSym.symbol, st).kind).to.equal(SymbolKind.Const);
      expect(resolve(fSym.symbol, st).kind).to.equal(SymbolKind.Fun);
      expect(resolve(RSym.symbol, st).kind).to.equal(SymbolKind.Rel);
    });

    it('throws for unknown symbols', () => {
      const unknownSym = Symbol('unknown');
      expect(() => resolve(unknownSym, st)).to.throw(UnresolvedSymbolError);
    });

    it('throws error when arity is missing for function/relation', () => {
      const testSt = createSymbolTable();
      expect(() => (add as any)(testSt, SymbolKind.Fun, Symbol('test'))).to.throw("expected symbol of kind '2' to have an arity");
      expect(() => (add as any)(testSt, SymbolKind.Rel, Symbol('test'))).to.throw("expected symbol of kind '3' to have an arity");
    });

    it('handles duplicate symbols correctly', () => {
      const testSt = createSymbolTable();
      const sym = Symbol('duplicate');
      
      // Add the same symbol twice - should return same index
      const first = add(testSt, SymbolKind.Var, sym);
      const second = add(testSt, SymbolKind.Var, sym);
      expect(first.idx).to.equal(second.idx);
      expect(testSt.vars).to.have.length(1);
    });

    it('throws error when adding symbol with different kind', () => {
      const testSt = createSymbolTable();
      const sym = Symbol('conflict');
      
      add(testSt, SymbolKind.Var, sym);
      expect(() => add(testSt, SymbolKind.Const, sym)).to.throw();
    });

    it('throws error when adding function with different arity', () => {
      const testSt = createSymbolTable();
      const sym = Symbol('conflict');
      
      add(testSt, SymbolKind.Fun, sym, 2);
      expect(() => add(testSt, SymbolKind.Fun, sym, 3)).to.throw();
    });
  });

  describe('resolve()', () => {
    it('resolves every kind correctly', () => {
      expect(resolve(SymbolKind.Var  , 2, st).symbol.description).to.equal('z');
      expect(resolve(SymbolKind.Const, 0, st).symbol.description).to.equal('c');
      expect(resolve(SymbolKind.Fun  , 1, st).symbol.description).to.equal('g');
      expect(resolve(SymbolKind.Rel  , 0, st).symbol.description).to.equal('R');
    });

    it('throws UnresolvedSymbolError for bad indices', () => {
      expect(() => resolve(SymbolKind.Const, 42, st))
        .to.throw(UnresolvedSymbolError);
    });
  });

  describe('render()', () => {
    // ∀x. ( R(x, f(x, g(c))) → ∃y. S(g(y)) )
    const termFxgC   = f(0, v(0), f(1, c(0)));
    const phiLeft    = atom(0, v(0), termFxgC);
    const phiRight   = {
      kind: NodeKind.Exists,
      vars: [1],
      arg : atom(1, f(1, v(1))),
    } as Formula;

    const full: Formula = {
      kind: NodeKind.ForAll,
      vars: [0],
      arg : {
        kind : NodeKind.Implies,
        left : phiLeft,
        right: phiRight,
      },
    };

    it('pretty-prints with the expected Unicode symbols', () => {
      const expected =
        '(∀x.(R(x, f(x, g(c)))→(∃y.S(g(y)))))';

      expect(render(full, st)).to.equal(expected);
    });

    it('throws InvalidSymbolArityError on arity mismatch (function)', () => {
      const bad: Term = { kind: NodeKind.FunApp, idx: 0, args: [] }; // f with 0 args
      expect(() => render(bad, st)).to.throw(InvalidSymbolArityError);
    });

    it('throws InvalidSymbolArityError on arity mismatch (relation)', () => {
      const bad: Formula = { kind: NodeKind.Atom, idx: 1, args: [] }; // S with 0 args
      expect(() => render(bad, st)).to.throw(InvalidSymbolArityError);
    });
  });

  describe('construct()', () => {
    it('creates variables and constants ergonomically', () => {
      const formula = construct(st, ({ var: v, const: c }) => {
        return v(xSym.symbol);
      });
      
      expect(formula.kind).to.equal(NodeKind.Var);
      expect(formula.idx).to.equal(0);
    });

    it('creates function applications with arity checking', () => {
      const term = construct(st, ({ var: v, func: f }) => {
        return f(fSym.symbol, v(xSym.symbol), v(ySym.symbol));
      });
      
      expect(term.kind).to.equal(NodeKind.FunApp);
      expect(term.idx).to.equal(0); // f is at index 0
      expect(term.args).to.have.length(2);
      expect(term.args[0]!.kind).to.equal(NodeKind.Var);
      expect(term.args[1]!.kind).to.equal(NodeKind.Var);
    });

    it('creates atomic formulas with arity checking', () => {
      const formula = construct(st, ({ var: v, atom: a }) => {
        return a(RSym.symbol, v(xSym.symbol), v(ySym.symbol));
      });
      
      expect(formula.kind).to.equal(NodeKind.Atom);
      expect(formula.idx).to.equal(0); // R is at index 0
      expect(formula.args).to.have.length(2);
    });

    it('creates complex formulas with logical connectives', () => {
      const formula = construct(st, ({ var: v, atom: a, and, or, not, implies }) => {
        const atom1 = a(RSym.symbol, v(xSym.symbol), v(ySym.symbol));
        const atom2 = a(SSym.symbol, v(xSym.symbol));
        
        return implies(
          and(atom1, not(atom2)),
          or(atom1, atom2)
        );
      });
      
      expect(formula.kind).to.equal(NodeKind.Implies);
      expect(formula.left.kind).to.equal(NodeKind.And);
      expect(formula.right.kind).to.equal(NodeKind.Or);
      
      // Check the nested structure
      const leftSide = formula.left as Formula & { kind: NodeKind.And };
      expect(leftSide.left.kind).to.equal(NodeKind.Atom);
      expect(leftSide.right.kind).to.equal(NodeKind.Not);
    });

    it('creates quantified formulas', () => {
      const formula = construct(st, ({ var: v, atom: a, forall, exists }) => {
        const innerFormula = a(RSym.symbol, v(xSym.symbol), v(ySym.symbol));
        
        return forall([xSym.symbol], 
          exists([ySym.symbol], innerFormula)
        );
      });
      
      expect(formula.kind).to.equal(NodeKind.ForAll);
      expect(formula.vars).to.deep.equal([0]); // x is at index 0
      
      const existsFormula = formula.arg as Formula & { kind: NodeKind.Exists };
      expect(existsFormula.kind).to.equal(NodeKind.Exists);
      expect(existsFormula.vars).to.deep.equal([1]); // y is at index 1
      expect(existsFormula.arg.kind).to.equal(NodeKind.Atom);
    });

    it('creates the same complex formula as in render test', () => {
      // Build: ∀x. ( R(x, f(x, g(c))) → ∃y. S(g(y)) )
      const formula = construct(st, ({ var: v, const: c, func: f, atom: a, forall, exists, implies }) => {
        const x = v(xSym.symbol);
        const y = v(ySym.symbol);
        const constC = c(cSym.symbol);
        
        const gOfC = f(gSym.symbol, constC);
        const fOfXgC = f(fSym.symbol, x, gOfC);
        const RxfxgC = a(RSym.symbol, x, fOfXgC);
        
        const gOfY = f(gSym.symbol, y);
        const SgY = a(SSym.symbol, gOfY);
        
        return forall([xSym.symbol],
          implies(RxfxgC, 
            exists([ySym.symbol], SgY)
          )
        );
      });
      
      expect(render(formula, st)).to.equal('(∀x.(R(x, f(x, g(c)))→(∃y.S(g(y)))))');
    });

    it('throws error for symbol type conflicts', () => {
      expect(() => construct(st, ({ var: v }) => {
        return v(cSym.symbol); // trying to use constant as variable
      })).to.throw(); // add() will throw about kind mismatch
      
      expect(() => construct(st, ({ const: c }) => {
        return c(xSym.symbol); // trying to use variable as constant  
      })).to.throw(); // add() will throw about kind mismatch
    });

    it('throws error for arity conflicts with existing symbols', () => {
      expect(() => construct(st, ({ var: v, func: f }) => {
        return f(fSym.symbol, v(xSym.symbol)); // f already exists with arity 2, trying to use with 1
      })).to.throw(); // add() will throw about arity mismatch
    });

    it('throws error for arity conflicts with relations', () => {
      expect(() => construct(st, ({ var: v, atom: a }) => {
        return a(RSym.symbol, v(xSym.symbol)); // R already exists with arity 2, trying to use with 1
      })).to.throw(); // add() will throw about arity mismatch
    });

    it('can add new symbols dynamically during construction', () => {
      const testSt = createSymbolTable();
      const newVar = Symbol('newVar');
      const newFunc = Symbol('newFunc');
      
      const formula = construct(testSt, ({ var: v, func: f }) => {
        return f(newFunc, v(newVar)); // both symbols will be added automatically
      });
      
      expect(formula.kind).to.equal(NodeKind.FunApp);
      expect(testSt.vars).to.have.length(1);
      expect(testSt.funs).to.have.length(1);
      expect(testSt.funs[0]!.arity).to.equal(1); // arity inferred from usage
    });
  });
});

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
});

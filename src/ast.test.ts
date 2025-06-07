import { expect } from 'chai';
import {
  NodeKind,
  SymbolKind,
  type Term,
  type Formula,
  type SymbolTable,
  resolve,
  render,
  UnresolvedSymbolError,
  InvalidSymbolArityError,
} from './ast';

function createVar(name: string): SymbolTable['vars'][number] {
  return { symbol: Symbol(name) };
}

function createConst(name: string): SymbolTable['consts'][number] {
  return { symbol: Symbol(name) };
}

function createFun(name: string, arity: number): SymbolTable['funs'][number] {
  return { symbol: Symbol(name), arity };
}

function createRel(name: string, arity: number): SymbolTable['rels'][number] {
  return { symbol: Symbol(name), arity };
}

const st: SymbolTable = {
  vars  : [createVar('x'), createVar('y'), createVar('z')],
  consts: [createConst('c')],
  funs  : [
    createFun('f', 2),   // idx = 0
    createFun('g', 1),   // idx = 1
  ],
  rels  : [
    createRel('R', 2),   // idx = 0
    createRel('S', 1),   // idx = 1
  ],
};

const v = (i: number): Term => ({ kind: NodeKind.Var, idx: i });
const c = (i: number): Term => ({ kind: NodeKind.Const, idx: i });
const f = (i: number, ...args: Term[]): Term =>
  ({ kind: NodeKind.FunApp, idx: i, args });

const atom = (i: number, ...args: Term[]): Formula =>
  ({ kind: NodeKind.Atom, idx: i, args });

describe('ast.ts', () => {
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
    /* Build the formula:
     *   ∀x. ( R(x, f(x, g(c))) → ∃y. S(g(y)) )
     */

    const termFxgC   = f(0, v(0), f(1, c(0)));         // f(x, g(c))
    const phiLeft    = atom(0, v(0), termFxgC);        // R(x, f(x, g(c)))
    const phiRight   = {
      kind: NodeKind.Exists,
      vars: [1],                                       // y
      arg : atom(1, f(1, v(1))),                       // S(g(y))
    } as Formula;

    const full: Formula = {
      kind: NodeKind.ForAll,
      vars: [0],                                       // x
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

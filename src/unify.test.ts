import { expect } from 'chai';
import {
  add,
  construct,
  createSymbolTable,
  equal,
  getFreeVars,
  NodeKind,
  resolve,
  SymbolKind,
  Term,
} from './ast';
import { parseFormula } from './parse';
import { apply, Substitution, unify } from './unify';

// Helper function to verify that a substitution actually unifies the given term pairs
function verifyUnification(
  termPairs: [Term, Term][],
  substitution: Substitution
): boolean {
  for (const [left, right] of termPairs) {
    const leftSubstituted = apply(substitution, left);
    const rightSubstituted = apply(substitution, right);
    if (!equal(leftSubstituted, rightSubstituted)) {
      return false;
    }
  }
  return true;
}

// I need to think about a less annoying way to do this. One option is as a
// small tagged literal like s`a`. Does require typing a ` though.
const A = Symbol('A');
const f = Symbol('f');
const g = Symbol('g');
const h = Symbol('h');
const x = Symbol('X');
const y = Symbol('Y');
const z = Symbol('Z');
const w = Symbol('W');
const a = Symbol('a');
const b = Symbol('b');
const c = Symbol('c');

// Not too bad:
const tmp = s`a`;
function s(tsa: TemplateStringsArray, ..._values: any) {
  return Symbol(tsa[0]);
}

describe('unify.ts', () => {
  describe('substitution application', () => {
    it('should substitute variables correctly in formulas', () => {
      const st = createSymbolTable();
      const c = add(st, SymbolKind.Const, Symbol('c'));
      const A = add(st, SymbolKind.Rel, Symbol('A'), 1);
      let f = parseFormula('forall x. (forall x. A(x) & B(x, y))', st);

      let idxs = getFreeVars(f);
      expect(idxs.length).to.equal(1);
      const v = resolve(SymbolKind.Var, idxs[0], st);
      expect(v.symbol.description!).to.equal('y');

      const sub: Substitution = new Map();
      sub.set(v.idx, {
        kind: NodeKind.Const,
        idx: c.idx,
      });

      f = apply(sub, f);
      idxs = getFreeVars(f);
      expect(idxs.length).to.equal(0);
    });
  });

  describe('basic unification patterns', () => {
    it('should unify variable with constant', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [factory.var(x), factory.const(a)];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify variable with function term', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [factory.var(x), factory.func(f, factory.const(a))];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify function terms with same functor', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(f, factory.const(a), factory.var(x)),
          factory.func(f, factory.const(a), factory.const(b)),
        ];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });
  });

  describe('complex unification patterns', () => {
    it('should unify nested function terms', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(f, factory.func(g, factory.var(x)), factory.var(x)),
          factory.func(f, factory.var(y), factory.const(a)),
        ];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify multiple variables in complex terms', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(
            f,
            factory.var(x),
            factory.func(g, factory.var(y), factory.var(z))
          ),
          factory.func(
            f,
            factory.const(a),
            factory.func(g, factory.const(b), factory.const(c))
          ),
        ];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify with variable chains', () => {
      const st = createSymbolTable();
      const [l, r, s] = construct(st, (factory) => {
        return [factory.var(x), factory.var(y), factory.const(a)];
      });

      const termPairs: [Term, Term][] = [
        [l, r],
        [r, s],
      ];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify complex nested structures', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(
            f,
            factory.func(g, factory.var(x), factory.const(a)),
            factory.func(h, factory.var(y))
          ),
          factory.func(
            f,
            factory.func(g, factory.const(b), factory.const(a)),
            factory.func(h, factory.const(c))
          ),
        ];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });
  });

  describe('unsatisfiable unification cases', () => {
    it('should fail when constant conflicts with different constant', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [factory.const(a), factory.const(b)];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });

    it('should fail when constant conflicts with function term', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.const(a),
          factory.func(f, factory.var(y), factory.const(a)),
        ];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });

    it('should fail when function terms have different functors', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(f, factory.var(x)),
          factory.func(g, factory.var(y)),
        ];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });

    it('should fail due to occurs check - variable in its own binding', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [factory.var(x), factory.func(f, factory.var(x))];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });

    it('should fail due to occurs check - variable in nested binding', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.var(x),
          factory.func(f, factory.func(g, factory.var(x), factory.const(a))),
        ];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });

    it('should fail when function arities differ implicitly', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(Symbol('p'), factory.var(x), factory.var(y)),
          factory.func(Symbol('p'), factory.const(a)),
        ];
      });

      const res = unify([[l, r]]);
      expect(res).to.equal(undefined);
    });
  });

  describe('edge cases', () => {
    it('should succeed with identical terms', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [
          factory.func(f, factory.const(a), factory.const(b)),
          factory.func(f, factory.const(a), factory.const(b)),
        ];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should succeed with same variable on both sides', () => {
      const st = createSymbolTable();
      const [l, r] = construct(st, (factory) => {
        return [factory.var(x), factory.var(x)];
      });

      const termPairs: [Term, Term][] = [[l, r]];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should handle empty unification set', () => {
      const termPairs: [Term, Term][] = [];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should unify with multiple constraint pairs', () => {
      const st = createSymbolTable();
      const [t1, t2, t3, t4] = construct(st, (factory) => {
        return [
          factory.func(f, factory.var(x), factory.var(y)),
          factory.func(f, factory.const(a), factory.const(b)),
          factory.func(g, factory.var(x)),
          factory.func(g, factory.const(a)),
        ];
      });

      const termPairs: [Term, Term][] = [
        [t1, t2],
        [t3, t4],
      ];
      const res = unify(termPairs);
      expect(res).not.to.equal(undefined);
      expect(verifyUnification(termPairs, res!)).to.be.true;
    });

    it('should fail with conflicting constraints', () => {
      const st = createSymbolTable();
      const [t1, t2, t3, t4] = construct(st, (factory) => {
        return [
          factory.var(x),
          factory.const(a),
          factory.var(x),
          factory.const(b),
        ];
      });

      const res = unify([
        [t1, t2],
        [t3, t4],
      ]);
      expect(res).to.equal(undefined);
    });
  });
});

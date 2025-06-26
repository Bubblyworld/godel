import { assert } from 'chai';
import { createSymbolTable } from './ast';
import { parseFormula } from './parse';
import { proves } from './prover';

describe('prover', () => {
  it('should prove simple tautologies', () => {
    const st = createSymbolTable();

    // reflexivity
    const f1 = parseFormula('P -> P', st);
    assert.isTrue(proves([], f1, st));

    // contrapositive
    const f2 = parseFormula('(P -> Q) -> (!Q -> !P)', st);
    assert.isTrue(proves([], f2, st));

    // modus ponens
    const theory = [parseFormula('P', st), parseFormula('P -> Q', st)];
    const goal = parseFormula('Q', st);
    assert.isTrue(proves(theory, goal, st));
  });

  it('should prove quantifier instantiation', () => {
    const st = createSymbolTable();
    const theory = [parseFormula('forall x. P(x)', st)];
    const goal = parseFormula('P(a)', st);
    assert.isTrue(proves(theory, goal, st));
  });

  it('should fail to prove simple non-theorems', () => {
    const st = createSymbolTable();
    const theory = [parseFormula('P', st)];
    const goal = parseFormula('Q', st);
    assert.isFalse(proves(theory, goal, st, {
      maxActiveClauses: 30,
    })); // limit iterations
  });

  it('should prove a theorem requiring the use of factoring', () => {
    const st = createSymbolTable();
    const theory = [
      parseFormula('P(x) | P(y)', st),
    ];
    const goal = parseFormula('!(!P(a) | !P(b))', st);
    assert.isTrue(proves(theory, goal, st, {
      maxActiveClauses: 30,
    })); // limit iterations
  });

  it('should prove a harder theorem requiring the use of factoring', () => {
    const st = createSymbolTable();
    const theory = [
      parseFormula('P(u) | P(f(u))', st),
      parseFormula('!P(v) | P(f(w))', st),
    ];
    const goal = parseFormula('!(!P(x) | !P(f(x)))', st);
    assert.isTrue(proves(theory, goal, st, {
      maxActiveClauses: 30,
    })); // limit iterations
  });
});

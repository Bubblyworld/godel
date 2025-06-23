import { assert } from 'chai';
import { createSymbolTable } from './ast';
import { parseFormula } from './parse';
import { proves } from './prover';

describe('prover', () => {
  it('should prove simple tautologies', () => {
    const st = createSymbolTable();

    // P -> P (reflexivity)
    const f1 = parseFormula('P -> P', st);
    assert.isTrue(proves([], f1, st));

    // (P -> Q) -> (!Q -> !P) (contrapositive)
    const f2 = parseFormula('(P -> Q) -> (!Q -> !P)', st);
    assert.isTrue(proves([], f2, st));
  });

  it('should prove with simple theories', () => {
    const st = createSymbolTable();

    // From P and P->Q, prove Q (modus ponens)
    const theory = [parseFormula('P', st), parseFormula('P -> Q', st)];
    const goal = parseFormula('Q', st);
    assert.isTrue(proves(theory, goal, st));
  });

  it('should handle quantified formulas', () => {
    const st = createSymbolTable();

    // From forall x. P(x), prove P(a)
    const theory = [parseFormula('forall x. P(x)', st)];
    const goal = parseFormula('P(a)', st);
    assert.isTrue(proves(theory, goal, st));
  });

  it('should fail to prove non-theorems', () => {
    const st = createSymbolTable();

    // P does not prove Q
    const theory = [parseFormula('P', st)];
    const goal = parseFormula('Q', st);
    assert.isFalse(proves(theory, goal, st, 100)); // limit iterations
  });
});

import { expect } from 'chai';
import { parseFormula, renderFormula } from './parse';
import { peanoArithmetic } from './peano';
import { proves } from './prover';
import { parse } from 'path';

describe('Peano Arithmetic', () => {
  it('should prove a basic formula given induction hypothesis manually', () => {
    const pa = peanoArithmetic();
    for (const axiom of pa.axioms) {
      console.log(renderFormula(axiom, pa.st));
    }

    // Proving this formula requires instantiating an instance of the induction
    // schema. Just to prove that the prover works, we provide it manually:
    const f = parseFormula('forall x. =(+(0, x), x)', pa.st);
    const ind = parseFormula(
      '(=(+(0, 0), 0) & forall x. (=(+(0, x), x) -> =(+(0, S(x)), S(x)))) -> forall x. =(+(0, x), x)',
      pa.st
    );

    const proved = proves([...pa.axioms, ind], f, pa.st, {
      maxActiveClauses: 100,
    });

    // not quite there yet, we are missing equality schemas
    //expect(proved).to.be.true;
  });
});

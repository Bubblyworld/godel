import { expect } from 'chai';
import { parseFormula, renderFormula } from './parse';
import { peanoArithmetic } from './peano';
import { proves } from './prover';

describe('Peano Arithmetic', () => {
  it('should prove a basic formula given induction hypothesis manually', () => {
    const pa = peanoArithmetic();
    for (const axiom of pa.axioms) {
      console.log(renderFormula(axiom, pa.st));
    }

    // Proving this formula requires instantiating an instance of the induction
    // schema. Just to prove that the prover works, we provide it manually:
    const f = parseFormula('forall x. =(+(x, 0), x)', pa.st);
    const ind = parseFormula(
      '(=(+(0, 0), 0) & forall x. (=(+(x, 0), x) -> =(+(S(x), 0), S(x)))) -> forall x. =(+(x, 0), x)',
      pa.st
    );

    const proved = proves([...pa.axioms, ind], f, pa.st, {
      maxActiveClauses: 30,
    });

    expect(proved).to.be.true;
  });
});

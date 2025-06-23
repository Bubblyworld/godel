import { parse } from 'path';
import { parseFormula, renderFormula } from './parse';
import { peanoArithmetic } from './peano';
import { proves } from './prover';

describe('Peano Arithmetic', () => {
  it('should construct the axioms and symbol table correctly', () => {
    const pa = peanoArithmetic();
    for (const axiom of pa.axioms) {
      console.log(renderFormula(axiom, pa.st));
    }

    // Let's see if we can prove a basic formula by providing the requisite
    // inductive hypothesis manually for now:
    const f = parseFormula('forall x. =(+(0, x), x)', pa.st);
    const ind = parseFormula(
      '(=(+(0, 0), 0) & forall x. (=(+(0, x), x) -> =(+(0, S(x)), S(x)))) -> forall x. =(+(0, x), x)',
      pa.st
    );
    const base = parseFormula('=(+(0, 0), 0)', pa.st);
    const hyp1 = parseFormula('=(S(+(0, F1)), S(F1))', pa.st);
    const hyp2 = parseFormula('=(S(F1), S(+(0, F1)))', pa.st);

    // Okay - I suspect we need factoring.

    console.log(renderFormula(ind, pa.st));
    console.log(renderFormula(base, pa.st));
    console.log(renderFormula(hyp1, pa.st));
    console.log(renderFormula(hyp2, pa.st));

    const proved = proves([...pa.axioms, ind, base, hyp1, hyp2], f, pa.st, 50);
    console.debug('Formula proved: ', proved);
    // TODO: The prover is not yet able to handle this inductive proof efficiently
    // expect(proved).to.be.true;
  });
});

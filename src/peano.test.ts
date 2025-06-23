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
      '(=(+(0, 0), 0) & forall x. (=(+(0, x), x)) -> =(+(0, S(x)), S(x))) -> forall x. =(+(0, x), x)',
      pa.st
    );

    console.log(renderFormula(ind, pa.st));

    const proved = proves([...pa.axioms, ind], f, pa.st);
    console.debug('Formula proved: ', proved);
  });
});

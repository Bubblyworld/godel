import { renderFormula } from './parse';
import { peanoArithmetic } from './peano';
import { proves } from './prover';

describe('Peano Arithmetic', () => {
  it('should construct the axioms and symbol table correctly', () => {
    const pa = peanoArithmetic();
    for (const axiom of pa.axioms) {
      console.log(renderFormula(axiom, pa.st));
    }

    proves(pa.axioms, null, pa.st, 3);
  });

});

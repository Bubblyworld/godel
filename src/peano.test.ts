import { expect } from 'chai';
import { peanoArithmetic } from './peano';
import { renderFormula } from './parse';
import { NodeKind } from './ast';
import { toCNF } from './cnf';
import { cnfToClauses } from './resolution';

describe('Peano Arithmetic', () => {
  it('should construct the axioms and symbol table correctly', () => {
    const pa = peanoArithmetic();
    for (const axiom of pa.axioms) {
      console.log(renderFormula(axiom, pa.st));
    }

    const theory = pa.axioms.reduce((f, ax) => ({
      kind: NodeKind.And,
      left: f,
      right: ax,
    }));

    const cnf = toCNF(theory, pa.st);
    console.log(renderFormula(cnf, pa.st));

    const clauses = cnfToClauses(cnf);
    console.log(clauses.map(clause => {
      return {
        ...clause,
        atoms: clause.atoms.map(atm => renderFormula(atm, pa.st)),
      };
    }));
  });

  /**
   * TODO: I think to make a prover more efficient we will have to implement
   * incremental hashing for formulas, and then also for clauses (we can take
   * hashes of underlying atoms, sort them and hash that, for instance).
   */
});

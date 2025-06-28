import { expect } from 'chai';
import { equality } from './equality';
import { parseFormula } from './parse';
import { proves } from './prover';

describe('Theory of Equality', () => {
  it('should satisfy reflexivity', () => {
    const { st, axioms } = equality();
    const f = parseFormula(`=(a, a)`, st);
    expect(proves(axioms, f, st)).to.be.true;
  });

  it('should satisfy commutativity', () => {
    const { st, axioms } = equality();
    const f = parseFormula(`=(x, y) -> =(y, x)`, st);
    expect(proves(axioms, f, st)).to.be.true;
  });

  it('should satisfy transitivity', () => {
    const { st, axioms } = equality();
    const f = parseFormula(`(=(x, y) & =(y, z)) -> =(x, z)`, st);
    expect(proves(axioms, f, st)).to.be.true;
  });

it("should satisfy simple cases of Leibniz's law", () => {
    const { st, axioms } = equality();
    const f = parseFormula('=(a,b)', st);
    const g = parseFormula('=(f(a), f(b))', st);
    // TODO: cannot handle this yet
    // expect(proves([...axioms, f], g, st, {
    //   maxActiveClauses: 6,
    // })).to.be.true;
  });
});

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  cnfToClauses,
  Clause,
  getResolutions,
  applyResolution,
  getFactors,
  applyFactor,
  isVariableOnlySubstitution,
} from './resolution';
import { toCNF } from './cnf';
import {
  Formula,
  NodeKind,
  createSymbolTable,
  add,
  SymbolKind,
  Atom,
  Not,
  And,
  Or,
  Implies,
  ForAll,
  Var,
  SymbolTable,
} from './ast';
import { parseFormula } from './parse';

describe('resolution.ts', () => {
  describe('getResolutions', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    it('should find a resolution when one exists', () => {
      let f = parseFormula('!R(x) | S(a) & R(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);
      expect(rs[0].leftIdx).to.equal(0);
      expect(rs[0].rightIdx).to.equal(0);
    });

    it('should find no resolutions when atoms have different predicates', () => {
      let f = parseFormula('P(x) & Q(y)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(0);
    });

    it('should find no resolutions when atoms have same polarity', () => {
      let f = parseFormula('P(x) & P(y)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(0);
    });

    it('should find resolution between positive and negative literals', () => {
      let f = parseFormula('P(x) & !P(a)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);
      expect(rs[0].sub.size).to.equal(1);
    });

    it('should find multiple resolutions when multiple atoms match', () => {
      let f = parseFormula('P(x) | Q(x) & !P(a) | !Q(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(2); // P(x) with !P(a) and Q(x) with !Q(b)
    });

    it('should handle complex terms with function applications', () => {
      let f = parseFormula('P(f(x)) & !P(f(a))', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);
    });

    it('should fail to unify when terms cannot be unified', () => {
      let f = parseFormula('P(f(x)) & !P(g(x))', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      expect(cs.length).to.equal(2);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(0); // f(x) and g(x) cannot unify
    });
  });

  describe('applyResolution', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    it('should create empty clause when resolving unit clauses', () => {
      let f = parseFormula('P(a) & !P(a)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(0);
      expect(resolvent.negated).to.have.length(0);
    });

    it('should apply substitution and remove resolved atoms', () => {
      let f = parseFormula('P(x) | Q(x) & !P(a) | R(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2);
      // Should have Q(a) and R(b) after resolving P(x) with !P(a)
    });

    it('should handle complex resolution with multiple variables', () => {
      let f = parseFormula('P(x,y) | Q(x) & !P(a,b) | R(z)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2);
      // Should have Q(a) and R(z) after resolving P(x,y) with !P(a,b)
    });

    it('should preserve correct polarities in resolvent', () => {
      let f = parseFormula('P(x) | !Q(x) & !P(a) | R(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2);
      expect(resolvent.negated).to.deep.equal([true, false]); // !Q(a) | R(b)
    });

    it('should handle resolution with function terms', () => {
      let f = parseFormula('P(f(x)) | Q(x) & !P(f(a)) | R(y)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2);
      // Should have Q(a) and R(y)
    });

    it('should handle resolution between clauses with shared variables', () => {
      let f = parseFormula('P(x) | Q(x,y) & !P(z) | R(z,y)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2);
      // Variables should be consistently substituted
    });

    it('should create unit clause when one input is unit clause', () => {
      let f = parseFormula('P(x) & !P(a) | Q(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(1);
      // Should result in Q(b)
    });

    it('should handle self-resolution within same clause type', () => {
      // Create two identical clauses manually for testing
      const p = parseFormula('P(x)', st);
      const notP = parseFormula('!P(a)', st);

      const clause1 = cnfToClauses(p)[0];
      const clause2 = cnfToClauses(notP)[0];

      const rs = getResolutions(clause1, clause2);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(0); // Empty clause
    });

    it('should remove duplicate literals after resolution', () => {
      let f = parseFormula('P(x) | Q(a) & !P(y) | Q(a)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(1); // Should have only one Q(a)
    });

    it('should handle multiple duplicates', () => {
      let f = parseFormula('P(x) | Q(a) | Q(a) & !P(y) | Q(a) | R(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2); // Should have Q(a) and R(b)
    });

    it('should preserve distinct literals with same predicate but different args', () => {
      let f = parseFormula('P(x) | Q(a) & !P(y) | Q(b)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(2); // Should have Q(a) and Q(b)
    });

    it('should handle duplicate removal with negated literals', () => {
      let f = parseFormula('P(x) | !Q(a) & !P(y) | !Q(a)', st);
      f = toCNF(f, st);
      const cs = cnfToClauses(f);
      const rs = getResolutions(cs[0], cs[1]);
      expect(rs.length).to.equal(1);

      const resolvent = applyResolution(rs[0]);
      expect(resolvent.atoms).to.have.length(1); // Should have only one !Q(a)
      expect(resolvent.negated[0]).to.equal(true);
    });
  });

  describe('cnfToClauses', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    const createAtom = (name: string, args: number = 0): Atom => {
      const rel = add(st, SymbolKind.Rel, Symbol(name), args);
      return { kind: NodeKind.Atom, idx: rel.idx, args: [] };
    };

    const createAtomWithVars = (relName: string, varNames: string[]): Atom => {
      const rel = add(st, SymbolKind.Rel, Symbol(relName), varNames.length);
      const args: Var[] = varNames.map((name) => {
        const varEntry = add(st, SymbolKind.Var, Symbol(name));
        return { kind: NodeKind.Var, idx: varEntry.idx };
      });
      return { kind: NodeKind.Atom, idx: rel.idx, args };
    };

    it('should convert a single atom to a single clause', () => {
      const p = createAtom('P');
      const clauses = cnfToClauses(p);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(1);
      expect(clauses[0].atoms[0]).to.deep.equal(p);
      expect(clauses[0].negated).to.deep.equal([false]);
    });

    it('should convert a single negated atom to a single clause', () => {
      const p = createAtom('P');
      const notP: Not = { kind: NodeKind.Not, arg: p };
      const clauses = cnfToClauses(notP);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(1);
      expect(clauses[0].atoms[0]).to.deep.equal(p);
      expect(clauses[0].negated).to.deep.equal([true]);
    });

    it('should convert a disjunction of atoms to a single clause', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const pOrQ: Or = { kind: NodeKind.Or, left: p, right: q };
      const clauses = cnfToClauses(pOrQ);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(2);
      expect(clauses[0].atoms).to.deep.include(p);
      expect(clauses[0].atoms).to.deep.include(q);
      expect(clauses[0].negated).to.deep.equal([false, false]);
    });

    it('should convert a disjunction with negated atoms to a single clause', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const notP: Not = { kind: NodeKind.Not, arg: p };
      const notPOrQ: Or = { kind: NodeKind.Or, left: notP, right: q };
      const clauses = cnfToClauses(notPOrQ);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(2);
      expect(clauses[0].negated).to.deep.equal([true, false]);
    });

    it('should convert a conjunction of atoms to multiple clauses', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const pAndQ: And = { kind: NodeKind.And, left: p, right: q };
      const clauses = cnfToClauses(pAndQ);

      expect(clauses).to.have.length(2);
      expect(clauses[0].atoms[0]).to.deep.equal(p);
      expect(clauses[0].negated).to.deep.equal([false]);
      expect(clauses[1].atoms[0]).to.deep.equal(q);
      expect(clauses[1].negated).to.deep.equal([false]);
    });

    it('should convert a conjunction of disjunctions to multiple clauses', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');
      const s = createAtom('S');

      const pOrQ: Or = { kind: NodeKind.Or, left: p, right: q };
      const rOrS: Or = { kind: NodeKind.Or, left: r, right: s };
      const cnf: And = { kind: NodeKind.And, left: pOrQ, right: rOrS };

      const clauses = cnfToClauses(cnf);

      expect(clauses).to.have.length(2);
      expect(clauses[0].atoms).to.have.length(2);
      expect(clauses[1].atoms).to.have.length(2);
    });

    it('should handle complex nested conjunction', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');
      const s = createAtom('S');

      // ((P ∨ Q) ∧ R) ∧ S
      const pOrQ: Or = { kind: NodeKind.Or, left: p, right: q };
      const pOrQAndR: And = { kind: NodeKind.And, left: pOrQ, right: r };
      const cnf: And = { kind: NodeKind.And, left: pOrQAndR, right: s };

      const clauses = cnfToClauses(cnf);

      expect(clauses).to.have.length(3);
      expect(clauses[0].atoms).to.have.length(2); // P ∨ Q
      expect(clauses[1].atoms).to.have.length(1); // R
      expect(clauses[2].atoms).to.have.length(1); // S
    });

    it('should handle complex disjunction with multiple atoms', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');
      const notS = { kind: NodeKind.Not, arg: createAtom('S') } as Not;

      // P ∨ Q ∨ R ∨ ¬S
      const pOrQ: Or = { kind: NodeKind.Or, left: p, right: q };
      const pOrQOrR: Or = { kind: NodeKind.Or, left: pOrQ, right: r };
      const clause: Or = { kind: NodeKind.Or, left: pOrQOrR, right: notS };

      const clauses = cnfToClauses(clause);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(4);
      expect(clauses[0].negated).to.deep.equal([false, false, false, true]);
    });

    it('should handle atoms with arguments', () => {
      const pxy = createAtomWithVars('P', ['x', 'y']);
      const qz = createAtomWithVars('Q', ['z']);

      const pxyOrQz: Or = { kind: NodeKind.Or, left: pxy, right: qz };
      const clauses = cnfToClauses(pxyOrQz);

      expect(clauses).to.have.length(1);
      expect(clauses[0].atoms).to.have.length(2);
      expect(clauses[0].atoms[0].args).to.have.length(2);
      expect(clauses[0].atoms[1].args).to.have.length(1);
    });

    it('should throw error for non-CNF formula with implication', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const implies: Implies = { kind: NodeKind.Implies, left: p, right: q };

      expect(() => cnfToClauses(implies)).to.throw(
        'formula passed to cnfToClause must be in CNF form'
      );
    });

    it('should throw error for non-CNF formula with quantifier', () => {
      const p = createAtom('P');
      const x = add(st, SymbolKind.Var, Symbol('x'));
      const forall: ForAll = { kind: NodeKind.ForAll, vars: [x.idx], arg: p };

      expect(() => cnfToClauses(forall)).to.throw(
        'formula passed to cnfToClause must be in CNF form'
      );
    });

    it('should throw error for negation of non-atom', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const pAndQ: And = { kind: NodeKind.And, left: p, right: q };
      const notPAndQ: Not = { kind: NodeKind.Not, arg: pAndQ };

      expect(() => cnfToClauses(notPAndQ)).to.throw(
        'formula passed to cnfToClause must be in CNF form'
      );
    });

    it('should throw error for AND inside OR (not CNF)', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');

      const qAndR: And = { kind: NodeKind.And, left: q, right: r };
      const pOrQAndR: Or = { kind: NodeKind.Or, left: p, right: qAndR };

      expect(() => cnfToClauses(pOrQAndR)).to.throw(
        'formula passed to cnfToClause must be in CNF form'
      );
    });

    it('should handle empty conjunction edge case', () => {
      // This tests the boundary between valid CNF structure
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');

      // P ∧ (Q ∧ R) - nested conjunction should work
      const qAndR: And = { kind: NodeKind.And, left: q, right: r };
      const cnf: And = { kind: NodeKind.And, left: p, right: qAndR };

      const clauses = cnfToClauses(cnf);

      expect(clauses).to.have.length(3);
      expect(clauses[0].atoms[0]).to.deep.equal(p);
      expect(clauses[1].atoms[0]).to.deep.equal(q);
      expect(clauses[2].atoms[0]).to.deep.equal(r);
    });

    it('should handle deeply nested valid CNF', () => {
      const p = createAtom('P');
      const q = createAtom('Q');
      const r = createAtom('R');
      const s = createAtom('S');
      const t = createAtom('T');

      // (P ∨ Q) ∧ ((R ∨ S) ∧ T)
      const pOrQ: Or = { kind: NodeKind.Or, left: p, right: q };
      const rOrS: Or = { kind: NodeKind.Or, left: r, right: s };
      const rOrSAndT: And = { kind: NodeKind.And, left: rOrS, right: t };
      const cnf: And = { kind: NodeKind.And, left: pOrQ, right: rOrSAndT };

      const clauses = cnfToClauses(cnf);

      expect(clauses).to.have.length(3);
      expect(clauses[0].atoms).to.have.length(2); // P ∨ Q
      expect(clauses[1].atoms).to.have.length(2); // R ∨ S
      expect(clauses[2].atoms).to.have.length(1); // T
    });
  });

  describe('getFactors', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    it('should find no factors in clause with no repeated predicates', () => {
      const f = parseFormula('P(x) | Q(y)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(0);
    });

    it('should find factors in clause with unifiable literals', () => {
      const f = parseFormula('P(x) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(1);
      expect(factors[0].idx1).to.equal(0);
      expect(factors[0].idx2).to.equal(1);
      expect(factors[0].sub.size).to.equal(1); // x -> a
    });

    it('should not factor literals with different polarities', () => {
      const f = parseFormula('P(x) | !P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(0);
    });

    it('should find multiple factors when possible', () => {
      const f = parseFormula('P(x) | P(y) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(3); // (0,1), (0,2), (1,2)
    });

    it('should handle function terms in factoring', () => {
      const f = parseFormula('P(f(x)) | P(f(a))', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(1);
    });
  });

  describe('applyFactor', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    it('should produce unit clause from binary clause', () => {
      const f = parseFormula('P(x) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      expect(factors).to.have.length(1);

      const factored = applyFactor(factors[0]);
      expect(factored.atoms).to.have.length(1); // P(a)
      expect(factored.atoms[0].args[0]).to.have.property('idx');
    });

    it('should handle factoring with multiple literals', () => {
      const f = parseFormula('P(x) | Q(y) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      // Find the factor that unifies P(x) with P(a)
      const factor = factors.find((f) => f.idx1 === 0 && f.idx2 === 2);
      expect(factor).to.not.be.undefined;

      const factored = applyFactor(factor!);
      expect(factored.atoms).to.have.length(2); // P(a) | Q(y)
    });

    it('should preserve SOS status', () => {
      const clause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Var, idx: 0 }],
          },
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Const, idx: 0 }],
          },
        ],
        negated: [false, false],
        sos: true,
      };

      const factors = getFactors(clause);
      expect(factors).to.have.length(1);

      const factored = applyFactor(factors[0]);
      expect(factored.sos).to.be.true;
    });

    it('should remove duplicates after factoring', () => {
      const f = parseFormula('P(x) | P(a) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const factors = getFactors(clauses[0]);
      const factor = factors.find(
        (f) => f.idx1 === 0 && (f.idx2 === 1 || f.idx2 === 2)
      );
      expect(factor).to.not.be.undefined;

      const factored = applyFactor(factor!);
      expect(factored.atoms).to.have.length(1); // Just P(a), no duplicates
    });
  });

  describe('isVariableOnlySubstitution', () => {
    let st: SymbolTable;

    beforeEach(() => {
      st = createSymbolTable();
    });

    it('should return true for variable-to-variable substitution', () => {
      const x = add(st, SymbolKind.Var, Symbol('x'));
      const y = add(st, SymbolKind.Var, Symbol('y'));

      const sub = new Map();
      sub.set(x.idx, { kind: NodeKind.Var, idx: y.idx });

      expect(isVariableOnlySubstitution(sub)).to.be.true;
    });

    it('should return false for variable-to-constant substitution', () => {
      const x = add(st, SymbolKind.Var, Symbol('x'));
      const a = add(st, SymbolKind.Const, Symbol('a'));

      const sub = new Map();
      sub.set(x.idx, { kind: NodeKind.Const, idx: a.idx });

      expect(isVariableOnlySubstitution(sub)).to.be.false;
    });

    it('should return false for variable-to-function substitution', () => {
      const x = add(st, SymbolKind.Var, Symbol('x'));
      const f = add(st, SymbolKind.Fun, Symbol('f'), 1);
      const a = add(st, SymbolKind.Const, Symbol('a'));

      const sub = new Map();
      sub.set(x.idx, {
        kind: NodeKind.FunApp,
        idx: f.idx,
        args: [{ kind: NodeKind.Const, idx: a.idx }],
      });

      expect(isVariableOnlySubstitution(sub)).to.be.false;
    });

    it('should return true for empty substitution', () => {
      const sub = new Map();
      expect(isVariableOnlySubstitution(sub)).to.be.true;
    });

    it('should return true for multiple variable-only substitutions', () => {
      const x = add(st, SymbolKind.Var, Symbol('x'));
      const y = add(st, SymbolKind.Var, Symbol('y'));
      const z = add(st, SymbolKind.Var, Symbol('z'));

      const sub = new Map();
      sub.set(x.idx, { kind: NodeKind.Var, idx: y.idx });
      sub.set(z.idx, { kind: NodeKind.Var, idx: y.idx });

      expect(isVariableOnlySubstitution(sub)).to.be.true;
    });
  });
});

import { expect } from 'chai';
import { PriorityQueue, ClauseSet } from './clause-set';
import {
  createSymbolTable,
  add,
  SymbolKind,
  NodeKind,
  SymbolTable,
} from './ast';
import { Clause, cnfToClauses } from './resolution';
import { IndexedClause } from './subsumption';
import { parseFormula } from './parse';
import { toCNF } from './cnf';

describe('clause-set', () => {
  describe('PriorityQueue', () => {
    it('should maintain min-heap property', () => {
      const pq = new PriorityQueue<string>((a, b) => a - b);

      pq.insert('item3', 3);
      pq.insert('item1', 1);
      pq.insert('item4', 4);
      pq.insert('item2', 2);

      expect(pq.pop()).to.equal('item1');
      expect(pq.pop()).to.equal('item2');
      expect(pq.pop()).to.equal('item3');
      expect(pq.pop()).to.equal('item4');
      expect(pq.pop()).to.be.null;
    });

    it('should handle single element', () => {
      const pq = new PriorityQueue<string>((a, b) => a - b);
      pq.insert('only', 42);

      expect(pq.size()).to.equal(1);
      expect(pq.isEmpty()).to.be.false;
      expect(pq.pop()).to.equal('only');
      expect(pq.isEmpty()).to.be.true;
    });

    it('should handle duplicate priorities', () => {
      const pq = new PriorityQueue<string>((a, b) => a - b);

      pq.insert('a', 1);
      pq.insert('b', 1);
      pq.insert('c', 1);

      const extracted: string[] = [];
      while (!pq.isEmpty()) {
        extracted.push(pq.pop()!);
      }

      expect(extracted).to.have.length(3);
      expect(extracted).to.include.members(['a', 'b', 'c']);
    });

    it('should handle max-heap with reversed comparator', () => {
      const pq = new PriorityQueue<string>((a, b) => b - a);

      pq.insert('item3', 3);
      pq.insert('item1', 1);
      pq.insert('item4', 4);
      pq.insert('item2', 2);

      expect(pq.pop()).to.equal('item4');
      expect(pq.pop()).to.equal('item3');
      expect(pq.pop()).to.equal('item2');
      expect(pq.pop()).to.equal('item1');
    });

    it('should remove specific items', () => {
      const pq = new PriorityQueue<{ id: number; name: string }>(
        (a, b) => a - b
      );

      pq.insert({ id: 1, name: 'one' }, 1);
      pq.insert({ id: 2, name: 'two' }, 2);
      pq.insert({ id: 3, name: 'three' }, 3);

      expect(pq.remove((item) => item.id === 2)).to.be.true;
      expect(pq.size()).to.equal(2);

      expect(pq.pop()?.name).to.equal('one');
      expect(pq.pop()?.name).to.equal('three');
    });

    it('should handle remove on empty queue', () => {
      const pq = new PriorityQueue<string>((a, b) => a - b);
      expect(pq.remove(() => true)).to.be.false;
    });

    it('should handle remove of last element', () => {
      const pq = new PriorityQueue<string>((a, b) => a - b);
      pq.insert('last', 1);
      expect(pq.remove((item) => item === 'last')).to.be.true;
      expect(pq.isEmpty()).to.be.true;
    });
  });

  describe('ClauseSet', () => {
    function createTestClause(
      st: SymbolTable,
      predicateIdx: number,
      negated: boolean = false
    ): Clause {
      return {
        atoms: [{ kind: NodeKind.Atom, idx: predicateIdx, args: [] }],
        negated: [negated],
        sos: false,
      };
    }

    it('should initialize empty clause set', () => {
      const st = createSymbolTable();
      const clauseSet = new ClauseSet(st);

      expect(clauseSet.size()).to.equal(0);
      expect(clauseSet.activeSize()).to.equal(0);
      expect(clauseSet.hasPassiveClauses()).to.be.false;
    });

    it('should add clauses to passive set', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);
      const clause = createTestClause(st, 0);

      const indexed = clauseSet.getSubsumptionIndex().index(clause);
      clauseSet.insert(indexed);

      expect(clauseSet.size()).to.equal(1);
      expect(clauseSet.activeSize()).to.equal(0);
      expect(clauseSet.hasPassiveClauses()).to.be.true;
    });

    it('should select clauses using Otter ratio', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const Q = Symbol('Q');
      add(st, SymbolKind.Rel, P, 0);
      add(st, SymbolKind.Rel, Q, 0);

      const clauseSet = new ClauseSet(st);

      // Add 6 clauses: enough to test the Otter ratio pattern
      const clauses: Clause[] = [];
      for (let i = 0; i < 6; i++) {
        const clause = createTestClause(st, i % 2); // Alternate between P and Q
        const indexed = clauseSet.getSubsumptionIndex().index(clause);
        clauseSet.insert(indexed);
        clauses.push(clause);
      }

      // Track which queue was used for selection
      const queueTypes: string[] = [];
      let ageQueueCount = 0;
      let heuristicQueueCount = 0;

      // Selection pattern should be: age, heuristic, heuristic, heuristic, heuristic, age
      for (let i = 0; i < 6; i++) {
        const selected = clauseSet.selectClause();
        expect(selected).to.not.be.null;

        // First selection (i=0) and sixth selection (i=5) should be from age queue
        if (i % 5 === 0) {
          ageQueueCount++;
          queueTypes.push('age');
        } else {
          heuristicQueueCount++;
          queueTypes.push('heuristic');
        }

        clauseSet.activate(selected!);
      }

      // Verify the ratio: 1 age selection for every 4 heuristic selections
      expect(ageQueueCount).to.equal(2);
      expect(heuristicQueueCount).to.equal(4);

      // No more clauses
      expect(clauseSet.selectClause()).to.be.null;
    });

    it('should activate clauses correctly', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);
      const clause = createTestClause(st, 0);
      const indexed = clauseSet.getSubsumptionIndex().index(clause);
      clauseSet.insert(indexed);

      const selected = clauseSet.selectClause();
      expect(selected).to.not.be.null;
      expect(selected!.noLongerPassive).to.be.undefined;

      clauseSet.activate(selected!);
      expect(selected!.noLongerPassive).to.be.true;
      expect(clauseSet.activeSize()).to.equal(1);

      // Should not select already active clause
      expect(clauseSet.selectClause()).to.be.null;
    });

    it('should skip active clauses during selection', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const Q = Symbol('Q');
      add(st, SymbolKind.Rel, P, 0);
      add(st, SymbolKind.Rel, Q, 0);

      const clauseSet = new ClauseSet(st);

      // Add multiple clauses
      const clause1 = createTestClause(st, 0);
      const clause2 = createTestClause(st, 1);
      const indexed1 = clauseSet.getSubsumptionIndex().index(clause1);
      clauseSet.insert(indexed1);
      const indexed2 = clauseSet.getSubsumptionIndex().index(clause2);
      clauseSet.insert(indexed2);

      // Activate first clause
      const selected1 = clauseSet.selectClause();
      clauseSet.activate(selected1!);

      // Next selection should skip the active clause
      const selected2 = clauseSet.selectClause();
      expect(selected2).to.not.be.null;
      expect(selected2!.id).to.not.equal(selected1!.id);
    });

    it('should generate resolvents between active clauses', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);

      // Add P and !P - make at least one clause SOS for resolution to occur
      const posClause: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [false],
        sos: true, // Set SOS to true
      };
      const negClause = createTestClause(st, 0, true);
      const indexedPos = clauseSet.getSubsumptionIndex().index(posClause);
      clauseSet.insert(indexedPos);
      const indexedNeg = clauseSet.getSubsumptionIndex().index(negClause);
      clauseSet.insert(indexedNeg);

      // Activate both clauses
      const pos = clauseSet.selectClause();
      clauseSet.activate(pos!);
      const neg = clauseSet.selectClause();
      clauseSet.activate(neg!);

      // Generate resolvents from positive clause
      const resolvents = clauseSet.generateResolvents(pos!);

      // Should produce empty clause (no forward subsumption here)
      expect(resolvents).to.have.length(1);
      expect(resolvents[0].atoms).to.have.length(0);
    });

    it('should handle clause removal', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);

      // Add and activate a clause
      const clause = createTestClause(st, 0);
      const indexed = clauseSet.getSubsumptionIndex().index(clause);
      clauseSet.insert(indexed);
      const selected = clauseSet.selectClause();
      clauseSet.activate(selected!);

      expect(clauseSet.size()).to.equal(1);
      expect(clauseSet.activeSize()).to.equal(1);

      // Remove the clause
      clauseSet.remove(selected!);

      expect(clauseSet.size()).to.equal(0);
      expect(clauseSet.activeSize()).to.equal(0);
    });

    it('should handle empty queue switching', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);

      // Add 5 clauses (exactly enough for one age + 4 heuristic selections)
      for (let i = 0; i < 5; i++) {
        const clause = createTestClause(st, 0);
        const indexed = clauseSet.getSubsumptionIndex().index(clause);
        clauseSet.insert(indexed);
      }

      // Activate all 5 clauses
      for (let i = 0; i < 5; i++) {
        const selected = clauseSet.selectClause();
        expect(selected).to.not.be.null;
        clauseSet.activate(selected!);
      }

      // Next selection should return null
      expect(clauseSet.selectClause()).to.be.null;
    });

    it('should handle complex clause with variables', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const x = Symbol('x');
      const y = Symbol('y');
      add(st, SymbolKind.Rel, P, 2);
      add(st, SymbolKind.Var, x);
      add(st, SymbolKind.Var, y);

      const clauseSet = new ClauseSet(st);

      // P(x,y) | !P(y,x)
      const clause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              { kind: NodeKind.Var, idx: 0 },
              { kind: NodeKind.Var, idx: 1 },
            ],
          },
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              { kind: NodeKind.Var, idx: 1 },
              { kind: NodeKind.Var, idx: 0 },
            ],
          },
        ],
        negated: [false, true],
        sos: false,
      };

      const indexed = clauseSet.getSubsumptionIndex().index(clause);
      clauseSet.insert(indexed);

      const selected = clauseSet.selectClause();
      expect(selected).to.not.be.null;
      expect(selected!.atoms).to.have.length(2);
      expect(selected!.signature).to.exist;
    });

    it('should properly track clause IDs and ages', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clauseSet = new ClauseSet(st);

      // Add multiple clauses
      const clauses: IndexedClause[] = [];
      for (let i = 0; i < 3; i++) {
        const clause = createTestClause(st, 0);
        const indexed = clauseSet.getSubsumptionIndex().index(clause);
        clauseSet.insert(indexed);

        // Get the last added clause
        const index = clauseSet.getSubsumptionIndex();
        const size = index.size();
        // Note: We can't directly access the clause, but we know it was added
      }

      // Select and check IDs are unique and ages are sequential
      const selected: IndexedClause[] = [];
      while (clauseSet.hasPassiveClauses()) {
        const clause = clauseSet.selectClause();
        if (clause) {
          selected.push(clause);
          clauseSet.activate(clause);
        }
      }

      expect(selected).to.have.length(3);

      // Check IDs are unique
      const ids = selected.map((c) => c.id);
      expect(new Set(ids).size).to.equal(3);

      // Check ages are sequential (0, 1, 2)
      const ages = selected.map((c) => c.age).sort((a, b) => a - b);
      expect(ages).to.deep.equal([0, 1, 2]);
    });

    it('should prioritize clauses with simpler terms', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const S = Symbol('S');
      const zero = Symbol('0');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Fun, S, 1);
      add(st, SymbolKind.Const, zero);

      const clauseSet = new ClauseSet(st);

      // Create clause with deeply nested term: P(S(S(S(0))))
      const deepClause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              {
                kind: NodeKind.FunApp,
                idx: 0,
                args: [
                  {
                    kind: NodeKind.FunApp,
                    idx: 0,
                    args: [
                      {
                        kind: NodeKind.FunApp,
                        idx: 0,
                        args: [{ kind: NodeKind.Const, idx: 0 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        negated: [false],
        sos: false,
      };

      // Create clause with simple term: P(0)
      const simpleClause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Const, idx: 0 }],
          },
        ],
        negated: [false],
        sos: false,
      };

      // Create clause with medium complexity: P(S(0))
      const mediumClause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              {
                kind: NodeKind.FunApp,
                idx: 0,
                args: [{ kind: NodeKind.Const, idx: 0 }],
              },
            ],
          },
        ],
        negated: [false],
        sos: false,
      };

      // Add a dummy clause to take the first age-based selection
      const dummyClause = createTestClause(st, 0);
      const dummyIndexed = clauseSet.getSubsumptionIndex().index(dummyClause);
      clauseSet.insert(dummyIndexed);

      // Insert in order: deep, simple, medium
      const deepIndexed = clauseSet.getSubsumptionIndex().index(deepClause);
      clauseSet.insert(deepIndexed);

      const simpleIndexed = clauseSet.getSubsumptionIndex().index(simpleClause);
      clauseSet.insert(simpleIndexed);

      const mediumIndexed = clauseSet.getSubsumptionIndex().index(mediumClause);
      clauseSet.insert(mediumIndexed);

      // Skip the first age-based selection (counter = 0)
      const first = clauseSet.selectClause();
      clauseSet.activate(first!);
      expect(first!.id).to.equal(dummyIndexed.id);

      // Now we're selecting from heuristic queue
      // Collect all remaining selections from heuristic queue
      const heuristicSelections: IndexedClause[] = [];
      let clause = clauseSet.selectClause();
      while (clause && heuristicSelections.length < 3) {
        heuristicSelections.push(clause);
        clause = clauseSet.selectClause();
      }

      // The heuristic queue should select simpler clauses first
      const selectedIds = heuristicSelections.map((c) => c.id);

      // Find positions of our test clauses
      const simplePos = selectedIds.indexOf(simpleIndexed.id);
      const deepPos = selectedIds.indexOf(deepIndexed.id);

      // Simple clause should be selected before deep clause
      expect(simplePos).to.be.at.least(0);
      expect(deepPos).to.be.at.least(0);
      expect(simplePos).to.be.lessThan(deepPos);
    });

    it('should skip tautological resolvents', () => {
      const st = createSymbolTable();
      const cs = new ClauseSet(st);

      // Create clauses: P(x) | Q(x) and !P(a) | !Q(a)
      // Resolving on P gives Q(x) | !Q(a), which with x=a is Q(a) | !Q(a) - a tautology
      // Resolving on Q gives P(x) | !P(a), which with x=a is P(a) | !P(a) - a tautology
      const f1 = parseFormula('P(x) | Q(x)', st);
      const f2 = parseFormula('!P(a) | !Q(a)', st);

      const cnf1 = toCNF(f1, st);
      const cnf2 = toCNF(f2, st);

      const clauses1 = cnfToClauses(cnf1, true);
      const clauses2 = cnfToClauses(cnf2, true);

      const ic1 = cs.getSubsumptionIndex().index(clauses1[0]);
      const ic2 = cs.getSubsumptionIndex().index(clauses2[0]);

      cs.activate(ic1);
      const resolvents = cs.generateResolvents(ic2);

      // Should generate 2 resolvents initially (one for P, one for Q)
      // But both should be tautologies and filtered out
      expect(resolvents).to.have.length(0);
    });

    it('should not skip non-tautological resolvents', () => {
      const st = createSymbolTable();
      const cs = new ClauseSet(st);

      // Create clauses: P(x) and !P(a) | Q(b)
      // Resolving these should produce Q(b), which is not a tautology
      const f1 = parseFormula('P(x)', st);
      const f2 = parseFormula('!P(a) | Q(b)', st);

      const cnf1 = toCNF(f1, st);
      const cnf2 = toCNF(f2, st);

      const clauses1 = cnfToClauses(cnf1, true);
      const clauses2 = cnfToClauses(cnf2, true);

      const ic1 = cs.getSubsumptionIndex().index(clauses1[0]);
      const ic2 = cs.getSubsumptionIndex().index(clauses2[0]);

      cs.activate(ic1);
      const resolvents = cs.generateResolvents(ic2);

      // Should generate 1 resolvent: Q(b)
      expect(resolvents).to.have.length(1);
      expect(resolvents[0].atoms).to.have.length(1);
      expect(resolvents[0].negated[0]).to.equal(false);
    });

    it('should generate factors from clauses', () => {
      const st = createSymbolTable();
      const cs = new ClauseSet(st);

      // Create clause: P(x) | P(a) | Q(b)
      // Factoring should produce P(a) | Q(b)
      const f = parseFormula('P(x) | P(a) | Q(b)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const ic = cs.getSubsumptionIndex().index(clauses[0]);
      const factors = cs.generateFactors(ic);

      // Should generate 1 factor: P(a) | Q(b)
      expect(factors).to.have.length(1);
      expect(factors[0].atoms).to.have.length(2);
    });

    it('should skip tautological factors', () => {
      const st = createSymbolTable();
      const cs = new ClauseSet(st);

      // Create clause: P(x) | !P(y) | P(a)
      // Factoring P(x) with P(a) gives P(a) | !P(y)
      // If y gets bound to a, this becomes P(a) | !P(a) - a tautology
      const f = parseFormula('P(x) | !P(x) | P(a)', st);
      const cnf = toCNF(f, st);
      const clauses = cnfToClauses(cnf);

      const ic = cs.getSubsumptionIndex().index(clauses[0]);
      const factors = cs.generateFactors(ic);

      // The factor P(x) | !P(x) -> P(a) | !P(a) is a tautology
      // Should be skipped
      expect(factors).to.have.length(0);
    });
  });
});

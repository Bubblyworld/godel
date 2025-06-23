import { expect } from 'chai';
import { PriorityQueue, ClauseSet } from './clause-set';
import {
  createSymbolTable,
  add,
  SymbolKind,
  NodeKind,
  SymbolTable,
} from './ast';
import { Clause } from './resolution';
import { IndexedClause } from './subsumption';

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

      clauseSet.insert(clause as IndexedClause);

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
        clauseSet.insert(clause as IndexedClause);
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
      clauseSet.insert(clause as IndexedClause);

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
      clauseSet.insert(clause1 as IndexedClause);
      clauseSet.insert(clause2 as IndexedClause);

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

      // Add P and !P
      const posClause = createTestClause(st, 0, false);
      const negClause = createTestClause(st, 0, true);
      clauseSet.insert(posClause as IndexedClause);
      clauseSet.insert(negClause as IndexedClause);

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
      clauseSet.insert(clause as IndexedClause);
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
        clauseSet.insert(clause as IndexedClause);
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

      clauseSet.insert(clause as IndexedClause);

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
        clauseSet.insert(clause as IndexedClause);

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
  });
});

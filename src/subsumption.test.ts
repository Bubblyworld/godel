import { expect } from 'chai';
import {
  generateKBitMask,
  popcount,
  createSymbolMasks,
  emptySignature,
  maybeSubsumes,
  buildSignature,
  ClauseSignature,
  MISC_HAS_GROUND,
  MISC_DEPTH_GE_3,
  lowestSetBit,
  SubsumptionIndex,
} from './subsumption';
import { createSymbolTable, add, SymbolKind, NodeKind } from './ast';
import { Clause } from './resolution';

describe('subsumption', () => {
  describe('generateKBitMask', () => {
    it('should generate masks with exactly k bits set', () => {
      for (let k = 1; k <= 8; k++) {
        for (let seed = 0; seed < 10; seed++) {
          const mask = generateKBitMask(k, seed);
          expect(popcount(mask)).to.equal(k);
        }
      }
    });

    it('should generate deterministic masks for same seed', () => {
      const mask1 = generateKBitMask(4, 42);
      const mask2 = generateKBitMask(4, 42);
      expect(mask1).to.equal(mask2);
    });

    it('should generate different masks for different seeds', () => {
      const masks = new Set<number>();
      for (let seed = 0; seed < 100; seed++) {
        masks.add(generateKBitMask(4, seed));
      }
      // Should generate many different masks
      expect(masks.size).to.be.greaterThan(50);
    });

    it('should only set bits in 32-bit range', () => {
      for (let seed = 0; seed < 10; seed++) {
        const mask = generateKBitMask(5, seed);
        expect(mask).to.be.lessThan(2 ** 32);
        expect(mask >>> 0).to.equal(mask); // Unsigned
      }
    });
  });

  describe('popcount', () => {
    it('should count bits correctly', () => {
      expect(popcount(0)).to.equal(0);
      expect(popcount(1)).to.equal(1);
      expect(popcount(3)).to.equal(2);
      expect(popcount(7)).to.equal(3);
      expect(popcount(0b10101010)).to.equal(4);
      expect(popcount(0xffffffff)).to.equal(32);
    });
  });

  describe('createSymbolMasks', () => {
    it('should create masks for all symbols', () => {
      const st = createSymbolTable();

      // Add some symbols
      const P = Symbol('P');
      const Q = Symbol('Q');
      const f = Symbol('f');
      const c = Symbol('c');

      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Rel, Q, 2);
      add(st, SymbolKind.Fun, f, 1);
      add(st, SymbolKind.Const, c);

      const masks = createSymbolMasks(st, 4);

      // Check all masks exist
      expect(masks.posPredicateMasks.has(0)).to.be.true;
      expect(masks.posPredicateMasks.has(1)).to.be.true;
      expect(masks.negPredicateMasks.has(0)).to.be.true;
      expect(masks.negPredicateMasks.has(1)).to.be.true;
      expect(masks.functionMasks.has(0)).to.be.true;
      expect(masks.constantMasks.has(0)).to.be.true;

      // Check masks have correct bit count
      expect(popcount(masks.posPredicateMasks.get(0)!)).to.equal(4);
      expect(popcount(masks.negPredicateMasks.get(0)!)).to.equal(4);
      expect(popcount(masks.functionMasks.get(0)!)).to.equal(4);
      expect(popcount(masks.constantMasks.get(0)!)).to.equal(4);

      // Check positive and negative masks are different
      expect(masks.posPredicateMasks.get(0)).to.not.equal(
        masks.negPredicateMasks.get(0)
      );
    });

    it('should generate sparse masks with low collision probability', () => {
      const st = createSymbolTable();

      // Add many symbols
      for (let i = 0; i < 100; i++) {
        add(st, SymbolKind.Rel, Symbol(`P${i}`), 1);
      }

      const masks = createSymbolMasks(st, 4);

      // Count collisions
      const maskValues = new Set<number>();
      let collisions = 0;

      for (let i = 0; i < 100; i++) {
        const mask = masks.posPredicateMasks.get(i)!;
        if (maskValues.has(mask)) {
          collisions++;
        }
        maskValues.add(mask);
      }

      // With 4 bits set out of 32, collision probability should be low
      expect(collisions).to.be.lessThan(5);
    });
  });

  describe('maybeSubsumes', () => {
    it('should return true when signatures are equal', () => {
      const sig: ClauseSignature = {
        posPreds: 0b1010,
        negPreds: 0b0101,
        funcs: 0b1100,
        misc: 0b0011,
      };
      expect(maybeSubsumes(sig, sig)).to.be.true;
    });

    it('should return true when A is subset of B', () => {
      const a: ClauseSignature = {
        posPreds: 0b1010,
        negPreds: 0b0100,
        funcs: 0b1000,
        misc: 0b0001,
      };
      const b: ClauseSignature = {
        posPreds: 0b1111,
        negPreds: 0b0101,
        funcs: 0b1100,
        misc: 0b0011,
      };
      expect(maybeSubsumes(a, b)).to.be.true;
    });

    it('should return false when A has bits not in B', () => {
      const a: ClauseSignature = {
        posPreds: 0b1010,
        negPreds: 0b0000,
        funcs: 0b0000,
        misc: 0b0000,
      };
      const b: ClauseSignature = {
        posPreds: 0b0101, // Missing bit 1 and 3 from A
        negPreds: 0b1111,
        funcs: 0b1111,
        misc: 0b1111,
      };
      expect(maybeSubsumes(a, b)).to.be.false;
    });

    it('should handle empty signatures', () => {
      const empty = emptySignature();
      const nonEmpty: ClauseSignature = {
        posPreds: 0b1111,
        negPreds: 0b1111,
        funcs: 0b1111,
        misc: 0b1111,
      };

      // Empty subsumes everything
      expect(maybeSubsumes(empty, nonEmpty)).to.be.true;
      expect(maybeSubsumes(empty, empty)).to.be.true;

      // Non-empty doesn't subsume empty
      expect(maybeSubsumes(nonEmpty, empty)).to.be.false;
    });
  });

  describe('buildSignature', () => {
    it('should build signature for simple positive literal', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clause: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [false],
        sos: false,
      };

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      // Should have positive predicate bits set
      expect(sig.posPreds).to.equal(masks.posPredicateMasks.get(0));
      expect(sig.negPreds).to.equal(0);
      expect(sig.funcs).to.equal(0);
      // Ground literal (no args = ground)
      expect(sig.misc & MISC_HAS_GROUND).to.equal(MISC_HAS_GROUND);
    });

    it('should build signature for negative literal', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const clause: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [true],
        sos: false,
      };

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      // Should have negative predicate bits set
      expect(sig.negPreds).to.equal(masks.negPredicateMasks.get(0));
      expect(sig.posPreds).to.equal(0);
    });

    it('should handle literals with function symbols', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const f = Symbol('f');
      const x = Symbol('x');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Fun, f, 1);
      add(st, SymbolKind.Var, x);

      const clause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              {
                kind: NodeKind.FunApp,
                idx: 0,
                args: [{ kind: NodeKind.Var, idx: 0 }],
              },
            ],
          },
        ],
        negated: [false],
        sos: false,
      };

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      expect(sig.posPreds).to.equal(masks.posPredicateMasks.get(0));
      expect(sig.funcs).to.equal(masks.functionMasks.get(0));
      // Not ground (contains variable)
      expect(sig.misc & MISC_HAS_GROUND).to.equal(0);
    });

    it('should handle ground literals with constants', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const c = Symbol('c');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Const, c);

      const clause: Clause = {
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

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      expect(sig.posPreds).to.equal(masks.posPredicateMasks.get(0));
      expect(sig.funcs).to.equal(masks.constantMasks.get(0));
      // Ground literal
      expect(sig.misc & MISC_HAS_GROUND).to.equal(MISC_HAS_GROUND);
    });

    it('should detect deep terms', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const f = Symbol('f');
      const g = Symbol('g');
      const h = Symbol('h');
      const x = Symbol('x');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Fun, f, 1);
      add(st, SymbolKind.Fun, g, 1);
      add(st, SymbolKind.Fun, h, 1);
      add(st, SymbolKind.Var, x);

      // P(f(g(h(x)))) - depth 4
      const clause: Clause = {
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
                    idx: 1,
                    args: [
                      {
                        kind: NodeKind.FunApp,
                        idx: 2,
                        args: [{ kind: NodeKind.Var, idx: 0 }],
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

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      // Should have depth >= 3 flag set
      expect(sig.misc & MISC_DEPTH_GE_3).to.equal(MISC_DEPTH_GE_3);

      // Should have all function masks
      const expectedFuncs =
        masks.functionMasks.get(0)! |
        masks.functionMasks.get(1)! |
        masks.functionMasks.get(2)!;
      expect(sig.funcs).to.equal(expectedFuncs);
    });

    it('should combine multiple literals', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const Q = Symbol('Q');
      const x = Symbol('x');
      const c = Symbol('c');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Rel, Q, 0);
      add(st, SymbolKind.Var, x);
      add(st, SymbolKind.Const, c);

      // P(x) | !Q() | P(c)
      const clause: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Var, idx: 0 }],
          },
          { kind: NodeKind.Atom, idx: 1, args: [] },
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Const, idx: 0 }],
          },
        ],
        negated: [false, true, false],
        sos: false,
      };

      const masks = createSymbolMasks(st, 4, 42);
      const sig = buildSignature(clause, masks);

      // Should have both positive P and negative Q
      expect(sig.posPreds).to.equal(masks.posPredicateMasks.get(0));
      expect(sig.negPreds).to.equal(masks.negPredicateMasks.get(1));
      expect(sig.funcs).to.equal(masks.constantMasks.get(0));
      // Has ground literals (Q() and P(c))
      expect(sig.misc & MISC_HAS_GROUND).to.equal(MISC_HAS_GROUND);
    });
  });

  describe('lowestSetBit', () => {
    it('should find lowest set bit correctly', () => {
      expect(lowestSetBit(0)).to.equal(32); // No bits set
      expect(lowestSetBit(1)).to.equal(0); // Bit 0
      expect(lowestSetBit(2)).to.equal(1); // Bit 1
      expect(lowestSetBit(4)).to.equal(2); // Bit 2
      expect(lowestSetBit(8)).to.equal(3); // Bit 3
      expect(lowestSetBit(0b1010)).to.equal(1); // Bits 1 and 3 set, lowest is 1
      expect(lowestSetBit(0b11000)).to.equal(3); // Bits 3 and 4 set, lowest is 3
      expect(lowestSetBit(0x80000000)).to.equal(31); // Bit 31
    });
  });

  describe('SubsumptionIndex', () => {
    it('should create index with proper buckets', () => {
      const st = createSymbolTable();
      const index = new SubsumptionIndex(st);

      // Should start empty
      expect(index.size()).to.equal(0);
    });

    it('should insert clauses and assign IDs', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const index = new SubsumptionIndex(st);

      const clause1: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [false],
        sos: false,
      };

      const indexed1 = index.insert(clause1);
      expect(indexed1.id).to.equal(0);
      expect(indexed1.age).to.equal(0);
      expect(indexed1.signature).to.exist;
      expect(index.size()).to.equal(1);

      const clause2: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [true],
        sos: false,
      };

      const indexed2 = index.insert(clause2);
      expect(indexed2.id).to.equal(1);
      expect(indexed2.age).to.equal(1);
      expect(index.size()).to.equal(2);
    });

    it('should bucket clauses by function symbol bits', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const f = Symbol('f');
      const g = Symbol('g');
      const x = Symbol('x');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Fun, f, 1);
      add(st, SymbolKind.Fun, g, 1);
      add(st, SymbolKind.Var, x);

      const index = new SubsumptionIndex(st);

      // Clause with f(x)
      const clause1: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              {
                kind: NodeKind.FunApp,
                idx: 0,
                args: [{ kind: NodeKind.Var, idx: 0 }],
              },
            ],
          },
        ],
        negated: [false],
        sos: false,
      };

      // Clause with g(x)
      const clause2: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [
              {
                kind: NodeKind.FunApp,
                idx: 1,
                args: [{ kind: NodeKind.Var, idx: 0 }],
              },
            ],
          },
        ],
        negated: [false],
        sos: false,
      };

      const indexed1 = index.insert(clause1);
      const indexed2 = index.insert(clause2);

      // They should have different function masks
      expect(indexed1.signature.funcs).to.not.equal(indexed2.signature.funcs);
    });

    it('should find candidates based on subsumption signatures', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const Q = Symbol('Q');
      const x = Symbol('x');
      add(st, SymbolKind.Rel, P, 1);
      add(st, SymbolKind.Rel, Q, 0);
      add(st, SymbolKind.Var, x);

      const index = new SubsumptionIndex(st);

      // Clause: P(x)
      const general: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Var, idx: 0 }],
          },
        ],
        negated: [false],
        sos: false,
      };

      // Clause: P(x) | Q()
      const specific: Clause = {
        atoms: [
          {
            kind: NodeKind.Atom,
            idx: 0,
            args: [{ kind: NodeKind.Var, idx: 0 }],
          },
          {
            kind: NodeKind.Atom,
            idx: 1,
            args: [],
          },
        ],
        negated: [false, false],
        sos: false,
      };

      const indexedGeneral = index.insert(general);
      const indexedSpecific = index.insert(specific);

      // General clause should find specific clause as candidate
      const candidates = index.findCandidates(indexedGeneral);
      expect(candidates).to.have.lengthOf(2); // Finds both (including itself)
      expect(candidates.some((c) => c.id === indexedSpecific.id)).to.be.true;

      // Specific clause should not find general clause
      const candidatesFromSpecific = index.findCandidates(indexedSpecific);
      expect(candidatesFromSpecific.some((c) => c.id === indexedGeneral.id)).to
        .be.false;
    });

    it('should remove clauses from index', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      add(st, SymbolKind.Rel, P, 0);

      const index = new SubsumptionIndex(st);

      const clause: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [false],
        sos: false,
      };

      const indexed = index.insert(clause);
      expect(index.size()).to.equal(1);

      index.remove(indexed);
      expect(index.size()).to.equal(0);

      // Should not find removed clause
      const candidates = index.findCandidates(indexed);
      expect(candidates).to.have.lengthOf(0);
    });

    it('should handle clauses with no function symbols', () => {
      const st = createSymbolTable();
      const P = Symbol('P');
      const Q = Symbol('Q');
      add(st, SymbolKind.Rel, P, 0);
      add(st, SymbolKind.Rel, Q, 0);

      const index = new SubsumptionIndex(st);

      // Clauses with no function symbols (funcs mask = 0)
      const clause1: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 0, args: [] }],
        negated: [false],
        sos: false,
      };

      const clause2: Clause = {
        atoms: [{ kind: NodeKind.Atom, idx: 1, args: [] }],
        negated: [false],
        sos: false,
      };

      const indexed1 = index.insert(clause1);
      const indexed2 = index.insert(clause2);

      // Both should go to bucket 32 (no bits set)
      expect(indexed1.signature.funcs).to.equal(0);
      expect(indexed2.signature.funcs).to.equal(0);

      // Should find only itself as candidate (since they have different predicate indices)
      const candidates1 = index.findCandidates(indexed1);
      expect(candidates1).to.have.lengthOf(1);
      expect(candidates1[0].id).to.equal(indexed1.id);
    });
  });
});

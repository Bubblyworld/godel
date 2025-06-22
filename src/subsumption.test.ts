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
});

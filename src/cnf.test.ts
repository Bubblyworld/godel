import { expect } from "chai";
import { construct, createSymbolTable, NodeKind, render } from "./ast";
import { transformImpliesToOr, pushNegationsDown, removeDoubleNegations, distributeOrOverAnd } from './cnf';

describe('cnf.ts', () => {
  it('should convert implications to disjunctions', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const R = Symbol('R');
    const st = createSymbolTable();
    const f = construct(st, c => {
      return c.implies(
        c.atom(R, c.const(a)),
        c.atom(R, c.const(b)),
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.Or);
  });

  it('should convert nested implications', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    const R = Symbol('R');
    const st = createSymbolTable();
    
    // Test (R(a) → R(b)) → R(c)
    const f = construct(st, builder => {
      return builder.implies(
        builder.implies(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        ),
        builder.atom(R, builder.const(c))
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.Or);
    if (g.kind === NodeKind.Or) {
      expect(g.left.kind).to.equal(NodeKind.Not);
      if (g.left.kind === NodeKind.Not) {
        expect(g.left.arg.kind).to.equal(NodeKind.Or);
      }
      expect(g.right.kind).to.equal(NodeKind.Atom);
    }
  });

  it('should convert implications nested within conjunctions', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    const R = Symbol('R');
    const st = createSymbolTable();
    
    // Test R(a) ∧ (R(b) → R(c))
    const f = construct(st, builder => {
      return builder.and(
        builder.atom(R, builder.const(a)),
        builder.implies(
          builder.atom(R, builder.const(b)),
          builder.atom(R, builder.const(c))
        )
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.And);
    if (g.kind === NodeKind.And) {
      expect(g.left.kind).to.equal(NodeKind.Atom);
      expect(g.right.kind).to.equal(NodeKind.Or);
    }
  });

  it('should convert implications nested within disjunctions', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    const R = Symbol('R');
    const st = createSymbolTable();
    
    // Test R(a) ∨ (R(b) → R(c))
    const f = construct(st, builder => {
      return builder.or(
        builder.atom(R, builder.const(a)),
        builder.implies(
          builder.atom(R, builder.const(b)),
          builder.atom(R, builder.const(c))
        )
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.Or);
    if (g.kind === NodeKind.Or) {
      expect(g.left.kind).to.equal(NodeKind.Atom);
      expect(g.right.kind).to.equal(NodeKind.Or);
    }
  });

  it('should convert implications nested within negations', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const R = Symbol('R');
    const st = createSymbolTable();
    
    // Test ¬(R(a) → R(b))
    const f = construct(st, builder => {
      return builder.not(
        builder.implies(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        )
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.Not);
    if (g.kind === NodeKind.Not) {
      expect(g.arg.kind).to.equal(NodeKind.Or);
    }
  });

  it('should convert multiple nested implications', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    const d = Symbol('d');
    const R = Symbol('R');
    const st = createSymbolTable();
    
    // Test (R(a) → R(b)) ∧ (R(c) → R(d))
    const f = construct(st, builder => {
      return builder.and(
        builder.implies(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        ),
        builder.implies(
          builder.atom(R, builder.const(c)),
          builder.atom(R, builder.const(d))
        )
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.And);
    if (g.kind === NodeKind.And) {
      expect(g.left.kind).to.equal(NodeKind.Or);
      expect(g.right.kind).to.equal(NodeKind.Or);
    }
  });

  it('should handle complex nested formula with multiple implications', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const c = Symbol('c');
    const R = Symbol('R');
    const S = Symbol('S');
    const st = createSymbolTable();
    
    // Test ((R(a) → S(b)) ∨ R(c)) → (S(a) ∧ R(b))
    const f = construct(st, builder => {
      return builder.implies(
        builder.or(
          builder.implies(
            builder.atom(R, builder.const(a)),
            builder.atom(S, builder.const(b))
          ),
          builder.atom(R, builder.const(c))
        ),
        builder.and(
          builder.atom(S, builder.const(a)),
          builder.atom(R, builder.const(b))
        )
      );
    });

    const g = transformImpliesToOr(f);
    expect(g.kind).to.equal(NodeKind.Or);
    if (g.kind === NodeKind.Or) {
      expect(g.left.kind).to.equal(NodeKind.Not);
      if (g.left.kind === NodeKind.Not) {
        expect(g.left.arg.kind).to.equal(NodeKind.Or);
        if (g.left.arg.kind === NodeKind.Or) {
          expect(g.left.arg.left.kind).to.equal(NodeKind.Or);
        }
      }
      expect(g.right.kind).to.equal(NodeKind.And);
    }
  });

  // Tests for pushNegationsDown
  describe('pushNegationsDown', () => {
    it('should push negation through AND (De Morgan)', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(R(a) ∧ R(b)) becomes ¬R(a) ∨ ¬R(b)
      const f = construct(st, builder => {
        return builder.not(
          builder.and(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          )
        );
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Not);
        expect(g.right.kind).to.equal(NodeKind.Not);
        if (g.left.kind === NodeKind.Not) {
          expect(g.left.arg.kind).to.equal(NodeKind.Atom);
        }
        if (g.right.kind === NodeKind.Not) {
          expect(g.right.arg.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should push negation through OR (De Morgan)', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(R(a) ∨ R(b)) becomes ¬R(a) ∧ ¬R(b)
      const f = construct(st, builder => {
        return builder.not(
          builder.or(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          )
        );
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Not);
        expect(g.right.kind).to.equal(NodeKind.Not);
      }
    });

    it('should push negation through ForAll', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(∀x R(x)) becomes ∃x ¬R(x)
      const f = construct(st, builder => {
        return builder.not(
          builder.forall([x], builder.atom(R, builder.var(x)))
        );
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.Exists);
      if (g.kind === NodeKind.Exists) {
        expect(g.arg.kind).to.equal(NodeKind.Not);
        if (g.arg.kind === NodeKind.Not) {
          expect(g.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should push negation through Exists', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(∃x R(x)) becomes ∀x ¬R(x)
      const f = construct(st, builder => {
        return builder.not(
          builder.exists([x], builder.atom(R, builder.var(x)))
        );
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.Not);
        if (g.arg.kind === NodeKind.Not) {
          expect(g.arg.arg.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should handle nested negations through multiple levels', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(R(a) ∧ (R(b) ∨ R(c)))
      // Should become ¬R(a) ∨ ¬(R(b) ∨ R(c))
      // Then become ¬R(a) ∨ (¬R(b) ∧ ¬R(c))
      const f = construct(st, builder => {
        return builder.not(
          builder.and(
            builder.atom(R, builder.const(a)),
            builder.or(
              builder.atom(R, builder.const(b)),
              builder.atom(R, builder.const(c))
            )
          )
        );
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Not);
        expect(g.right.kind).to.equal(NodeKind.And);
        if (g.right.kind === NodeKind.And) {
          expect(g.right.left.kind).to.equal(NodeKind.Not);
          expect(g.right.right.kind).to.equal(NodeKind.Not);
        }
      }
    });

    it('should leave negated atoms unchanged', () => {
      const a = Symbol('a');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬R(a) stays ¬R(a)
      const f = construct(st, builder => {
        return builder.not(builder.atom(R, builder.const(a)));
      });

      const g = pushNegationsDown(f);
      expect(g.kind).to.equal(NodeKind.Not);
      if (g.kind === NodeKind.Not) {
        expect(g.arg.kind).to.equal(NodeKind.Atom);
      }
    });
  });

  // Tests for removeDoubleNegations
  describe('removeDoubleNegations', () => {
    it('should remove simple double negation', () => {
      const a = Symbol('a');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬¬R(a) becomes R(a)
      const f = construct(st, builder => {
        return builder.not(
          builder.not(builder.atom(R, builder.const(a)))
        );
      });

      const g = removeDoubleNegations(f);
      expect(g.kind).to.equal(NodeKind.Atom);
    });

    it('should remove multiple double negations', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬¬R(a) ∧ ¬¬R(b) becomes R(a) ∧ R(b)
      const f = construct(st, builder => {
        return builder.and(
          builder.not(builder.not(builder.atom(R, builder.const(a)))),
          builder.not(builder.not(builder.atom(R, builder.const(b))))
        );
      });

      const g = removeDoubleNegations(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Atom);
        expect(g.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should handle nested double negations', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(¬¬R(a) ∧ R(b)) becomes ¬(R(a) ∧ R(b))
      const f = construct(st, builder => {
        return builder.not(
          builder.and(
            builder.not(builder.not(builder.atom(R, builder.const(a)))),
            builder.atom(R, builder.const(b))
          )
        );
      });

      const g = removeDoubleNegations(f);
      expect(g.kind).to.equal(NodeKind.Not);
      if (g.kind === NodeKind.Not) {
        expect(g.arg.kind).to.equal(NodeKind.And);
        if (g.arg.kind === NodeKind.And) {
          expect(g.arg.left.kind).to.equal(NodeKind.Atom);
          expect(g.arg.right.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should leave single negations unchanged', () => {
      const a = Symbol('a');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬R(a) stays ¬R(a)
      const f = construct(st, builder => {
        return builder.not(builder.atom(R, builder.const(a)));
      });

      const g = removeDoubleNegations(f);
      expect(g.kind).to.equal(NodeKind.Not);
      if (g.kind === NodeKind.Not) {
        expect(g.arg.kind).to.equal(NodeKind.Atom);
      }
    });
  });

  // Tests for distributeOrOverAnd
  describe('distributeOrOverAnd', () => {
    it('should distribute OR over AND on the right', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test R(a) ∨ (R(b) ∧ R(c)) becomes (R(a) ∨ R(b)) ∧ (R(a) ∨ R(c))
      const f = construct(st, builder => {
        return builder.or(
          builder.atom(R, builder.const(a)),
          builder.and(
            builder.atom(R, builder.const(b)),
            builder.atom(R, builder.const(c))
          )
        );
      });

      const g = distributeOrOverAnd(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Or);
        expect(g.right.kind).to.equal(NodeKind.Or);
      }
    });

    it('should distribute OR over AND on the left', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test (R(a) ∧ R(b)) ∨ R(c) becomes (R(a) ∨ R(c)) ∧ (R(b) ∨ R(c))
      const f = construct(st, builder => {
        return builder.or(
          builder.and(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          ),
          builder.atom(R, builder.const(c))
        );
      });

      const g = distributeOrOverAnd(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Or);
        expect(g.right.kind).to.equal(NodeKind.Or);
      }
    });

    it('should handle nested distribution', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const d = Symbol('d');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test R(a) ∨ (R(b) ∧ (R(c) ∨ R(d)))
      // Should eventually become CNF form
      const f = construct(st, builder => {
        return builder.or(
          builder.atom(R, builder.const(a)),
          builder.and(
            builder.atom(R, builder.const(b)),
            builder.or(
              builder.atom(R, builder.const(c)),
              builder.atom(R, builder.const(d))
            )
          )
        );
      });

      const g = distributeOrOverAnd(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Or);
        expect(g.right.kind).to.equal(NodeKind.Or);
      }
    });

    it('should handle complex nested distribution with multiple levels', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const d = Symbol('d');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test (R(a) ∨ R(b)) ∨ (R(c) ∧ R(d))
      // Should become ((R(a) ∨ R(b)) ∨ R(c)) ∧ ((R(a) ∨ R(b)) ∨ R(d))
      const f = construct(st, builder => {
        return builder.or(
          builder.or(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          ),
          builder.and(
            builder.atom(R, builder.const(c)),
            builder.atom(R, builder.const(d))
          )
        );
      });

      const g = distributeOrOverAnd(f);
      expect(g.kind).to.equal(NodeKind.And);
    });

    it('should leave formulas without AND-OR combinations unchanged', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test R(a) ∨ R(b) stays R(a) ∨ R(b)
      const f = construct(st, builder => {
        return builder.or(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = distributeOrOverAnd(f);
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Atom);
        expect(g.right.kind).to.equal(NodeKind.Atom);
      }
    });
  });

  // Integration tests combining all transformations
  describe('combined transformations', () => {
    it('should work together to convert complex formula to CNF-like form', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(¬(R(a) ∧ R(b)) ∨ R(c))
      // Step 1: pushNegationsDown -> ¬¬(R(a) ∧ R(b)) ∧ ¬R(c)
      // Step 2: removeDoubleNegations -> (R(a) ∧ R(b)) ∧ ¬R(c)
      // Step 3: distributeOrOverAnd -> No change needed
      const f = construct(st, builder => {
        return builder.not(
          builder.or(
            builder.not(
              builder.and(
                builder.atom(R, builder.const(a)),
                builder.atom(R, builder.const(b))
              )
            ),
            builder.atom(R, builder.const(c))
          )
        );
      });

      let g = pushNegationsDown(f);
      g = removeDoubleNegations(g);
      g = distributeOrOverAnd(g);
      
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.And);
        expect(g.right.kind).to.equal(NodeKind.Not);
      }
    });

    it('should handle formula requiring distribution after negation pushing', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const R = Symbol('R');
      const st = createSymbolTable();
      
      // Test ¬(R(a) ∧ R(b)) ∨ R(c)
      // Step 1: pushNegationsDown -> (¬R(a) ∨ ¬R(b)) ∨ R(c)
      // Step 2: distributeOrOverAnd -> No distribution needed for this form
      const f = construct(st, builder => {
        return builder.or(
          builder.not(
            builder.and(
              builder.atom(R, builder.const(a)),
              builder.atom(R, builder.const(b))
            )
          ),
          builder.atom(R, builder.const(c))
        );
      });

      let g = pushNegationsDown(f);
      g = removeDoubleNegations(g);
      g = distributeOrOverAnd(g);
      
      // Should end up as (¬R(a) ∨ ¬R(b)) ∨ R(c) which is already in good form
      expect(g.kind).to.equal(NodeKind.Or);
    });
  });
});

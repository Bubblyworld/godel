import { expect } from 'chai';
import { construct, createSymbolTable, NodeKind } from './ast';
import {
  transformImpliesToOr,
  pushNegationsDown,
  removeDoubleNegations,
  distributeOrOverAnd,
  freshenQuantifiers,
  moveQuantifiersOutside,
  skolemizeExistentials,
  removeLeadingUniversals,
  toCNF,
} from './cnf';

describe('cnf.ts', () => {
  it('should convert implications to disjunctions', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    const R = Symbol('R');
    const st = createSymbolTable();
    const f = construct(st, (c) => {
      return c.implies(c.atom(R, c.const(a)), c.atom(R, c.const(b)));
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
    const f = construct(st, (builder) => {
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
    const f = construct(st, (builder) => {
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
    const f = construct(st, (builder) => {
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
    const f = construct(st, (builder) => {
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
    const f = construct(st, (builder) => {
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
    const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
        return builder.not(builder.not(builder.atom(R, builder.const(a))));
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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

  // Tests for freshenQuantifiers
  describe('freshenQuantifiers', () => {
    it('should leave formulas with no quantifiers unchanged', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test R(a) ∧ R(b)
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = freshenQuantifiers(f, st);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });

    it('should leave formulas with unique quantified variables unchanged', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃y R(x, y)
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists([y], builder.atom(R, builder.var(x), builder.var(y)))
        );
      });

      const g = freshenQuantifiers(f, st);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });

    it('should rename conflicting variables in nested quantifiers', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x (R(x) ∧ ∃x S(x)) - inner x should be renamed
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.and(
            builder.atom(R, builder.var(x)),
            builder.exists([x], builder.atom(S, builder.var(x)))
          )
        );
      });

      const g = freshenQuantifiers(f, st);

      // The outer structure should be ForAll
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.And);
        if (g.arg.kind === NodeKind.And) {
          expect(g.arg.right.kind).to.equal(NodeKind.Exists);
          if (g.arg.right.kind === NodeKind.Exists) {
            // The inner quantifier should have a different variable index
            expect(g.arg.right.vars[0]).to.not.equal(g.vars[0]);
          }
        }
      }
    });

    it('should handle multiple conflicting variables in the same quantifier', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∀y (R(x, y) ∧ ∃x ∃y R(x, y)) - both inner variables should be renamed
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.forall(
            [y],
            builder.and(
              builder.atom(R, builder.var(x), builder.var(y)),
              builder.exists(
                [x, y],
                builder.atom(R, builder.var(x), builder.var(y))
              )
            )
          )
        );
      });

      const g = freshenQuantifiers(f, st);

      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.ForAll);
        if (g.arg.kind === NodeKind.ForAll) {
          expect(g.arg.arg.kind).to.equal(NodeKind.And);
          if (g.arg.arg.kind === NodeKind.And) {
            expect(g.arg.arg.right.kind).to.equal(NodeKind.Exists);
            if (g.arg.arg.right.kind === NodeKind.Exists) {
              // Both inner variables should be different from outer ones
              const outerXIdx = g.vars[0];
              const outerYIdx = g.arg.vars[0];
              const innerXIdx = g.arg.arg.right.vars[0];
              const innerYIdx = g.arg.arg.right.vars[1];

              expect(innerXIdx).to.not.equal(outerXIdx);
              expect(innerYIdx).to.not.equal(outerYIdx);
            }
          }
        }
      }
    });

    it('should handle deep nesting with multiple conflicts', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃x ∀x R(x) - each subsequent x should be renamed
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists(
            [x],
            builder.forall([x], builder.atom(R, builder.var(x)))
          )
        );
      });

      const g = freshenQuantifiers(f, st);

      // Extract all variable indices
      const extractVarIndices = (f: any): number[] => {
        if (f.kind === NodeKind.ForAll || f.kind === NodeKind.Exists) {
          return [...f.vars, ...extractVarIndices(f.arg)];
        } else if (f.arg) {
          return extractVarIndices(f.arg);
        } else if (f.left && f.right) {
          return [...extractVarIndices(f.left), ...extractVarIndices(f.right)];
        }
        return [];
      };

      const varIndices = extractVarIndices(g);
      // All three quantified variables should have unique indices
      expect(new Set(varIndices).size).to.equal(3);
    });

    it('should correctly substitute variables in atom arguments', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x (R(x) ∧ ∃x R(x)) - ensure substitution works in atom arguments
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.and(
            builder.atom(R, builder.var(x)),
            builder.exists([x], builder.atom(R, builder.var(x)))
          )
        );
      });

      const g = freshenQuantifiers(f, st);

      // The outer R(x) should use the outer variable
      // The inner R(x) should use the renamed inner variable
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        const outerVarIdx = g.vars[0];
        if (g.arg.kind === NodeKind.And) {
          const leftAtom = g.arg.left;
          const rightExists = g.arg.right;

          if (leftAtom.kind === NodeKind.Atom && leftAtom.args.length > 0) {
            const firstArg = leftAtom.args[0];
            if (firstArg) {
              expect(firstArg.kind).to.equal(NodeKind.Var);
              if (firstArg.kind === NodeKind.Var) {
                expect(firstArg.idx).to.equal(outerVarIdx);
              }
            }
          }

          if (
            rightExists.kind === NodeKind.Exists &&
            rightExists.vars.length > 0
          ) {
            const innerVarIdx = rightExists.vars[0];
            if (innerVarIdx !== undefined) {
              expect(innerVarIdx).to.not.equal(outerVarIdx);

              if (
                rightExists.arg.kind === NodeKind.Atom &&
                rightExists.arg.args.length > 0
              ) {
                const firstArg = rightExists.arg.args[0];
                if (firstArg) {
                  expect(firstArg.kind).to.equal(NodeKind.Var);
                  if (firstArg.kind === NodeKind.Var) {
                    expect(firstArg.idx).to.equal(innerVarIdx);
                  }
                }
              }
            }
          }
        }
      }
    });

    it('should handle complex formula with mixed quantifiers and connectives', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const T = Symbol('T');
      const st = createSymbolTable();

      // Test ∀x (R(x) ∨ ∀y (S(y) ∧ ∃x ∃y T(x, y))) - inner x and y should be renamed
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.or(
            builder.atom(R, builder.var(x)),
            builder.forall(
              [y],
              builder.and(
                builder.atom(S, builder.var(y)),
                builder.exists(
                  [x, y],
                  builder.atom(T, builder.var(x), builder.var(y))
                )
              )
            )
          )
        );
      });

      const g = freshenQuantifiers(f, st);

      // Should have unique variables for all quantifiers
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (
        g.kind === NodeKind.ForAll &&
        g.arg.kind === NodeKind.Or &&
        g.arg.right.kind === NodeKind.ForAll
      ) {
        const outerX = g.vars[0];
        const outerY = g.arg.right.vars[0];

        const innerExists = g.arg.right.arg;
        if (
          innerExists.kind === NodeKind.And &&
          innerExists.right.kind === NodeKind.Exists
        ) {
          const innerX = innerExists.right.vars[0];
          const innerY = innerExists.right.vars[1];

          expect(innerX).to.not.equal(outerX);
          expect(innerY).to.not.equal(outerY);
          expect(innerX).to.not.equal(innerY);
        }
      }
    });

    it('should handle edge case with no variable conflicts', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃y ∀z R(x, y, z) - no conflicts, should remain unchanged
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists(
            [y],
            builder.forall(
              [z],
              builder.atom(R, builder.var(x), builder.var(y), builder.var(z))
            )
          )
        );
      });

      const g = freshenQuantifiers(f, st);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });
  });

  // Tests for moveQuantifiersOutside
  describe('moveQuantifiersOutside', () => {
    it('should leave formulas with no quantifiers unchanged', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test R(a) ∧ R(b)
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });

    it('should move universal quantifier out of conjunction on right', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test R(a) ∧ ∀x S(x) → ∀x (R(a) ∧ S(x))
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.forall([x], builder.atom(S, builder.var(x)))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.And);
        if (g.arg.kind === NodeKind.And) {
          expect(g.arg.left.kind).to.equal(NodeKind.Atom);
          expect(g.arg.right.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should move universal quantifier out of conjunction on left', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x S(x) ∧ R(a) → ∀x (S(x) ∧ R(a))
      const f = construct(st, (builder) => {
        return builder.and(
          builder.forall([x], builder.atom(S, builder.var(x))),
          builder.atom(R, builder.const(a))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.And);
        if (g.arg.kind === NodeKind.And) {
          expect(g.arg.left.kind).to.equal(NodeKind.Atom);
          expect(g.arg.right.kind).to.equal(NodeKind.Atom);
        }
      }
    });

    it('should move existential quantifier out of conjunction', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test R(a) ∧ ∃x S(x) → ∃x (R(a) ∧ S(x))
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.exists([x], builder.atom(S, builder.var(x)))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.Exists);
      if (g.kind === NodeKind.Exists) {
        expect(g.arg.kind).to.equal(NodeKind.And);
      }
    });

    it('should move universal quantifier out of disjunction on right', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test R(a) ∨ ∀x S(x) → ∀x (R(a) ∨ S(x))
      const f = construct(st, (builder) => {
        return builder.or(
          builder.atom(R, builder.const(a)),
          builder.forall([x], builder.atom(S, builder.var(x)))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.Or);
      }
    });

    it('should move existential quantifier out of disjunction on left', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∃x S(x) ∨ R(a) → ∃x (S(x) ∨ R(a))
      const f = construct(st, (builder) => {
        return builder.or(
          builder.exists([x], builder.atom(S, builder.var(x))),
          builder.atom(R, builder.const(a))
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.Exists);
      if (g.kind === NodeKind.Exists) {
        expect(g.arg.kind).to.equal(NodeKind.Or);
      }
    });

    it('should handle multiple quantifiers in sequence', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const T = Symbol('T');
      const st = createSymbolTable();

      // Test R(a) ∧ ∀x S(x) ∧ ∃y T(y) → ∃y ∀x (R(a) ∧ S(x) ∧ T(y))
      // This tests multiple passes
      const f = construct(st, (builder) => {
        return builder.and(
          builder.and(
            builder.atom(R, builder.const(a)),
            builder.forall([x], builder.atom(S, builder.var(x)))
          ),
          builder.exists([y], builder.atom(T, builder.var(y)))
        );
      });

      const g = moveQuantifiersOutside(f);
      // Should have moved both quantifiers to the outside
      expect(g.kind === NodeKind.ForAll || g.kind === NodeKind.Exists).to.be
        .true;
      if (g.kind === NodeKind.Exists || g.kind === NodeKind.ForAll) {
        expect(
          g.arg.kind === NodeKind.ForAll ||
            g.arg.kind === NodeKind.Exists ||
            g.arg.kind === NodeKind.And
        ).to.be.true;
      }
    });

    it('should handle nested quantifiers correctly', () => {
      const a = Symbol('a');
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test R(a) ∧ ∀x ∃y S(x, y) → ∀x ∃y (R(a) ∧ S(x, y))
      // Multi-pass algorithm moves all quantifiers to the outside
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.forall(
            [x],
            builder.exists([y], builder.atom(S, builder.var(x), builder.var(y)))
          )
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.Exists);
        if (g.arg.kind === NodeKind.Exists) {
          expect(g.arg.arg.kind).to.equal(NodeKind.And);
          if (g.arg.arg.kind === NodeKind.And) {
            expect(g.arg.arg.left.kind).to.equal(NodeKind.Atom);
            expect(g.arg.arg.right.kind).to.equal(NodeKind.Atom);
          }
        }
      }
    });

    it('should handle complex mixed quantifiers and connectives', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const T = Symbol('T');
      const st = createSymbolTable();

      // Test (R(a) ∨ ∀x S(x)) ∧ (∃y T(y) ∨ R(b))
      // Should become ∀x ∃y ((R(a) ∨ S(x)) ∧ (T(y) ∨ R(b)))
      const f = construct(st, (builder) => {
        return builder.and(
          builder.or(
            builder.atom(R, builder.const(a)),
            builder.forall([x], builder.atom(S, builder.var(x)))
          ),
          builder.or(
            builder.exists([y], builder.atom(T, builder.var(y))),
            builder.atom(R, builder.const(b))
          )
        );
      });

      const g = moveQuantifiersOutside(f);
      // Should have moved quantifiers to the outside
      expect(g.kind === NodeKind.ForAll || g.kind === NodeKind.Exists).to.be
        .true;
    });

    it('should leave already moved quantifiers unchanged', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x ∃y (R(x) ∧ S(y)) - already in correct form
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists(
            [y],
            builder.and(
              builder.atom(R, builder.var(x)),
              builder.atom(S, builder.var(y))
            )
          )
        );
      });

      const g = moveQuantifiersOutside(f);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });
  });

  // Tests for skolemize
  describe('skolemize', () => {
    it('should leave formulas with no quantifiers unchanged', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test R(a) ∧ R(b)
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });

    it('should leave universal quantifiers unchanged', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x R(x)
      const f = construct(st, (builder) => {
        return builder.forall([x], builder.atom(R, builder.var(x)));
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.vars.length).to.equal(1);
        expect(g.arg.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should replace existential quantifier with Skolem constant', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∃x R(x) → R(skolem_0)
      const f = construct(st, (builder) => {
        return builder.exists([x], builder.atom(R, builder.var(x)));
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(1);
        expect(g.args[0]?.kind).to.equal(NodeKind.Const);
      }
    });

    it('should use actual constant symbols when no universal variables in scope', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∃x R(x) → R(c0) where c0 is a constant symbol, not a function
      const f = construct(st, (builder) => {
        return builder.exists([x], builder.atom(R, builder.var(x)));
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(1);
        expect(g.args[0]?.kind).to.equal(NodeKind.Const);
      }
    });

    it('should replace existential quantifier with Skolem function dependent on universal variables', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃y R(x, y) → ∀x R(x, skolem_0(x))
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists([y], builder.atom(R, builder.var(x), builder.var(y)))
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.Atom);
        if (g.arg.kind === NodeKind.Atom) {
          expect(g.arg.args.length).to.equal(2);
          // First arg should be the universal variable
          expect(g.arg.args[0]?.kind).to.equal(NodeKind.Var);
          // Second arg should be Skolem function of x
          expect(g.arg.args[1]?.kind).to.equal(NodeKind.FunApp);
          if (g.arg.args[1]?.kind === NodeKind.FunApp) {
            expect(g.arg.args[1].args.length).to.equal(1);
            expect(g.arg.args[1].args[0]?.kind).to.equal(NodeKind.Var);
          }
        }
      }
    });

    it('should handle multiple existential variables in same quantifier', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃y ∃z R(x, y, z) → ∀x R(x, skolem_0(x), skolem_1(x))
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists(
            [y, z],
            builder.atom(R, builder.var(x), builder.var(y), builder.var(z))
          )
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.Atom);
        if (g.arg.kind === NodeKind.Atom) {
          expect(g.arg.args.length).to.equal(3);
          // First arg should be universal variable
          expect(g.arg.args[0]?.kind).to.equal(NodeKind.Var);
          // Second and third args should be different Skolem functions
          expect(g.arg.args[1]?.kind).to.equal(NodeKind.FunApp);
          expect(g.arg.args[2]?.kind).to.equal(NodeKind.FunApp);
          if (
            g.arg.args[1]?.kind === NodeKind.FunApp &&
            g.arg.args[2]?.kind === NodeKind.FunApp
          ) {
            // Should be different function indices
            expect(g.arg.args[1].idx).to.not.equal(g.arg.args[2].idx);
            // Both should depend on x
            expect(g.arg.args[1].args.length).to.equal(1);
            expect(g.arg.args[2].args.length).to.equal(1);
          }
        }
      }
    });

    it('should handle nested quantifiers correctly', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∀y ∃z R(x, y, z) → ∀x ∀y R(x, y, skolem_0(x, y))
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.forall(
            [y],
            builder.exists(
              [z],
              builder.atom(R, builder.var(x), builder.var(y), builder.var(z))
            )
          )
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.ForAll);
      if (g.kind === NodeKind.ForAll) {
        expect(g.arg.kind).to.equal(NodeKind.ForAll);
        if (g.arg.kind === NodeKind.ForAll) {
          expect(g.arg.arg.kind).to.equal(NodeKind.Atom);
          if (g.arg.arg.kind === NodeKind.Atom) {
            expect(g.arg.arg.args.length).to.equal(3);
            // Third arg should be Skolem function with 2 arguments (x, y)
            expect(g.arg.arg.args[2]?.kind).to.equal(NodeKind.FunApp);
            if (g.arg.arg.args[2]?.kind === NodeKind.FunApp) {
              expect(g.arg.arg.args[2].args.length).to.equal(2);
            }
          }
        }
      }
    });

    it('should handle complex formula with mixed quantifiers', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x (R(x) ∧ ∃y S(x, y)) ∧ ∃z R(z)
      // Should become ∀x (R(x) ∧ S(x, skolem_0(x))) ∧ R(skolem_1)
      const f = construct(st, (builder) => {
        return builder.and(
          builder.forall(
            [x],
            builder.and(
              builder.atom(R, builder.var(x)),
              builder.exists(
                [y],
                builder.atom(S, builder.var(x), builder.var(y))
              )
            )
          ),
          builder.exists([z], builder.atom(R, builder.var(z)))
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        // Left side should be ∀x (R(x) ∧ S(x, skolem_0(x)))
        expect(g.left.kind).to.equal(NodeKind.ForAll);
        // Right side should be R(skolem_1)
        expect(g.right.kind).to.equal(NodeKind.Atom);
        if (g.right.kind === NodeKind.Atom) {
          expect(g.right.args[0]?.kind).to.equal(NodeKind.Const);
        }
      }
    });

    it('should handle deeply nested existentials', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∃x ∃y ∃z R(x, y, z) → R(skolem_0, skolem_1, skolem_2)
      const f = construct(st, (builder) => {
        return builder.exists(
          [x],
          builder.exists(
            [y],
            builder.exists(
              [z],
              builder.atom(R, builder.var(x), builder.var(y), builder.var(z))
            )
          )
        );
      });

      const g = skolemizeExistentials(f, st);
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(3);
        // All should be Skolem constants
        expect(g.args[0]?.kind).to.equal(NodeKind.Const);
        expect(g.args[1]?.kind).to.equal(NodeKind.Const);
        expect(g.args[2]?.kind).to.equal(NodeKind.Const);
        if (
          g.args[0]?.kind === NodeKind.Const &&
          g.args[1]?.kind === NodeKind.Const &&
          g.args[2]?.kind === NodeKind.Const
        ) {
          // Should be different constant indices
          expect(g.args[0].idx).to.not.equal(g.args[1].idx);
          expect(g.args[1].idx).to.not.equal(g.args[2].idx);
        }
      }
    });

    it('should create unique Skolem functions across multiple calls', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test that multiple skolemizations create different functions
      const f1 = construct(st, (builder) => {
        return builder.exists([x], builder.atom(R, builder.var(x)));
      });

      const f2 = construct(st, (builder) => {
        return builder.exists([x], builder.atom(R, builder.var(x)));
      });

      const g1 = skolemizeExistentials(f1, st);
      const g2 = skolemizeExistentials(f2, st);

      // Should use different Skolem constant indices
      if (
        g1.kind === NodeKind.Atom &&
        g2.kind === NodeKind.Atom &&
        g1.args[0]?.kind === NodeKind.Const &&
        g2.args[0]?.kind === NodeKind.Const
      ) {
        expect(g1.args[0].idx).to.not.equal(g2.args[0].idx);
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
      const f = construct(st, (builder) => {
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
      const f = construct(st, (builder) => {
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

  // Tests for removeLeadingUniversals
  describe('removeLeadingUniversals', () => {
    it('should leave formulas with no quantifiers unchanged', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test R(a) ∧ R(b)
      const f = construct(st, (builder) => {
        return builder.and(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = removeLeadingUniversals(f);
      expect(JSON.stringify(g)).to.equal(JSON.stringify(f));
    });

    it('should remove single leading universal quantifier', () => {
      const x = Symbol('x');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x R(x) → R(x)
      const f = construct(st, (builder) => {
        return builder.forall([x], builder.atom(R, builder.var(x)));
      });

      const g = removeLeadingUniversals(f);
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(1);
        expect(g.args[0]?.kind).to.equal(NodeKind.Var);
      }
    });

    it('should remove multiple leading universal quantifiers', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∀y R(x, y) → R(x, y)
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.forall([y], builder.atom(R, builder.var(x), builder.var(y)))
        );
      });

      const g = removeLeadingUniversals(f);
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(2);
        expect(g.args[0]?.kind).to.equal(NodeKind.Var);
        expect(g.args[1]?.kind).to.equal(NodeKind.Var);
      }
    });

    it('should leave non-leading quantifiers unchanged', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x (R(x) ∧ ∃y S(y)) → R(x) ∧ ∃y S(y)
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.and(
            builder.atom(R, builder.var(x)),
            builder.exists([y], builder.atom(S, builder.var(y)))
          )
        );
      });

      const g = removeLeadingUniversals(f);
      expect(g.kind).to.equal(NodeKind.And);
      if (g.kind === NodeKind.And) {
        expect(g.left.kind).to.equal(NodeKind.Atom);
        expect(g.right.kind).to.equal(NodeKind.Exists);
      }
    });

    it('should handle complex formula with mixed quantifiers', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const z = Symbol('z');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x ∀y (R(x) ∨ ∃z S(y, z)) → R(x) ∨ ∃z S(y, z)
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.forall(
            [y],
            builder.or(
              builder.atom(R, builder.var(x)),
              builder.exists(
                [z],
                builder.atom(S, builder.var(y), builder.var(z))
              )
            )
          )
        );
      });

      const g = removeLeadingUniversals(f);
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Atom);
        expect(g.right.kind).to.equal(NodeKind.Exists);
      }
    });
  });

  // Tests for toCNF
  describe('toCNF', () => {
    it('should convert simple implication to CNF', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test R(a) → R(b)
      const f = construct(st, (builder) => {
        return builder.implies(
          builder.atom(R, builder.const(a)),
          builder.atom(R, builder.const(b))
        );
      });

      const g = toCNF(f, st);
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Not);
        expect(g.right.kind).to.equal(NodeKind.Atom);
      }
    });

    it('should convert complex formula with quantifiers to CNF', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test ∀x (R(x) → ∃y S(x, y))
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.implies(
            builder.atom(R, builder.var(x)),
            builder.exists([y], builder.atom(S, builder.var(x), builder.var(y)))
          )
        );
      });

      const g = toCNF(f, st);
      // After full transformation, should be in CNF form without leading quantifiers
      // The exact structure depends on the pipeline, but it should not have implications or existentials
      expect(g.kind).to.not.equal(NodeKind.Implies);
      expect(g.kind).to.not.equal(NodeKind.Exists);
      expect(g.kind).to.not.equal(NodeKind.ForAll);
    });

    it('should handle formula with negated conjunction', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ¬(R(a) ∧ R(b))
      const f = construct(st, (builder) => {
        return builder.not(
          builder.and(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          )
        );
      });

      const g = toCNF(f, st);
      // Should become ¬R(a) ∨ ¬R(b) after applying De Morgan
      expect(g.kind).to.equal(NodeKind.Or);
      if (g.kind === NodeKind.Or) {
        expect(g.left.kind).to.equal(NodeKind.Not);
        expect(g.right.kind).to.equal(NodeKind.Not);
      }
    });

    it('should handle complex nested formula', () => {
      const a = Symbol('a');
      const b = Symbol('b');
      const c = Symbol('c');
      const x = Symbol('x');
      const R = Symbol('R');
      const S = Symbol('S');
      const st = createSymbolTable();

      // Test (R(a) → R(b)) ∧ ∃x (S(x) → R(c))
      const f = construct(st, (builder) => {
        return builder.and(
          builder.implies(
            builder.atom(R, builder.const(a)),
            builder.atom(R, builder.const(b))
          ),
          builder.exists(
            [x],
            builder.implies(
              builder.atom(S, builder.var(x)),
              builder.atom(R, builder.const(c))
            )
          )
        );
      });

      const g = toCNF(f, st);

      // After transformation: no implications, no existentials, in CNF
      expect(g.kind).to.not.equal(NodeKind.Implies);
      expect(g.kind).to.not.equal(NodeKind.Exists);
      expect(g.kind).to.not.equal(NodeKind.ForAll);

      // Should be in CNF form (conjunction of disjunctions or single atoms/negated atoms)
      const isCNF = (f: any): boolean => {
        if (
          f.kind === NodeKind.Atom ||
          (f.kind === NodeKind.Not && f.arg.kind === NodeKind.Atom)
        ) {
          return true;
        }
        if (f.kind === NodeKind.Or) {
          return isCNF(f.left) && isCNF(f.right);
        }
        if (f.kind === NodeKind.And) {
          return isCNF(f.left) && isCNF(f.right);
        }
        if (f.kind === NodeKind.FunApp) {
          return true; // Skolem functions are allowed
        }
        return false;
      };

      expect(isCNF(g)).to.be.true;
    });

    it('should produce equisatisfiable formula', () => {
      const x = Symbol('x');
      const y = Symbol('y');
      const R = Symbol('R');
      const st = createSymbolTable();

      // Test ∀x ∃y R(x, y)
      const f = construct(st, (builder) => {
        return builder.forall(
          [x],
          builder.exists([y], builder.atom(R, builder.var(x), builder.var(y)))
        );
      });

      const g = toCNF(f, st);

      // The result should be R(x, F0(x)) where F0 is a Skolem function
      expect(g.kind).to.equal(NodeKind.Atom);
      if (g.kind === NodeKind.Atom) {
        expect(g.args.length).to.equal(2);
        expect(g.args[0]?.kind).to.equal(NodeKind.Var);
        expect(g.args[1]?.kind).to.equal(NodeKind.FunApp);
        if (g.args[1]?.kind === NodeKind.FunApp) {
          // Skolem function should depend on x
          expect(g.args[1].args.length).to.equal(1);
          expect(g.args[1].args[0]?.kind).to.equal(NodeKind.Var);
        }
      }
    });
  });
});

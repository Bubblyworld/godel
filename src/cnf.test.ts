import { expect } from "chai";
import { construct, createSymbolTable, NodeKind, render } from "./ast";
import { transformImpliesToOr } from './cnf';

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
});

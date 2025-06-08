import { Formula, NodeKind, transform, TransformFns } from "./ast";

/**
 * Converts all instances of A→B to ¬A∨B.
 */
export function transformImpliesToOr(f: Formula): Formula {
  const cbs: TransformFns = {
    Implies: f => ({
      kind: NodeKind.Or,
      right: transform(f.right, cbs),
      left: {
        kind: NodeKind.Not,
        arg: transform(f.left, cbs),
      },
    }),
  };

  return transform(f, cbs);
}

/**
 * Pushes all negations down to atoms using De Morgan's laws:
 * - ¬(A ∧ B) becomes ¬A ∨ ¬B
 * - ¬(A ∨ B) becomes ¬A ∧ ¬B  
 * - ¬(∀x A) becomes ∃x ¬A
 * - ¬(∃x A) becomes ∀x ¬A
 */
export function pushNegationsDown(f: Formula): Formula {
  let touched = false;
  const singlePass = (f: Formula): Formula => {
    const cbs: TransformFns = {
      Not: f => {
        switch (f.arg.kind) {
          case NodeKind.And:
            // ¬(A ∧ B) → (¬A ∨ ¬B)
            touched = true;
            return {
              kind: NodeKind.Or,
              left: { kind: NodeKind.Not, arg: transform(f.arg.left, cbs) },
              right: { kind: NodeKind.Not, arg: transform(f.arg.right, cbs) },
            };
          case NodeKind.Or:
            // ¬(A ∨ B) → (¬A ∧ ¬B)
            touched = true;
            return {
              kind: NodeKind.And,
              left: { kind: NodeKind.Not, arg: transform(f.arg.left, cbs) },
              right: { kind: NodeKind.Not, arg: transform(f.arg.right, cbs) },
            };
          case NodeKind.ForAll:
            // ¬(∀x A) → (∃x ¬A)
            touched = true;
            return {
              kind: NodeKind.Exists,
              vars: f.arg.vars,
              arg: { kind: NodeKind.Not, arg: transform(f.arg.arg, cbs) },
            };
          case NodeKind.Exists:
            // ¬(∃x A) → (∀x ¬A)
            touched = true;
            return {
              kind: NodeKind.ForAll,
              vars: f.arg.vars,
              arg: { kind: NodeKind.Not, arg: transform(f.arg.arg, cbs) },
            };
          default:
            return {
              kind: NodeKind.Not,
              arg: transform(f.arg, cbs),
            };
        }
      },
    };
    
    return transform(f, cbs);
  };
  
  do {
    touched = false;
    f = singlePass(f);
  } while (touched);
  return f;
}

/**
 * Removes all double negations: ¬¬A becomes A.
 */
export function removeDoubleNegations(f: Formula): Formula {
  const cbs: TransformFns = {
    Not: f => {
      if (f.arg.kind === NodeKind.Not) {
        // ¬¬A → A
        return transform(f.arg.arg, cbs);
      }
      return {
        kind: NodeKind.Not,
        arg: transform(f.arg, cbs),
      };
    },
  };
  
  return transform(f, cbs);
}

/**
 * Distributes OR over AND: A ∨ (B ∧ C) becomes (A ∨ B) ∧ (A ∨ C).
 * Also handles (B ∧ C) ∨ A becomes (B ∨ A) ∧ (C ∨ A).
 */
export function distributeOrOverAnd(f: Formula): Formula {
  let touched = false;
  const singlePass = (f: Formula): Formula => {
    const cbs: TransformFns = {
      Or: f => {
        // A ∨ (B ∧ C) → (A ∨ B) ∧ (A ∨ C)
        if (f.right.kind === NodeKind.And) {
          touched = true;
          return {
            kind: NodeKind.And,
            left: { kind: NodeKind.Or, left: transform(f.left, cbs), right: transform(f.right.left, cbs) },
            right: { kind: NodeKind.Or, left: transform(f.left, cbs), right: transform(f.right.right, cbs) },
          };
        }
        // (B ∧ C) ∨ A → (B ∨ A) ∧ (C ∨ A)
        if (f.left.kind === NodeKind.And) {
          touched = true;
          return {
            kind: NodeKind.And,
            left: { kind: NodeKind.Or, left: transform(f.left.left, cbs), right: transform(f.right, cbs) },
            right: { kind: NodeKind.Or, left: transform(f.left.right, cbs), right: transform(f.right, cbs) },
          };
        }
        // No distribution needed, just transform children
        return {
          kind: NodeKind.Or,
          left: transform(f.left, cbs),
          right: transform(f.right, cbs),
        };
      },
    };
    
    return transform(f, cbs);
  };
  
  do {
    touched = false;
    f = singlePass(f);
  } while(touched);
  return f;
}

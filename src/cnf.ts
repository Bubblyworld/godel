import { add, Formula, NodeKind, resolve, SymbolKind, SymbolTable, Term, transform, TransformFns, visit } from "./ast";

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
 * Pushes all negations down to atoms using De Morgan's laws.
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
 * Removes all double negations.
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
 * Distributes OR over AND.
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

/**
 * Skolemizes existential quantifiers by replacing them with function symbols.
 * Each existential variable is replaced with a Skolem function that takes all
 * universally quantified variables in scope as arguments.
 */
let skolemCounter = 0;
export function skolemizeExistentials(f: Formula, st: SymbolTable): Formula {
  const mappings: Map<number, Term> = new Map();
  const transformVar = (f: Term & { kind: NodeKind.Var }) => {
    if (mappings.has(f.idx)) {
      return mappings.get(f.idx)!;
    }
    return f;
  };

  const scope: number[] = [];
  const transformQuantifier = (f: Formula & {
    kind: NodeKind.Exists | NodeKind.ForAll,
  }) => {
    if (f.kind === NodeKind.ForAll) {
      const len = scope.length;
      scope.push(...f.vars);
      const arg = transform(f.arg, cbs);
      scope.length = len;
      
      return {
        kind: NodeKind.ForAll,
        vars: f.vars,
        arg,
      } as Formula;
    } else {
      const maps: [number, Term][] = [];
      for (const idx of f.vars) {
        const sym = Symbol(`F${skolemCounter++}`);
        const func = add(st, SymbolKind.Fun, sym, scope.length);
        const term: Term = {
          idx: func.idx,
          kind: NodeKind.FunApp,
          args: scope.map(idx => ({ kind: NodeKind.Var, idx }))
        };
        
        maps.push([idx, term]);
      }
      
      for (const [idx, term] of maps) mappings.set(idx, term);
      const arg = transform(f.arg, cbs);
      for (const [idx, _] of maps) mappings.delete(idx);
      return arg;
    }
  };

  const cbs = {
    Var: transformVar,
    Exists: transformQuantifier,
    ForAll: transformQuantifier,
  };

  return transform(f, cbs);
}

/**
 * Transforms a formula so that every quantified variable is unique. This is
 * necessary before moving universal quantifiers to the outside, to prevent
 * accidental variable capture between different quantifiers.
 */
let freshenCounter = 0;
export function freshenQuantifiers(f: Formula, st: SymbolTable): Formula {
  const mappings: Map<number, number> = new Map();
  const transformVar = (f: Term & { kind: NodeKind.Var }) => ({
    ...f,
    idx: mappings.has(f.idx) ? mappings.get(f.idx)! : f.idx,
  });

  const visited: Set<number> = new Set();
  const transformQuantifier = (f: Formula & {
    kind: NodeKind.Exists | NodeKind.ForAll,
  }) => {
    const vars: number[] = [];
    const maps: [number, number][] = [];
    for (const idx of f.vars) {
      if (visited.has(idx)) {
        const node = resolve(SymbolKind.Var, idx, st);
        const sym = Symbol(`${node.symbol.description}${freshenCounter++}`);
        const ent = add(st, SymbolKind.Var, sym);
        vars.push(ent.idx);
        maps.push([idx, ent.idx]); 
      } else {
        visited.add(idx);
        vars.push(idx);
      }
    }

    for (const map of maps) mappings.set(...map);
    const arg = transform(f.arg, cbs);
    for (const map of maps) mappings.delete(map[0]);

    return {
      ...f,
      vars,
      arg, 
    };
  };

  const cbs = {
    Var: transformVar,
    Exists: transformQuantifier,
    ForAll: transformQuantifier,
  };

  return transform(f, cbs);
}

/**
 * Moves quantifiers to the outside of the formula. Note that this is only
 * guaranteed to produce an equivalent output formula if you have called
 * `freshenQuantifiers` with the formula first.
 */
export function moveQuantifiersOutside(f: Formula): Formula {
  let touched = false;
  const singlePass = (f: Formula): Formula => {
    const cbs: TransformFns = {
      And: f => {
        // A ∧ ∀x B → ∀x (A ∧ B) or A ∧ ∃x B → ∃x (A ∧ B)
        if (f.right.kind === NodeKind.ForAll || f.right.kind === NodeKind.Exists) {
          touched = true;
          return {
            kind: f.right.kind,
            vars: f.right.vars,
            arg: {
              kind: NodeKind.And,
              left: transform(f.left, cbs),
              right: transform(f.right.arg, cbs),
            },
          };
        }
        // ∀x A ∧ B → ∀x (A ∧ B) or ∃x A ∧ B → ∃x (A ∧ B)
        if (f.left.kind === NodeKind.ForAll || f.left.kind === NodeKind.Exists) {
          touched = true;
          return {
            kind: f.left.kind,
            vars: f.left.vars,
            arg: {
              kind: NodeKind.And,
              left: transform(f.left.arg, cbs),
              right: transform(f.right, cbs),
            },
          };
        }
        return {
          kind: NodeKind.And,
          left: transform(f.left, cbs),
          right: transform(f.right, cbs),
        };
      },
      Or: f => {
        // A ∨ ∀x B → ∀x (A ∨ B) or A ∨ ∃x B → ∃x (A ∨ B)
        if (f.right.kind === NodeKind.ForAll || f.right.kind === NodeKind.Exists) {
          touched = true;
          return {
            kind: f.right.kind,
            vars: f.right.vars,
            arg: {
              kind: NodeKind.Or,
              left: transform(f.left, cbs),
              right: transform(f.right.arg, cbs),
            },
          };
        }
        // ∀x A ∨ B → ∀x (A ∨ B) or ∃x A ∨ B → ∃x (A ∨ B)
        if (f.left.kind === NodeKind.ForAll || f.left.kind === NodeKind.Exists) {
          touched = true;
          return {
            kind: f.left.kind,
            vars: f.left.vars,
            arg: {
              kind: NodeKind.Or,
              left: transform(f.left.arg, cbs),
              right: transform(f.right, cbs),
            },
          };
        }
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

/**
 * Removes leading universal quantifiers from a formula. Since free variables
 * are universally quantified by convention, this is equivalent.
 */
export function removeLeadingUniversals(f: Formula): Formula {
  while (f.kind === NodeKind.ForAll) f = f.arg;
  return f;
}

/**
 * Converts a first-order formula to an equisatisfiable CNF form suitable for
 * use in a resolution-based refutation algorithm.
 */
export function toCNF(f: Formula, st: SymbolTable): Formula {
  f = transformImpliesToOr(f);
  f = pushNegationsDown(f);
  f = removeDoubleNegations(f);
  f = freshenQuantifiers(f, st);
  f = moveQuantifiersOutside(f);
  f = skolemizeExistentials(f, st);
  f = distributeOrOverAnd(f);
  f = removeLeadingUniversals(f);
  return f;
}

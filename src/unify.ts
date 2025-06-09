import { assert } from 'console';
import {
    Atom,
  equal,
  Formula,
  getFreeVars,
  NodeKind,
  Term,
  transform,
  TransformFns,
} from './ast';

/**
 * Represents a mapping from free variables to terms.
 */
export type Substitution = Map<number, Term>;

/**
 * Applies a substitution to the free variables in a formula.
 */
export function apply(sub: Substitution, f: Term): Term;
export function apply(sub: Substitution, f: Formula): Formula;
export function apply(sub: Substitution, f: Term | Formula): Term | Formula {
  const isBoundVar: Set<number> = new Set();
  const transformVar = (f: Term & { kind: NodeKind.Var }) => {
    if (sub.has(f.idx) && !isBoundVar.has(f.idx)) {
      return sub.get(f.idx)!;
    } else {
      return f;
    }
  };
  const transformQuantifier = (
    f: Formula & {
      kind: NodeKind.Exists | NodeKind.ForAll;
    }
  ) => {
    const bound: number[] = [];
    for (const idx of f.vars) {
      // edge-case where same variable reused
      if (!isBoundVar.has(idx)) {
        bound.push(idx);
        isBoundVar.add(idx);
      }
    }

    const res = {
      ...f,
      arg: transform(f.arg, cbs),
    };

    for (const idx of bound) isBoundVar.delete(idx);
    return res;
  };

  const cbs: TransformFns = {
    Var: transformVar,
    Exists: transformQuantifier,
    ForAll: transformQuantifier,
  };

  if (
    f.kind == NodeKind.Var ||
    f.kind == NodeKind.Const ||
    f.kind == NodeKind.FunApp
  ) {
    return transform(f, cbs);
  } else {
    return transform(f, cbs);
  }
}

/**
 * Returns the most general substitution from free variables to terms making
 * each of the pairs of input terms equal to each other (otherwise known as
 * syntactic unification). Uses Martelli and Montanari's algorithm, which is
 * exponential-time in the worst case.
 */
export function unify(terms: [Term, Term][]): Substitution | undefined {
  let stepped = false;
  do {
    stepped = false;

    // Delete step:
    for (const [i, [left, right]] of terms.entries()) {
      if (equal(left, right)) {
        terms.splice(i, 1);
        stepped = true;
        break;
      }
    }
    if (stepped) continue;

    // Swap step:
    for (const [i, [left, right]] of terms.entries()) {
      if (left.kind != NodeKind.Var && right.kind == NodeKind.Var) {
        terms[i] = [right, left];
        stepped = true;
        break;
      }
    }
    if (stepped) continue;

    // Eliminate or Check steps:
    for (let [i, [left, right]] of terms.entries()) {
      if (left.kind === NodeKind.Var) {
        const rightFrees = getFreeVars(right);
        if (rightFrees.includes(left.idx)) {
          if (right.kind != NodeKind.Var) {
            return undefined; // no solution
          } else {
            throw new Error(`should have been caught by delete step`);
          }
        } else {
          const frees: Set<number> = new Set();
          for (let j = 0; j < terms.length; j++) {
            if (i == j) continue;
            for (const idx of getFreeVars(terms[j][0])) frees.add(idx);
            for (const idx of getFreeVars(terms[j][1])) frees.add(idx);
          }
          if (frees.has(left.idx)) {
            const sub: Substitution = new Map();
            sub.set(left.idx, right);
            for (let j = 0; j < terms.length; j++) {
              if (i == j) continue;
              terms[j] = [apply(sub, terms[j][0]), apply(sub, terms[j][1])];
            }
            stepped = true;
            break;
          }
        }
      }
    }
    if (stepped) continue;

    // Decompose or Conflict steps:
    for (let [i, [left, right]] of terms.entries()) {
      if (left.kind == NodeKind.Var || right.kind == NodeKind.Var) continue;

      // no solution
      if (left.kind == NodeKind.Const && right.kind == NodeKind.FunApp)
        return undefined;
      if (left.kind == NodeKind.FunApp && right.kind == NodeKind.Const)
        return undefined;
      if (left.idx != right.idx) return undefined;
      if (left.kind == NodeKind.Const && right.kind == NodeKind.Const) {
        throw new Error(`should have been caught by delete step`);
      }

      if (left.kind == NodeKind.FunApp && right.kind == NodeKind.FunApp) {
        if (left.args.length != right.args.length) {
          throw new Error(
            `function terms have same symbol but different arity`
          );
        }

        terms.splice(i, 1);
        for (let j = 0; j < left.args.length; j++) {
          terms.push([left.args[j], right.args[j]]);
        }
        stepped = true;
        break;
      }
    }
  } while (stepped);

  const substitution: Substitution = new Map();
  for (const [left, right] of terms) {
    if (left.kind === NodeKind.Var) {
      substitution.set(left.idx, right);
    } else if (right.kind === NodeKind.Var) {
      substitution.set(right.idx, left);
    }
  }

  return substitution;
}

/**
 * Friendly wrapper around `unify` for Atoms.
 */
export function unifyAtoms(a: Atom, b: Atom): Substitution | undefined {
  if (a.idx != b.idx) return undefined;
  assert(a.args.length == b.args.length, "args should be same length")

  const pairs: [Term, Term][] = [];
  for (let i = 0; i < a.args.length; i++) {
    pairs.push([a.args[i], b.args[i]]);
  }

  return unify(pairs);
}

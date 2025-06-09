import {
  And,
  Atom,
  Formula,
  NodeKind,
  Not,
  Or,
  transform,
  TransformFns,
} from './ast';
import { Substitution, unify, unifyAtoms, apply } from './unify';

/**
 * A clause represents a disjunction of atomic formulas or their negations.
 */
export type Clause = {
  atoms: Atom[];
  negated: boolean[];
};

/**
 * Converts a formula in CNF to a set of clauses.
 */
export function cnfToClauses(f: Formula): Clause[] {
  const clauses: (Or | Not | Atom)[] = [];
  const check = (f: Formula) => {
    if (
      f.kind == NodeKind.Or ||
      f.kind == NodeKind.Not ||
      f.kind == NodeKind.Atom
    ) {
      clauses.push(f);
    } else {
      throw new Error(`formula passed to cnfToClause must be in CNF form`);
    }
  };
  const split = (f: And) => {
    if (f.left.kind == NodeKind.And) split(f.left);
    else check(f.left);
    if (f.right.kind == NodeKind.And) split(f.right);
    else check(f.right);
  };
  if (f.kind == NodeKind.And) split(f);
  else check(f);

  return clauses.map((f) => {
    const atoms: Atom[] = [];
    const negated: boolean[] = [];
    const check = (f: Formula) => {
      if (f.kind == NodeKind.Atom) {
        atoms.push(f);
        negated.push(false);
      } else if (f.kind == NodeKind.Not) {
        if (f.arg.kind != NodeKind.Atom) {
          throw new Error(`formula passed to cnfToClause must be in CNF form`);
        }
        atoms.push(f.arg);
        negated.push(true);
      } else {
        throw new Error(`formula passed to cnfToClause must be in CNF form`);
      }
    };
    const split = (f: Or) => {
      if (f.left.kind == NodeKind.Or) split(f.left);
      else check(f.left);
      if (f.right.kind == NodeKind.Or) split(f.right);
      else check(f.right);
    };
    if (f.kind == NodeKind.Or) split(f);
    else check(f);

    return { atoms, negated };
  });
}

/**
 * A possible resolution between an atom in one clause and a negative of the
 * same atom in another clause. A resolution is just a unification of the two
 * atoms, ignoring the negative.
 */
export type Resolution = {
  left: Clause;
  leftIdx: number;
  right: Clause;
  rightIdx: number;
  sub: Substitution;
};

/**
 * Returns a list of valid resolutions between the two clauses.
 */
export function getResolutions(a: Clause, b: Clause): Resolution[] {
  const res: Resolution[] = [];
  for (const [i, atomA] of a.atoms.entries()) {
    for (const [j, atomB] of b.atoms.entries()) {
      if (atomA.idx != atomB.idx) continue;
      if (a.negated[i] == b.negated[j]) continue;
      const sub = unifyAtoms(atomA, atomB);
      if (sub) {
        res.push({
            left: a,
            leftIdx: i,
            right: b,
            rightIdx: j,
            sub,
        });
      }
    }
  }
  return res;
}

/**
 * Applies a resolution to create a new clause. The new clause contains atoms
 * from both clauses (except the unified atoms) with the substitution applied.
 */
export function applyResolution(resolution: Resolution): Clause {
  const { left, leftIdx, right, rightIdx, sub } = resolution;
  
  const atoms: Atom[] = [];
  const negated: boolean[] = [];
  for (let i = 0; i < left.atoms.length; i++) {
    if (i !== leftIdx) {
      const atom = apply(sub, left.atoms[i]) as Atom;
      atoms.push(atom);
      negated.push(left.negated[i]);
    }
  }
  for (let i = 0; i < right.atoms.length; i++) {
    if (i !== rightIdx) {
      const atom = apply(sub, right.atoms[i]) as Atom;
      atoms.push(atom);
      negated.push(right.negated[i]);
    }
  }
  
  return { atoms, negated };
}

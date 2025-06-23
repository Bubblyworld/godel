import {
  And,
  Atom,
  Formula,
  NodeKind,
  Not,
  Or,
  SymbolTable,
  Term,
} from './ast';
import { apply, Substitution, unifyAtoms } from './unify';
import { renderFormula } from './parse';

/**
 * A clause represents a disjunction of atomic formulas or their negations.
 */
export type Clause = {
  atoms: Atom[];
  negated: boolean[];

  /**
   * True if the clause is in the support-set, i.e. was either the original
   * goal or some descended resolvent of it.
   */
  sos: boolean;
};

/**
 * Converts a formula in CNF to a set of clauses.
 */
export function cnfToClauses(f: Formula, sos: boolean = false): Clause[] {
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

    return { atoms, negated, sos };
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
 * Checks if two terms are structurally equal.
 */
function termsEqual(a: Term, b: Term): boolean {
  if (a.kind !== b.kind) return false;
  if (a.idx !== b.idx) return false;

  if (a.kind === NodeKind.FunApp && b.kind === NodeKind.FunApp) {
    if (a.args.length !== b.args.length) return false;
    for (let i = 0; i < a.args.length; i++) {
      if (!termsEqual(a.args[i], b.args[i])) return false;
    }
  }

  return true;
}

/**
 * Checks if two atoms are structurally equal.
 */
function atomsEqual(a: Atom, b: Atom): boolean {
  if (a.idx !== b.idx) return false;
  if (a.args.length !== b.args.length) return false;

  for (let i = 0; i < a.args.length; i++) {
    if (!termsEqual(a.args[i], b.args[i])) return false;
  }

  return true;
}

/**
 * Removes duplicate literals from a clause.
 */
function removeDuplicates(
  atoms: Atom[],
  negated: boolean[]
): { atoms: Atom[]; negated: boolean[] } {
  const uniqueAtoms: Atom[] = [];
  const uniqueNegated: boolean[] = [];

  for (let i = 0; i < atoms.length; i++) {
    let isDuplicate = false;
    for (let j = 0; j < uniqueAtoms.length; j++) {
      if (
        negated[i] === uniqueNegated[j] &&
        atomsEqual(atoms[i], uniqueAtoms[j])
      ) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueAtoms.push(atoms[i]);
      uniqueNegated.push(negated[i]);
    }
  }

  return { atoms: uniqueAtoms, negated: uniqueNegated };
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

  // Remove duplicate literals
  const cleaned = removeDuplicates(atoms, negated);

  return {
    atoms: cleaned.atoms,
    negated: cleaned.negated,
    sos: left.sos || right.sos,
  };
}

/**
 * Represents a factoring opportunity where two literals in a clause can be unified.
 */
export type Factor = {
  clause: Clause;
  idx1: number;
  idx2: number;
  sub: Substitution;
};

/**
 * Finds all possible factors in a clause by attempting to unify pairs of literals
 * with the same polarity.
 */
export function getFactors(clause: Clause): Factor[] {
  const factors: Factor[] = [];

  // Try to unify every pair of literals with same polarity
  for (let i = 0; i < clause.atoms.length; i++) {
    for (let j = i + 1; j < clause.atoms.length; j++) {
      // Only factor literals with same polarity
      if (clause.negated[i] === clause.negated[j]) {
        const sub = unifyAtoms(clause.atoms[i], clause.atoms[j]);
        if (sub) {
          factors.push({ clause, idx1: i, idx2: j, sub });
        }
      }
    }
  }

  return factors;
}

/**
 * Applies a factor to create a new clause by unifying two literals and removing one.
 */
export function applyFactor(factor: Factor): Clause {
  const { clause, idx2, sub } = factor;

  // Apply substitution to all atoms
  const atoms: Atom[] = [];
  const negated: boolean[] = [];

  for (let i = 0; i < clause.atoms.length; i++) {
    // Skip the second unified atom (remove it)
    if (i === idx2) continue;

    const atom = apply(sub, clause.atoms[i]) as Atom;
    atoms.push(atom);
    negated.push(clause.negated[i]);
  }

  // Remove duplicates that may have been created
  const cleaned = removeDuplicates(atoms, negated);

  return {
    atoms: cleaned.atoms,
    negated: cleaned.negated,
    sos: clause.sos,
  };
}

/**
 * Checks if a substitution only binds variables (not function applications or constants).
 * Such substitutions are "safe" because the factored clause subsumes the original.
 */
export function isVariableOnlySubstitution(sub: Substitution): boolean {
  for (const [, term] of sub) {
    // If any binding maps to a non-variable term, it's not variable-only
    if (term.kind !== NodeKind.Var) {
      return false;
    }
  }
  return true;
}

/**
 * Renders a clause as a human-readable string.
 */
export function renderClause(clause: Clause, st: SymbolTable): string {
  if (clause.atoms.length === 0) {
    return '⊥'; // empty clause
  }

  const literals = clause.atoms.map((atom, i) => {
    const formula: Formula = clause.negated[i]
      ? { kind: NodeKind.Not, arg: atom }
      : atom;
    return renderFormula(formula, st);
  });

  return literals.join(' ∨ ');
}

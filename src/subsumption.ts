import { Clause, renderClause } from './resolution';
import {
  SymbolTable,
  NodeKind,
  Term,
  SymbolKind,
  Atom,
  equal,
  resolve,
  VarSymbol,
} from './ast';
import { Substitution, unifyAtoms, apply } from './unify';
import { debugLogger, LogComponent, LogLevel } from './debug-logger';
import { renderTerm } from './parse';

export interface ClauseSignature {
  posPreds: number;
  negPreds: number;
  funcs: number;
  misc: number;
}

export interface SymbolMasks {
  posPredicateMasks: Map<number, number>;
  negPredicateMasks: Map<number, number>;
  functionMasks: Map<number, number>;
  constantMasks: Map<number, number>;
}

export interface IndexedClause extends Clause {
  signature: ClauseSignature;
  id: number;
  noLongerPassive?: boolean;
  age: number;
}

export const MISC_HAS_EQUALITY = 1 << 0;
export const MISC_HAS_GROUND = 1 << 1;
export const MISC_DEPTH_GE_3 = 1 << 2;

export function generateKBitMask(k: number, seed: number): number {
  if (k < 0 || k > 32) {
    throw new Error(`k must be between 0 and 32, got ${k}`);
  }

  // We need deterministic randomness so signatures are reproducible across runs
  let random = Math.abs(seed) || 1;
  const nextRandom = () => {
    random = (random * 1103515245 + 12345) % 0x7fffffff;
    return random;
  };

  let mask = 0;
  const usedBits = new Set<number>();

  let attempts = 0;
  while (usedBits.size < k && attempts < 1000) {
    const bit = nextRandom() % 32;
    if (!usedBits.has(bit)) {
      usedBits.add(bit);
      mask |= 1 << bit;
    }
    attempts++;
  }

  if (usedBits.size < k) {
    throw new Error(
      `Failed to generate ${k} unique bits after ${attempts} attempts`
    );
  }

  return mask >>> 0;
}

export function popcount(n: number): number {
  n = n >>> 0;
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
}

export function createSymbolMasks(
  st: SymbolTable,
  k: number = 4,
  seed: number = 42
): SymbolMasks {
  const masks: SymbolMasks = {
    posPredicateMasks: new Map(),
    negPredicateMasks: new Map(),
    functionMasks: new Map(),
    constantMasks: new Map(),
  };

  for (let i = 0; i < st.rels.length; i++) {
    masks.posPredicateMasks.set(i, generateKBitMask(k, seed + i * 2));
    masks.negPredicateMasks.set(i, generateKBitMask(k, seed + i * 2 + 1));
  }

  for (let i = 0; i < st.funs.length; i++) {
    masks.functionMasks.set(i, generateKBitMask(k, seed + 1000 + i));
  }

  for (let i = 0; i < st.consts.length; i++) {
    masks.constantMasks.set(i, generateKBitMask(k, seed + 2000 + i));
  }

  return masks;
}

export function emptySignature(): ClauseSignature {
  return {
    posPreds: 0,
    negPreds: 0,
    funcs: 0,
    misc: 0,
  };
}

// Fast signature check with no false negatives but ~2% false positives
export function maybeSubsumes(a: ClauseSignature, b: ClauseSignature): boolean {
  if ((a.posPreds & ~b.posPreds) !== 0) return false;
  if ((a.negPreds & ~b.negPreds) !== 0) return false;
  if ((a.funcs & ~b.funcs) !== 0) return false;
  if ((a.misc & ~b.misc) !== 0) return false;
  return true;
}

function termDepth(term: Term): number {
  switch (term.kind) {
    case NodeKind.Var:
    case NodeKind.Const:
      return 1;
    case NodeKind.FunApp:
      return 1 + Math.max(...term.args.map(termDepth), 0);
  }
}

export function isGroundTerm(term: Term): boolean {
  switch (term.kind) {
    case NodeKind.Var:
      return false;
    case NodeKind.Const:
      return true;
    case NodeKind.FunApp:
      return term.args.every(isGroundTerm);
  }
}

function walkTerm(
  term: Term,
  fn: (kind: SymbolKind, idx: number) => void
): void {
  switch (term.kind) {
    case NodeKind.Var:
      break;
    case NodeKind.Const:
      fn(SymbolKind.Const, term.idx);
      break;
    case NodeKind.FunApp:
      fn(SymbolKind.Fun, term.idx);
      term.args.forEach((arg) => walkTerm(arg, fn));
      break;
  }
}

export function buildSignature(
  clause: Clause,
  masks: SymbolMasks
): ClauseSignature {
  const sig = emptySignature();

  for (let i = 0; i < clause.atoms.length; i++) {
    const atom = clause.atoms[i];
    const negated = clause.negated[i];

    if (negated) {
      const mask = masks.negPredicateMasks.get(atom.idx);
      if (mask !== undefined) sig.negPreds |= mask;
    } else {
      const mask = masks.posPredicateMasks.get(atom.idx);
      if (mask !== undefined) sig.posPreds |= mask;
    }

    const isGround = atom.args.every(isGroundTerm);
    if (isGround) {
      sig.misc |= MISC_HAS_GROUND;
    }

    for (const term of atom.args) {
      if (termDepth(term) >= 3) {
        sig.misc |= MISC_DEPTH_GE_3;
      }

      walkTerm(term, (kind, idx) => {
        if (kind === SymbolKind.Fun) {
          const mask = masks.functionMasks.get(idx);
          if (mask !== undefined) sig.funcs |= mask;
        } else if (kind === SymbolKind.Const) {
          const mask = masks.constantMasks.get(idx);
          if (mask !== undefined) sig.funcs |= mask;
        }
      });
    }
  }

  return sig;
}

export function lowestSetBit(n: number): number {
  if (n === 0) return 32;
  let bit = 0;
  if ((n & 0xffff) === 0) {
    bit += 16;
    n >>>= 16;
  }
  if ((n & 0xff) === 0) {
    bit += 8;
    n >>>= 8;
  }
  if ((n & 0xf) === 0) {
    bit += 4;
    n >>>= 4;
  }
  if ((n & 0x3) === 0) {
    bit += 2;
    n >>>= 2;
  }
  if ((n & 0x1) === 0) {
    bit += 1;
  }
  return bit;
}

export class SubsumptionIndex {
  private masks: SymbolMasks;

  private buckets: Map<number, IndexedClause[]>;

  private nextClauseId: number;

  private nextAge: number;

  constructor(private st: SymbolTable) {
    this.masks = createSymbolMasks(st);
    this.buckets = new Map();
    this.nextClauseId = 0;
    this.nextAge = 0;

    // We need 33 buckets: 0-31 for each possible lowest bit + 32 for empty signatures
    for (let i = 0; i <= 32; i++) {
      this.buckets.set(i, []);
    }
  }

  index(clause: Clause): IndexedClause {
    const signature = this.buildSignature(clause);
    const indexed: IndexedClause = {
      ...clause,
      signature,
      id: this.nextClauseId++,
      age: this.nextAge++,
    };
    return indexed;
  }

  insert(clause: IndexedClause) {
    const lowestBit = lowestSetBit(clause.signature.funcs);
    const bucket = this.buckets.get(lowestBit);
    if (bucket) {
      bucket.push(clause);
    } else {
      throw new Error('subsumption index buckets not initialised');
    }
  }

  findCandidates(clause: IndexedClause): IndexedClause[] {
    const candidates: IndexedClause[] = [];
    const sig = clause.signature;

    const lowestBit = lowestSetBit(sig.funcs);
    const bucket = this.buckets.get(lowestBit);

    if (bucket) {
      for (const candidate of bucket) {
        if (maybeSubsumes(sig, candidate.signature)) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  remove(clause: IndexedClause): void {
    const lowestBit = lowestSetBit(clause.signature.funcs);
    const bucket = this.buckets.get(lowestBit);

    if (bucket) {
      const index = bucket.findIndex((c) => c.id === clause.id);
      if (index >= 0) {
        bucket.splice(index, 1);
      }
    }
  }

  size(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.length;
    }
    return total;
  }

  subsumes(a: IndexedClause, b: IndexedClause): Substitution | null {
    if (!maybeSubsumes(a.signature, b.signature)) {
      return null;
    }

    // Empty clause only subsumes itself
    if (a.atoms.length === 0) {
      return b.atoms.length === 0 ? new Map() : null;
    }

    const result = this.findSubsumptionSubstitution(a, b);

    if (result) {
      // Filter out identity mappings for the returned substitution
      const filteredResult = this.filterIdentityMappings(result);

      const subStr = this.renderSubstitution(filteredResult);
      debugLogger.debug(
        LogComponent.SUBSUMPTION,
        `Clause #${a.id} "${renderClause(a, this.st)}" subsumes #${b.id} "${renderClause(b, this.st)}" with substitution: ${subStr}`
      );

      return filteredResult;
    }

    return null;
  }

  private filterIdentityMappings(sub: Substitution): Substitution {
    const filtered = new Map<number, Term>();
    for (const [varIdx, term] of sub) {
      if (!(term.kind === NodeKind.Var && term.idx === varIdx)) {
        filtered.set(varIdx, term);
      }
    }
    return filtered;
  }

  private renderSubstitution(sub: Substitution): string {
    if (sub.size === 0) return '{}';

    const entries: string[] = [];
    for (const [varIdx, term] of sub) {
      // Skip identity mappings for cleaner output
      if (term.kind === NodeKind.Var && term.idx === varIdx) {
        continue;
      }

      const varSymbol = resolve(SymbolKind.Var, varIdx, this.st);
      const varName = varSymbol.symbol.description || `x${varIdx}`;
      const termStr = renderTerm(term, this.st);
      entries.push(`${varName} ↦ ${termStr}`);
    }
    return entries.length > 0 ? `{${entries.join(', ')}}` : '{}';
  }

  // Matches a pattern atom against a target atom, only allowing substitutions
  // for variables in the pattern. Returns null if no match is possible.
  private matchAtoms(pattern: Atom, target: Atom): Substitution | null {
    if (pattern.idx !== target.idx) return null;
    if (pattern.args.length !== target.args.length) return null;

    const sub = new Map<number, Term>();

    const matchTerms = (p: Term, t: Term): boolean => {
      if (p.kind === NodeKind.Var) {
        // Pattern variable - can be matched to anything
        if (sub.has(p.idx)) {
          // Already bound - check consistency
          return equal(sub.get(p.idx), t);
        } else {
          // Always record the binding to ensure consistency
          sub.set(p.idx, t);
          return true;
        }
      } else if (p.kind === NodeKind.Const) {
        // Constants must match exactly
        return t.kind === NodeKind.Const && p.idx === t.idx;
      } else if (p.kind === NodeKind.FunApp) {
        // Function applications must match structurally
        if (t.kind !== NodeKind.FunApp) return false;
        if (p.idx !== t.idx) return false;
        if (p.args.length !== t.args.length) return false;

        for (let i = 0; i < p.args.length; i++) {
          if (!matchTerms(p.args[i], t.args[i])) return false;
        }
        return true;
      }

      return false;
    };

    // Match all arguments
    for (let i = 0; i < pattern.args.length; i++) {
      if (!matchTerms(pattern.args[i], target.args[i])) {
        return null;
      }
    }

    return sub;
  }

  // Backtracking algorithm to find consistent substitution across all literals
  private findSubsumptionSubstitution(
    a: IndexedClause,
    b: IndexedClause
  ): Substitution | null {
    const substitution = new Map<number, Term>();

    const matchLiterals = (aIndex: number): boolean => {
      if (aIndex >= a.atoms.length) {
        return true;
      }

      const aAtom = a.atoms[aIndex];
      const aNegated = a.negated[aIndex];

      // B's literals can be reused - we need σ(A) ⊆ B
      for (let bIndex = 0; bIndex < b.atoms.length; bIndex++) {
        const bAtom = b.atoms[bIndex];
        const bNegated = b.negated[bIndex];

        if (aNegated !== bNegated) continue;

        // Use matching instead of unification - only variables in A can be substituted
        const matcher = this.matchAtoms(aAtom, bAtom);
        if (!matcher) continue;

        const mergedSub = this.mergeSubstitutions(substitution, matcher);
        if (!mergedSub) continue;

        const oldSubstitution = new Map(substitution);

        substitution.clear();
        for (const [k, v] of mergedSub) {
          substitution.set(k, v);
        }

        if (matchLiterals(aIndex + 1)) {
          return true;
        }

        substitution.clear();
        for (const [k, v] of oldSubstitution) {
          substitution.set(k, v);
        }
      }

      return false;
    };

    if (matchLiterals(0)) {
      return substitution;
    }

    return null;
  }

  private mergeSubstitutions(
    sub1: Substitution,
    sub2: Substitution
  ): Substitution | null {
    const result = new Map(sub1);

    for (const [varIdx, term2] of sub2) {
      if (result.has(varIdx)) {
        const term1 = result.get(varIdx);
        // For matching, we just need direct equality check
        if (!equal(term1, term2)) {
          return null;
        }
      } else {
        result.set(varIdx, term2);
      }
    }

    return result;
  }

  buildSignature(clause: Clause): ClauseSignature {
    return buildSignature(clause, this.masks);
  }
}

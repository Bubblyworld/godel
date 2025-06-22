import { Clause } from './resolution';
import { SymbolTable, NodeKind, Term, SymbolKind } from './ast';
import { Substitution } from './unify';

/**
 * 128-bit clause signature split into 4x32-bit blocks for efficient subsumption checking
 */
export interface ClauseSignature {
  /** Positive predicate symbols (32 bits) */
  posPreds: number;

  /** Negative predicate symbols (32 bits) */
  negPreds: number;

  /** Function and constant symbols (32 bits) */
  funcs: number;

  /** Miscellaneous features (32 bits) */
  misc: number;
}

/**
 * Pre-computed symbol masks for fast signature generation
 */
export interface SymbolMasks {
  /** Maps positive predicate symbol indices to their k-bit masks */
  posPredicateMasks: Map<number, number>;

  /** Maps negative predicate symbol indices to their k-bit masks */
  negPredicateMasks: Map<number, number>;

  /** Maps function symbol indices to their k-bit masks */
  functionMasks: Map<number, number>;

  /** Maps constant symbol indices to their k-bit masks */
  constantMasks: Map<number, number>;
}

/**
 * Extended clause with pre-computed signature and metadata
 */
export interface IndexedClause extends Clause {
  /** Pre-computed signature for fast subsumption checks */
  signature: ClauseSignature;

  /** Unique identifier for clause tracking */
  id: number;

  /** Activation status to prevent double selection from queues */
  active?: boolean;

  /** Age for FIFO ordering */
  age: number;
}

// Miscellaneous feature bits
export const MISC_HAS_EQUALITY = 1 << 0; // unused
export const MISC_HAS_GROUND = 1 << 1;
export const MISC_DEPTH_GE_3 = 1 << 2;

/**
 * Generate a random k-bit mask with exactly k bits set
 * @param k Number of bits to set (typically 3-5)
 * @param seed Random seed for deterministic generation
 */
export function generateKBitMask(k: number, seed: number): number {
  // Validate input
  if (k < 0 || k > 32) {
    throw new Error(`k must be between 0 and 32, got ${k}`);
  }

  // Use a simple linear congruential generator for deterministic randomness
  let random = Math.abs(seed) || 1; // Ensure non-zero seed
  const nextRandom = () => {
    random = (random * 1103515245 + 12345) % 0x7fffffff;
    return random;
  };

  // Start with no bits set
  let mask = 0;
  const usedBits = new Set<number>();

  // Generate k unique bit positions
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

  return mask >>> 0; // Ensure unsigned 32-bit
}

/**
 * Count the number of set bits in a 32-bit integer
 */
export function popcount(n: number): number {
  n = n >>> 0; // Ensure unsigned
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
}

/**
 * Create symbol masks for a given symbol table
 * @param st Symbol table to generate masks for
 * @param k Number of bits per mask (default: 4)
 * @param seed Base random seed (default: 42)
 */
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

  // Generate masks for relations (predicates)
  for (let i = 0; i < st.rels.length; i++) {
    masks.posPredicateMasks.set(i, generateKBitMask(k, seed + i * 2));
    masks.negPredicateMasks.set(i, generateKBitMask(k, seed + i * 2 + 1));
  }

  // Generate masks for functions
  for (let i = 0; i < st.funs.length; i++) {
    masks.functionMasks.set(i, generateKBitMask(k, seed + 1000 + i));
  }

  // Generate masks for constants
  for (let i = 0; i < st.consts.length; i++) {
    masks.constantMasks.set(i, generateKBitMask(k, seed + 2000 + i));
  }

  return masks;
}

/**
 * Create an empty clause signature
 */
export function emptySignature(): ClauseSignature {
  return {
    posPreds: 0,
    negPreds: 0,
    funcs: 0,
    misc: 0,
  };
}

/**
 * Fast check if signature A might subsume signature B
 * Returns false if A definitely doesn't subsume B (no false negatives)
 * Returns true if A might subsume B (may have false positives)
 */
export function maybeSubsumes(a: ClauseSignature, b: ClauseSignature): boolean {
  // Check if any bit set in A is missing in B
  if ((a.posPreds & ~b.posPreds) !== 0) return false;
  if ((a.negPreds & ~b.negPreds) !== 0) return false;
  if ((a.funcs & ~b.funcs) !== 0) return false;
  if ((a.misc & ~b.misc) !== 0) return false;
  return true;
}

/**
 * Calculate the depth of a term
 */
function termDepth(term: Term): number {
  switch (term.kind) {
    case NodeKind.Var:
    case NodeKind.Const:
      return 1;
    case NodeKind.FunApp:
      return 1 + Math.max(...term.args.map(termDepth), 0);
  }
}

/**
 * Check if a term is ground (contains no variables)
 */
function isGroundTerm(term: Term): boolean {
  switch (term.kind) {
    case NodeKind.Var:
      return false;
    case NodeKind.Const:
      return true;
    case NodeKind.FunApp:
      return term.args.every(isGroundTerm);
  }
}

/**
 * Walk a term and apply function to each symbol
 */
function walkTerm(
  term: Term,
  fn: (kind: SymbolKind, idx: number) => void
): void {
  switch (term.kind) {
    case NodeKind.Var:
      // Variables don't contribute to signature
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

/**
 * Build a clause signature from a clause and symbol masks
 */
export function buildSignature(
  clause: Clause,
  masks: SymbolMasks
): ClauseSignature {
  const sig = emptySignature();

  for (let i = 0; i < clause.atoms.length; i++) {
    const atom = clause.atoms[i];
    const negated = clause.negated[i];

    // Add predicate mask based on polarity
    if (negated) {
      const mask = masks.negPredicateMasks.get(atom.idx);
      if (mask !== undefined) sig.negPreds |= mask;
    } else {
      const mask = masks.posPredicateMasks.get(atom.idx);
      if (mask !== undefined) sig.posPreds |= mask;
    }

    // Check if literal is ground
    const isGround = atom.args.every(isGroundTerm);
    if (isGround) {
      sig.misc |= MISC_HAS_GROUND;
    }

    // Walk terms to collect function and constant symbols
    for (const term of atom.args) {
      // Check depth
      if (termDepth(term) >= 3) {
        sig.misc |= MISC_DEPTH_GE_3;
      }

      // Collect function and constant symbols
      walkTerm(term, (kind, idx) => {
        if (kind === SymbolKind.Fun) {
          const mask = masks.functionMasks.get(idx);
          if (mask !== undefined) sig.funcs |= mask;
        } else if (kind === SymbolKind.Const) {
          const mask = masks.constantMasks.get(idx);
          if (mask !== undefined) sig.funcs |= mask; // Constants go in funcs block
        }
      });
    }
  }

  return sig;
}

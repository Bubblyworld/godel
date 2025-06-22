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

/**
 * Find the lowest set bit in a 32-bit integer
 * Returns 32 if no bits are set
 */
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

/**
 * Subsumption index for fast clause retrieval
 */
export class SubsumptionIndex {
  /** Symbol masks computed once at startup */
  private masks: SymbolMasks;

  /** Level-1 hash table indexed by lowest set bit of function mask */
  private buckets: Map<number, IndexedClause[]>;

  /** Counter for generating clause IDs */
  private nextClauseId: number;

  /** Counter for clause age */
  private nextAge: number;

  constructor(symbolTable: SymbolTable) {
    this.masks = createSymbolMasks(symbolTable);
    this.buckets = new Map();
    this.nextClauseId = 0;
    this.nextAge = 0;

    // Initialize buckets for all possible lowest bits (0-31) + one for empty signatures
    for (let i = 0; i <= 32; i++) {
      this.buckets.set(i, []);
    }
  }

  /**
   * Add a clause to the index
   */
  insert(clause: Clause): IndexedClause {
    const signature = buildSignature(clause, this.masks);
    const indexed: IndexedClause = {
      ...clause,
      signature,
      id: this.nextClauseId++,
      age: this.nextAge++,
    };

    // Find the lowest set bit in the function mask
    const lowestBit = lowestSetBit(signature.funcs);

    // Add to the appropriate bucket
    const bucket = this.buckets.get(lowestBit);
    if (bucket) {
      bucket.push(indexed);
    }

    return indexed;
  }

  /**
   * Find all clauses that might be subsumed by the given clause
   */
  findCandidates(clause: IndexedClause): IndexedClause[] {
    const candidates: IndexedClause[] = [];
    const sig = clause.signature;

    // Only need to check the bucket for the lowest bit of clause's function mask
    const lowestBit = lowestSetBit(sig.funcs);
    const bucket = this.buckets.get(lowestBit);

    if (bucket) {
      for (const candidate of bucket) {
        // Use fast signature check to filter
        if (maybeSubsumes(sig, candidate.signature)) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  /**
   * Remove a clause from the index
   */
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

  /**
   * Get total number of indexed clauses
   */
  size(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.length;
    }
    return total;
  }

  /**
   * Full subsumption check with substitution finding
   * Returns null if no subsumption, or the substitution if A subsumes B
   */
  subsumes(a: IndexedClause, b: IndexedClause): Substitution | null {
    // Quick signature check first
    if (!maybeSubsumes(a.signature, b.signature)) {
      return null;
    }

    // TODO: Implement full subsumption algorithm in Week 3
    // For now, just return null (no subsumption found)
    return null;
  }
}

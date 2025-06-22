# Subsumption Index and Active/Passive Clause Set Implementation Plan

## Overview

This document outlines the plan for implementing:
1. An efficient subsumption check with a bitmask-based index
2. A proper passive/active clause set architecture using Otter's selection mechanism

The subsumption relation (A ⊑ B) holds when there exists a substitution σ such that σ(A) ⊆ B, meaning A is a generalization of B. The passive/active architecture will replace the current naive refutation loop with a more sophisticated clause selection strategy.

## Architecture Design

### 1. Core Data Structures

#### 1.1 ClauseSignature (128-bit feature vector)
```typescript
// src/subsumption.ts
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
```

#### 1.2 Symbol Masks
```typescript
export interface SymbolMasks {
  /** Maps positive predicate symbol indices to their k-bit masks */
  posPredicateMasks: Map<number, number>;
  
  /** Maps negative predicate symbol indices to their k-bit masks */
  negPredicateMasks: Map<number, number>;
  
  /** Maps function symbol indices to their k-bit masks */
  functionMasks: Map<number, number>;
}
```

#### 1.3 Extended Clause Type
```typescript
// Extend existing Clause type in resolution.ts
export interface IndexedClause extends Clause {
  /** Pre-computed signature for fast subsumption checks */
  signature: ClauseSignature;
  
  /** Unique identifier for clause tracking */
  id: number;
  
  /** Activation status to prevent double selection from queues */
  active?: boolean;
}
```

### 2. Subsumption Index Structure

#### 2.1 Main Index
```typescript
export class SubsumptionIndex {
  /** Symbol masks computed once at startup */
  private masks: SymbolMasks;
  
  /** Level-1 hash table indexed by lowest set bit of function mask */
  private buckets: Map<number, IndexedClause[]>;
  
  /** Counter for generating clause IDs */
  private nextClauseId: number;
  
  constructor(symbolTable: SymbolTable);
  
  /** Add a clause to the index */
  insert(clause: Clause): IndexedClause;
  
  /** Find all clauses that might be subsumed by the given clause */
  findCandidates(clause: IndexedClause): IndexedClause[];
  
  /** Fast check if A might subsume B based on signatures */
  maybeSubsumes(a: ClauseSignature, b: ClauseSignature): boolean;
  
  /** Full subsumption check with substitution finding */
  subsumes(a: IndexedClause, b: IndexedClause): Substitution | null;
}
```

### 3. Passive/Active Clause Architecture

#### 3.1 Clause Set Management
```typescript
export class ClauseSet {
  /** Active clauses - currently being processed */
  private active: Set<IndexedClause>;
  
  /** Passive clauses - waiting to be selected */
  private passive: {
    /** Priority queue ordered by age (FIFO) */
    ageQueue: PriorityQueue<IndexedClause>;
    
    /** Priority queue ordered by heuristic (length for now) */
    heuristicQueue: PriorityQueue<IndexedClause>;
  };
  
  /** Otter's ratio: take 1 from age queue for every k from heuristic */
  private readonly otterRatio: number = 4;
  
  /** Counter for age-based selection */
  private selectionCounter: number = 0;
  
  /** Select next clause to process using Otter's mechanism */
  selectClause(): IndexedClause | null;
  
  /** Add new clause to passive set */
  addPassive(clause: IndexedClause): void;
  
  /** Move clause from passive to active */
  activate(clause: IndexedClause): void;
  
  /** Remove clause from both sets */
  remove(clause: IndexedClause): void;
  
  /** Generate all resolvents between active clause and others */
  generateResolvents(clause: IndexedClause): IndexedClause[];
}
```

#### 3.2 Priority Queue Implementation
```typescript
export class PriorityQueue<T> {
  private heap: Array<{item: T, priority: number}>;
  
  constructor(private compareFn: (a: number, b: number) => number);
  
  insert(item: T, priority: number): void;
  extractMin(): T | null;
  isEmpty(): boolean;
  size(): number;
}
```

#### 3.3 Clause Selection Strategy
- Maintain two priority queues in passive set:
  - **Age queue**: FIFO order (older clauses have higher priority)
  - **Heuristic queue**: Currently ordered by clause length (shorter = higher priority)
- Use Otter's ratio (k=4): Take 1 clause from age queue, then k from heuristic queue
- This guarantees completeness while preferring promising clauses
- **Activation tracking**: When selecting a clause:
  1. Extract from appropriate queue based on counter
  2. Skip if `clause.active === true` (already activated from other queue)
  3. Continue extracting until finding non-active clause or queue empty
  4. The `activate()` method sets `clause.active = true`

### 4. Implementation Phases

#### Phase 1: Bitmask Generation and Signature Building
1. **Random k-bit mask generation** (k=4 for 32-bit blocks)
   - Use deterministic random seed for reproducibility
   - Ensure exactly k bits are set per mask
   - Store masks in SymbolMasks structure

2. **Signature computation for clauses**
   - Walk literals to collect predicate symbols with polarity
   - Walk terms recursively to collect function symbols
   - Set misc bits for special features (equality, ground literals, depth≥3)

#### Phase 2: Fast Filtering Implementation
1. **Bit-level maybe_subsumes check**
   - Use bitwise ANDN operations: `(a & ~b) === 0`
   - Early exit on first mismatch
   - Inline for maximum performance

2. **Hash bucket management**
   - Compute lowest set bit of function mask
   - Maintain 256 buckets (8 bits)
   - Insert clauses into all relevant buckets

#### Phase 3: Full Subsumption Algorithm
1. **Constraint matching algorithm**
   - Try to match each literal in A with some literal in B
   - Build consistent substitution across all matches
   - Use backtracking for constraint satisfaction

2. **Integration with unification**
   - Leverage existing unifyAtoms function
   - Check substitution consistency across literals
   - Handle variable renaming

### 4. Integration Points

#### 4.1 Prover Integration
```typescript
// In prover.ts, complete rewrite of proves() function:
export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  maxClauses: number = 10000,
): boolean {
  // Initialize subsumption index and clause set
  const subsumptionIndex = new SubsumptionIndex(st);
  const clauseSet = new ClauseSet();
  
  // Convert initial theory and negated goal to clauses
  const initialClauses = [
    ...theory.flatMap(f => cnfToClauses(toCNF(f, st))),
    ...cnfToClauses(toCNF({ kind: NodeKind.Not, arg: formula }, st), true)
  ];
  
  // Add all initial clauses to passive set
  for (const clause of initialClauses) {
    const indexed = subsumptionIndex.insert(clause);
    clauseSet.addPassive(indexed);
  }
  
  // Main refutation loop
  while (clauseSet.hasPassiveClauses() && clauseSet.size() < maxClauses) {
    // Select next clause using Otter's mechanism
    const selected = clauseSet.selectClause();
    if (!selected) break;
    
    // Move to active set and mark as active
    clauseSet.activate(selected);
    
    // Generate all possible resolvents
    const resolvents = clauseSet.generateResolvents(selected);
    
    for (const resolvent of resolvents) {
      // Check for empty clause (proof found)
      if (resolvent.atoms.length === 0) {
        return true;
      }
      
      // Forward subsumption: skip if subsumed by existing
      const candidates = subsumptionIndex.findCandidates(resolvent);
      let isSubsumed = false;
      for (const candidate of candidates) {
        if (subsumptionIndex.subsumes(candidate, resolvent)) {
          isSubsumed = true;
          break;
        }
      }
      if (isSubsumed) continue;
      
      // Backward subsumption: remove clauses subsumed by new one
      for (const candidate of candidates) {
        if (subsumptionIndex.subsumes(resolvent, candidate)) {
          clauseSet.remove(candidate);
          subsumptionIndex.remove(candidate);
        }
      }
      
      // Add new clause
      const indexed = subsumptionIndex.insert(resolvent);
      clauseSet.addPassive(indexed);
    }
  }
  
  return false; // Saturation reached without finding empty clause
}
```

#### 4.2 Resolution Engine Integration
- Extend `getResolutions` to work with `IndexedClause`
- Implement clause equality checking for duplicate detection
- Add clause metadata (age, parent clauses) for proof reconstruction

### 5. Testing Strategy

1. **Unit tests for subsumption.ts**
   - Test mask generation (distribution, sparsity)
   - Test signature computation
   - Test maybe_subsumes accuracy
   - Test full subsumption algorithm

2. **Unit tests for clause-set.ts**
   - Test priority queue operations
   - Test Otter's selection mechanism
   - Test clause activation/passivation
   - Test resolvent generation

### 6. Implementation Timeline

1. **Week 1**: Core data structures (ClauseSignature, SymbolMasks, IndexedClause)
2. **Week 2**: Subsumption index with fast filtering
3. **Week 3**: Full subsumption algorithm with constraint matching
4. **Week 4**: Passive/Active clause architecture with priority queues
5. **Week 5**: Integration into prover and testing

## Key Benefits

1. **Subsumption Index**
   - Eliminates redundant clauses early
   - Constant-time filtering with ~98% precision
   - Reduces search space significantly

2. **Passive/Active Architecture**
   - Replaces naive O(n²) all-pairs resolution
   - Focuses on promising clauses via heuristics
   - Maintains completeness through age-based fairness
   - Scales better to larger problems

3. **Combined Impact**
   - More efficient memory usage
   - Better clause selection strategy
   - Faster convergence to proofs
   - Ability to handle larger theories
import { IndexedClause, SubsumptionIndex } from './subsumption';
import { SymbolTable, NodeKind, Term, Atom } from './ast';
import {
  getResolutions,
  applyResolution,
  renderClause,
  Clause,
  getFactors,
  applyFactor,
} from './resolution';
import { debugLogger, LogComponent, LogLevel } from './debug-logger';

/**
 * Calculate the depth of a term. Variables and constants have depth 1,
 * function applications have depth 1 + max depth of arguments.
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
 * Calculate the total symbol count in a term, which represents the
 * size of the term tree.
 */
function termSize(term: Term): number {
  switch (term.kind) {
    case NodeKind.Var:
    case NodeKind.Const:
      return 1;
    case NodeKind.FunApp:
      return 1 + term.args.reduce((sum, arg) => sum + termSize(arg), 0);
  }
}

/**
 * Calculate a complexity score for a clause that considers both the number
 * of atoms and the complexity of terms within those atoms. This helps
 * penalize clauses with deeply nested function applications (like S(S(S(...)))).
 */
export function clauseComplexity(clause: IndexedClause): number {
  let totalDepth = 0;
  let totalSize = 0;
  const atomCount = clause.atoms.length;

  // Sum up the depth and size of all terms in all atoms
  for (const atom of clause.atoms) {
    for (const term of atom.args) {
      totalDepth += termDepth(term);
      totalSize += termSize(term);
    }
  }

  // Heuristic formula that balances:
  // - Number of atoms (want fewer atoms)
  // - Average term depth (penalize deep nesting like S(S(S(...))))
  // - Total term size (penalize large terms)
  // The weights can be tuned based on performance
  const avgDepth =
    clause.atoms.length > 0 && totalSize > 0 ? totalDepth / totalSize : 0;
  return atomCount * 10 + avgDepth * 10 + totalSize * 5;
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
 * Checks if a clause is a tautology (contains P and ¬P for some atom P).
 */
function isTautology(clause: Clause): boolean {
  for (let i = 0; i < clause.atoms.length; i++) {
    for (let j = i + 1; j < clause.atoms.length; j++) {
      if (
        clause.negated[i] !== clause.negated[j] &&
        atomsEqual(clause.atoms[i], clause.atoms[j])
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Priority queue implementation for clause selection
 */
export class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  /**
   * Comparison function follows the same convention as Array.sort().
   */
  constructor(private compareFn: (a: number, b: number) => number) {}

  /**
   * Insert an item with given priority.
   */
  insert(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Extract the item with minimum priority.
   */
  pop(): T | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop().item;

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return min.item;
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Get number of items in queue.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Remove a specific item from the queue.
   */
  remove(predicate: (item: T) => boolean): boolean {
    const index = this.heap.findIndex((entry) => predicate(entry.item));
    if (index === -1) return false;

    if (index === this.heap.length - 1) {
      this.heap.pop();
    } else {
      this.heap[index] = this.heap.pop()!;

      // One will be a no-op:
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (
        this.compareFn(
          this.heap[index].priority,
          this.heap[parentIndex].priority
        ) >= 0
      ) {
        break;
      }
      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex],
        this.heap[index],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    for (;;) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (
        leftChild < this.heap.length &&
        this.compareFn(
          this.heap[leftChild].priority,
          this.heap[minIndex].priority
        ) < 0
      ) {
        minIndex = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.compareFn(
          this.heap[rightChild].priority,
          this.heap[minIndex].priority
        ) < 0
      ) {
        minIndex = rightChild;
      }

      if (minIndex === index) break;

      [this.heap[index], this.heap[minIndex]] = [
        this.heap[minIndex],
        this.heap[index],
      ];
      index = minIndex;
    }
  }
}

/**
 * Manages active and passive clause sets with two priority queues. Most of the
 * time we take from the heuristic queue which orders clauses based on size and
 * other heuristics (mainly to keep active clauses small, NP-completeness is a
 * bitch).
 */
export class ClauseSet {
  /**
   * Active clauses have already been selected. Resolutions are only every
   * generated between the selected clause and the other active clauses, to
   * keep the search space bounded:
   */
  private active: Set<IndexedClause> = new Set();

  /**
   * List of clauses that have been generated by resolutions or from axiom
   * schemas during inference. They are pushed into the active set one at a
   * time during search:
   */
  private passive: {
    ageQueue: PriorityQueue<IndexedClause>;
    heuristicQueue: PriorityQueue<IndexedClause>;
  };

  /**
   * One clause is taken from the age-based queue for every `ratio` clauses
   * taken from the heuristic queue. This is to ensure completeness - every
   * clause _eventually_ gets selected, regardless of how poorly it matches
   * our set of heuristics:
   */
  private readonly ratio: number = 4;
  private counter: number = 0;

  /**
   * We use subsumption as a cheaper proxy for implication to prune clauses
   * that are redundant, i.e. already implied by another clause in the set:
   */
  private subsumptionIndex: SubsumptionIndex;

  constructor(private st: SymbolTable) {
    this.subsumptionIndex = new SubsumptionIndex(st);

    this.passive = {
      ageQueue: new PriorityQueue<IndexedClause>((a, b) => a - b),
      heuristicQueue: new PriorityQueue<IndexedClause>((a, b) => a - b),
    };
  }

  /**
   * Selects the next clause from one of the queues. Note that we do soft
   * deletion of clauses from the queues by marking them as 'noLongerPassive: true',
   * so we may have to pop the queue multiple times before we get a hit.
   */
  selectClause(): IndexedClause | null {
    let queue: PriorityQueue<IndexedClause>;
    let queueName: string;
    if (this.counter % (this.ratio + 1) === 0) {
      queue = this.passive.ageQueue;
      queueName = 'age-based';
    } else {
      queue = this.passive.heuristicQueue;
      queueName = 'heuristic';
    }

    debugLogger.trace(
      LogComponent.CLAUSE_SELECT,
      `Attempting to select from ${queueName} queue (counter: ${this.counter})`
    );

    let clause = this.extract(queue);
    if (!clause) {
      const otherQueue =
        queue === this.passive.ageQueue
          ? this.passive.heuristicQueue
          : this.passive.ageQueue;
      const otherQueueName =
        queueName === 'age-based' ? 'heuristic' : 'age-based';
      debugLogger.trace(
        LogComponent.CLAUSE_SELECT,
        `${queueName} queue empty, trying ${otherQueueName} queue`
      );
      clause = this.extract(otherQueue);
    }

    if (clause) {
      this.counter++;
      debugLogger.logClause(
        LogComponent.CLAUSE_SELECT,
        LogLevel.DEBUG,
        `Selected clause`,
        clause,
        () => renderClause(clause, this.st)
      );
    }

    return clause;
  }

  private extract(queue: PriorityQueue<IndexedClause>): IndexedClause | null {
    while (!queue.isEmpty()) {
      const clause = queue.pop();
      if (clause && !clause.noLongerPassive) {
        return clause;
      }
    }
    return null;
  }

  // TODO: index so we know if we already have clause
  insert(clause: IndexedClause): void {
    this.subsumptionIndex.insert(clause);
    const complexity = clauseComplexity(clause);
    this.passive.ageQueue.insert(clause, clause.age);
    this.passive.heuristicQueue.insert(clause, complexity);

    debugLogger.logClause(
      LogComponent.CLAUSE_MGMT,
      LogLevel.DEBUG,
      `Inserted clause into passive set (age-priority: ${clause.age}, heuristic-priority: ${complexity})`,
      clause,
      () => renderClause(clause, this.st)
    );
  }

  activate(clause: IndexedClause): void {
    clause.noLongerPassive = true; // soft-delete from queues
    this.active.add(clause);

    debugLogger.logClause(
      LogComponent.CLAUSE_MGMT,
      LogLevel.DEBUG,
      `Activated clause (now ${this.active.size} active clauses)`,
      clause,
      () => renderClause(clause, this.st)
    );
  }

  remove(clause: IndexedClause): void {
    this.active.delete(clause);
    clause.noLongerPassive = true;
    this.subsumptionIndex.remove(clause);
  }

  /**
   * Generate all resolvents between the given clause and the active set.
   */
  generateResolvents(clause: IndexedClause): IndexedClause[] {
    const resolvents: IndexedClause[] = [];

    debugLogger.trace(
      LogComponent.RESOLUTION,
      `Generating SOS-filtered resolvents for clause #${clause.id} against ${this.active.size} active clauses`
    );

    for (const activeClause of this.active) {
      if (activeClause.id === clause.id) continue;
      if (!clause.sos && !activeClause.sos) continue;

      const resolutions = getResolutions(clause, activeClause);
      for (const resolution of resolutions) {
        const resolvent = applyResolution(resolution);

        // Skip tautologies
        if (isTautology(resolvent)) {
          debugLogger.debug(
            LogComponent.RESOLUTION,
            `Skipping tautology from #${clause.id}[${resolution.leftIdx}] and #${activeClause.id}[${resolution.rightIdx}]`
          );
          continue;
        }

        debugLogger.debug(
          LogComponent.RESOLUTION,
          `Resolving #${clause.id}[${resolution.leftIdx}] "${renderClause(clause, this.st)}" with #${activeClause.id}[${resolution.rightIdx}] "${renderClause(activeClause, this.st)}"`
        );

        const indexed = this.subsumptionIndex.index(resolvent);
        resolvents.push(indexed);

        debugLogger.logClause(
          LogComponent.RESOLUTION,
          LogLevel.TRACE,
          `Generated resolvent`,
          indexed,
          () => renderClause(indexed, this.st)
        );
      }
    }

    if (resolvents.length > 0) {
      debugLogger.debug(
        LogComponent.RESOLUTION,
        `Generated ${resolvents.length} resolvents from clause #${clause.id}`
      );
    }

    return resolvents;
  }

  /**
   * Generate all factors of the given clause by unifying literals with same
   * polarity.
   */
  generateFactors(clause: IndexedClause): IndexedClause[] {
    const factors = getFactors(clause);
    const indexedFactors: IndexedClause[] = [];

    debugLogger.trace(
      LogComponent.FACTORING,
      `Generating factors for clause #${clause.id}`
    );

    for (const factor of factors) {
      const factored = applyFactor(factor);
      if (isTautology(factored)) {
        debugLogger.debug(
          LogComponent.FACTORING,
          `Skipping tautological factor from #${clause.id}[${factor.idx1},${factor.idx2}]`
        );
        continue;
      }

      const indexed = this.subsumptionIndex.index(factored);
      indexedFactors.push(indexed);

      debugLogger.debug(
        LogComponent.FACTORING,
        `Generated factor #${indexed.id} "${renderClause(indexed, this.st)}" from clause #${clause.id} "${renderClause(clause, this.st)}"`
      );
    }

    if (indexedFactors.length > 0) {
      debugLogger.debug(
        LogComponent.FACTORING,
        `Generated ${indexedFactors.length} factors from clause #${clause.id}`
      );
    }

    return indexedFactors;
  }

  getSubsumptionIndex(): SubsumptionIndex {
    return this.subsumptionIndex;
  }

  /**
   * Get all active clauses (for forward subsumption check)
   */
  getActive(): Set<IndexedClause> {
    return this.active;
  }

  /**
   * Check if there are passive clauses available - approximate, may include
   * undeleted active clauses as well.
   */
  hasPassiveClauses(): boolean {
    return (
      !this.passive.ageQueue.isEmpty() || !this.passive.heuristicQueue.isEmpty()
    );
  }

  /**
   * Get total number of clauses (active and passive).
   */
  size(): number {
    return this.subsumptionIndex.size();
  }

  /**
   * Get number of active clauses.
   */
  activeSize(): number {
    return this.active.size;
  }

  /**
   * Get number of passive clauses (approximate, may include soft-deleted
   * active clauses as well).
   */
  passiveSize(): number {
    return Math.max(
      this.passive.ageQueue.size(),
      this.passive.heuristicQueue.size()
    );
  }

  /**
   * Get all passive clauses sorted by complexity (smallest to highest).
   * Filters out soft-deleted clauses.
   */
  getPassiveClausesSorted(): IndexedClause[] {
    const passiveClauses: IndexedClause[] = [];
    const seen = new Set<number>();

    const collectFromQueue = (queue: PriorityQueue<IndexedClause>) => {
      const queueWithHeap = queue as any;
      for (const entry of queueWithHeap.heap) {
        const clause = entry.item;
        if (!clause.noLongerPassive && !seen.has(clause.id)) {
          seen.add(clause.id);
          passiveClauses.push(clause);
        }
      }
    };

    collectFromQueue(this.passive.ageQueue);
    collectFromQueue(this.passive.heuristicQueue);

    return passiveClauses.sort((a, b) => {
      const complexityA = clauseComplexity(a);
      const complexityB = clauseComplexity(b);
      return complexityA - complexityB;
    });
  }
}

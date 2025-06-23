import { Formula, NodeKind, SymbolTable } from './ast';
import { toCNF } from './cnf';
import { Clause, cnfToClauses } from './resolution';
import { ClauseSet } from './clause-set';
import { IndexedClause, maybeSubsumes } from './subsumption';

/**
 * Attempts to prove a formula from a theory using resolution-based refutation.
 * Uses the given-clause algorithm with subsumption checking to manage the search space.
 *
 * @param theory - Set of axioms/assumptions
 * @param formula - Goal formula to prove
 * @param st - Symbol table for the formulas
 * @param maxClauses - Limit on total clauses to prevent runaway searches
 * @returns true if formula is provable from theory, false otherwise
 */
export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  maxClauses: number = 10000
): boolean {
  const clauseSet = new ClauseSet(st);

  // Refutation: prove by showing theory ∧ ¬formula is unsatisfiable
  const initialClauses: Clause[] = [
    ...theory.flatMap((f) => cnfToClauses(toCNF(f, st))),
    ...cnfToClauses(
      toCNF({ kind: NodeKind.Not, arg: formula }, st),
      true // SOS: goal-derived clauses get priority
    ),
  ];

  for (const clause of initialClauses) {
    clauseSet.insert(clause as IndexedClause);
  }

  let iterations = 0;

  // Given-clause algorithm: repeatedly select and process clauses until
  // we derive ⊥ (empty clause) or saturate the search space
  while (clauseSet.hasPassiveClauses() && clauseSet.size() < maxClauses) {
    iterations++;

    const selected = clauseSet.selectClause();
    if (!selected) break;

    // Forward subsumption: is selected clause redundant?
    let isSubsumed = false;
    for (const active of clauseSet.getActive()) {
      if (maybeSubsumes(active.signature, selected.signature)) {
        if (clauseSet.getSubsumptionIndex().subsumes(active, selected)) {
          isSubsumed = true;
          break;
        }
      }
    }

    if (isSubsumed) {
      selected.noLongerPassive = true; // soft delete for efficiency
      continue;
    }

    clauseSet.activate(selected);

    // Generate resolvents between selected clause and all active clauses
    const resolvents = clauseSet.generateResolvents(selected);

    for (const resolvent of resolvents) {
      if (resolvent.atoms.length === 0) {
        console.debug(
          `Proof found after ${iterations} iterations with ${clauseSet.size()} clauses`
        );
        return true;
      }

      // SOS restriction: only keep resolvents if at least one parent was goal-derived
      if (!selected.sos && !resolvent.sos) {
        continue;
      }

      clauseSet.insert(resolvent);
    }

    // Backward subsumption: remove existing clauses made redundant by selected
    const candidates = clauseSet.getSubsumptionIndex().findCandidates(selected);
    for (const candidate of candidates) {
      if (
        candidate.id !== selected.id &&
        clauseSet.getSubsumptionIndex().subsumes(selected, candidate)
      ) {
        clauseSet.remove(candidate);
      }
    }

    if (iterations % 100 === 0) {
      console.debug(
        `Iteration ${iterations}: ${clauseSet.activeSize()} active, ` +
          `~${clauseSet.passiveSize()} passive, ${clauseSet.size()} total clauses`
      );
    }
  }

  console.debug(
    `Saturation reached after ${iterations} iterations with ${clauseSet.size()} clauses`
  );
  return false;
}

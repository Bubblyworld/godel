import { Formula, NodeKind, SymbolTable } from './ast';
import { toCNF } from './cnf';
import { Clause, cnfToClauses, renderClause } from './resolution';
import { ClauseSet } from './clause-set';
import { IndexedClause, maybeSubsumes } from './subsumption';
import { debugLogger, LogComponent, LogLevel } from './debug-logger';

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
  debugLogger.info(
    LogComponent.PROVER,
    `Starting proof attempt with ${theory.length} theory axioms`
  );

  const theoryClauses = theory.flatMap((f) => cnfToClauses(toCNF(f, st)));
  const goalClauses = cnfToClauses(
    toCNF({ kind: NodeKind.Not, arg: formula }, st),
    true // SOS: goal-derived clauses get priority
  );

  debugLogger.info(
    LogComponent.PROVER,
    `Generated ${theoryClauses.length} theory clauses and ${goalClauses.length} goal clauses`
  );

  const initialClauses: Clause[] = [...theoryClauses, ...goalClauses];

  debugLogger.debug(
    LogComponent.CNF,
    `Initial clauses from theory and negated goal:`
  );

  for (let i = 0; i < initialClauses.length; i++) {
    const clause = initialClauses[i];
    const isGoalClause = i >= theoryClauses.length;

    // Log the clause before insertion (we can still render it)
    debugLogger.debug(
      LogComponent.CNF,
      `${isGoalClause ? 'Goal clause (SOS)' : 'Theory clause'}: ${renderClause(clause, st)}`
    );

    const indexed = clauseSet.getSubsumptionIndex().index(clause);
    clauseSet.insert(indexed);
  }

  let iterations = 0;

  // Given-clause algorithm: repeatedly select and process clauses until
  // we derive ⊥ (empty clause) or saturate the search space
  while (clauseSet.hasPassiveClauses() && clauseSet.size() < maxClauses) {
    iterations++;

    debugLogger.trace(
      LogComponent.PROVER,
      `Iteration ${iterations}: hasPassive=${clauseSet.hasPassiveClauses()}, size=${clauseSet.size()}, maxClauses=${maxClauses}`
    );

    const selected = clauseSet.selectClause();
    if (!selected) {
      debugLogger.debug(
        LogComponent.PROVER,
        `No clause selected, breaking. hasPassive=${clauseSet.hasPassiveClauses()}`
      );
      break;
    }

    // Forward subsumption: is selected clause redundant?
    debugLogger.trace(
      LogComponent.SUBSUMPTION,
      `Checking forward subsumption for clause #${selected.id}`
    );

    let isSubsumed = false;
    let subsumingClauseId: number | null = null;
    for (const active of clauseSet.getActive()) {
      if (maybeSubsumes(active.signature, selected.signature)) {
        debugLogger.trace(
          LogComponent.SUBSUMPTION,
          `Signature match between #${active.id} and #${selected.id}, checking full subsumption`
        );

        if (clauseSet.getSubsumptionIndex().subsumes(active, selected)) {
          isSubsumed = true;
          subsumingClauseId = active.id;
          break;
        }
      }
    }

    if (isSubsumed) {
      debugLogger.debug(
        LogComponent.SUBSUMPTION,
        `Clause #${selected.id} subsumed by #${subsumingClauseId}, discarding`
      );
      selected.noLongerPassive = true; // soft delete for efficiency
      continue;
    }

    clauseSet.activate(selected);

    // Generate factors before resolutions
    const factors = clauseSet.generateFactors(selected);
    for (const factor of factors) {
      if (factor.atoms.length === 0) {
        throw new Error(
          'should not be able to get an empty clause from factoring'
        );
      }

      clauseSet.insert(factor);
    }

    const resolvents = clauseSet.generateResolvents(selected);
    for (const resolvent of resolvents) {
      if (resolvent.atoms.length === 0) {
        debugLogger.info(
          LogComponent.PROVER,
          `Empty clause derived! Proof found after ${iterations} iterations`
        );
        console.debug(
          `Proof found after ${iterations} iterations with ${clauseSet.size()} clauses`
        );
        return true;
      }

      clauseSet.insert(resolvent);
    }

    // Backward subsumption:
    const candidates = clauseSet.getSubsumptionIndex().findCandidates(selected);
    debugLogger.trace(
      LogComponent.SUBSUMPTION,
      `Checking backward subsumption: ${candidates.length} candidates for clause #${selected.id}`
    );

    for (const candidate of candidates) {
      if (
        candidate.id !== selected.id &&
        clauseSet.getSubsumptionIndex().subsumes(selected, candidate)
      ) {
        debugLogger.debug(
          LogComponent.CLAUSE_MGMT,
          `Removing clause #${candidate.id}`
        );
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

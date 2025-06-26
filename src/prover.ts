import { Formula, NodeKind, SymbolTable } from './ast';
import { toCNF } from './cnf';
import { Clause, cnfToClauses, renderClause } from './resolution';
import { ClauseSet } from './clause-set';
import { maybeSubsumes } from './subsumption';
import { debugLogger, LogComponent } from './debug-logger';

export interface ProverConfig {
  /**
   * Stops the search if the number of passive clauses exceeds this limit.
   */
  maxPassiveClauses?: number;

  /**
   * Stops the search if the number of active clauses exceeds this limit.
   */
  maxActiveClauses?: number;
}

/**
 * Attempts to prove a formula from a theory using resolution-based refutation.
 *
 * @param theory - the set of axioms
 * @param formula - the formula to try and prove
 * @param st - the symbol table for the formulas
 * @param cfg - optional configuration for the prover
 * @returns true if formula is provable from theory, false otherwise
 */
export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  cfg?: ProverConfig,
): boolean {
  const clauseSet = new ClauseSet(st);

  debugLogger.info(
    LogComponent.PROVER,
    `Starting proof attempt with ${theory.length} theory axioms`
  );

  const theoryClauses = theory.flatMap((f) => cnfToClauses(toCNF(f, st)));
  const goalClauses = cnfToClauses(
    toCNF({ kind: NodeKind.Not, arg: formula }, st),
    true // marks clause as sos
  );

  debugLogger.info(
    LogComponent.PROVER,
    `Generated ${theoryClauses.length} theory clauses and ${goalClauses.length} goal clauses`
  );

  debugLogger.debug(
    LogComponent.CNF,
    `Initial clauses from theory and negated goal:`
  );

  const clauses: Clause[] = [...theoryClauses, ...goalClauses];
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const isGoalClause = i >= theoryClauses.length;

    debugLogger.debug(
      LogComponent.CNF,
      `${isGoalClause ? 'Goal clause (SOS)' : 'Theory clause'}: ${renderClause(clause, st)}`
    );

    const indexed = clauseSet.getSubsumptionIndex().index(clause);
    clauseSet.insert(indexed);
  }

  let iterations = 0;
  const limitsExceeded = () => {
    let exceeded = false;
    if (cfg?.maxPassiveClauses != null) {
      exceeded ||= clauseSet.passiveSize() >= cfg.maxPassiveClauses;
    }
    if (cfg?.maxActiveClauses != null) {
      exceeded ||= clauseSet.activeSize() >= cfg.maxActiveClauses;
    }
    return exceeded;
  };

  // Main loop:
  while (clauseSet.hasPassiveClauses() && !limitsExceeded()) {
    iterations++;

    debugLogger.trace(
      LogComponent.PROVER,
      `Iteration ${iterations}: passive(${clauseSet.passiveSize()}), active(${
        clauseSet.activeSize()}`
    );

    const given = clauseSet.selectClause();
    if (!given) {
      debugLogger.debug(
        LogComponent.PROVER,
        `No clause selected, breaking. hasPassive=${clauseSet.hasPassiveClauses()}`
      );
      break;
    }

    debugLogger.trace(
      LogComponent.SUBSUMPTION,
      `Checking forward subsumption for clause #${given.id}`
    );

    // Forward Subsumption:
    // This is an initial check to see if the given clause is subsumed by any
    // of the existing active clauses. If it is then there's no point in using
    // it since the existing clause would make stronger resolutions anyway.
    // TODO: efficient index for forward subsumption
    let isSubsumed = false;
    let subsumingClauseId: number | null = null;
    for (const active of clauseSet.getActive()) {
      if (active === given.factoredFrom) continue;

      if (maybeSubsumes(active.signature, given.signature)) {
        debugLogger.trace(
          LogComponent.SUBSUMPTION,
          `Signature match between #${active.id} and #${given.id}, checking full subsumption`
        );

        if (clauseSet.getSubsumptionIndex().subsumes(active, given)) {
          isSubsumed = true;
          subsumingClauseId = active.id;
          break;
        }
      }
    }
    if (isSubsumed) {
      debugLogger.debug(
        LogComponent.SUBSUMPTION,
        `Clause #${given.id} subsumed by #${subsumingClauseId}, discarding`
      );
      given.noLongerPassive = true; // soft delete for efficiency
      continue;
    }

    // Accept the given clause into the active set, as the given clause must
    // strictly increase our proving power. The assumption here is that our
    // heuristics cause the proving power to increase in the right direction.
    clauseSet.activate(given);

    // Factoring:
    // Resolution for first-order logic is only complete in the presence of
    // another inference rule called factoring. Factoring is analogous to the
    // introduction rule for universal quantification, except that we only pick
    // the instances that cause the clause to get smaller. The hope is that the
    // smaller instances of the clause will lead to contradiction faster than
    // the parent.
    const factors = clauseSet.generateFactors(given);
    for (const factor of factors) {
      if (factor.atoms.length === 0) {
        throw new Error(
          'should not be able to get an empty clause from factoring'
        );
      }

      clauseSet.insert(factor);
    }

    // Resolution:
    // The main inference step of resolution-based provers. A generalisation
    // of modus ponens that lets you reason "in both directions". Much more
    // expensive to compute but gets you full completeness which is nice.
    const resolvents = clauseSet.generateResolvents(given);
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

    // Backward Subsumption:
    // If the given clause subsumes anything in the active or passive sets,
    // then we remove them, as the given clause has more proving power.
    const candidates = clauseSet.getSubsumptionIndex().findCandidates(given);
    debugLogger.trace(
      LogComponent.SUBSUMPTION,
      `Checking backward subsumption: ${candidates.length} candidates for clause #${given.id}`
    );
    for (const candidate of candidates) {
      if (
        candidate.id !== given.id &&
        candidate.factoredFrom !== given &&
        clauseSet.getSubsumptionIndex().subsumes(given, candidate)
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

  // Print summary of active clauses
  console.log('\n=== ACTIVE CLAUSES ===');
  const activeClauses = Array.from(clauseSet.getActive()).sort(
    (a, b) => a.id - b.id
  );
  console.log(`Total active clauses: ${activeClauses.length}`);
  for (const clause of activeClauses) {
    console.log(`${clause.sos ? '!' : ' '} #${clause.id}: ${renderClause(clause, st)}`);
  }

  // Print summary of passive clauses sorted by complexity
  console.log('\n=== PASSIVE CLAUSES (sorted by complexity) ===');
  const passiveClauses = clauseSet.getPassiveClausesSorted();
  console.log(`Total passive clauses: ${passiveClauses.length}`);
  for (const clause of passiveClauses) {
    console.log(`${clause.sos ? '!' : ' '} #${clause.id}: ${renderClause(clause, st)}`);
  }

  return false;
}

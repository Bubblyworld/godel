import { Formula, NodeKind, SymbolTable } from './ast';
import { toCNF } from './cnf';
import {
  cnfToClauses,
  getResolutions,
  applyResolution,
  Clause,
} from './resolution';

export interface ResolutionStep {
  iteration: number;
  leftClause: Clause;
  rightClause: Clause;
  resolvent: Clause;
  isEmptyClause: boolean;
}

export interface DebugInfo {
  initialClauses: Clause[];
  totalIterations: number;
  resolutionSteps: ResolutionStep[];
  finalClauseCount: number;
  terminationReason: 'empty_clause' | 'no_new_clauses' | 'iteration_limit';
  cnfConversions: { original: Formula; cnf: Formula }[];
}

export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable
): boolean;
export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  debug: true
): { result: boolean; debug: DebugInfo };
export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  debug?: boolean
): boolean | { result: boolean; debug: DebugInfo } {
  // Initialize debug tracking
  const debugInfo: DebugInfo = {
    initialClauses: [],
    totalIterations: 0,
    resolutionSteps: [],
    finalClauseCount: 0,
    terminationReason: 'no_new_clauses',
    cnfConversions: [],
  };

  // Create the negation of the formula we want to prove
  const negatedFormula: Formula = {
    kind: NodeKind.Not,
    arg: formula,
  };

  // Combine theory with negated formula
  const allFormulas = [...theory, negatedFormula];

  // Convert each formula to CNF and combine with conjunction
  let combinedCNF: Formula | null = null;
  for (const f of allFormulas) {
    const cnf = toCNF(f, st);
    if (debug) {
      debugInfo.cnfConversions.push({ original: f, cnf });
    }
    if (combinedCNF === null) {
      combinedCNF = cnf;
    } else {
      combinedCNF = {
        kind: NodeKind.And,
        left: combinedCNF,
        right: cnf,
      };
    }
  }

  if (combinedCNF === null) {
    // Empty theory - can't prove anything
    debugInfo.terminationReason = 'no_new_clauses';
    return debug ? { result: false, debug: debugInfo } : false;
  }

  // Convert CNF to clauses
  const clauses = cnfToClauses(combinedCNF);
  debugInfo.initialClauses = [...clauses];

  // Apply resolution repeatedly until we derive the empty clause (False)
  const clauseSet = new Set<string>();
  const workingSet = [...clauses];

  // Helper to create a unique string representation of a clause
  const clauseToString = (clause: Clause): string => {
    return JSON.stringify({
      atoms: clause.atoms.map((atom) => ({ idx: atom.idx, args: atom.args })),
      negated: clause.negated,
    });
  };

  // Add initial clauses to the set
  for (const clause of clauses) {
    clauseSet.add(clauseToString(clause));
  }

  // Resolution loop
  for (let iteration = 0; iteration < 1000; iteration++) {
    debugInfo.totalIterations = iteration + 1;
    const newClauses: Clause[] = [];

    // Try all pairs of clauses for resolution
    for (let i = 0; i < workingSet.length; i++) {
      for (let j = i + 1; j < workingSet.length; j++) {
        const resolutions = getResolutions(workingSet[i], workingSet[j]);

        for (const resolution of resolutions) {
          const newClause = applyResolution(resolution);
          const isEmptyClause = newClause.atoms.length === 0;

          // Track resolution step
          if (debug) {
            debugInfo.resolutionSteps.push({
              iteration,
              leftClause: workingSet[i],
              rightClause: workingSet[j],
              resolvent: newClause,
              isEmptyClause,
            });
          }

          // Check if we derived the empty clause (contradiction)
          if (isEmptyClause) {
            debugInfo.terminationReason = 'empty_clause';
            debugInfo.finalClauseCount = workingSet.length + newClauses.length;
            return debug ? { result: true, debug: debugInfo } : true;
          }

          // Check if this clause is new
          const clauseStr = clauseToString(newClause);
          if (!clauseSet.has(clauseStr)) {
            clauseSet.add(clauseStr);
            newClauses.push(newClause);
          }
        }
      }
    }

    // If no new clauses were generated, we can't prove the formula
    if (newClauses.length === 0) {
      debugInfo.terminationReason = 'no_new_clauses';
      debugInfo.finalClauseCount = workingSet.length;
      return debug ? { result: false, debug: debugInfo } : false;
    }

    // Add new clauses to working set
    workingSet.push(...newClauses);
  }

  // Reached iteration limit - give up
  debugInfo.terminationReason = 'iteration_limit';
  debugInfo.finalClauseCount = workingSet.length;
  return debug ? { result: false, debug: debugInfo } : false;
}

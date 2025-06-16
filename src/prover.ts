import { Formula, NodeKind, Not, SymbolTable } from './ast';
import { toCNF } from './cnf';
import { renderFormula } from './parse';
import {
  cnfToClauses,
  getResolutions,
  applyResolution,
  Clause,
} from './resolution';

export function proves(
  theory: Formula[],
  formula: Formula | null | undefined,
  st: SymbolTable,
  iters: number = 5,
): boolean {
  const formulas: Formula[] = [
    ...theory,
    ...(formula != null ? [{ kind: NodeKind.Not, arg: formula } as Not] : []),
  ];

  const clauses = cnfToClauses(toCNF(formulas.reduce((f, g) => ({
    kind: NodeKind.And,
    left: f,
    right: g,
  })), st));

  const lookup = new Set<string>();
  for (const clause of clauses) {
    lookup.add(hashClause(clause));
  }

  for (let epoch = 0; epoch < iters; epoch++) {
    const len = clauses.length;
    for (let i = 0; i < len; i++) {
      for (let j = i+1; j < len; j++) {
        const resolutions = getResolutions(clauses[i], clauses[j]);
        for (const res of resolutions) {
          const clause = applyResolution(res);
          if (clause.atoms.length == 0) {
            return true; // derived absurdity; formula has been proven
          }

          const hash = hashClause(clause);
          if (lookup.has(hash)) {
            continue;
          }

          clauses.push(clause);
          lookup.add(hash);
        }
      }
    }

    const added = clauses.length - len;
    console.debug(`Epoch ${epoch.toString().padStart(2, '0')}: added ${added} new clauses`);
    if (added == 0) {
      break; // early-out
    }
  }

  console.debug('Final clauses:');
  console.debug(clauses.map(clause => {
    return {
      ...clause,
      atoms: clause.atoms.map(atm => renderFormula(atm, st)),
    };
  }));

  return false; // failed to prove formula
}

/**
 * TODO: I think to make a prover more efficient we will have to implement
 * incremental hashing for formulas, and then also for clauses (we can take
 * hashes of underlying atoms, sort them and hash that, for instance).
 */
function hashClause(clause: Clause): string {
  return JSON.stringify(clause);
}

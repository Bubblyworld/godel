import { Formula, NodeKind, SymbolTable } from './ast';
import { toCNF } from './cnf';
import { renderFormula } from './parse';
import {
    applyResolution,
    Clause,
    cnfToClauses,
    getResolutions,
    Resolution,
} from './resolution';

export function proves(
  theory: Formula[],
  formula: Formula,
  st: SymbolTable,
  iters: number = 5,
): boolean {
  const clauses = theory.flatMap(f => cnfToClauses(toCNF(f, st)));
  clauses.push(...cnfToClauses(toCNF({
    kind: NodeKind.Not,
    arg: formula,
  }, st), true));

  const lookup = new Set<string>();
  for (const clause of clauses) {
    lookup.add(hashClause(clause));
  }

  for (let epoch = 0; epoch < iters; epoch++) {
    const len = clauses.length;
    let resolutions: Resolution[] = [];
    for (let i = 0; i < len; i++) {
      for (let j = i+1; j < len; j++) {
        resolutions.push(...getResolutions(clauses[i], clauses[j]));
      }
    }

    // Stick to only resolving SOS clauses:
    resolutions = resolutions.filter(res => res.left.sos || res.right.sos);

    // Stick to unit resolutions if possible:
    resolutions.sort((a, b) => {
      const as = size(a);
      const bs = size(b);
      return as < bs ? -1 : as == bs ? 0 : 1;
    });
    if (resolutions.length > 0 && size(resolutions[0]) == 1) {
      resolutions = resolutions.filter(res => size(res) == 1);
    }

    let added = 0;
    let maxSize = 0;
    for (const res of resolutions) {
      maxSize = Math.max(maxSize, size(res));

      const clause = applyResolution(res);
      if (clause.atoms.length == 0) {
        return true; // derived absurdity; formula has been proven
      }

      const hash = hashClause(clause);
      if (lookup.has(hash)) {
        continue;
      }

      added++;
      clauses.push(clause);
      lookup.add(hash);
    }

    console.debug(`Epoch ${epoch.toString().padStart(2, '0')}: added ${added} new clauses, max size ${maxSize}`);
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

function size(res: Resolution): number {
  return Math.min(res.left.atoms.length, res.right.atoms.length);
}

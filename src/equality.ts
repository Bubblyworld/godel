import {
    add,
    createSymbolTable,
    Formula,
    RelSymbol,
    SymbolKind,
    SymbolTable
} from './ast';
import { parseFormula } from './parse';

/**
 * I've implemented equality directly as an axiom schema. This is kinda because
 * it's easier to do it like this, but mainly I want to golf the number of meta
 * level assumptions you have to make.
 */
export function equality(st?: SymbolTable): {
  st: SymbolTable;
  axioms: Formula[];
  equals: RelSymbol;
} {
  st ??= createSymbolTable();
  const equals = add(st, SymbolKind.Rel, Symbol('='), 2);
  const reflexivity = parseFormula('=(x, x)', st);

  return {
    st,
    equals,
    axioms: [reflexivity],
  };
}

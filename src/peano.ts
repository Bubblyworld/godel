import { add, ConstSymbol, createSymbolTable, Formula, FunSymbol, RelSymbol, SymbolKind, SymbolTable } from "./ast";
import { parseFormula } from "./parse";

/**
 * Returns the axioms and symbols of Peano Arithmetic.
 * TODO: axiom schema of induction
 */
export function peanoArithmetic(): {
  st: SymbolTable; 
  axioms: Formula[]; 
  zero: ConstSymbol;
  equals: RelSymbol;
  plus: FunSymbol;
  times: FunSymbol;
} {
  const st = createSymbolTable();
  const equals = add(st, SymbolKind.Rel, Symbol('='), 2);
  const plus = add(st, SymbolKind.Fun, Symbol('+'), 2);
  const times = add(st, SymbolKind.Fun, Symbol('*'), 2);
  const zero = add(st, SymbolKind.Const, Symbol('0'));

  const f1 = parseFormula('forall x. =(+(x, 0), x)', st);
  const f2 = parseFormula('forall x, y. =(+(x, S(y)), S(+(x, y)))', st);
  const f3 = parseFormula('forall x. =(*(x, 0), 0)', st);
  const f4 = parseFormula('forall x, y. =(*(x, S(y)), +(*(x, y), x))', st);
  const f5 = parseFormula('forall x. (!(=(S(x), 0)))', st);
  const f6 = parseFormula('forall x, y. (=(S(x), S(y)) -> =(x, y))', st);

  return {
    st,
    equals,
    plus,
    times,
    zero,
    axioms: [f1, f2, f3, f4, f5, f6],
  };
}

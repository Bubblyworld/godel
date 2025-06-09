#!/usr/bin/env node

import { createSymbolTable } from './ast';
import { parseFormula, renderFormula } from './parse';
import { toCNF } from './cnf';

function printUsage() {
  console.log(`Usage: godel [COMMAND] [OPTIONS] <formula>

COMMANDS:
  parse                Parse and pretty-print a formula
  cnf                  Convert formula to CNF
  help                 Show this help message

OPTIONS:
  -h, --help          Show help message
  
EXAMPLES:
  godel parse "forall x. P(x) -> Q(x)"
  godel cnf "exists x. P(x) & (Q(x) | R(x))"
  godel parse "∀x.∃y.(P(x) ∧ Q(y)) → R(x,y)"

FORMULA SYNTAX:
  Variables:          x, y, z, ...
  Constants:          a, b, c, ...
  Functions:          f(x), g(x,y), ...
  Relations:          P(x), R(x,y), ...
  Negation:           !P(x) or ¬P(x)
  Conjunction:        P(x) & Q(x) or P(x) ∧ Q(x)
  Disjunction:        P(x) | Q(x) or P(x) ∨ Q(x)
  Implication:        P(x) -> Q(x) or P(x) → Q(x)
  Universal:          forall x. P(x) or ∀x.P(x)
  Existential:        exists x. P(x) or ∃x.P(x)
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  let formula: string;

  if (command === 'help') {
    printUsage();
    process.exit(0);
  }

  if (command === 'parse' || command === 'cnf') {
    if (args.length < 2) {
      console.error('Error: Missing formula argument');
      console.error('Use "godel help" for usage information');
      process.exit(1);
    }
    formula = args[1]!;
  } else {
    // If no command given, treat first arg as formula and default to parse
    formula = args[0]!;
  }

  try {
    const st = createSymbolTable();
    const parsed = parseFormula(formula, st);

    switch (command) {
      case 'cnf':
        console.log('Original:');
        console.log(renderFormula(parsed, st));
        console.log();
        console.log('CNF:');
        const cnf = toCNF(parsed, st);
        console.log(renderFormula(cnf, st));
        break;
      case 'parse':
      default:
        console.warn(`Unrecognised command '${command}'.`);
        printUsage();
        break;
    }
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
